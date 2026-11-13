import { Schema, model, Document, Types } from 'mongoose';

export interface ICommunity extends Document {
    nombre: string;
    descripcion: string;
    fechaCreacion?: Date;
    creadorId: Types.ObjectId;
    miembros: Types.ObjectId[];
}

const CommunitySchema = new Schema<ICommunity>({
    nombre: { type: String, required: true, unique: true },
    descripcion: { type: String, required: true },
    creadorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    miembros: [{ type: Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: { createdAt: 'fechaCreacion' } });

export const Community = model<ICommunity>('Community', CommunitySchema);