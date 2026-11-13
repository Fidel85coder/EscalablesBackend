import { Schema, model, Document, Types } from 'mongoose';

export interface IPost extends Document {
    titulo: string;
    contenido: string;
    fechaCreacion?: Date;
    usuarioId: Types.ObjectId;
    comunidadId: Types.ObjectId;
}

const PostSchema = new Schema<IPost>({
    titulo: { type: String, required: true },
    contenido: { type: String, required: true },
    usuarioId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    comunidadId: { type: Schema.Types.ObjectId, ref: 'Community', required: true }
}, { timestamps: { createdAt: 'fechaCreacion' } });

export const Post = model<IPost>('Post', PostSchema);