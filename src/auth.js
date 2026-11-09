import crypto from 'node:crypto';
import { config } from './config.js';
import { q } from './db.js';

const COOKIE = 'va_session';
const TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 dias

// ---- senha (scrypt) ------------------------------------------------------------
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyHash(pw, stored) {
  const [alg, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const a = crypto.scryptSync(String(pw), salt, 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---- usuários ------------------------------------------------------------------
// Master: definido nas variáveis da VPS (ADMIN_USER + ADMIN_PASSWORD). id 0.
const MASTER = () => ({ id: 0, name: 'Administrador', username: config.adminUser, isMaster: true, session_ver: 0 });

/** Confere login e senha. Retorna o usuário ou null. */
export function login(username, password) {
  const u = String(username || '').trim();
  if (safeEqual(u.toLowerCase(), config.adminUser.toLowerCase()) && safeEqual(password || '', config.adminPassword)) return MASTER();
  const row = q.userByUsername.get(u);
  if (!row || !row.active) { hashPassword('x'); return null; } // tempo parecido com/sem usuário
  return verifyHash(password || '', row.password_hash) ? { ...row, isMaster: false } : null;
}

// ---- sessão --------------------------------------------------------------------
function sign(payload) {
  return crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
}
export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function createSession(res, req, user) {
  const exp = Date.now() + TTL_MS;
  const payload = `u${user.id}.${user.session_ver || 0}.${exp}`;
  const token = `${payload}.${sign(payload)}`;
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}${secure ? '; Secure' : ''}`);
}
export function destroySession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Usuário logado (ou null). Sessões caem se o usuário for desativado ou trocar a senha. */
export function currentUser(req) {
  if (req._user !== undefined) return req._user;
  req._user = null;
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const [uid, ver, exp, sig] = token.split('.');
  if (!uid || !ver || !exp || !sig || !/^u\d+$/.test(uid)) return null;
  if (Number(exp) < Date.now()) return null;
  const expected = sign(`${uid}.${ver}.${exp}`);
  if (!(sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))) return null;
  const id = Number(uid.slice(1));
  if (id === 0) return (req._user = MASTER());
  const row = q.userById.get(id);
  if (!row || !row.active || String(row.session_ver) !== ver) return null;
  return (req._user = { ...row, isMaster: false });
}
export const isAuthed = req => !!currentUser(req);

export function requireAuth(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.redirect('/admin/login');
  req.user = u;
  next();
}
export function requireMaster(req, res, next) {
  if (req.user?.isMaster) return next();
  res.redirect('/admin');
}
