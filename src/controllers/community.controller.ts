import { Request, Response } from 'express';
import { Community } from '../models/Community';
import { AuthRequest } from '../middleware/auth';

const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getCommunities = async (req: Request, res: Response) => {
    try {
        const search = req.query['search'];
        const filter: Record<string, unknown> = {};

        if (typeof search === 'string' && search.trim() !== '') {
            const escapedSearch = escapeRegex(search.trim());
            filter['$or'] = [
                { nombre: { $regex: escapedSearch, $options: 'i' } },
                { descripcion: { $regex: escapedSearch, $options: 'i' } }
            ];
        }

        const communities = await Community.find(filter)
            .populate('creadorId', 'username')
            .lean();

        res.json(communities);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
};

export const createCommunity = async (req: AuthRequest, res: Response) => {
    try {
        const { nombre, descripcion } = req.body;

        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ message: 'El nombre es obligatorio' });
        }

        const cleanName = String(nombre).trim().replace(/^r\//, '');

        const existing = await Community.findOne({ nombre: cleanName });
        if (existing) {
            return res.status(400).json({ message: 'La comunidad ya existe' });
        }

        const userId = req.usuarioId!;

        const newComm = await Community.create({
            nombre: cleanName,
            descripcion: descripcion || '',
            creadorId: userId,
            miembros: [userId]
        });

        res.status(201).json(newComm);
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};

export const toggleJoinCommunity = async (req: AuthRequest, res: Response) => {
    try {
        const community = await Community.findById(req.params.id);
        if (!community) {
            return res.status(404).json({ message: 'Comunidad no encontrada' });
        }

        const userId = req.usuarioId!;
        const memberIndex = community.miembros.findIndex(m => m.toString() === userId);

        let joined = false;
        if (memberIndex > -1) {
            community.miembros.splice(memberIndex, 1);
        } else {
            community.miembros.push(userId as any);
            joined = true;
        }

        await community.save();
        res.json({ joined, totalMembers: community.miembros.length, communityId: community._id });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};