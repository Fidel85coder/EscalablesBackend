import { Router } from 'express';
import { isAdmin, authenticateJWT } from '../middleware/auth';
import {
    deleteComment,
    deleteCommunity,
    deletePost,
    deleteUser,
    getAllCommunities,
    getAllPosts,
    getUsers,
    updateUserRole
} from '../controllers/admin.controller';

const router = Router();

router.use(authenticateJWT, isAdmin);

router.get('/users', getUsers);
router.patch('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);
router.get('/communities', getAllCommunities);
router.delete('/communities/:id', deleteCommunity);
router.get('/posts', getAllPosts);
router.delete('/posts/:id', deletePost);
router.delete('/comments/:id', deleteComment);

export default router;
