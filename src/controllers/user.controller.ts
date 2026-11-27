import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { Comment } from '../models/Comment';
import { Post } from '../models/Post';
import { User } from '../models/User';
import { Vote } from '../models/Vote';

const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : 'Error interno del servidor';

export const getMyProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.usuarioId;
        if (!userId || !Types.ObjectId.isValid(userId)) {
            return res.status(401).json({ message: 'Autenticación requerida' });
        }

        const [user, posts] = await Promise.all([
            User.findById(userId).select('-password').lean(),
            Post.aggregate([
                { $match: { usuarioId: new Types.ObjectId(userId) } },
                {
                    $lookup: {
                        from: Vote.collection.name,
                        let: { postId: '$_id' },
                        pipeline: [
                            { $match: { $expr: { $eq: ['$postId', '$$postId'] } } },
                            { $group: { _id: null, score: { $sum: '$tipo' } } }
                        ],
                        as: 'voteStats'
                    }
                },
                {
                    $lookup: {
                        from: Comment.collection.name,
                        let: { postId: '$_id' },
                        pipeline: [
                            { $match: { $expr: { $eq: ['$postId', '$$postId'] } } },
                            { $count: 'count' }
                        ],
                        as: 'commentStats'
                    }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'usuarioId',
                        foreignField: '_id',
                        pipeline: [{ $project: { username: 1, email: 1, rol: 1 } }],
                        as: 'usuarioId'
                    }
                },
                { $unwind: { path: '$usuarioId', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'communities',
                        localField: 'comunidadId',
                        foreignField: '_id',
                        pipeline: [{ $project: { nombre: 1 } }],
                        as: 'comunidadId'
                    }
                },
                { $unwind: { path: '$comunidadId', preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        score: { $ifNull: [{ $arrayElemAt: ['$voteStats.score', 0] }, 0] },
                        commentCount: { $ifNull: [{ $arrayElemAt: ['$commentStats.count', 0] }, 0] },
                        userVote: 0
                    }
                },
                { $sort: { fechaCreacion: -1 } },
                {
                    $project: {
                        titulo: 1,
                        contenido: 1,
                        fechaCreacion: 1,
                        usuarioId: 1,
                        comunidadId: 1,
                        score: 1,
                        userVote: 1,
                        commentCount: 1
                    }
                }
            ])
        ]);

        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        res.json({ user, posts });
    } catch (error: unknown) {
        res.status(500).json({ message: getErrorMessage(error) });
    }
};

export const updateMyProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.usuarioId;
        if (!userId || !Types.ObjectId.isValid(userId)) {
            return res.status(401).json({ message: 'Autenticación requerida' });
        }

        const body = req.body as {
            username?: unknown;
            email?: unknown;
            password?: unknown;
        };
        const updates: { username?: string; email?: string; password?: string } = {};

        if (body.username !== undefined) {
            if (typeof body.username !== 'string' || !body.username.trim()) {
                return res.status(400).json({ message: 'El nombre de usuario no puede estar vacío' });
            }
            updates.username = body.username.trim();
        }

        if (body.email !== undefined) {
            if (
                typeof body.email !== 'string' ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
            ) {
                return res.status(400).json({ message: 'El correo electrónico no es válido' });
            }
            updates.email = body.email.trim();
        }

        if (body.password !== undefined && body.password !== '') {
            if (typeof body.password !== 'string' || body.password.length < 8) {
                return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
            }
            updates.password = await bcrypt.hash(body.password, 10);
        }

        if (updates.username || updates.email) {
            const duplicate = await User.findOne({
                _id: { $ne: new Types.ObjectId(userId) },
                $or: [
                    ...(updates.username ? [{ username: updates.username }] : []),
                    ...(updates.email ? [{ email: updates.email }] : [])
                ]
            }).select('_id');

            if (duplicate) {
                return res.status(409).json({ message: 'El nombre de usuario o correo ya está en uso' });
            }
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { $set: updates },
            { returnDocument: 'after', runValidators: true }
        ).select('-password').lean();

        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        res.json(user);
    } catch (error: unknown) {
        if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 11000
        ) {
            return res.status(409).json({ message: 'El nombre de usuario o correo ya está en uso' });
        }
        res.status(400).json({ message: getErrorMessage(error) });
    }
};
