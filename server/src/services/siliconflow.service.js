/**
 * SiliconFlow Service
 * Handles interactions with SiliconFlow API
 */

// TODO: Move to environment variable
const API_KEY = 'sk-dvqctiniyvmkktscjmzzccrsxngfvlhylkjgdxmazmazomkb';

class SiliconFlowService {
    constructor() {
        this.baseUrl = 'https://api.siliconflow.com/v1';
        this.models = {
            'ds': 'nex-agi/DeepSeek-V3.1-Nex-N1',
            'hy': 'tencent/Hunyuan-MT-7B'
        };
    }

    async handleChat(modelKey, prompt) {
        const model = this.models[modelKey];
        if (!model) {
            throw new Error(`Invalid SiliconFlow model key: ${modelKey}`);
        }

        console.log(`[SiliconFlow] Requesting model: ${model} (${modelKey})`);

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY || API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    stream: false
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`SiliconFlow API Error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();

            // Validate response format
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error('Invalid response format from SiliconFlow');
            }

            const content = data.choices[0].message.content;

            // Return in Gemini format
            return {
                candidates: [{
                    content: {
                        parts: [{ text: content }]
                    }
                }]
            };

        } catch (error) {
            console.error('[SiliconFlow] Request failed:', error);
            throw error;
        }
    }
}

export default new SiliconFlowService();
