import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

export const register = async (req: Request, res: Response) => {
    try {
        const { username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({ username, email, password: hashedPassword });

        const token = jwt.sign(
            { usuarioId: user._id, userRol: user.rol },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '12h' }
        );

        res.status(201).json({
            token,
            user: { _id: user._id, username: user.username, email: user.email, rol: user.rol }
        });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { username, email, password } = req.body;
        const identifier = username || email;

        const user = await User.findOne({
            $or: [{ email: identifier }, { username: identifier }]
        });

        if (!user || !(await bcrypt.compare(password, user.password || ''))) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        const token = jwt.sign(
            { usuarioId: user._id, userRol: user.rol },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '12h' }
        );

        res.json({
            token,
            user: { _id: user._id, username: user.username, email: user.email, rol: user.rol }
        });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
};