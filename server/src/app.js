/**
 * Main Application Entry Point
 * 重构后的模块化服务器
 */

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import websocketService from './services/websocket.service.js';
import dbService from './services/db.service.js';
import sharp from 'sharp';
import chatRoutes from './routes/chat.routes.js';
import imageRoutes from './routes/image.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8010;
const MAX_PAYLOAD = 512 * 1024 * 1024;

// Create Express app
const app = express();
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: MAX_PAYLOAD
});

// Initialize WebSocket service
websocketService.initialize(wss);

// Middleware
app.use(cors());
app.use(express.json({ limit: '512mb' }));
app.use(express.urlencoded({ limit: '512mb', extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/images', express.static(path.join(__dirname, '../images')));

// API Routes
app.use('/api/chat', chatRoutes);
app.use('/api/images', imageRoutes);

// Metadata Database API
app.get('/api/history', (req, res) => {
    try {
        const history = dbService.getImages(200);
        res.json({ success: true, history });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/history', (req, res) => {
    try {
        const image = req.body;
        dbService.saveImage(image);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/history/:id', (req, res) => {
    try {
        dbService.deleteImage(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/history', (req, res) => {
    try {
        dbService.clearAll();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Image Compression API
app.post('/api/compress', async (req, res) => {
    try {
        const { image, format, quality, targetSize = 1024 * 1024 } = req.body;
        if (!image) return res.status(400).json({ error: 'Missing image data' });

        let buffer;
        if (image.startsWith('data:')) {
            buffer = Buffer.from(image.split(',')[1], 'base64');
        } else if (image.startsWith('/Users/')) {
            buffer = await fs.promises.readFile(image);
        } else {
            return res.status(400).json({ error: 'Invalid image format or path' });
        }

        const origSize = buffer.length;
        let q = parseInt(quality) || 80;
        let fmt = (format || 'jpeg').toLowerCase();
        if (fmt === 'jpg') fmt = 'jpeg';

        let transformer = sharp(buffer);
        let resultBuffer;
        let currentWidth, currentHeight;

        const metadata = await transformer.metadata();
        currentWidth = metadata.width;
        currentHeight = metadata.height;

        // Iterative compression logic
        async function encode(img, quality) {
            if (fmt === 'png') {
                return await img.png({ compressionLevel: 9, palette: true }).toBuffer();
            } else if (fmt === 'webp') {
                return await img.webp({ quality }).toBuffer();
            } else {
                return await img.jpeg({ quality, mozjpeg: true }).toBuffer();
            }
        }

        resultBuffer = await encode(transformer, q);

        // If still too large, lower quality
        if (resultBuffer.length > targetSize && fmt !== 'png') {
            while (resultBuffer.length > targetSize && q > 20) {
                q -= 10;
                resultBuffer = await encode(transformer, Math.max(q, 20));
            }
        }

        // If still too large, resize
        let workImg = transformer;
        while (resultBuffer.length > targetSize) {
            if (currentWidth <= 200 || currentHeight <= 200) break;
            currentWidth = Math.round(currentWidth * 0.8);
            currentHeight = Math.round(currentHeight * 0.8);
            workImg = workImg.resize(currentWidth, currentHeight);
            resultBuffer = await encode(workImg, Math.max(q, 30));
        }

        const compSize = resultBuffer.length;
        const b64 = resultBuffer.toString('base64');
        const mime = `image/${fmt}`;
        
        res.json({
            success: true,
            dataUrl: `data:${mime};base64,${b64}`,
            origSize,
            compSize,
            width: currentWidth,
            height: currentHeight,
            format: fmt
        });

    } catch (error) {
        console.error('Compression error:', error);
        res.status(500).json({ error: error.message });
    }
});



// Local file proxy with dynamic resizing support
app.get('/local-proxy', async (req, res) => {
    const filePath = req.query.path;
    const width = parseInt(req.query.w);
    const height = parseInt(req.query.h);

    if (!filePath) return res.status(400).send('Missing path');
    
    // Security: Only allow files from the user's home directory
    if (!filePath.startsWith('/Users/')) {
        console.warn(`[Server] Blocked out-of-scope access: ${filePath}`);
        return res.status(403).send('Access denied: Outside allowed scope');
    }

    try {
        if (width || height) {
            // Use sharp to resize on the fly
            const transformer = sharp(filePath);
            if (width && height) {
                transformer.resize(width, height, { fit: 'cover' });
            } else if (width) {
                transformer.resize(width);
            } else if (height) {
                transformer.resize(height);
            }
            
            const buffer = await transformer.toBuffer();
            res.set('Content-Type', 'image/png');
            res.send(buffer);
            console.log(`[Server] Resized and proxied: ${filePath} (${width || 'auto'}x${height || 'auto'})`);
        } else {
            // Standard proxy
            res.sendFile(filePath, (err) => {
                if (err) {
                    console.error(`[Server] Proxy error for ${filePath}:`, err.message);
                    if (!res.headersSent) res.status(404).send('File not found');
                } else {
                    console.log(`[Server] Successfully proxied: ${filePath}`);
                }
            });
        }
    } catch (error) {
        console.error(`[Server] Resize/Proxy error for ${filePath}:`, error.message);
        if (!res.headersSent) res.status(500).send('Internal Server Error');
    }
});

// Health check
app.get('/api/health', (req, res) => {
    const status = websocketService.getStatus();
    res.json({
        status: 'running',
        version: '2.0.5-debug',
        features: ['local-proxy', 'sharp-resize'],
        ...status,
        timestamp: new Date().toISOString()
    });
});

// Serve config.json
app.get('/config.json', (req, res) => {
    res.sendFile(path.join(__dirname, '../config.json'));
});

// Legacy unified API endpoint (for backward compatibility)
app.post('/api/unified', async (req, res) => {
    try {
        const { mode, model, prompt, image, reference_images, aspect_ratio } = req.body;

        if (!mode || !model || !prompt) {
            return res.status(400).json({
                error: 'Missing required fields: mode, model, prompt'
            });
        }

        // Import services dynamically to avoid circular dependencies
        const { default: aiService } = await import('./services/ai.service.js');
        const { default: imageService } = await import('./services/image.service.js');

        if (mode === 'chat') {
            const response = await aiService.handleChat(model, prompt);
            const text = aiService.extractText(response);
            res.json({ success: true, text, model, rawResponse: response });
        } else if (mode === 'image_generation') {
            const response = await aiService.handleImageGeneration(
                model,
                prompt,
                reference_images || [],
                aspect_ratio || 'Auto'
            );
            const text = aiService.extractText(response);
            const images = aiService.extractImages(response);

            res.json({ success: true, text, images, model, rawResponse: response });
        } else {
            res.status(400).json({ error: `Unsupported mode: ${mode}` });
        }

    } catch (error) {
        console.error('Unified API error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// Legacy v1beta endpoint (for backward compatibility)
app.post(/\/v1beta\/(.*)/, async (req, res) => {
    const model = req.params[0].split(':')[0];
    const cleanModelName = model.replace('models/', '');

    console.log(`📨 Legacy Request: ${cleanModelName}`);

    const targetSocket = websocketService.getTargetSocket(cleanModelName);

    if (!targetSocket) {
        return res.status(503).json({
            error: {
                code: 503,
                message: `Service Unavailable: No worker for '${cleanModelName}'`,
                status: 'UNAVAILABLE'
            }
        });
    }

    const { default: crypto } = await import('crypto');
    const id = crypto.randomUUID();

    const message = JSON.stringify({
        type: 'GENERATE',
        requestId: id,
        model: cleanModelName,
        contents: req.body.contents,
        config: req.body.generationConfig,
        reference_images_b64: req.body.reference_images_b64 || [],
        aspect_ratio: req.body.aspect_ratio || 'Auto'
    });

    websocketService.sendRequest(id, res, targetSocket, message);
});

// Serve main app
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Helper function
async function downloadImageAsBase64(url) {
    try {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return `data:image/png;base64,${base64}`;
    } catch (error) {
        console.error('Error downloading image:', error);
        throw error;
    }
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Doubao AI Studio Server running at: http://0.0.0.0:${PORT}`);
    console.log(`📱 Web App: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`📊 Health Check: http://localhost:${PORT}/api/health`);
});

export default app;
