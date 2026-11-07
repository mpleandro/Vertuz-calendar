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

// Em produção, não sobe com senha ou segredo de exemplo.
const PLACEHOLDER_PASSWORDS = ['admin', 'troque-esta-senha', 'defina-uma-senha-forte'];
const PLACEHOLDER_SECRETS = ['dev-secret-change-me', 'troque-este-segredo-longo', 'gere-um-texto-longo-e-aleatorio'];
if (process.env.NODE_ENV === 'production') {
  const problems = [];
  if (PLACEHOLDER_PASSWORDS.includes(config.adminPassword.trim().toLowerCase())) problems.push('ADMIN_PASSWORD está com o valor de exemplo');
  if (PLACEHOLDER_SECRETS.includes(config.sessionSecret.trim().toLowerCase())) problems.push('SESSION_SECRET está com o valor de exemplo');
  else if (config.sessionSecret.length < 32) problems.push('SESSION_SECRET precisa ter pelo menos 32 caracteres');
  if (problems.length) {
    console.error(`ERRO: ${problems.join('; ')}. Ajuste o .env (ou as variáveis de ambiente do painel) antes de subir.`);
    process.exit(1);
  }
}
