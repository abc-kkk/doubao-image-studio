import { processPrompt } from './core/prompt';

console.log('Doubao Shadow Node: Content Script Loaded');

// Inject the hook script
const hookScript = document.createElement('script');
// Need to use chrome.runtime.getURL for Vite CRX processed assets correctly
hookScript.src = chrome.runtime.getURL('assets/hook.js');
(document.head || document.documentElement).appendChild(hookScript);

let currentRequestId: string | null = null;
let accumulatedResponse = '';
let responseTimeout: number | null = null;

// Listen for messages from the injected hook script
window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data.type === 'DOUBAO_PROGRESS') {
        if (currentRequestId && chrome.runtime && chrome.runtime.id) {
            chrome.runtime.sendMessage({
                type: 'PROGRESS',
                requestId: currentRequestId,
                text: event.data.text
            }).catch(() => {});
        }
        return;
    }

    if (event.data.type === 'DOUBAO_CHUNK') {
        const text = event.data.text;
        const images = event.data.images || [];

        accumulatedResponse += text;

        console.log('Received chunk:', { text: text.substring(0, 50), images: images.length });

        // Check if extension context is still valid
        if (!chrome.runtime || !chrome.runtime.id) {
            console.warn('Doubao Shadow Node: Extension context invalidated, ignoring message.');
            return;
        }

        // Send final result when finished
        if (event.data.is_finish || event.data.is_finish === true) {
            console.log('Response finished via Hook:', { text: accumulatedResponse.substring(0, 100), images: images.length });

            if (currentRequestId) {
                if (responseTimeout !== null) {
                    clearTimeout(responseTimeout);
                    responseTimeout = null;
                }
                
                try {
                    chrome.runtime.sendMessage({
                        type: 'RESULT',
                        requestId: currentRequestId,
                        text: accumulatedResponse,
                        images: images
                    });
                } catch (err) {
                    console.error('Failed to send result:', err);
                }
                currentRequestId = null;
                accumulatedResponse = '';
            }
        }
    }
});

chrome.runtime.onMessage.addListener((request: any, _sender: any, sendResponse: any) => {
    if (request.type === 'PROMPT') {
        currentRequestId = request.requestId;
        accumulatedResponse = ''; // Reset for new request

        processPrompt(
            request.text,
            request.requestId,
            request.isImageMode,
            request.referenceImages || [],
            request.aspectRatio || 'Auto',
            request.switchToImageMode || false
        ).catch(err => {
            console.error('Error processing prompt:', err);
        });

        sendResponse({ status: 'processing' });

        // Set timeout
        if (responseTimeout !== null) {
            clearTimeout(responseTimeout);
        }
        // @ts-ignore
        responseTimeout = setTimeout(() => {
            if (currentRequestId === request.requestId) {
                if (accumulatedResponse.length > 0) {
                    chrome.runtime.sendMessage({ type: 'RESULT', requestId: request.requestId, text: accumulatedResponse });
                } else {
                    chrome.runtime.sendMessage({ type: 'RESULT', requestId: request.requestId, text: "Error: Timeout" });
                }
                currentRequestId = null;
            }
        }, 60000);
    }

    if (request.type === 'CHAT_REQUEST') {
        console.log('[CHAT] content script received CHAT_REQUEST', request.requestId);
        sendResponse({ status: 'processing' });
        handleChatFetch(request).catch(err => {
            console.error('[CHAT] handleChatFetch error:', err);
            chrome.runtime.sendMessage({ type: 'CHAT_ERROR', requestId: request.requestId, error: err.message });
        });
        return true;
    }

    return true;
});

async function handleChatFetch(request: any) {
    const { requestId, messages, conversationId } = request;

    const params = new URLSearchParams({
        aid: '497858', device_platform: 'web', language: 'zh',
        pkg_type: 'release_version', real_aid: '497858', region: 'CN',
        samantha_web: '1', sys_region: 'CN', use_olympus_account: '1', version_code: '20800',
    });

    // Merge multi-turn messages into samantha format
    const mergedText = messages.map((m: any) => {
        const role = m.role === 'user' ? 'user' : 'assistant';
        return `<|im_start|>${role}\n${m.content}\n`;
    }).join('') + '<|im_end|>\n';

    // Get the last user message as current input
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
    const currentInput = lastUserMsg?.content ?? '';

    const body = JSON.stringify({
        messages: [{
            content: JSON.stringify({ text: mergedText }),
            content_type: 2001,
            attachments: [],
            references: [],
        }],
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
        section_list: [{
            messages: [{
                role: 1,
                content: currentInput,
                content_type: 2001,
                attachments: [],
                references: [],
            }],
        }],
    });

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
        const errText = await response.text();
        console.error('[CHAT] API error body:', errText.substring(0, 500));
        throw new Error(`API error ${response.status}: ${errText.substring(0, 200)}`);
    }

    let fullText = '';
    let newConversationId = conversationId || '';
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

                // Extract conversation_id
                if (data.conversation_id && data.conversation_id !== '0' && data.conversation_id !== 'null') {
                    newConversationId = data.conversation_id;
                }

                // Extract delta based on event type
                let delta = '';
                if (data.event_type === 2003 && data.event_data) {
                    let eventData = data.event_data;
                    if (typeof eventData === 'string') {
                        try { eventData = JSON.parse(eventData); } catch {}
                    }
                    delta = (eventData as any)?.text ?? (eventData as any)?.content ?? '';
                }
                delta = delta || data.choices?.[0]?.delta?.content
                    || data.choices?.[0]?.message?.content
                    || data.text || data.delta || '';

                if (delta) {
                    fullText += delta;
                    chrome.runtime.sendMessage({
                        type: 'CHAT_CHUNK',
                        requestId,
                        delta,
                    }).catch(() => {});
                }

                if (data.event_type === 'STREAM_END' || data.done) {
                    break;
                }
            } catch { /* skip malformed */ }
        }
    }

    console.log('[CHAT] final text length:', fullText.length);

    chrome.runtime.sendMessage({
        type: 'CHAT_END',
        requestId,
        text: fullText,
        conversationId: newConversationId,
    });
}
