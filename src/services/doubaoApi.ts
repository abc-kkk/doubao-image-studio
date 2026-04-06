import { invoke } from '@tauri-apps/api/core';
import type { AspectRatio } from '../types';

const MODEL = 'db';

export function getBaseUrl(wsUrl: string): string {
  return wsUrl
    .replace('ws://', 'http://')
    .replace('wss://', 'https://')
    .replace('/ws', '');
}

async function httpPost(url: string, body: string): Promise<string> {
  // Try Tauri invoke first (bypasses WKWebView ATS), fallback to native fetch
  try {
    return await invoke<string>('generate_image_request', { url, body });
  } catch {
    const res = await window.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return res.text();
  }
}

async function httpGet(url: string): Promise<unknown> {
  try {
    return await invoke<boolean>('check_worker', { url });
  } catch {
    const res = await window.fetch(url);
    return res.json();
  }
}

// ============================================================================
// History Management (Rust-native via invoke)
// ============================================================================

export interface HistoryImage {
  id: string;
  batchId?: string;
  prompt: string;
  model: string;
  aspectRatio?: string;
  localPath?: string;
  url: string;
  createdAt: number;
  status: string;
}

export async function getHistory(limit = 200, offset = 0): Promise<HistoryImage[]> {
  try {
    const result = await invoke<{ success: boolean; history: HistoryImage[] }>('get_history', { limit, offset });
    return result.history || [];
  } catch (e) {
    console.error('Failed to get history:', e);
    return [];
  }
}

export async function saveHistory(image: HistoryImage): Promise<void> {
  try {
    await invoke('save_history', { image });
  } catch (e) {
    console.error('Failed to save history:', e);
    throw e;
  }
}

export async function deleteHistory(id: string): Promise<void> {
  try {
    await invoke('delete_history', { id });
  } catch (e) {
    console.error('Failed to delete history:', e);
    throw e;
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await invoke('clear_history');
  } catch (e) {
    console.error('Failed to clear history:', e);
    throw e;
  }
}

// ============================================================================
// Image Generation (Proxy to Workers via HTTP)
// ============================================================================

export interface ImageResult {
  url: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
}

export async function generateImages(
  prompt: string,
  aspectRatio: AspectRatio,
  serverUrl: string,
  switchToImageMode: boolean = false,
  referenceImages: string[] = []
): Promise<ImageResult[]> {
  const base = getBaseUrl(serverUrl);
  const url = `${base}/api/images/generate`;
  const body = JSON.stringify({
    model: MODEL,
    prompt,
    aspect_ratio: aspectRatio,
    reference_images: referenceImages,
    switch_to_image_mode: switchToImageMode,
  });

  const text = await httpPost(url, body);
  console.log('[doubaoApi] Raw response:', text.substring(0, 500));
  const data = JSON.parse(text) as {
    success: boolean;
    images: { url?: string; imageUrl?: string; thumbnail_url?: string; width?: number; height?: number }[];
    error?: string;
  };

  if (!data.success) throw new Error(data.error ?? '生成失败');
  if (!data.images?.length) {
    // If no images but success, might be text response
    if (data.success) {
      return [];
    }
    throw new Error('未返回图片');
  }

  return data.images
    .map((img) => ({
      url: img.url ?? img.imageUrl ?? '',
      thumbnail_url: img.thumbnail_url,
      width: img.width,
      height: img.height
    }))
    .filter((img) => img.url !== '');
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  serverUrl: string,
  onChunk: (delta: string) => void,
): Promise<{ text: string; conversationId?: string }> {
  const base = getBaseUrl(serverUrl);
  const url = `${base}/api/chat/stream`;
  const body = JSON.stringify({ messages });

  const res = await window.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) throw new Error(`Chat error: ${res.status}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let conversationId: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const payload = JSON.parse(line.slice(6));
        if (payload.delta) {
          fullText += payload.delta;
          onChunk(payload.delta);
        }
        if (payload.done) {
          fullText = payload.text ?? fullText;
          conversationId = payload.conversationId;
        }
      } catch {}
    }
  }

  return { text: fullText, conversationId };
}

// ============================================================================
// Status & Progress (Rust-native)
// ============================================================================

export async function checkWorkerStatus(serverUrl: string): Promise<boolean> {
  try {
    // Use Rust's get_server_status command
    const status = await invoke<{
      connections?: number;
      registeredModels?: string[];
      legacyConnected?: boolean;
    }>('get_server_status');
    
    // Check for connections or registered models
    const hasConnections = (status?.connections ?? 0) > 0;
    const hasModels = (status?.registeredModels?.length ?? 0) > 0;
    const legacyConnected = status?.legacyConnected ?? false;
    
    return hasConnections || hasModels || legacyConnected;
  } catch {
    // Fallback: try HTTP
    const base = getBaseUrl(serverUrl);
    const healthUrl = `${base}/api/health`;
    try {
      const result = await httpGet(healthUrl);
      if (typeof result === 'boolean') return result;
      const data = result as { connections?: number; registeredModels?: string[] };
      return (data.connections ?? 0) > 0 || (data.registeredModels?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }
}

export async function getProgress(): Promise<{ text: string; active: boolean }> {
  try {
    return await invoke<{ text: string; active: boolean }>('get_progress');
  } catch (e) {
    console.error('Failed to get progress:', e);
    return { text: '', active: false };
  }
}
