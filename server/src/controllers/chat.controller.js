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
