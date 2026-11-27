import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Comment } from '../models/Comment';
import { Post } from '../models/Post';
import { AuthRequest } from '../middleware/auth';

const getRouteParam = (value: string | string[] | undefined): string =>
    Array.isArray(value) ? value[0] : value ?? '';

const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : 'Error interno del servidor';

const getPositiveInteger = (value: unknown, fallback: number, max: number): number => {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        return fallback;
    }

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

const collectCommentTreeIds = async (rootId: string): Promise<string[]> => {
    const ids = new Set([rootId]);
    let parents = [rootId];

    while (parents.length > 0) {
        const children = await Comment.find({ comentarioPadreId: { $in: parents } })
            .select('_id')
            .lean();
        const nextParents: string[] = [];

        for (const child of children) {
            const childId = child._id.toString();
            if (!ids.has(childId)) {
                ids.add(childId);
                nextParents.push(childId);
            }
        }

        parents = nextParents;
    }

    return [...ids];
};

export const getCommentsByPost = async (req: Request, res: Response) => {
    try {
        const postId = getRouteParam(req.params.postId);
        if (!Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ message: 'ID de publicación inválido' });
        }

        const page = getPositiveInteger(req.query['page'], 1, Number.MAX_SAFE_INTEGER);
        const limit = getPositiveInteger(req.query['limit'], 20, 100);
        const rootFilter = { postId, comentarioPadreId: null };
        const [totalRoots, roots] = await Promise.all([
            Comment.countDocuments(rootFilter),
            Comment.find(rootFilter)
                .sort({ fechaCreacion: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean()
        ]);

        const comments = [...roots];
        const visitedIds = new Set(roots.map(comment => comment._id.toString()));
        let parentIds = [...visitedIds];

        while (parentIds.length > 0) {
            const descendants = await Comment.find({
                postId,
                comentarioPadreId: { $in: parentIds }
            }).lean();
            const nextParentIds: string[] = [];

            for (const descendant of descendants) {
                const id = descendant._id.toString();
                if (!visitedIds.has(id)) {
                    visitedIds.add(id);
                    comments.push(descendant);
                    nextParentIds.push(id);
                }
            }

            parentIds = nextParentIds;
        }

        const populatedComments = await Comment.populate(comments, {
            path: 'usuarioId',
            select: 'username email rol'
        });
        populatedComments.sort((a, b) =>
            new Date(a.fechaCreacion ?? 0).getTime() - new Date(b.fechaCreacion ?? 0).getTime()
        );

        const totalPages = Math.ceil(totalRoots / limit);
        res.json({
            comments: populatedComments.map(comment => ({
                ...comment,
                comentarioPadreId: comment.comentarioPadreId?.toString() ?? null
            })),
            totalRoots,
            page,
            totalPages,
            hasMore: page < totalPages
        });
    } catch (error: unknown) {
        res.status(500).json({ message: getErrorMessage(error) });
    }
};

export const createComment = async (req: AuthRequest, res: Response) => {
    try {
        const body = req.body as {
            contenido?: unknown;
            postId?: unknown;
            comentarioPadreId?: unknown;
        };
        const { contenido, postId: rawPostId, comentarioPadreId: rawParentId } = body;

        if (typeof contenido !== 'string' || contenido.trim().length === 0) {
            return res.status(400).json({ message: 'El contenido del comentario es obligatorio' });
        }
        if (typeof rawPostId !== 'string' || !Types.ObjectId.isValid(rawPostId)) {
            return res.status(400).json({ message: 'ID de publicación inválido' });
        }
        if (!req.usuarioId) {
            return res.status(401).json({ message: 'Autenticación requerida' });
        }

        const postId = new Types.ObjectId(rawPostId);
        const postExists = await Post.exists({ _id: postId });
        if (!postExists) {
            return res.status(404).json({ message: 'Publicación no encontrada' });
        }

        let parentId: Types.ObjectId | null = null;
        if (rawParentId !== undefined && rawParentId !== null) {
            if (typeof rawParentId !== 'string' || !Types.ObjectId.isValid(rawParentId)) {
                return res.status(400).json({ message: 'ID de comentario padre inválido' });
            }

            const parent = await Comment.findById(rawParentId).select('postId');
            if (!parent) {
                return res.status(404).json({ message: 'Comentario padre no encontrado' });
            }
            if (parent.postId.toString() !== postId.toString()) {
                return res.status(400).json({ message: 'El comentario padre pertenece a otra publicación' });
            }

            parentId = new Types.ObjectId(rawParentId);
        }

        const newComment = await Comment.create({
            contenido: contenido.trim(),
            postId,
            comentarioPadreId: parentId,
            usuarioId: req.usuarioId
        });

        const populated = await Comment.findById(newComment._id)
            .populate('usuarioId', 'username email rol')
            .lean();

        if (!populated) {
            return res.status(404).json({ message: 'Error al recuperar el comentario creado' });
        }

        res.status(201).json({
            ...populated,
            comentarioPadreId: populated.comentarioPadreId?.toString() ?? null
        });
    } catch (error: unknown) {
        res.status(400).json({ message: getErrorMessage(error) });
    }
};

export const deleteComment = async (req: AuthRequest, res: Response) => {
    try {
        const commentId = getRouteParam(req.params.id);
        if (!Types.ObjectId.isValid(commentId)) {
            return res.status(400).json({ message: 'ID de comentario inválido' });
        }

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ message: 'Comentario no encontrado' });
        }

        const isAuthor = comment.usuarioId.toString() === String(req.usuarioId);
        const isAdmin = req.userRol === 'administrador';

        if (!isAuthor && !isAdmin) {
            return res.status(403).json({ message: 'No tienes permiso para eliminar este comentario' });
        }

        const commentIds = await collectCommentTreeIds(commentId);
        await Comment.deleteMany({ _id: { $in: commentIds } });
        res.json({ message: 'Comentario eliminado', deletedCount: commentIds.length });
    } catch (error: unknown) {
        res.status(500).json({ message: getErrorMessage(error) });
    }
};