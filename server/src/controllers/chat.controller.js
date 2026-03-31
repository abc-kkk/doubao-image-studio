/**
 * Chat Controller
 * 处理聊天相关的请求
 */

import aiService from '../services/ai.service.js';
import websocketService from '../services/websocket.service.js';

export const chat = async (req, res) => {
    try {
        const { model, prompt, reference_images = [] } = req.body;

        if (!model || !prompt) {
            return res.status(400).json({
                error: 'Missing required fields: model, prompt'
            });
        }

        console.log(`💬 Chat request: model=${model}, prompt=${prompt.substring(0, 50)}..., images=${reference_images.length}`);

        const response = await aiService.handleChat(model, prompt, reference_images);
        const text = aiService.extractText(response);

        res.json({
            success: true,
            text,
            model,
            rawResponse: response
        });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
};

export const chatStream = async (req, res) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Missing required field: messages' });
        }

        const targetSocket = websocketService.getTargetSocket('doubao-pro');
        if (!targetSocket) {
            return res.status(503).json({ error: 'No doubao worker connected' });
        }

        const requestId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        console.log(`💬 Chat stream request [${requestId}]: ${messages.at(-1)?.content?.substring(0, 50)}...`);

        // SSE headers will be set on first STREAM_CHUNK
        req.on('close', () => {
            websocketService.pendingRequests.delete(requestId);
        });

        websocketService.sendRequest(requestId, res, targetSocket, JSON.stringify({
            type: 'CHAT',
            requestId,
            messages,
        }), 120000);

    } catch (error) {
        console.error('Chat stream error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

export const deleteCurrentConversation = async (req, res) => {
    try {
        // Find the doubao worker socket
        const targetSocket = websocketService.getTargetSocket('doubao-pro');

        if (!targetSocket) {
            return res.status(503).json({
                success: false,
                error: 'No doubao worker connected'
            });
        }

        // Send delete command to extension
        const message = JSON.stringify({
            type: 'DELETE_CURRENT_CONVERSATION'
        });

        targetSocket.send(message);

        res.json({
            success: true,
            message: 'Delete request sent to extension'
        });

    } catch (error) {
        console.error('Delete current conversation error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
};

export const deleteAllConversations = async (req, res) => {
    try {
        // Find the doubao worker socket
        const targetSocket = websocketService.getTargetSocket('doubao-pro');

        if (!targetSocket) {
            return res.status(503).json({
                success: false,
                error: 'No doubao worker connected'
            });
        }

        // Send delete all command to extension
        const message = JSON.stringify({
            type: 'DELETE_ALL_CONVERSATIONS'
        });

        targetSocket.send(message);

        res.json({
            success: true,
            message: 'Delete all request sent to extension'
        });

    } catch (error) {
        console.error('Delete all conversations error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
};
