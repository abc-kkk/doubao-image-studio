// @ts-nocheck
console.log('Doubao Shadow Node: Hook Script Injected Successfully');
console.log('Doubao Shadow Node: page URL is', window.location.href);
const originalFetch = window.fetch;

window.fetch = async function (url: string | URL | Request, options?: RequestInit) {
    const urlStr = url?.toString() || '';
    
    // Debug: log all fetch requests (first 50 only)
    if (!window._fetchCount) window._fetchCount = 0;
    if (window._fetchCount < 50) {
        console.log('[Hook] Fetch:', urlStr.substring(0, 100), options?.method || 'GET');
        window._fetchCount++;
    }

    const response = await originalFetch(url, options);

    // Start standard stream parsing
    // Check for various possible API endpoints
    const isChatAPI = urlStr.includes('chat/completion') || 
                      urlStr.includes('chat/completions') || 
                      urlStr.includes('api/chat') ||
                      urlStr.includes('v1/chat');
    
    if (isChatAPI) {
        console.log('Doubao Shadow Node: Intercepted chat API:', urlStr);

        const clone = response.clone();
        const reader = clone.body.getReader();
        const decoder = new TextDecoder();

        let accumulatedText = '';
        let images = [];

        let buffer = '';

        (async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    buffer += chunk;

                    const lines = buffer.split('\n');
                    // Keep the last line in the buffer as it might be incomplete
                    buffer = lines.pop();

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.slice(6).trim();
                            if (!jsonStr || jsonStr === '[DONE]') continue;

                            try {
                                const data = JSON.parse(jsonStr);

                                // Debug: log all event types
                                if (data.event_type) {
                                    console.log('[Hook] event_type:', data.event_type, 'has event_data:', !!data.event_data);
                                }
                                if (data.event_type === 2001 && data.event_data) {
                                    const eventData = JSON.parse(data.event_data);
                                    console.log('[Hook] content_type:', eventData.message?.content_type, 'is_finish:', eventData.is_finish);

                                    // Extract text from various content types
                                    // 2001: user message, 2018: AI response, 10000: other text, 2071: code blocks
                                    if (eventData.message && [2001, 2018, 10000, 2071].includes(eventData.message.content_type)) {
                                        try {
                                            const content = JSON.parse(eventData.message.content);
                                            if (content.text) {
                                                accumulatedText += content.text;
                                                // Send progress update with accumulated text
                                                window.postMessage({ type: 'DOUBAO_PROGRESS', text: content.text }, '*');
                                            }
                                        } catch (e) {
                                            // content might not be JSON
                                        }
                                    }

                                    // Extract images (content_type 2074)
                                    if (eventData.message && eventData.message.content_type === 2074) {
                                        try {
                                            const content = JSON.parse(eventData.message.content);
                                            if (content.creations && Array.isArray(content.creations)) {
                                                content.creations.forEach(creation => {
                                                    if (creation.type === 1 && creation.image) {
                                                        const imgData = creation.image;
                                                        images.push({
                                                            // High-res (No watermark)
                                                            url: imgData.image_ori_raw?.url || imgData.image_ori?.url || '',
                                                            // Preview / Thumbnail
                                                            thumbnail_url: imgData.image_thumb?.url || imgData.image_preview?.url || imgData.image_ori_raw?.url || '',
                                                            width: imgData.image_ori_raw?.width || imgData.image_ori?.width || 1024,
                                                            height: imgData.image_ori_raw?.height || imgData.image_ori?.height || 1024
                                                        });
                                                    }
                                                });
                                                console.log('Doubao Shadow Node: Extracted images:', images.length);
                                                // Notify progress: images found
                                                window.postMessage({ type: 'DOUBAO_PROGRESS', text: `已生成 ${images.length} 张图片，等待完成...` }, '*');
                                            }
                                        } catch (e) {
                                            console.log('Image content parse error:', e);
                                        }
                                    }

                                    // Send final result when finished
                                    if (eventData.is_finish) {
                                        console.log('Doubao Shadow Node: Sending Final Result', {
                                            text: accumulatedText.substring(0, 50),
                                            images: images.length
                                        });
                                        window.postMessage({
                                            type: 'DOUBAO_CHUNK',
                                            text: accumulatedText,
                                            images: images,
                                            is_finish: true
                                        }, '*');
                                    }
                                }
                            } catch (e) {
                                console.log('Parse error for line:', line.substring(0, 100), e);
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('Doubao Shadow Node: Error reading stream', err);
            }
        })();
    }

    return response;
};
