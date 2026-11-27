import { Request, Response } from 'express';
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import { Post } from '../models/Post';
import { Vote } from '../models/Vote';
import { Comment } from '../models/Comment';
import { Community } from '../models/Community';
import { AuthRequest } from '../middleware/auth';

type PostSort = 'hot' | 'new' | 'top';

const getQueryString = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined;

const getPositiveInteger = (value: unknown, fallback: number, max: number): number => {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        return fallback;
    }

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

const getOptionalUserId = (req: Request): Types.ObjectId | null => {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) return null;

    try {
        const decoded = jwt.verify(
            authorization.slice('Bearer '.length),
            process.env.JWT_SECRET || 'secret'
        );
        if (
            typeof decoded === 'object' &&
            decoded !== null &&
            'usuarioId' in decoded &&
            typeof decoded.usuarioId === 'string' &&
            Types.ObjectId.isValid(decoded.usuarioId)
        ) {
            return new Types.ObjectId(decoded.usuarioId);
        }
    } catch {
        return null;
    }

    return null;
};

export const getPosts = async (req: Request, res: Response) => {
    try {
        const rawSort = getQueryString(req.query['sort']) || 'hot';
        if (!['hot', 'new', 'top'].includes(rawSort)) {
            return res.status(400).json({ message: 'Criterio de ordenamiento inválido' });
        }
        const sortParam = rawSort as PostSort;

        const rawCommunityId = req.query['comunidadId'];
        if (rawCommunityId !== undefined && typeof rawCommunityId !== 'string') {
            return res.status(400).json({ message: 'ID de comunidad inválido' });
        }
        const communityId = getQueryString(rawCommunityId);
        const filter: { comunidadId?: Types.ObjectId } = {};
        if (communityId) {
            if (!Types.ObjectId.isValid(communityId)) {
                return res.status(400).json({ message: 'ID de comunidad inválido' });
            }
            filter.comunidadId = new Types.ObjectId(communityId);
        }

        const page = getPositiveInteger(req.query['page'], 1, Number.MAX_SAFE_INTEGER);
        const limit = getPositiveInteger(req.query['limit'], 10, 100);
        const skip = (page - 1) * limit;
        const userId = getOptionalUserId(req);
        const [total, posts] = await Promise.all([
            Post.countDocuments(filter),
            Post.aggregate([
                { $match: filter },
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
                {
                    $lookup: {
                        from: 'communities',
                        localField: 'comunidadId',
                        foreignField: '_id',
                        pipeline: [{ $project: { nombre: 1, descripcion: 1 } }],
                        as: 'comunidadId'
                    }
                },
                ...(userId
                    ? [{
                        $lookup: {
                            from: Vote.collection.name,
                            let: { postId: '$_id' },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ['$postId', '$$postId'] },
                                                { $eq: ['$usuarioId', userId] }
                                            ]
                                        }
                                    }
                                },
                                { $project: { tipo: 1 } }
                            ],
                            as: 'userVotes'
                        }
                    }]
                    : []),
                { $unwind: { path: '$usuarioId', preserveNullAndEmptyArrays: true } },
                { $unwind: { path: '$comunidadId', preserveNullAndEmptyArrays: true } },
                {
                    $set: {
                        score: { $ifNull: [{ $arrayElemAt: ['$voteStats.score', 0] }, 0] },
                        commentCount: { $ifNull: [{ $arrayElemAt: ['$commentStats.count', 0] }, 0] },
                        userVote: { $ifNull: [{ $arrayElemAt: ['$userVotes.tipo', 0] }, 0] }
                    }
                },
                ...(sortParam === 'hot'
                    ? [{
                        $set: {
                            hotRank: {
                                $divide: [
                                    { $add: ['$score', '$commentCount'] },
                                    {
                                        $add: [
                                            {
                                                $divide: [
                                                    { $subtract: [new Date(), '$fechaCreacion'] },
                                                    3600000
                                                ]
                                            },
                                            2
                                        ]
                                    }
                                ]
                            }
                        }
                    }]
                    : []),
                {
                    $sort: sortParam === 'top'
                        ? { score: -1, fechaCreacion: -1 }
                        : sortParam === 'new'
                            ? { fechaCreacion: -1 }
                            : { hotRank: -1, fechaCreacion: -1 }
                },
                { $skip: skip },
                { $limit: limit },
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
        const totalPages = Math.ceil(total / limit);

        res.json({
            posts,
            total,
            page,
            totalPages,
            hasMore: page < totalPages
        });
    } catch (error: unknown) {
        res.status(500).json({
            message: error instanceof Error ? error.message : 'Error interno del servidor'
        });
    }
};

export const createPost = async (req: AuthRequest, res: Response) => {
    try {
        const { titulo, contenido, comunidadId } = req.body;

        const community = await Community.findById(comunidadId);
        if (!community) {
            return res.status(404).json({ message: 'Comunidad no encontrada.' });
        }

        const isMember = community.miembros.some(m => m.toString() === req.usuarioId);
        if (!isMember) {
            return res.status(403).json({
                message: 'Debes unirte a esta comunidad antes de poder publicar en ella.'
            });
        }

        const newPost = await Post.create({
            titulo,
            contenido,
            comunidadId,
            usuarioId: req.usuarioId
        });

        const populated: any = await Post.findById(newPost._id)
            .populate('usuarioId', 'username email rol')
            .populate('comunidadId', 'nombre descripcion')
            .lean();

        res.status(201).json({
            _id: populated?._id,
            titulo: populated?.titulo,
            contenido: populated?.contenido,
            comunidadId: populated?.comunidadId,
            usuarioId: populated?.usuarioId,
            score: 0,
            userVote: 0,
            commentCount: 0,
            fechaCreacion: populated?.fechaCreacion
        });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};

export const updatePost = async (req: AuthRequest, res: Response) => {
    try {
        const { titulo, contenido } = req.body;

        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: 'Publicación no encontrada en la base de datos' });
        }

        if (String(post.usuarioId) !== String(req.usuarioId)) {
            return res.status(403).json({ message: 'Solo el autor puede editar esta publicación' });
        }

        if (titulo) post.titulo = titulo;
        if (contenido) post.contenido = contenido;

        await post.save();

        const populated: any = await Post.findById(post._id)
            .populate('usuarioId', 'username email rol')
            .populate('comunidadId', 'nombre descripcion')
            .lean();

        res.json(populated);
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};

export const deletePost = async (req: AuthRequest, res: Response) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ message: 'Publicación no encontrada' });
        }

        const isAuthor = String(post.usuarioId) === String(req.usuarioId);
        const isAdmin = req.userRol === 'administrador';

        if (!isAuthor && !isAdmin) {
            return res.status(403).json({ message: 'No tienes permiso para eliminar esta publicación' });
        }

        await Post.findByIdAndDelete(req.params.id);
        await Comment.deleteMany({ postId: req.params.id });
        await Vote.deleteMany({ postId: req.params.id });

        res.json({ message: 'Publicación eliminada exitosamente' });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
};

export const votePost = async (req: AuthRequest, res: Response) => {
    try {
        const { tipo } = req.body;
        const postId = req.params.id as string;
        const usuarioId = req.usuarioId as string;

        const existingVote = await Vote.findOne({ postId, usuarioId });

        if (existingVote) {
            if (existingVote.tipo === tipo) {
                await Vote.findByIdAndDelete(existingVote._id);
            } else {
                existingVote.tipo = tipo;
                await existingVote.save();
            }
        } else {
            await Vote.create({
                postId,
                usuarioId,
                tipo
            });
        }

        const allVotes: any[] = await Vote.find({ postId }).lean();
        const score = allVotes.reduce((acc, v) => acc + v.tipo, 0);
        const activeVote = allVotes.find(v => String(v.usuarioId) === String(usuarioId));

        res.json({ score, userVote: activeVote ? activeVote.tipo : 0 });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};