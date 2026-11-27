import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

export interface AuthRequest extends Request {
    usuarioId?: string;
    userRol?: string;
}

export const authenticateJWT = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token no proporcionado u formato inválido' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { usuarioId: string; userRol: string };
        req.usuarioId = decoded.usuarioId;
        req.userRol = decoded.userRol;
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Token inválido o expirado' });
    }
};

export const isAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.usuarioId) {
            return res.status(401).json({ message: 'Autenticación requerida' });
        }

        const user = await User.findById(req.usuarioId).select('rol');
        if (!user || user.rol !== 'administrador') {
            return res.status(403).json({ message: 'Se requieren privilegios de administrador' });
        }

        req.userRol = user.rol;
        next();
    } catch (error) {
        next(error);
    }
};