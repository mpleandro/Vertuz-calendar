import fs from 'node:fs';
import path from 'node:path';

// Carrega .env simples (sem dependência externa)
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export const config = {
  port: Number(process.env.PORT || 3000),
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  defaultTz: process.env.DEFAULT_TZ || 'America/Sao_Paulo',
  uploadsDir: path.resolve('uploads'),
  dataDir: path.resolve('data'),
};
