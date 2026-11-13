import { Schema, model, Document, Types } from 'mongoose';

export interface IComment extends Document {
    contenido: string;
    fechaCreacion?: Date;
    usuarioId: Types.ObjectId;
    postId: Types.ObjectId;
    comentarioPadreId?: Types.ObjectId | null;
}

const CommentSchema = new Schema<IComment>({
    contenido: { type: String, required: true },
    usuarioId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    comentarioPadreId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null }
}, { timestamps: { createdAt: 'fechaCreacion' } });

export const Comment = model<IComment>('Comment', CommentSchema);