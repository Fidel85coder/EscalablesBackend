import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth';
import {
    getPosts,
    createPost,
    updatePost,
    deletePost,
    votePost
} from '../controllers/post.controller';

const router = Router();

router.get('/', getPosts);
router.post('/', authenticateJWT, createPost);
router.put('/:id', authenticateJWT, updatePost);
router.delete('/:id', authenticateJWT, deletePost);
router.post('/:id/vote', authenticateJWT, votePost);

export default router;