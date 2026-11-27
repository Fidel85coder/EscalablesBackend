import { Router } from 'express';
import { getMyProfile, updateMyProfile } from '../controllers/user.controller';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

router.get('/me', authenticateJWT, getMyProfile);
router.put('/me', authenticateJWT, updateMyProfile);

export default router;
