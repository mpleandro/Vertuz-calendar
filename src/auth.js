import crypto from 'node:crypto';
import { config } from './config.js';

const COOKIE = 'va_session';
const TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 dias

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
export function createSession(res, req) {
  const exp = Date.now() + TTL_MS;
  const payload = `admin.${exp}`;
  const token = `${payload}.${sign(payload)}`;
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}${secure ? '; Secure' : ''}`);
}
export function destroySession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
export function isAuthed(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return false;
  const [who, exp, sig] = token.split('.');
  if (who !== 'admin' || !exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const expected = sign(`${who}.${exp}`);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
export function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.redirect('/admin/login');
}
export function checkPassword(input) {
  const a = Buffer.from(String(input || ''));
  const b = Buffer.from(config.adminPassword);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
