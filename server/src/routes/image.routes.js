/**
 * Image Routes
 */

import express from 'express';
import {
    generateImage,
    saveImage,
    getImages,
    getImage,
    deleteImage,
    deleteImages,
    clearImages
} from '../controllers/image.controller.js';

const router = express.Router();

router.post('/generate', generateImage);
router.post('/save', saveImage);
router.get('/', getImages);
router.get('/:id', getImage);
router.delete('/:id', deleteImage);
router.post('/delete-batch', deleteImages);
router.delete('/', clearImages);

export default router;
