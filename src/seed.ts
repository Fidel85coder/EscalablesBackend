import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs'; // Si usas 'bcrypt', cambia este import a 'bcrypt'
import { User } from './models/User';
import { Community } from './models/Community';
import { Post } from './models/Post';
import { Comment } from './models/Comment';
import { Vote } from './models/Vote';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mean_db';

async function seedDatabase(): Promise<void> {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Conectado a MongoDB para poblar datos...');

        // Limpiar colecciones previas (comenta estas líneas si no quieres borrar lo que ya tienes)
        await Promise.all([
            Vote.deleteMany({}),
            Comment.deleteMany({}),
            Post.deleteMany({}),
            Community.deleteMany({}),
            User.deleteMany({})
        ]);

        const hashedPassword = await bcrypt.hash('123456', 10);

        // 1. Usuarios (1 admin y 3 estudiantes)
        const [admin, ana, carlos, luis] = await User.create([
            { username: 'fidel_admin', email: 'fidel@uaslp.mx', password: hashedPassword, rol: 'administrador' },
            { username: 'ana_dev', email: 'ana@uaslp.mx', password: hashedPassword, rol: 'usuario' },
            { username: 'carlos_js', email: 'carlos@uaslp.mx', password: hashedPassword, rol: 'usuario' },
            { username: 'luis_ing', email: 'luis@uaslp.mx', password: hashedPassword, rol: 'usuario' }
        ]);

        // 2. Comunidades
        const [prog, uaslp, videojuegos] = await Community.create([
            {
                nombre: 'programacion',
                descripcion: 'Dudas de algoritmos, estructuras de datos, MEAN stack y desarrollo web.',
                creadorId: admin._id,
                miembros: [admin._id, ana._id, carlos._id, luis._id]
            },
            {
                nombre: 'uaslp',
                descripcion: 'Comunidad general de la Facultad de Ingeniería, trámites y eventos.',
                creadorId: ana._id,
                miembros: [admin._id, ana._id, luis._id]
            },
            {
                nombre: 'videojuegos',
                descripcion: 'Recomendaciones, torneos internos y desarrollo indie.',
                creadorId: carlos._id,
                miembros: [carlos._id, luis._id]
            }
        ]);

        // 3. Publicaciones (14 posts para probar paginación > 10 y distintos tiempos/votos)
        const now = Date.now();
        const hour = 3600000;

        const postsData = [
            {
                titulo: 'Guía rápida de JWT con Express y TypeScript',
                contenido: 'Les comparto cómo estructuré los middlewares authenticateJWT e isAdmin.',
                usuarioId: carlos._id,
                comunidadId: prog._id,
                fechaCreacion: new Date(now - 2 * hour)
            },
            {
                titulo: '¿Alguien más juega Hollow Knight en el Panteón?',
                contenido: 'Estoy atorado en el jefe final. ¿Qué amuletos recomiendan?',
                usuarioId: ana._id,
                comunidadId: videojuegos._id,
                fechaCreacion: new Date(now - 5 * hour)
            },
            {
                titulo: 'Fechas de inscripción para Servicio Social y Prácticas',
                contenido: 'Ya salió la convocatoria en el portal de la facultad para este semestre.',
                usuarioId: admin._id,
                comunidadId: uaslp._id,
                fechaCreacion: new Date(now - 10 * hour)
            },
            ...Array.from({ length: 11 }, (_, i) => ({
                titulo: `Publicación de prueba #${i + 4} para paginación`,
                contenido: `Contenido de ejemplo generado automáticamente para validar el botón Cargar más (item ${i + 4}).`,
                usuarioId: [admin._id, ana._id, carlos._id, luis._id][i % 4],
                comunidadId: [prog._id, uaslp._id, videojuegos._id][i % 3],
                fechaCreacion: new Date(now - (12 + i * 3) * hour)
            }))
        ];

        const createdPosts = await Post.create(postsData);

        // 4. Votos (para diferenciar Top vs New vs Hot)
        await Vote.create([
            { postId: createdPosts[0]._id, usuarioId: admin._id, tipo: 1 },
            { postId: createdPosts[0]._id, usuarioId: ana._id, tipo: 1 },
            { postId: createdPosts[0]._id, usuarioId: luis._id, tipo: 1 },
            { postId: createdPosts[2]._id, usuarioId: ana._id, tipo: 1 },
            { postId: createdPosts[2]._id, usuarioId: carlos._id, tipo: 1 },
            { postId: createdPosts[1]._id, usuarioId: luis._id, tipo: -1 }
        ]);

        // 5. Comentarios anidados (3 niveles en el primer post)
        const c1 = await Comment.create({
            contenido: '¡Excelente aporte! Me sirvió mucho para separar rutas protegidas.',
            postId: createdPosts[0]._id,
            usuarioId: ana._id,
            comentarioPadreId: null
        });

        const c2 = await Comment.create({
            contenido: 'Gracias Ana, cualquier duda con los tipos de Express avísame.',
            postId: createdPosts[0]._id,
            usuarioId: carlos._id,
            comentarioPadreId: c1._id
        });

        await Comment.create({
            contenido: 'Confirmo, validar ObjectId.isValid evita muchos errores 500.',
            postId: createdPosts[0]._id,
            usuarioId: admin._id,
            comentarioPadreId: c2._id
        });

        console.log('Base de datos poblada correctamente.');
        console.log('Credenciales de prueba (password para todos: 123456):');
        console.log(' - Admin: fidel@uaslp.mx');
        console.log(' - Usuario: ana@uaslp.mx');
    } catch (error) {
        console.error('Error al poblar la base de datos:', error);
    } finally {
        await mongoose.disconnect();
    }
}

seedDatabase();