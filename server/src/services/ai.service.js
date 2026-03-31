/**
 * AI Service
 * 处理AI请求的路由和转发
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import websocketService from './websocket.service.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AIService {
    constructor() {
        this.REQUEST_TIMEOUT = 240000; // 4 minutes
    }

    /**
     * 处理聊天请求
     */
    async handleChat(model, prompt, referenceImages = []) {
        const targetModel = this.mapModel(model, 'chat');
        if (!targetModel) {
            throw new Error(`Invalid model '${model}' for chat mode`);
        }

        // Process reference images: Convert URLs to Base64
        const processedImages = await this.processReferenceImages(referenceImages);

        const isDoubao = targetModel.includes('doubao');

        if (isDoubao) {
            return await this.sendToWorker(targetModel, prompt, processedImages);
        } else {
            return await this.proxyToGemini(targetModel, prompt);
        }
    }

    /**
     * 处理图片生成请求
     */
    async handleImageGeneration(model, prompt, referenceImages = [], aspectRatio = 'Auto', switchToImageMode = false) {
        const targetModel = this.mapModel(model, 'image_generation');
        if (!targetModel) {
            throw new Error(`Invalid model '${model}' for image generation mode`);
        }

        // Process reference images: Convert URLs to Base64
        const validImages = await this.processReferenceImages(referenceImages);

        const isDoubao = targetModel.includes('doubao');

        if (isDoubao) {
            return await this.sendToWorker(
                targetModel,
                prompt,
                validImages,
                aspectRatio,
                switchToImageMode
            );
        } else {
            return await this.proxyToGemini(targetModel, prompt);
        }
    }

    /**
     * 处理参考图片：将URL转换为Base64
     */
    async processReferenceImages(referenceImages = []) {
        const processedImages = await Promise.all(referenceImages.map(async (img) => {
            console.log(`[AI Service] Checking image: "${img}" (Type: ${typeof img}, Length: ${img ? img.length : 0})`);

            if (!img) return null;

            // If it's already Base64, return as is
            if (img.startsWith('data:image')) {
                console.log('[AI Service] Image is already Base64');
                return img;
            }

            // Try to resolve local file path
            let filePath = null;
            const decodedImg = decodeURIComponent(img);

            // Case 1: URL path starting with /images/
            if (typeof decodedImg === 'string' && decodedImg.trim().startsWith('/images/')) {
                const filename = decodedImg.split('/').pop();

                // Try multiple paths to find the file
                const pathsToTry = [
                    path.join(process.cwd(), 'images', filename),
                    path.join(__dirname, '../../images', filename),
                    path.join(process.cwd(), 'public/images', filename)
                ];

                console.log(`[AI Service v2] Looking for file: ${filename}`);

                for (const p of pathsToTry) {
                    if (fs.existsSync(p)) {
                        filePath = p;
                        console.log(`[AI Service v2] Found file at: ${p}`);
                        break;
                    }
                }
            }
            // Case 2: Just a filename or other path, try to find it in images dir
            else if (typeof decodedImg === 'string' && !decodedImg.startsWith('http')) {
                const filename = path.basename(decodedImg);
                const p = path.join(process.cwd(), 'images', filename);
                if (fs.existsSync(p)) filePath = p;
            }

            if (filePath) {
                console.log(`[AI Service v2] Attempting to read file: ${filePath}`);
                try {
                    // Use sharp to resize and compress the image
                    console.log(`[AI Service v2] Compressing image...`);
                    const buffer = await sharp(filePath)
                        .resize(1024, 1024, {
                            fit: 'inside',
                            withoutEnlargement: true
                        })
                        .jpeg({ quality: 80 })
                        .toBuffer();

                    const base64 = buffer.toString('base64');
                    console.log(`[AI Service v2] Successfully compressed and converted ${filePath} to Base64 (Size: ${Math.round(buffer.length / 1024)}KB)`);
                    return `data:image/jpeg;base64,${base64}`;
                } catch (err) {
                    console.error(`[AI Service v2] Error processing file ${filePath}:`, err);
                    // Fallback to original if compression fails
                    try {
                        const buffer = await fs.promises.readFile(filePath);
                        const base64 = buffer.toString('base64');
                        const ext = path.extname(filePath).substring(1);
                        return `data:image/${ext};base64,${base64}`;
                    } catch (readErr) {
                        console.error(`[AI Service v2] Error reading file fallback ${filePath}:`, readErr);
                    }
                }
            } else {
                console.warn(`[AI Service v2] File not found for image: ${img}`);
            }

            console.warn(`[AI Service v2] Could not process image, returning original: ${img.substring(0, 50)}...`);
            return img; // Return as is if unknown format or failed to read
        }));

        // Filter out failed images
        return processedImages.filter(img => img !== null);
    }

    /**
     * 映射简化的模型名到实际模型名
     */
    mapModel(model, mode) {
        const modelMap = {
            chat: {
                'db': 'doubao-pro',
                'doubao': 'doubao-pro',
            },
            image_generation: {
                'db': 'doubao-pro-image',
                'doubao': 'doubao-pro-image',
            },
            vision: {
                'g3': 'gemini-3-pro-preview'
            }
        };

        const mapped = modelMap[mode]?.[model];
        if (mapped) return mapped;

        // If not found in map, check if it's already one of the values
        if (modelMap[mode]) {
            const values = Object.values(modelMap[mode]);
            if (values.includes(model)) return model;
        }

        return null;
    }

    /**
     * 发送请求到Worker（通过WebSocket）
     */
    async sendToWorker(model, prompt, referenceImages = [], aspectRatio = 'Auto', switchToImageMode = false) {
        return new Promise((resolve, reject) => {
            const targetSocket = websocketService.getTargetSocket(model);

            if (!targetSocket) {
                reject(new Error(`Service Unavailable: No worker for '${model}'`));
                return;
            }

            const requestId = crypto.randomUUID();

            // 创建临时响应对象
            const mockRes = {
                json: (data) => resolve(data),
                status: (code) => ({
                    json: (data) => reject({ statusCode: code, ...data })
                })
            };

            const message = JSON.stringify({
                type: 'GENERATE',
                requestId,
                model,
                contents: [{ parts: [{ text: prompt }] }],
                config: { temperature: 0.7 },
                reference_images_b64: referenceImages,
                aspect_ratio: aspectRatio,
                switch_to_image_mode: switchToImageMode
            });

            websocketService.sendRequest(
                requestId,
                mockRes,
                targetSocket,
                message,
                this.REQUEST_TIMEOUT
            );
        });
    }

    /**
     * 代理请求到Gemini服务
     */
    async proxyToGemini(model, prompt, image = null) {
        const baseUrl = 'https://gemini-reply.onrender.com/v1beta/models';
        const url = `${baseUrl}/${model}:generateContent`;

        const parts = [{ text: prompt }];
        if (image) {
            parts.push({
                inlineData: {
                    mimeType: "image/jpeg",
                    data: image
                }
            });
        }

        const body = {
            contents: [{ parts }],
            generationConfig: { temperature: 0.7 }
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gemini API error: ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Gemini proxy error: ${error.message}`);
            throw new Error(`Gemini proxy error: ${error.message}`);
        }
    }

    /**
     * 提取AI响应文本
     */
    extractText(response) {
        try {
            // Worker format: { parts: [...] }
            if (response.parts && response.parts[0]) {
                return response.parts[0].text || '';
            }
            // Gemini format: { candidates: [{ content: { parts: [...] } }] }
            if (response.candidates && response.candidates[0]) {
                const content = response.candidates[0].content;
                if (content.parts && content.parts[0]) {
                    return content.parts[0].text || '';
                }
            }
            return '';
        } catch (error) {
            console.error('Error extracting text:', error);
            return '';
        }
    }

    /**
     * 提取生成的图片
     */
    extractImages(response) {
        try {
            let parts = [];
            if (response.parts) {
                parts = response.parts;
            } else if (response.candidates?.[0]?.content?.parts) {
                parts = response.candidates[0].content.parts;
            }

            return parts
                .filter(part => part.imageUrl || part.url)
                .map(part => ({
                    url: part.imageUrl || part.url,
                    width: part.width,
                    height: part.height,
                    thumbnail_url: part.thumbnail_url || part.thumbnailUrl || part.imageUrl || part.url
                }));
        } catch (error) {
            console.error('Error extracting images:', error);
            return [];
        }
    }
}

export default new AIService();
