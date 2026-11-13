import { Schema, model, Document, Types } from 'mongoose';

export interface IVote extends Document {
    tipo: number;
    usuarioId: Types.ObjectId;
    postId: Types.ObjectId;
}

const VoteSchema = new Schema<IVote>({
    tipo: { type: Number, enum: [1, -1], required: true },
    usuarioId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true }
});

VoteSchema.index({ usuarioId: 1, postId: 1 }, { unique: true });

export const Vote = model<IVote>('Vote', VoteSchema);