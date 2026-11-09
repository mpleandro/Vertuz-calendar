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
  adminUser: (process.env.ADMIN_USER || 'admin').trim(),
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  defaultTz: process.env.DEFAULT_TZ || 'America/Sao_Paulo',
  uploadsDir: path.resolve('uploads'),
  dataDir: path.resolve('data'),
};

// Mesma trava da versão de deploy que funcionava: em produção, não sobe com a senha/segredo padrão.
if (process.env.NODE_ENV === 'production' && (config.adminPassword === 'admin' || config.adminPassword === 'TROQUE-ESTA-SENHA' || config.sessionSecret === 'dev-secret-change-me')) {
  console.error('ERRO: defina ADMIN_PASSWORD e SESSION_SECRET no arquivo .env antes de subir.');
  process.exit(1);
}

// Avisos que não impedem a subida.
if (process.env.NODE_ENV === 'production') {
  if (['troque-esta-senha', 'defina-uma-senha-forte'].includes(config.adminPassword.toLowerCase())) console.warn('AVISO: ADMIN_PASSWORD parece ser o valor de exemplo. Troque por uma senha forte.');
  if (config.sessionSecret.length < 32) console.warn('AVISO: SESSION_SECRET curto. Use pelo menos 32 caracteres (openssl rand -hex 32).');
}
