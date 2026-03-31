/**
 * WebSocket Service
 * 管理与Chrome扩展的WebSocket连接
 */

class WebSocketService {
    constructor() {
        this.appletSocket = null; // Legacy fallback (Gemini)
        this.modelSocketMap = new Map(); // Map model names to sockets
        this.pendingRequests = new Map();
        this.progressStore = new Map(); // requestId -> { text, updatedAt }
    }

    /**
     * 初始化WebSocket服务器
     */
    initialize(wss) {
        this.wss = wss;
        this.setupHeartbeat();
        this.setupConnectionHandler();
    }

    /**
     * 设置心跳检测
     */
    setupHeartbeat() {
        const interval = setInterval(() => {
            const socketsToCheck = new Set([this.appletSocket, ...this.modelSocketMap.values()]);

            socketsToCheck.forEach(ws => {
                if (!ws) return;

                if (ws.isAlive === false) {
                    if (this.pendingRequests.size > 0) {
                        console.log(`⚠️ Heartbeat missed, but ${this.pendingRequests.size} tasks running. Keeping alive...`);
                        ws.ping();
                        return;
                    }
                    console.log('💀 Connection dead, terminating...');
                    return ws.terminate();
                }

                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);

        this.wss.on('close', () => {
            clearInterval(interval);
        });
    }

    /**
     * 设置连接处理器
     */
    setupConnectionHandler() {
        this.wss.on('connection', (ws) => {
            console.log('✅ New Worker Connected!');

            ws.isAlive = true;
            ws.on('pong', () => {
                ws.isAlive = true;
            });

            // Default to legacy appletSocket if no REGISTER message received yet
            if (!this.appletSocket) {
                this.appletSocket = ws;
                console.log('   -> Defaulting to Legacy Gemini Worker');
            }

            ws.on('message', (message) => this.handleMessage(ws, message));
            ws.on('close', () => this.handleClose(ws));
            ws.on('error', (err) => console.error('WebSocket Error:', err));
        });
    }

    /**
     * 处理WebSocket消息
     */
    handleMessage(ws, message) {
        ws.isAlive = true;

        try {
            const msgString = message.toString();
            if (msgString.trim().toLowerCase().startsWith('p')) return;

            const msg = JSON.parse(msgString);

            // Handle Registration
            if (msg.type === 'REGISTER' && Array.isArray(msg.models)) {
                console.log(`📝 Worker Registered Models: ${msg.models.join(', ')}`);
                msg.models.forEach(model => {
                    this.modelSocketMap.set(model, ws);
                });
                return;
            }

            // Handle Responses
            this.handleResponse(msg);
        } catch (e) {
            if (!e.message.includes('Unexpected token')) {
                console.error('⚠️ Non-standard message:', e.message);
            }
        }
    }

    /**
     * 处理响应消息
     */
    handleResponse(msg) {
        let id, success, payload, error;

        // Handle progress updates - store for polling
        if (msg.type === 'PROGRESS') {
            const progressText = msg.content?.text || '';
            this.progressStore.set(msg.requestId, {
                text: progressText,
                updatedAt: Date.now()
            });
            console.log(`📊 Progress [${msg.requestId}]: ${progressText}`);
            return;
        }

        if (msg.type === 'STREAM_CHUNK') {
            const pending = this.pendingRequests.get(msg.requestId);
            if (pending?.res && !pending.res.headersSent) {
                pending.res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                });
            }
            if (pending?.res) {
                pending.res.write(`data: ${JSON.stringify({ delta: msg.delta })}\n\n`);
            }
            return;
        }

        if (msg.type === 'STREAM_END') {
            const pending = this.pendingRequests.get(msg.requestId);
            if (pending) {
                const { res, timeoutId } = pending;
                clearTimeout(timeoutId);
                if (!res.headersSent) {
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                    });
                }
                res.write(`data: ${JSON.stringify({ done: true, text: msg.text, conversationId: msg.conversationId })}\n\n`);
                res.end();
                this.pendingRequests.delete(msg.requestId);
            }
            return;
        }

        if (msg.type === 'RESPONSE') {
            id = msg.requestId;
            success = true;
            payload = msg.content;
        } else if (msg.type === 'ERROR') {
            id = msg.requestId;
            success = false;
            error = msg.error;
        } else {
            // Legacy format
            ({ id, success, payload, error } = msg);
        }

        if (this.pendingRequests.has(id)) {
            const { res, timeoutId } = this.pendingRequests.get(id);
            clearTimeout(timeoutId);

            if (success) {
                // Wrap in Gemini API compatible format
                const geminiResponse = {
                    candidates: [{
                        content: payload
                    }]
                };
                res.json(geminiResponse);
            } else {
                res.status(500).json({
                    error: {
                        code: 500,
                        message: error || 'Unknown error',
                        status: 'INTERNAL_ERROR'
                    }
                });
            }
            this.pendingRequests.delete(id);
            this.progressStore.delete(id);
        }
    }

    /**
     * 处理连接关闭
     */
    handleClose(ws) {
        console.log('❌ Worker Disconnected.');
        if (this.appletSocket === ws) this.appletSocket = null;
        for (const [model, socket] of this.modelSocketMap.entries()) {
            if (socket === ws) this.modelSocketMap.delete(model);
        }
    }

    /**
     * 获取目标Socket
     */
    getTargetSocket(modelName) {
        let targetSocket = this.modelSocketMap.get(modelName);

        if (!targetSocket) {
            if (this.appletSocket) {
                targetSocket = this.appletSocket;
                console.log(`   -> Forwarding to Legacy Worker`);
            } else {
                return null;
            }
        } else {
            console.log(`   -> Forwarding to Registered Worker (${modelName})`);
        }

        return targetSocket;
    }

    /**
     * 发送请求到Worker
     */
    sendRequest(requestId, res, targetSocket, message, timeout = 240000) {
        const timeoutId = setTimeout(() => {
            if (this.pendingRequests.has(requestId)) {
                console.log(`⏰ Task [${requestId}] Timeout`);
                res.status(504).json({
                    error: {
                        code: 504,
                        message: 'Gateway Timeout',
                        status: 'DEADLINE_EXCEEDED'
                    }
                });
                this.pendingRequests.delete(requestId);
            }
        }, timeout);

        this.pendingRequests.set(requestId, { res, timeoutId });
        targetSocket.send(message);
    }

    /**
     * 获取服务状态
     */
    getStatus() {
        return {
            legacyConnected: !!this.appletSocket,
            registeredModels: Array.from(this.modelSocketMap.keys()),
            pendingTasks: this.pendingRequests.size
        };
    }
}

export default new WebSocketService();
