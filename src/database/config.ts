import mongoose from 'mongoose';

export const dbConnection = async (): Promise<void> => {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/mean_db';
        await mongoose.connect(mongoUri);
        console.log('Conectado exitosamente a MongoDB');
    } catch (error) {
        console.error('Error al conectar a MongoDB:', error);
        throw new Error('Error al iniciar la base de datos');
    }
};