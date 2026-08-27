import express from 'express';
import cors from 'cors';
import { PORT, CORS_ORIGIN } from './config/env.js';
import { errorHandler } from './middlewares/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import usuariosRoutes from './routes/usuarios.routes.js';
import equipamentosRoutes from './routes/equipamentos.routes.js';
import operadoresRoutes from './routes/operadores.routes.js';
import lancamentosRoutes from './routes/lancamentos.routes.js';
import configRoutes from './routes/config.routes.js';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, hora: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/equipamentos', equipamentosRoutes);
app.use('/api/operadores', operadoresRoutes);
app.use('/api/lancamentos', lancamentosRoutes);
app.use('/api/config', configRoutes);

app.use((req, res) => res.status(404).json({ erro: 'ROTA_NAO_ENCONTRADA', mensagem: 'Rota não encontrada.' }));
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`GP2T backend rodando na porta ${PORT}`);
});
