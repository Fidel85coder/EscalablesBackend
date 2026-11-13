import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth';
import {
    getCommentsByPost,
    createComment,
    deleteComment
} from '../controllers/comment.controller';

const router = Router();

router.get('/post/:postId', getCommentsByPost);
router.post('/', authenticateJWT, createComment);
router.delete('/:id', authenticateJWT, deleteComment);

export default router;