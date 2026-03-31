const RELAY_WS_URL = 'ws://localhost:8081/ws'; // AI Studio local server
let socket: WebSocket | null = null;
let keepAliveInterval: number | null = null;

// Initialize alarm for keep-alive/reconnect
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        checkConnection();
    }
});

function checkConnection() {
    if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        console.log('Alarm: Connection lost, reconnecting...');
        connect();
    } else if (socket.readyState === WebSocket.OPEN) {
        // Send a ping to keep the connection alive at the application level
        socket.send(JSON.stringify({ type: 'PING' }));
    }
}

function connect() {
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
        return; // Already connecting or connected
    }

    console.log('Connecting to Relay:', RELAY_WS_URL);
    socket = new WebSocket(RELAY_WS_URL);

    socket.onopen = () => {
        console.log('Connected to Relay');
        // Register as a worker for 'doubao-pro' and 'doubao-pro-image' models
        socket?.send(JSON.stringify({
            type: 'REGISTER',
            models: ['doubao-pro', 'doubao-pro-image']
        }));

        // Clear interval if it exists (we use alarms now, but keep this for immediate in-memory keep-alive)
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        keepAliveInterval = setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) {
                socket?.send(JSON.stringify({ type: 'PING' }));
            }
        }, 30000) as unknown as number;
    };

    socket.onmessage = async (event) => {
        try {
            const msg = JSON.parse(event.data);
            console.log('Received message:', msg);

            if (msg.type === 'GENERATE' && (msg.model === 'doubao-pro' || msg.model === 'doubao-pro-image')) {
                handleGenerateRequest(msg);
            }

            if (msg.type === 'CHAT') {
                handleChatRequest(msg);
            }
        } catch (e) {
            console.error('Error parsing message:', e);
        }
    };

    socket.onclose = () => {
        console.log('Disconnected from Relay. Reconnecting in 5s...');
        // Clear the interval to stop pinging a dead socket
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        keepAliveInterval = null;

        setTimeout(connect, 5000);
    };

    socket.onerror = (err) => {
        console.error('WebSocket error:', err);
        // Don't close immediately, let onclose handle it, or close if it's not connecting
        if (socket?.readyState === WebSocket.OPEN) {
            socket?.close();
        }
    };
}

async function handleGenerateRequest(msg: any) {
    // Find the Doubao tab
    const tabs = await chrome.tabs.query({ url: "https://www.doubao.com/*" });

    if (tabs.length === 0) {
        console.error('No Doubao tab found');
        sendError(msg.requestId, "Doubao tab not open. Please open https://www.doubao.com/chat/");
        return;
    }

    const tabId = tabs[0].id;
    if (!tabId) return;

    // Activate the tab to ensure it's "awake" and ready
    await chrome.tabs.update(tabId, { active: true });

    const prompt = msg.contents[0].parts[0].text;
    const isImageMode = msg.model === 'doubao-pro-image';

    // Extract reference images and aspect ratio
    const referenceImages = msg.reference_images_b64 || [];
    const aspectRatio = msg.aspect_ratio || 'Auto';
    const switchToImageMode = msg.switch_to_image_mode || false;

    console.log(`Sending to content script: ${prompt.substring(0, 50)}...`);
    console.log(`Reference images: ${referenceImages.length}, Aspect ratio: ${aspectRatio}, Switch mode: ${switchToImageMode}`);

    // Send to content script with retry
    let retries = 3;
    const maxRetries = 3;
    while (retries > 0) {
        try {
            console.log(`Sending to tab ${tabId}, attempt ${maxRetries - retries + 1}...`);
            const response = await chrome.tabs.sendMessage(tabId, {
                type: 'PROMPT',
                text: prompt,
                requestId: msg.requestId,
                isImageMode: isImageMode,
                switchToImageMode: switchToImageMode,
                referenceImages: referenceImages,
                aspectRatio: aspectRatio
            });
            console.log('Content script responded:', response);
            return; // Success
        } catch (e: any) {
            console.error(`Attempt ${maxRetries - retries + 1} failed: ${e.message}`);
            retries--;

            if (retries === 0) {
                // Last attempt failed, try to inject content script manually
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['assets/src/content/index.js'] // Vite builds content script here
                    });
                    console.log('Manually injected content script, retrying...');
                    await new Promise(r => setTimeout(r, 1000));

                    // One more try after injection
                    await chrome.tabs.sendMessage(tabId, {
                        type: 'PROMPT',
                        text: prompt,
                        requestId: msg.requestId,
                        isImageMode: isImageMode,
                        switchToImageMode: switchToImageMode,
                        referenceImages: referenceImages,
                        aspectRatio: aspectRatio
                    });
                    return;
                } catch (injectError) {
                    console.error('Failed to inject or communicate after injection:', injectError);
                    sendError(msg.requestId, "Failed to communicate with Doubao tab. Please refresh the Doubao page manually.");
                }
            } else {
                // Exponential backoff or just a delay
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }
}

// conversation_id persistence for multi-turn chat
let currentConversationId: string = '';

async function handleChatRequest(msg: any) {
    const { requestId, messages } = msg;
    const conversationId = currentConversationId;

    // Build query params matching doubao web
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

    const url = `https://www.doubao.com/samantha/chat/completion?${params}`;

    const body = JSON.stringify({
        messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
        conversation_id: conversationId,
        local_conversation_id: `local_16${Date.now().toString().slice(-14)}`,
        local_message_id: crypto.randomUUID(),
        completion_option: {
            is_regen: false,
            with_suggest: false,
            need_create_conversation: conversationId === '',
            launch_stage: 1,
            is_replace: false,
            is_delete: false,
            message_from: 0,
            event_id: '0',
        },
        section_list: [
            {
                messages: messages.map((m: any) => ({
                    role: m.role === 'user' ? 1 : 2,
                    content: m.content,
                    content_type: 2001,
                    attachments: [],
                    references: [],
                })),
            },
        ],
    });

    try {
        const response = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Referer': 'https://www.doubao.com/chat/',
                'Agw-js-conv': 'str',
            },
            body,
        });

        if (!response.ok || !response.body) {
            const errText = await response.text();
            sendError(requestId, `API error ${response.status}: ${errText.substring(0, 200)}`);
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const data = line.slice(5).trim();
                if (!data || data === '[DONE]') continue;
                try {
                    const json = JSON.parse(data);
                    // Extract conversation_id if present
                    if (json.conversation_id && json.conversation_id !== '0') {
                        currentConversationId = json.conversation_id;
                    }
                    const delta = json.choices?.[0]?.delta?.content
                        ?? json.choices?.[0]?.message?.content
                        ?? json.message?.content
                        ?? '';
                    if (delta) {
                        fullText += delta;
                        if (socket?.readyState === WebSocket.OPEN) {
                            socket.send(JSON.stringify({
                                type: 'STREAM_CHUNK',
                                requestId,
                                delta,
                            }));
                        }
                    }
                } catch { /* skip malformed */ }
            }
        }

        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'STREAM_END',
                requestId,
                text: fullText,
                conversationId: currentConversationId,
            }));
        }
    } catch (err: any) {
        sendError(requestId, err?.message ?? 'Chat fetch failed');
    }
}

// Listen for results from Content Script
chrome.runtime.onMessage.addListener((request: any, _sender: any, sendResponse: any) => {
    if (request.type === 'GET_CONFIG') {
        // Load config from server with fallback to defaults
        fetch('http://115.190.228.12:8080/config.json')
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP error! status: ${res.status}`);
                }
                return res.text();
            })
            .then(text => {
                try {
                    const config = JSON.parse(text);
                    console.log('Loaded config from server:', config);
                    sendResponse({ config });
                } catch (e) {
                    console.error('Failed to parse config JSON:', e);
                    console.error('Response was:', text.substring(0, 200));
                    // Use defaults on parse error
                    const defaultConfig = { maxMessagesPerConversation: 20, autoDeleteConversation: true };
                    console.log('Using default config:', defaultConfig);
                    sendResponse({ config: defaultConfig });
                }
            })
            .catch(err => {
                console.error('Failed to load config from server:', err);
                // Use defaults on network error
                const defaultConfig = { maxMessagesPerConversation: 20, autoDeleteConversation: true };
                console.log('Using default config:', defaultConfig);
                sendResponse({ config: defaultConfig });
            });
        return true; // Keep channel open for async response
    } else if (request.type === 'GET_SESSIONID') {
        // Get all cookies from doubao.com
        chrome.cookies.getAll({
            url: 'https://www.doubao.com'
        }, (cookies) => {
            if (cookies && cookies.length > 0) {
                // Build cookie string
                const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
                console.log('Got cookies:', cookies.map(c => c.name).join(', '));
                sendResponse(cookieString);
            } else {
                console.error('No cookies found for doubao.com');
                sendResponse(null);
            }
        });
        return true; // Keep channel open for async response
    } else if (request.type === 'PROGRESS') {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'PROGRESS',
                requestId: request.requestId,
                content: { text: request.text }
            }));
        }
    } else if (request.type === 'RESULT') {
        console.log('Got result from content script:', request);
        if (socket && socket.readyState === WebSocket.OPEN) {
            const parts: any[] = [{ text: request.text }];

            // Add images if present
            if (request.images && Array.isArray(request.images) && request.images.length > 0) {
                request.images.forEach((img: any) => {
                    parts.push({
                        imageUrl: img.url,
                        thumbnailUrl: img.thumbnail_url || img.thumbnailUrl || img.url,
                        width: img.width,
                        height: img.height
                    });
                });
            }

            socket.send(JSON.stringify({
                type: 'RESPONSE',
                requestId: request.requestId,
                content: {
                    parts: parts
                }
            }));
        }
    }
});

function sendError(requestId: string, errorMsg: string) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'ERROR',
            requestId: requestId,
            error: errorMsg
        }));
    }
}

// Initial connection
connect();
