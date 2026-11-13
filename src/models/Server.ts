import express, { type Application } from 'express';
import cors from 'cors';

import authRoutes from '../routes/auth.routes';
import communityRoutes from '../routes/community.routes';
import postRoutes from '../routes/posts.routes';
import commentRoutes from '../routes/comment.routes';
import { dbConnection } from '../database/config';

export class Server {
    private app: Application;
    private port: string;

    private apiPaths = {
        auth: '/api/auth',
        communities: '/api/communities',
        posts: '/api/posts',
        comments: '/api/comments'
    };

    constructor() {
        this.app = express();
        this.port = process.env.PORT || '3000';

        this.middleware();
        this.routes();
    }

    private middleware(): void {
        this.app.use(cors());
        this.app.use(express.json());
    }

    private routes(): void {
        this.app.use(this.apiPaths.auth, authRoutes);
        this.app.use(this.apiPaths.communities, communityRoutes);
        this.app.use(this.apiPaths.posts, postRoutes);
        this.app.use(this.apiPaths.comments, commentRoutes);
    }

    public async listen(): Promise<void> {
        try {
            await dbConnection();

            this.app.listen(this.port, () => {
                console.log(`Servidor Express escuchando en puerto ${this.port}`);
            });
        } catch (error) {
            console.error('Error al iniciar el servidor:', error);
        }
    }
}