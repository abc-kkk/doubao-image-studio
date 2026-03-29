import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import cors from 'cors';
import modelScopeService from './src/services/modelscope.service.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080; // Use 8080 for Doubao project
const REQUEST_TIMEOUT = 240000; // 4 minutes

const app = express();
const server = http.createServer(app);

const MAX_PAYLOAD = 512 * 1024 * 1024;
const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: MAX_PAYLOAD
});

let appletSocket = null; // Legacy fallback (Gemini)
const modelSocketMap = new Map(); // Map model names to sockets
const pendingRequests = new Map();

// =================================================================
// Heartbeat
// =================================================================
function heartbeat() {
    this.isAlive = true;
}

const interval = setInterval(function ping() {
    const socketsToCheck = new Set([appletSocket, ...modelSocketMap.values()]);

    socketsToCheck.forEach(ws => {
        if (!ws) return;

        if (ws.isAlive === false) {
            if (pendingRequests.size > 0) {
                console.log(`⚠️ Heartbeat missed, but ${pendingRequests.size} tasks running. Keeping alive...`);
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

wss.on('close', () => {
    clearInterval(interval);
});

// =================================================================
// WebSocket Connection
// =================================================================
wss.on('connection', (ws) => {
    console.log('✅ New Worker Connected!');

    ws.isAlive = true;
    ws.on('pong', heartbeat);

    // Default to legacy appletSocket if no REGISTER message received yet
    if (!appletSocket) {
        appletSocket = ws;
        console.log('   -> Defaulting to Legacy Gemini Worker');
    }

    ws.on('message', (message) => {
        ws.isAlive = true;

        try {
            const msgString = message.toString();
            if (msgString.trim().toLowerCase().startsWith('p')) return;

            const msg = JSON.parse(msgString);

            // Handle Registration
            if (msg.type === 'REGISTER' && Array.isArray(msg.models)) {
                console.log(`📝 Worker Registered Models: ${msg.models.join(', ')}`);
                msg.models.forEach(model => {
                    modelSocketMap.set(model, ws);
                });
                return;
            }

            // Handle Responses
            let id, success, payload, error;

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

            if (pendingRequests.has(id)) {
                const { res, timeoutId } = pendingRequests.get(id);
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
                    res.status(500).json({ error: { code: 500, message: error || 'Unknown error', status: 'INTERNAL_ERROR' } });
                }
                pendingRequests.delete(id);
            }
        } catch (e) {
            if (!e.message.includes('Unexpected token')) {
                console.error('⚠️ Non-standard message:', e.message);
            }
        }
    });

    ws.on('close', () => {
        console.log('❌ Worker Disconnected.');
        if (appletSocket === ws) appletSocket = null;
        for (const [model, socket] of modelSocketMap.entries()) {
            if (socket === ws) modelSocketMap.delete(model);
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket Error:', err);
    });
});

// =================================================================
// Express HTTP Server
// =================================================================

app.use(cors());
app.use(express.json({ limit: '512mb' }));
app.use(express.urlencoded({ limit: '512mb', extended: true }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'web_client.html'));
});

app.get('/status', (req, res) => {
    res.status(200).json({
        status: 'running',
        legacyConnected: !!appletSocket,
        registeredModels: Array.from(modelSocketMap.keys()),
        pendingTasks: pendingRequests.size
    });
});

app.post(/\/v1beta\/(.*)/, async (req, res) => {
    const modelPath = req.params[0]; // e.g., "models/gemini-2.0-flash:generateContent"
    const model = modelPath.split(':')[0].replace('models/', '');

    console.log(`📨 Request: ${model}`);

    // =================================================================
    // 1. ModelScope (Mota)
    // =================================================================
    if (model === 'mota') {
        try {
            const prompt = req.body.contents[0].parts[0].text;
            const data = await modelScopeService.handleChat(prompt);
            return res.json(data);
        } catch (error) {
            return res.status(500).json({ error: { code: 500, message: error.message, status: 'INTERNAL_ERROR' } });
        }
    }

    if (model === 'mota-image') {
        try {
            const prompt = req.body.contents[0].parts[0].text;
            const data = await modelScopeService.generateImage(prompt);
            return res.json(data);
        } catch (error) {
            return res.status(500).json({ error: { code: 500, message: error.message, status: 'INTERNAL_ERROR' } });
        }
    }

    // =================================================================
    // 2. Doubao (WebSocket)
    // =================================================================
    if (modelSocketMap.has(model) || (appletSocket && !model.startsWith('gemini'))) {
        let targetSocket = modelSocketMap.get(model);

        if (!targetSocket) {
            if (appletSocket) {
                targetSocket = appletSocket;
                console.log(`   -> Forwarding to Legacy Worker`);
            } else {
                return res.status(503).json({ error: { code: 503, message: `Service Unavailable: No worker for '${model}'`, status: 'UNAVAILABLE' } });
            }
        } else {
            console.log(`   -> Forwarding to Registered Worker (${model})`);
        }

        const id = crypto.randomUUID();
        const path = req.originalUrl;

        const timeoutId = setTimeout(() => {
            if (pendingRequests.has(id)) {
                console.log(`⏰ Task [${id}] Timeout`);
                res.status(504).json({ error: { code: 504, message: 'Gateway Timeout', status: 'DEADLINE_EXCEEDED' } });
                pendingRequests.delete(id);
            }
        }, REQUEST_TIMEOUT);

        pendingRequests.set(id, { res, timeoutId });

        let message;
        if (modelSocketMap.has(model)) {
            message = JSON.stringify({
                type: 'GENERATE',
                requestId: id,
                model: model,
                contents: req.body.contents,
                config: req.body.generationConfig,
                reference_images_b64: req.body.reference_images_b64 || [],
                aspect_ratio: req.body.aspect_ratio || 'Auto'
            });
        } else {
            message = JSON.stringify({ id, path, body: req.body });
        }

        targetSocket.send(message);
        return;
    }

    // =================================================================
    // 3. Gemini (Proxy + Fallback)
    // =================================================================
    // Default to Gemini Proxy for everything else
    const baseUrl = 'https://gemini-reply.onrender.com/v1beta/models';
    const url = `${baseUrl}/${model}:generateContent`;

    console.log(`   -> Proxying to Gemini: ${url}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        res.json(data);

    } catch (error) {
        console.error('Gemini Proxy Error:', error);
        console.log('⚠️ Gemini failed, attempting fallback to ModelScope...');

        try {
            // Extract prompt
            const prompt = req.body.contents?.[0]?.parts?.[0]?.text || '';
            if (!prompt) throw new Error('No prompt found for fallback');

            const fallbackData = await modelScopeService.handleChat(prompt, "You are a helpful assistant (Fallback from Gemini).");
            res.json(fallbackData);
        } catch (fallbackError) {
            console.error('Fallback failed:', fallbackError);
            res.status(500).json({ error: { code: 500, message: `Gemini failed and Fallback failed: ${fallbackError.message}`, status: 'INTERNAL_ERROR' } });
        }
    }
});

// =================================================================
// Unified API Endpoint
// =================================================================
app.post('/api/unified', async (req, res) => {
    try {
        const { mode, model, prompt, image, reference_images, aspect_ratio } = req.body;

        if (!mode || !model || !prompt) {
            return res.status(400).json({ error: 'Missing required fields: mode, model, prompt' });
        }

        let targetModel = '';
        let isDoubao = false;

        // 1. Map simplified model to actual model name
        if (mode === 'chat') {
            if (model === 'g2') targetModel = 'gemini-2.0-flash';
            else if (model === 'g2.5') targetModel = 'gemini-2.5-flash';
            else if (model === 'g3') targetModel = 'gemini-3-pro-preview';
            else if (model === 'db') { targetModel = 'doubao-pro'; isDoubao = true; }
            else if (model === 'mota') { targetModel = 'mota'; }
        } else if (mode === 'image_generation') {
            if (model === 'g2.5') targetModel = 'gemini-2.5-flash-image';
            else if (model === 'db') { targetModel = 'doubao-pro-image'; isDoubao = true; }
        } else if (mode === 'vision') {
            if (model === 'g3') targetModel = 'gemini-3-pro-preview';
        }

        if (!targetModel) {
            return res.status(400).json({ error: `Invalid model '${model}' for mode '${mode}'` });
        }

        // 2. Construct Gemini-compatible request body
        const parts = [{ text: prompt }];
        if (image) {
            // Assume image is base64 string
            parts.push({
                inlineData: {
                    mimeType: "image/jpeg", // Default to jpeg, or detect if possible
                    data: image
                }
            });
        }

        const geminiBody = {
            contents: [{ parts: parts }],
            generationConfig: {
                temperature: 0.7 // Default config
            }
        };

        // 3. Route request
        if (isDoubao) {
            // Use existing WebSocket logic
            const cleanModelName = targetModel;
            let targetSocket = modelSocketMap.get(cleanModelName);

            if (!targetSocket) {
                return res.status(503).json({ error: { code: 503, message: `Service Unavailable: No worker for '${cleanModelName}'`, status: 'UNAVAILABLE' } });
            }

            const id = crypto.randomUUID();
            const timeoutId = setTimeout(() => {
                if (pendingRequests.has(id)) {
                    res.status(504).json({ error: { code: 504, message: 'Gateway Timeout', status: 'DEADLINE_EXCEEDED' } });
                    pendingRequests.delete(id);
                }
            }, REQUEST_TIMEOUT);

            pendingRequests.set(id, { res, timeoutId });

            const message = JSON.stringify({
                type: 'GENERATE',
                requestId: id,
                model: cleanModelName,
                contents: geminiBody.contents,
                config: geminiBody.generationConfig,
                reference_images_b64: reference_images || [],
                aspect_ratio: aspect_ratio || 'Auto'
            });

            targetSocket.send(message);

        } else if (targetModel === 'mota') {
            // Direct ModelScope request
            try {
                const data = await modelScopeService.handleChat(prompt);
                res.json(data);
            } catch (error) {
                res.status(500).json({ error: { code: 500, message: error.message, status: 'INTERNAL_ERROR' } });
            }
        } else {
            // Proxy to Gemini Relay (gemini-reply.onrender.com)
            const baseUrl = 'https://gemini-reply.onrender.com/v1beta/models';
            const url = `${baseUrl}/${targetModel}:generateContent`;

            console.log(`Proxying to Gemini: ${url}`);

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(geminiBody)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Gemini API error: ${response.status} ${errorText}`);
                }

                const data = await response.json();
                res.json(data);

            } catch (error) {
                console.error('Gemini Proxy Error:', error);
                console.log('⚠️ Gemini failed, attempting fallback to ModelScope...');

                try {
                    const fallbackData = await modelScopeService.handleChat(prompt);
                    res.json(fallbackData);
                } catch (fallbackError) {
                    console.error('Fallback failed:', fallbackError);
                    res.status(500).json({ error: { code: 500, message: `Gemini failed and Fallback failed: ${fallbackError.message}`, status: 'INTERNAL_ERROR' } });
                }
            }
        }

    } catch (error) {
        console.error('Unified API Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Doubao Relay Server running at: http://0.0.0.0:${PORT}`);
});
