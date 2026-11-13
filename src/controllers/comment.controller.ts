import { Request, Response } from 'express';
import { Comment } from '../models/Comment';
import { AuthRequest } from '../middleware/auth';

export const getCommentsByPost = async (req: Request, res: Response) => {
    try {
        const comments = await Comment.find({ postId: req.params.postId })
            .populate('usuarioId', 'username email rol')
            .sort({ fechaCreacion: 1 })
            .lean();
        res.json(comments);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
};

export const createComment = async (req: AuthRequest, res: Response) => {
    try {
        const { contenido, postId, comentarioPadreId } = req.body;

        const newComment = await Comment.create({
            contenido,
            postId,
            comentarioPadreId: comentarioPadreId || null,
            usuarioId: req.usuarioId
        });

        const populated = await Comment.findById(newComment._id)
            .populate('usuarioId', 'username email rol')
            .lean();

        res.status(201).json(populated);
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};

export const deleteComment = async (req: AuthRequest, res: Response) => {
    try {
        const comment = await Comment.findById(req.params.id);
        if (!comment) {
            return res.status(404).json({ message: 'Comentario no encontrado' });
        }

        const isAuthor = comment.usuarioId.toString() === req.usuarioId;
        const isAdmin = req.userRol === 'administrador';

        if (!isAuthor && !isAdmin) {
            return res.status(403).json({ message: 'No tienes permiso para eliminar este comentario' });
        }

        await Comment.findByIdAndDelete(req.params.id);
        res.json({ message: 'Comentario eliminado' });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
};