import { Request, Response } from 'express';
import { Post } from '../models/Post';
import { Vote } from '../models/Vote';
import { Comment } from '../models/Comment';
import { Community } from '../models/Community';
import { AuthRequest } from '../middleware/auth';

export const getPosts = async (req: Request, res: Response) => {
    try {
        const communityIdParam = req.query['communityId'];

        const filter: Record<string, any> = {};
        if (typeof communityIdParam === 'string' && communityIdParam.trim() !== '') {
            filter['comunidadId'] = communityIdParam;
        }

        const posts: any[] = await Post.find(filter)
            .populate('usuarioId', 'username email rol')
            .populate('comunidadId', 'nombre descripcion')
            .sort({ fechaCreacion: -1 })
            .lean();

        const formatted = await Promise.all(posts.map(async (p) => {
            const votes = await Vote.find({ postId: p._id }).lean();
            const score = votes.reduce((acc, v) => acc + v.tipo, 0);
            const commentCount = await Comment.countDocuments({ postId: p._id });

            return {
                _id: p._id,
                titulo: p.titulo,
                contenido: p.contenido,
                usuarioId: p.usuarioId,
                comunidadId: p.comunidadId,
                score,
                userVote: 0,
                commentCount,
                fechaCreacion: p.fechaCreacion
            };
        }));

        res.json(formatted);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
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