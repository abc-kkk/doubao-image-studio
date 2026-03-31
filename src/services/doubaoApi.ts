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
  const data = JSON.parse(text) as {
    success: boolean;
    images: { url?: string; imageUrl?: string; thumbnail_url?: string; width?: number; height?: number }[];
    error?: string;
  };

  if (!data.success) throw new Error(data.error ?? '生成失败');
  if (!data.images?.length) throw new Error('未返回图片');

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

export async function checkWorkerStatus(serverUrl: string): Promise<boolean> {
  const base = getBaseUrl(serverUrl);
  const healthUrl = `${base}/api/health`;
  try {
    const result = await httpGet(healthUrl);
    if (typeof result === 'boolean') return result;
    const data = result as { registeredModels?: string[] };
    return (data.registeredModels?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Doubao 文字聊天流式接口
 *
 * 通过 server 代理（WebSocket relay → Chrome 扩展 → 豆包 API），
 * 不直接请求 doubao.com，避免 CORS 问题。
 */
export async function doubaoStreamChat(
  history: ChatMessage[],
  conversationId: string,
  onDelta: (delta: string, thinking?: string) => void,
  onDone: (text: string, conversationId: string, thinking?: string) => void,
  onError: (error: string) => void,
): Promise<void> {
  const serverUrl = getBaseUrl('ws://localhost:8081');
  const url = `${serverUrl}/api/chat/stream`;

  try {
    const response = await window.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, conversationId }),
    });

    if (!response.ok || !response.body) {
      const text = await response.text();
      onError(`请求失败 ${response.status}: ${text.substring(0, 200)}`);
      return;
    }

    let fullText = '';
    let newConvId = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const dataStr = line.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;

        try {
          const data = JSON.parse(dataStr);

          if (data.delta) {
            fullText += data.delta;
            onDelta(data.delta);
          }

          if (data.done) {
            if (data.text) fullText = data.text;
            if (data.conversationId) newConvId = data.conversationId;
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    onDone(fullText, newConvId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '网络请求失败';
    onError(msg);
  }
}
