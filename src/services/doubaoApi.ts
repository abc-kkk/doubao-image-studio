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
 * 直接调用豆包 samantha API，不经过 relay server。
 * 支持多轮对话，自动处理 thinking 标签和流式打字。
 */
export async function doubaoStreamChat(
  history: ChatMessage[],
  conversationId: string,
  onDelta: (delta: string, thinking?: string) => void,
  onDone: (text: string, conversationId: string, thinking?: string) => void,
  onError: (error: string) => void,
): Promise<void> {
  const params = new URLSearchParams({
    aid: '497858',
    device_platform: 'web',
    language: 'zh',
    pkg_type: 'release_version',
    real_aid: '497858',
    region: 'CN',
    samantha_web: '1',
    sys_region: 'CN',
    use_olympus_account: '1',
    version_code: '20800',
  });

  // 合并历史消息为 samantha 格式
  const mergedText = history.map((m) => {
    const role = m.role === 'user' ? 'user' : 'assistant';
    return `<|im_start|>${role}\n${m.content}\n`;
  }).join('') + '<|im_end|>\n';

  // 取最后一条用户消息作为当前输入
  const lastUserMsg = [...history].reverse().find((m) => m.role === 'user');
  const currentInput = lastUserMsg?.content ?? '';

  const body = JSON.stringify({
    messages: [
      {
        content: JSON.stringify({ text: mergedText }),
        content_type: 2001,
        attachments: [],
        references: [],
      },
    ],
    conversation_id: conversationId || '0',
    local_conversation_id: `local_16${Date.now().toString().slice(-14)}`,
    local_message_id: crypto.randomUUID(),
    completion_option: {
      is_regen: false,
      with_suggest: true,
      need_create_conversation: !conversationId,
      launch_stage: 1,
      is_replace: false,
      is_delete: false,
      message_from: 0,
      event_id: '0',
    },
    section_list: [
      {
        messages: [
          {
            role: 1,
            content: currentInput,
            content_type: 2001,
            attachments: [],
            references: [],
          },
        ],
      },
    ],
  });

  try {
    const response = await fetch(
      `https://www.doubao.com/samantha/chat/completion?${params}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://www.doubao.com/chat/',
          'Agw-js-conv': 'str',
        },
        body,
      }
    );

    if (!response.ok || !response.body) {
      const text = await response.text();
      onError(`请求失败 ${response.status}: ${text.substring(0, 200)}`);
      return;
    }

    let fullText = '';
    let thinking = '';
    let newConvId = '';
    let textBuffer = '';
    let thinkingBuffer = '';
    let inThinking = false;
    const TEXT_THRESHOLD = 20;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const flushTextBuffer = () => {
      if (textBuffer.length > 0) {
        fullText += textBuffer;
        onDelta(textBuffer);
        textBuffer = '';
      }
    };

    const flushThinkingBuffer = () => {
      if (thinkingBuffer.length > 0) {
        thinking += thinkingBuffer;
        onDelta('', thinking);
        thinkingBuffer = '';
      }
    };

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

          // 提取 conversation_id
          if (data.conversation_id && data.conversation_id !== '0' && data.conversation_id !== 'null') {
            newConvId = data.conversation_id;
          }

          // 解析 event_type 2003 (content delta)
          if (data.event_type === 2003 && data.event_data) {
            let eventData = data.event_data;

            // event_data 可能是 JSON 字符串，需要二次解析
            if (typeof eventData === 'string') {
              try {
                eventData = JSON.parse(eventData);
              } catch {
                // ignore
              }
            }

            const delta = (eventData as any)?.text
              ?? (eventData as any)?.content
              ?? (eventData as any)?.delta
              ?? (eventData as any)?.message?.content
              ?? '';

            if (typeof delta === 'string' && delta) {
              // 处理 thinking 标签
              const openTag = '<｜';
              const closeTag = '｜>';
              const thinkingStart = delta.indexOf(openTag);
              const thinkingEnd = delta.indexOf(closeTag);

              if (thinkingStart !== -1 && thinkingEnd !== -1) {
                // 标签内开始/结束
                if (!inThinking && thinkingStart < thinkingEnd) {
                  inThinking = true;
                  textBuffer += delta.substring(0, thinkingStart);
                  flushTextBuffer();
                  thinkingBuffer += delta.substring(thinkingStart + openTag.length, thinkingEnd);
                } else if (inThinking && thinkingEnd > thinkingStart) {
                  thinkingBuffer += delta.substring(0, thinkingEnd);
                  flushThinkingBuffer();
                  textBuffer += delta.substring(thinkingEnd + closeTag.length);
                  inThinking = false;
                }
              } else if (inThinking) {
                thinkingBuffer += delta;
                flushThinkingBuffer();
              } else {
                textBuffer += delta;
                if (textBuffer.length >= TEXT_THRESHOLD) {
                  flushTextBuffer();
                }
              }
            }
          }

          // 标准 SSE 兜底
          const delta = data.choices?.[0]?.delta?.content
            ?? data.text
            ?? data.content
            ?? data.delta
            ?? '';

          if (typeof delta === 'string' && delta) {
            textBuffer += delta;
            if (textBuffer.length >= TEXT_THRESHOLD) {
              flushTextBuffer();
            }
          }

          // STREAM_END 或 DONE
          if (data.event_type === 'STREAM_END' || data.done || data.is_done) {
            flushTextBuffer();
            if (inThinking) {
              flushThinkingBuffer();
              inThinking = false;
            }
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    // 处理残余 buffer
    flushTextBuffer();
    if (inThinking) {
      flushThinkingBuffer();
    }

    onDone(fullText, newConvId, thinking || undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '网络请求失败';
    onError(msg);
  }
}
