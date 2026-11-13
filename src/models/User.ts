import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
    username: string;
    email: string;
    password?: string;
    rol: 'usuario' | 'administrador';
    fechaRegistro?: Date;
}

const UserSchema = new Schema<IUser>({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rol: { type: String, enum: ['usuario', 'administrador'], default: 'usuario' }
}, { timestamps: { createdAt: 'fechaRegistro' } });

export const User = model<IUser>('User', UserSchema);