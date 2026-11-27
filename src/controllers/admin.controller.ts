import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { Comment } from '../models/Comment';
import { Community } from '../models/Community';
import { Post } from '../models/Post';
import { User } from '../models/User';
import { Vote } from '../models/Vote';

const getParamId = (param: string | string[] | undefined): string =>
    Array.isArray(param) ? param[0] : (param ?? '');

const isSameId = (firstId: string | undefined, secondId: string): boolean =>
    firstId?.toLowerCase() === secondId.toLowerCase();

const collectCommentTreeIds = async (rootIds: Types.ObjectId[]): Promise<Types.ObjectId[]> => {
    const ids = [...rootIds];
    const visited = new Set(rootIds.map(id => id.toString()));
    let parents = rootIds;

    while (parents.length > 0) {
        const children = await Comment.find({ comentarioPadreId: { $in: parents } }).select('_id').lean();
        const childIds = children
            .map(comment => comment._id)
            .filter(id => {
                const key = id.toString();
                if (visited.has(key)) return false;
                visited.add(key);
                return true;
            });
        ids.push(...childIds);
        parents = childIds;
    }

    return ids;
};

const deletePostsAndRelatedData = async (postIds: Types.ObjectId[]): Promise<void> => {
    if (postIds.length === 0) return;

    const commentRoots = await Comment.find({ postId: { $in: postIds } }).distinct('_id');
    const commentIds = await collectCommentTreeIds(commentRoots);

    await Promise.all([
        Comment.deleteMany({ _id: { $in: commentIds } }),
        Vote.deleteMany({ postId: { $in: postIds } }),
        Post.deleteMany({ _id: { $in: postIds } })
    ]);
};

export const getUsers = async (_req: Request, res: Response) => {
    try {
        const users = await User.find()
            .select('-password')
            .sort({ fechaRegistro: -1 })
            .lean();
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'No se pudieron cargar los usuarios' });
    }
};

export const updateUserRole = async (req: AuthRequest, res: Response) => {
    try {
        const targetId = getParamId(req.params.id);
        const { rol } = req.body as { rol?: unknown };

        if (rol !== 'usuario' && rol !== 'administrador') {
            return res.status(400).json({ message: 'El rol debe ser usuario o administrador' });
        }
        if (!Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ message: 'ID de usuario inválido' });
        }
        if (isSameId(req.usuarioId, targetId)) {
            return res.status(400).json({ message: 'No puedes modificar tu propio rol' });
        }

        const user = await User.findByIdAndUpdate(
            targetId,
            { rol },
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        res.json(user);
    } catch (error) {
        res.status(400).json({ message: 'No se pudo actualizar el rol del usuario' });
    }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
    try {
        const targetId = getParamId(req.params.id);

        if (!Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ message: 'ID de usuario inválido' });
        }
        if (isSameId(req.usuarioId, targetId)) {
            return res.status(400).json({ message: 'No puedes eliminar tu propia cuenta activa' });
        }

        const user = await User.findById(targetId).select('_id');
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        const ownedPosts = await Post.find({ usuarioId: user._id }).distinct('_id');
        const authoredComments = await Comment.find({ usuarioId: user._id }).distinct('_id');
        const userCommentTree = await collectCommentTreeIds(authoredComments);

        await deletePostsAndRelatedData(ownedPosts);
        await Promise.all([
            Comment.deleteMany({ _id: { $in: userCommentTree } }),
            Vote.deleteMany({ usuarioId: user._id }),
            Community.updateMany(
                { miembros: user._id },
                { $pull: { miembros: user._id } }
            ),
            User.findByIdAndDelete(user._id)
        ]);

        res.json({ message: 'Usuario eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ message: 'No se pudo eliminar el usuario' });
    }
};

export const getAllCommunities = async (_req: Request, res: Response) => {
    try {
        const communities = await Community.find()
            .populate('creadorId', 'username email')
            .sort({ fechaCreacion: -1 })
            .lean();
        res.json(communities);
    } catch (error) {
        res.status(500).json({ message: 'No se pudieron cargar las comunidades' });
    }
};

export const deleteCommunity = async (req: Request, res: Response) => {
    try {
        const targetId = getParamId(req.params.id);

        if (!Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ message: 'ID de comunidad inválido' });
        }

        const community = await Community.findById(targetId).select('_id');
        if (!community) {
            return res.status(404).json({ message: 'Comunidad no encontrada' });
        }

        const postIds = await Post.find({ comunidadId: community._id }).distinct('_id');
        await deletePostsAndRelatedData(postIds);
        await Community.findByIdAndDelete(community._id);

        res.json({ message: 'Comunidad eliminada correctamente' });
    } catch (error) {
        res.status(500).json({ message: 'No se pudo eliminar la comunidad' });
    }
};

export const getAllPosts = async (_req: Request, res: Response) => {
    try {
        const posts = await Post.find()
            .populate('usuarioId', 'username email rol')
            .populate('comunidadId', 'nombre descripcion')
            .sort({ fechaCreacion: -1 })
            .lean();
        res.json(posts);
    } catch (error) {
        res.status(500).json({ message: 'No se pudieron cargar las publicaciones' });
    }
};

export const deletePost = async (req: Request, res: Response) => {
    try {
        const targetId = getParamId(req.params.id);

        if (!Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ message: 'ID de publicación inválido' });
        }

        const post = await Post.findById(targetId).select('_id');
        if (!post) {
            return res.status(404).json({ message: 'Publicación no encontrada' });
        }

        await deletePostsAndRelatedData([post._id]);
        res.json({ message: 'Publicación eliminada correctamente' });
    } catch (error) {
        res.status(500).json({ message: 'No se pudo eliminar la publicación' });
    }
};

export const deleteComment = async (req: Request, res: Response) => {
    try {
        const targetId = getParamId(req.params.id);

        if (!Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ message: 'ID de comentario inválido' });
        }

        const comment = await Comment.findById(targetId).select('_id');
        if (!comment) {
            return res.status(404).json({ message: 'Comentario no encontrado' });
        }

        const commentIds = await collectCommentTreeIds([comment._id]);
        await Comment.deleteMany({ _id: { $in: commentIds } });
        res.json({ message: 'Comentario y sus respuestas eliminados correctamente' });
    } catch (error) {
        res.status(500).json({ message: 'No se pudo eliminar el comentario' });
    }
};