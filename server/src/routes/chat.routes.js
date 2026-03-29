/**
 * Chat Routes
 */

import express from 'express';
import { chat, deleteCurrentConversation, deleteAllConversations } from '../controllers/chat.controller.js';

const router = express.Router();

router.post('/', chat);
router.post('/delete-current-conversation', deleteCurrentConversation);
router.post('/delete-all-conversations', deleteAllConversations);

export default router;
