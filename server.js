import express from 'express';
import path from 'node:path';
import { config } from './src/config.js';
import './src/db.js';
import { publicRouter } from './src/routes/public.js';
import { adminRouter } from './src/routes/admin.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(express.static(path.resolve('public'), { maxAge: '7d', etag: true }));
app.use('/uploads', express.static(config.uploadsDir, { maxAge: '30d', immutable: true }));

app.use(publicRouter);
app.use(adminRouter);

app.use((req, res) => res.status(404).send('Não encontrado'));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).send('Erro interno');
});

app.listen(config.port, () => {
  console.log(`Vértuz Agenda rodando em ${config.baseUrl} (porta ${config.port})`);
  console.log(`Admin: ${config.baseUrl}/admin`);
});
