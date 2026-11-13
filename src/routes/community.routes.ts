import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth';
import {
    getCommunities,
    createCommunity,
    toggleJoinCommunity
} from '../controllers/community.controller';

const router = Router();

router.get('/', getCommunities);
router.post('/', authenticateJWT, createCommunity);
router.post('/:id/join', authenticateJWT, toggleJoinCommunity);

export default router;