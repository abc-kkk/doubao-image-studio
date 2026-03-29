(function () {
    console.log('Doubao Shadow Node: Hook Script Injected Successfully');
    const originalFetch = window.fetch;
    window.fetch = async function (url, options) {
        const response = await originalFetch(url, options);

        if (url && url.toString().includes('chat/completion')) {
            console.log('Doubao Shadow Node: Intercepted chat completion', url);

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

                                    // Only process event_type 2001 (message events)
                                    if (data.event_type === 2001 && data.event_data) {
                                        const eventData = JSON.parse(data.event_data);

                                        // Extract text from various content types
                                        // 2001: user message, 2018: AI response, 10000: other text, 2071: code blocks
                                        if (eventData.message && [2001, 2018, 10000, 2071].includes(eventData.message.content_type)) {
                                            try {
                                                const content = JSON.parse(eventData.message.content);
                                                if (content.text) {
                                                    accumulatedText += content.text;
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
                                                        if (creation.type === 1 && creation.image && creation.image.image_ori_raw) {
                                                            images.push({
                                                                url: creation.image.image_ori_raw.url,
                                                                width: creation.image.image_ori_raw.width,
                                                                height: creation.image.image_ori_raw.height
                                                            });
                                                        }
                                                    });
                                                    console.log('Doubao Shadow Node: Extracted images:', images.length);
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
})();
