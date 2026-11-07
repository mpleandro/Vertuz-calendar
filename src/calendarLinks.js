import crypto from 'node:crypto';
import { eventTimes } from './ics.js';
import { toIcsUtc } from './time.js';
import { config } from './config.js';

/** Monta os deep links de Google, Outlook (web), Office 365, Yahoo e o .ics. */
export function calendarLinks(ev, { baseUrl, token = '' }) {
  const { start, end } = eventTimes(ev);
  const pageUrl = `${baseUrl}/e/${ev.slug}`;
  const desc = [ev.description, ev.details, ev.url ? `Link: ${ev.url}` : 'Link do evento: ainda não divulgado. Acompanhe pela página do evento.', `Página: ${pageUrl}`].filter(Boolean).join('\n\n');
  const s = toIcsUtc(start), e = toIcsUtc(end);
  const iso = d => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const google = 'https://calendar.google.com/calendar/render?' + new URLSearchParams({
    action: 'TEMPLATE', text: ev.title, dates: `${s}/${e}`, details: desc, location: ev.location || '', ctz: ev.timezone,
  });
  const outlookParams = new URLSearchParams({
    path: '/calendar/action/compose', rru: 'addevent', subject: ev.title,
    startdt: iso(start), enddt: iso(end), body: desc, location: ev.location || '',
  });
  const outlook = 'https://outlook.live.com/calendar/0/action/compose?' + outlookParams;
  const office365 = 'https://outlook.office.com/calendar/0/action/compose?' + outlookParams;
  const yahoo = 'https://calendar.yahoo.com/?' + new URLSearchParams({
    v: '60', title: ev.title, st: s, et: e, desc, in_loc: ev.location || '',
  });
  const ics = `${pageUrl}/evento.ics${token ? `?t=${encodeURIComponent(token)}` : ''}`;
  return { google, outlook, office365, yahoo, ics };
}

// ---- token de acesso (e-mail obrigatório) ---------------------------------
function sig(ev, email) {
  return crypto.createHmac('sha256', config.sessionSecret).update(`${ev.uid}|${email}`).digest('base64url').slice(0, 32);
}
export function makeAccessToken(ev, email) {
  return `${Buffer.from(email).toString('base64url')}.${sig(ev, email)}`;
}
/** Retorna o e-mail se o token for válido para o evento, senão null. */
export function verifyAccessToken(ev, token) {
  const [b, s] = String(token || '').split('.');
  if (!b || !s) return null;
  let email;
  try { email = Buffer.from(b, 'base64url').toString('utf8'); } catch { return null; }
  const expected = sig(ev, email);
  if (s.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)) ? email : null;
}
