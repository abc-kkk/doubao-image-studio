import fs from 'fs';
import path from 'path';

const MODELS = [
    'Qwen/Qwen3-32B',
    'ZhipuAI/GLM-4.6',
    'Qwen/Qwen3-Next-80B-A3B-Instruct',
    'Qwen/Qwen3-30B-A3B-Instruct-2507'
];

const API_KEY = 'ms-033cc5ff-1aad-48f9-a097-e96b270546b4';
const BASE_URL = 'https://api-inference.modelscope.cn/v1/chat/completions';
const DAILY_LIMIT = 500;
const USAGE_FILE = path.join(process.cwd(), 'modelscope_usage.json');

class ModelScopeService {
    constructor() {
        this.usageData = this.loadUsage();
    }

    loadUsage() {
        try {
            if (fs.existsSync(USAGE_FILE)) {
                const data = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
                // Check if it's a new day
                const today = new Date().toISOString().split('T')[0];
                if (data.date !== today) {
                    return { date: today, counts: {} };
                }
                return data;
            }
        } catch (e) {
            console.error('Error loading usage data:', e);
        }
        return { date: new Date().toISOString().split('T')[0], counts: {} };
    }

    saveUsage() {
        try {
            fs.writeFileSync(USAGE_FILE, JSON.stringify(this.usageData, null, 2));
        } catch (e) {
            console.error('Error saving usage data:', e);
        }
    }

    getAvailableModel() {
        for (const model of MODELS) {
            const count = this.usageData.counts[model] || 0;
            if (count < DAILY_LIMIT) {
                return model;
            }
        }
        return null; // All limits reached
    }

    incrementUsage(model) {
        if (!this.usageData.counts[model]) {
            this.usageData.counts[model] = 0;
        }
        this.usageData.counts[model]++;
        this.saveUsage();
    }

    markModelAsLimited(model) {
        console.warn(`[ModelScope] Marking model ${model} as limited for today.`);
        this.usageData.counts[model] = DAILY_LIMIT; // Set to limit to prevent further use
        this.saveUsage();
    }

    async handleChat(prompt, systemPrompt = null) {
        let attempts = 0;
        const maxAttempts = MODELS.length; // Try all models if necessary

        while (attempts < maxAttempts) {
            const model = this.getAvailableModel();
            if (!model) {
                throw new Error('All ModelScope models have reached their daily limit (500 each) or are unavailable.');
            }

            console.log(`[ModelScope] Attempting with model: ${model} (Usage: ${this.usageData.counts[model] || 0}/${DAILY_LIMIT})`);

            const messages = [];
            if (systemPrompt) {
                messages.push({ role: 'system', content: systemPrompt });
            }
            messages.push({ role: 'user', content: prompt });

            const body = {
                model: model,
                messages: messages,
                stream: true,
                extra_body: {
                    enable_thinking: true
                }
            };

            try {
                const response = await fetch(BASE_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    const status = response.status;

                    // Check for Rate Limit (429) or specific error messages
                    if (status === 429 || errorText.includes('Request limit exceeded') || status === 426) {
                        console.error(`[ModelScope] Rate limit exceeded for ${model}: ${status} - ${errorText}`);
                        this.markModelAsLimited(model);
                        attempts++;
                        continue; // Try next model
                    }

                    throw new Error(`ModelScope API Error: ${status} - ${errorText}`);
                }

                // We need to process the stream to format it for our client
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let accumulatedText = '';
                let accumulatedThinking = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.slice(6).trim();
                            if (jsonStr === '[DONE]') continue;

                            try {
                                const data = JSON.parse(jsonStr);
                                const delta = data.choices[0].delta;

                                if (delta.reasoning_content) {
                                    accumulatedThinking += delta.reasoning_content;
                                }
                                if (delta.content) {
                                    accumulatedText += delta.content;
                                }
                            } catch (e) {
                                // ignore parse errors for partial chunks
                            }
                        }
                    }
                }

                this.incrementUsage(model);

                // Return in Gemini format
                return {
                    candidates: [{
                        content: {
                            parts: [{ text: accumulatedText }]
                        }
                    }]
                };

            } catch (error) {
                console.error(`[ModelScope] Request failed with ${model}:`, error.message);

                // If it was a network error or other non-API error, we might want to retry too?
                // For now, let's assume if we caught it here and it wasn't handled above, it might be worth retrying if it's not a fatal logic error.
                // But to be safe, if we already marked it limited, we continue. 
                // If it's a different error, maybe we should just throw? 
                // The user specifically asked for "if return error... immediately change model".
                // So let's be aggressive with retries.

                if (!error.message.includes('All ModelScope models')) {
                    // If we haven't exhausted models, try next one?
                    // But we need to make sure we don't infinite loop on the SAME model if we didn't mark it limited.
                    // The getAvailableModel() returns the first one under limit. 
                    // If we don't mark it limited, we'll get the same one back.
                    // So we MUST mark it limited or increment usage to skip it? 
                    // Or we can just temporarily exclude it from this request's rotation?
                    // The user said "mark this model limited for today". So we should probably do that for ANY API error that looks like a failure?
                    // But maybe not for 500 errors? 
                    // Let's stick to the user's specific request about "limit exceeded" first.

                    // If we are here, it means we threw from the !response.ok block OR a network error.
                    // If it was !response.ok and NOT 429, we threw.
                    // So if we are here, it's either a non-429 API error or a network error.
                    // Let's NOT retry blindly for all errors to avoid burning through models on bad requests.
                    throw error;
                }
                throw error;
            }
        }
    }

    async generateImage(prompt) {
        // Use a specific model for image generation or rotate? 
        // User provided: "black-forest-labs/FLUX.1-Krea-dev"
        const model = "black-forest-labs/FLUX.1-Krea-dev";

        console.log(`[ModelScope] Generating image with model: ${model}`);

        try {
            // 1. Submit Task
            const submitResponse = await fetch('https://api-inference.modelscope.cn/v1/images/generations', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                    'X-ModelScope-Async-Mode': 'true'
                },
                body: JSON.stringify({
                    model: model,
                    prompt: prompt
                })
            });

            if (!submitResponse.ok) {
                const errorText = await submitResponse.text();
                throw new Error(`ModelScope Image Submit Error: ${submitResponse.status} - ${errorText}`);
            }

            const submitData = await submitResponse.json();
            const taskId = submitData.task_id;
            console.log(`[ModelScope] Image task submitted. ID: ${taskId}`);

            // 2. Poll for Result
            let attempts = 0;
            const maxAttempts = 60; // 5 minutes (5s interval)

            while (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 5000)); // Wait 5s
                attempts++;

                const checkResponse = await fetch(`https://api-inference.modelscope.cn/v1/tasks/${taskId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`,
                        'Content-Type': 'application/json',
                        'X-ModelScope-Task-Type': 'image_generation'
                    }
                });

                if (!checkResponse.ok) {
                    console.warn(`[ModelScope] Task check failed: ${checkResponse.status}`);
                    continue;
                }

                const checkData = await checkResponse.json();

                if (checkData.task_status === 'SUCCEED') {
                    const imageUrl = checkData.output_images[0];
                    console.log(`[ModelScope] Image generation succeeded: ${imageUrl}`);

                    // Return in Gemini format
                    return {
                        generatedImages: [{
                            image: {
                                mimeType: 'image/jpeg', // Assuming JPEG/PNG
                                imageBytes: null // We return URL, client handles it? 
                                // Wait, web_client.html expects base64 in `imageBytes` OR `imageUrl` in candidates.
                                // Let's fetch the image and convert to base64 to be safe and consistent with other tools
                            }
                        }],
                        // Also return as candidate for compatibility
                        candidates: [{
                            content: {
                                parts: [{
                                    imageUrl: imageUrl
                                }]
                            }
                        }]
                    };
                } else if (checkData.task_status === 'FAILED') {
                    throw new Error('ModelScope Image Generation Failed');
                }

                console.log(`[ModelScope] Task status: ${checkData.task_status} (Attempt ${attempts})`);
            }

            throw new Error('ModelScope Image Generation Timeout');

        } catch (error) {
            console.error('[ModelScope] Image generation failed:', error);
            throw error;
        }
    }
}

export default new ModelScopeService();
