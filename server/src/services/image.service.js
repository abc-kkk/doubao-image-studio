/**
 * Image Service
 * 管理图片的保存、读取和删除
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

class ImageService {
    constructor() {
        this.imagesDir = path.join(process.cwd(), 'images');
        this.metadataFile = path.join(this.imagesDir, 'metadata.json');
        this.ensureImagesDir();
    }

    /**
     * 确保images目录存在
     */
    async ensureImagesDir() {
        try {
            await fs.access(this.imagesDir);
        } catch {
            await fs.mkdir(this.imagesDir, { recursive: true });
            await this.saveMetadata([]);
        }
    }

    /**
     * 保存图片
     * @param {string} base64Data - Base64编码的图片数据
     * @param {object} metadata - 图片元数据（prompt, model等）
     * @returns {object} 保存的图片信息
     */
    async saveImage(base64Data, metadata = {}) {
        await this.ensureImagesDir();

        // 生成唯一文件名
        const timestamp = Date.now();
        const hash = crypto.createHash('md5').update(base64Data.substring(0, 100)).digest('hex').substring(0, 8);
        const filename = `img_${timestamp}_${hash}.png`;
        const filepath = path.join(this.imagesDir, filename);

        // 移除data URI前缀（如果有）
        const base64Content = base64Data.includes(',')
            ? base64Data.split(',')[1]
            : base64Data;

        // 保存图片文件
        const buffer = Buffer.from(base64Content, 'base64');
        await fs.writeFile(filepath, buffer);

        // 保存元数据
        const imageInfo = {
            id: `${timestamp}_${hash}`,
            filename,
            path: filepath,
            url: `/images/${filename}`,
            createdAt: new Date().toISOString(),
            size: buffer.length,
            ...metadata
        };

        await this.addToMetadata(imageInfo);

        return imageInfo;
    }

    /**
     * 批量保存图片
     * @param {Array<string>} base64Images - Base64图片数组
     * @param {object} metadata - 共享的元数据
     * @returns {Array<object>} 保存的图片信息数组
     */
    async saveImages(base64Images, metadata = {}) {
        const savedImages = [];

        for (let i = 0; i < base64Images.length; i++) {
            const imageMetadata = {
                ...metadata,
                index: i + 1,
                total: base64Images.length
            };
            const imageInfo = await this.saveImage(base64Images[i], imageMetadata);
            savedImages.push(imageInfo);
        }

        return savedImages;
    }

    /**
     * 获取所有图片列表
     * @returns {Array<object>} 图片信息数组
     */
    async getImages() {
        try {
            const metadata = await this.loadMetadata();
            // 按创建时间倒序排列
            return metadata.sort((a, b) =>
                new Date(b.createdAt) - new Date(a.createdAt)
            );
        } catch (error) {
            console.error('Error loading images:', error);
            return [];
        }
    }

    /**
     * 根据ID获取图片
     * @param {string} id - 图片ID
     * @returns {object|null} 图片信息
     */
    async getImageById(id) {
        const images = await this.getImages();
        return images.find(img => img.id === id) || null;
    }

    /**
     * 删除图片
     * @param {string} id - 图片ID
     * @returns {boolean} 是否删除成功
     */
    async deleteImage(id) {
        try {
            const image = await this.getImageById(id);
            if (!image) return false;

            // 删除文件
            await fs.unlink(image.path);

            // 从元数据中移除
            await this.removeFromMetadata(id);

            return true;
        } catch (error) {
            console.error('Error deleting image:', error);
            return false;
        }
    }

    /**
     * 批量删除图片
     * @param {Array<string>} ids - 图片ID数组
     * @returns {object} 删除结果
     */
    async deleteImages(ids) {
        const results = {
            success: [],
            failed: []
        };

        for (const id of ids) {
            const deleted = await this.deleteImage(id);
            if (deleted) {
                results.success.push(id);
            } else {
                results.failed.push(id);
            }
        }

        return results;
    }

    /**
     * 加载元数据
     */
    async loadMetadata() {
        try {
            const data = await fs.readFile(this.metadataFile, 'utf-8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    /**
     * 保存元数据
     */
    async saveMetadata(metadata) {
        await fs.writeFile(
            this.metadataFile,
            JSON.stringify(metadata, null, 2),
            'utf-8'
        );
    }

    /**
     * 添加到元数据
     */
    async addToMetadata(imageInfo) {
        const metadata = await this.loadMetadata();
        metadata.push(imageInfo);
        await this.saveMetadata(metadata);
    }

    /**
     * 从元数据中移除
     */
    async removeFromMetadata(id) {
        const metadata = await this.loadMetadata();
        const filtered = metadata.filter(img => img.id !== id);
        await this.saveMetadata(filtered);
    }

    /**
     * 清理所有图片
     */
    async clearAll() {
        try {
            const images = await this.getImages();
            for (const image of images) {
                try {
                    await fs.unlink(image.path);
                } catch (error) {
                    console.error(`Failed to delete ${image.filename}:`, error);
                }
            }
            await this.saveMetadata([]);
            return true;
        } catch (error) {
            console.error('Error clearing images:', error);
            return false;
        }
    }
}

export default new ImageService();
