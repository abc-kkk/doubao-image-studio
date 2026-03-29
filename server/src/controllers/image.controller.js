/**
 * Image Controller
 * 处理图片生成和管理相关的请求
 */

import aiService from '../services/ai.service.js';
import imageService from '../services/image.service.js';

/**
 * 生成图片
 */
export const generateImage = async (req, res) => {
    try {
        const { model, prompt, reference_images = [], aspect_ratio = 'Auto', switch_to_image_mode = false } = req.body;

        if (!model || !prompt) {
            return res.status(400).json({
                error: 'Missing required fields: model, prompt'
            });
        }

        console.log(`🎨 Image generation request: model=${model}, prompt=${prompt.substring(0, 50)}...`);
        console.log(`   Reference images: ${reference_images.length}, Aspect ratio: ${aspect_ratio}, Switch mode: ${switch_to_image_mode}`);

        const response = await aiService.handleImageGeneration(
            model,
            prompt,
            reference_images,
            aspect_ratio,
            switch_to_image_mode
        );

        const text = aiService.extractText(response);
        const images = aiService.extractImages(response);

        // 不自动保存，直接返回图片URL
        console.log(`✅ Generated ${images.length} images (not saved)`);

        res.json({
            success: true,
            text,
            images: images, // 返回原始URL，不保存
            model,
            rawResponse: response
        });

    } catch (error) {
        console.error('Image generation error:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
};

/**
 * 保存生成的图片到图片库
 */
export const saveImage = async (req, res) => {
    try {
        const { url, prompt, model, aspectRatio } = req.body;

        if (!url || !prompt || !model) {
            return res.status(400).json({
                error: 'Missing required fields: url, prompt, model'
            });
        }

        console.log(`💾 Saving image: ${url.substring(0, 50)}...`);

        // 下载图片并转换为base64
        const base64Image = await downloadImageAsBase64(url);

        // 保存到图片库
        const savedImages = await imageService.saveImages([base64Image], {
            prompt,
            model,
            aspectRatio: aspectRatio || 'Auto',
            referenceImagesCount: 0
        });

        if (savedImages.length > 0) {
            console.log(`✅ Image saved successfully: ${savedImages[0].id}`);
            res.json({
                success: true,
                image: savedImages[0],
                message: 'Image saved to gallery'
            });
        } else {
            throw new Error('Failed to save image');
        }

    } catch (error) {
        console.error('Save image error:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
};

/**
 * 获取所有图片
 */
export const getImages = async (req, res) => {
    try {
        const images = await imageService.getImages();
        res.json({
            success: true,
            images,
            total: images.length
        });
    } catch (error) {
        console.error('Get images error:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
};

/**
 * 获取单个图片
 */
export const getImage = async (req, res) => {
    try {
        const { id } = req.params;
        const image = await imageService.getImageById(id);

        if (!image) {
            return res.status(404).json({
                error: 'Image not found'
            });
        }

        res.json({
            success: true,
            image
        });
    } catch (error) {
        console.error('Get image error:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
};

/**
 * 删除图片
 */
export const deleteImage = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await imageService.deleteImage(id);

        if (!deleted) {
            return res.status(404).json({
                error: 'Image not found or failed to delete'
            });
        }

        res.json({
            success: true,
            message: 'Image deleted successfully'
        });
    } catch (error) {
        console.error('Delete image error:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
};

/**
 * 批量删除图片
 */
export const deleteImages = async (req, res) => {
    try {
        const { ids } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                error: 'Invalid or empty ids array'
            });
        }

        const results = await imageService.deleteImages(ids);

        res.json({
            success: true,
            deleted: results.success.length,
            failed: results.failed.length,
            results
        });
    } catch (error) {
        console.error('Batch delete error:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
};

/**
 * 清空所有图片
 */
export const clearImages = async (req, res) => {
    try {
        const cleared = await imageService.clearAll();

        if (!cleared) {
            return res.status(500).json({
                error: 'Failed to clear images'
            });
        }

        res.json({
            success: true,
            message: 'All images cleared successfully'
        });
    } catch (error) {
        console.error('Clear images error:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
};

/**
 * 辅助函数：下载图片并转换为base64
 */
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
