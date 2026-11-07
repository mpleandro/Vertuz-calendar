import { Router } from 'express';
import { q, hydrate } from '../db.js';
import { config } from '../config.js';
import { buildIcs } from '../ics.js';
import { calendarLinks, makeAccessToken, verifyAccessToken } from '../calendarLinks.js';
import { renderEventPage } from '../views/eventPage.js';
import { isAuthed } from '../auth.js';

export const publicRouter = Router();
const CALS = new Set(['google', 'apple', 'outlook', 'office365', 'yahoo', 'ics']);
const PLATS = new Set(['ios', 'android', 'mac', 'windows', 'other']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Carrega o evento visível ao público (ou ao admin em pré-visualização). */
function loadEvent(req, res, { json = false } = {}) {
  const ev = hydrate(q.bySlug.get(req.params.slug));
  const preview = req.query.preview === '1' && isAuthed(req);
  if (!ev || (ev.status === 'draft' && !preview && !isAuthed(req))) {
    if (json) res.status(404).json({ error: 'not_found' }); else res.status(404).send(notFound());
    return null;
  }
  return { ev, preview };
}

function accessPayload(ev, email) {
  const token = makeAccessToken(ev, email);
  return { ok: true, token, links: calendarLinks(ev, { baseUrl: config.baseUrl, token }), url: ev.fields.showUrl ? ev.url : '', location: ev.fields.showLocation ? ev.location : '' };
}

publicRouter.get('/e/:slug', (req, res) => {
  const r = loadEvent(req, res); if (!r) return;
  if (!r.preview && r.ev.status !== 'draft') q.bumpViews.run(r.ev.id);
  const gated = r.ev.fields.requireEmail;
  const links = gated ? null : calendarLinks(r.ev, { baseUrl: config.baseUrl });
  res.set('Cache-Control', 'no-store');
  res.send(renderEventPage(r.ev, { baseUrl: config.baseUrl, links, preview: r.preview }));
});

publicRouter.get('/e/:slug/evento.ics', (req, res) => {
  const r = loadEvent(req, res); if (!r) return;
  if (r.ev.fields.requireEmail && !verifyAccessToken(r.ev, req.query.t) && !isAuthed(req)) {
    return res.status(403).send(locked(r.ev.slug));
  }
  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `attachment; filename="${r.ev.slug}.ics"`,
    'Cache-Control': 'no-store',
  });
  res.send(buildIcs(r.ev, { baseUrl: config.baseUrl }));
});

// Revalida um acesso já liberado (visitante voltando à página).
publicRouter.get('/e/:slug/access', (req, res) => {
  const r = loadEvent(req, res, { json: true }); if (!r) return;
  const email = verifyAccessToken(r.ev, req.query.t);
  if (!email) return res.status(403).json({ error: 'invalid_token' });
  res.set('Cache-Control', 'no-store').json(accessPayload(r.ev, email));
});

publicRouter.post('/e/:slug/click', (req, res) => {
  const ev = q.bySlug.get(req.params.slug);
  if (!ev) return res.status(404).end();
  const cal = CALS.has(req.body?.calendar) ? req.body.calendar : 'other';
  const plat = PLATS.has(req.body?.platform) ? req.body.platform : 'other';
  q.addClick.run(ev.id, cal, plat);
  res.status(204).end();
});

publicRouter.post('/e/:slug/lead', (req, res) => {
  const r = loadEvent(req, res, { json: true }); if (!r) return;
  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 200);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid_email' });
  const name = String(req.body?.name || '').trim().slice(0, 120);
  const cal = CALS.has(req.body?.calendar) ? req.body.calendar : '';
  const plat = PLATS.has(req.body?.platform) ? req.body.platform : '';
  q.addLead.run(r.ev.id, email, name, cal, plat);
  // E-mail obrigatório: só agora o navegador recebe o link do evento e o .ics.
  if (r.ev.fields.requireEmail) return res.json(accessPayload(r.ev, email));
  res.json({ ok: true });
});

publicRouter.get('/', (_req, res) => res.redirect('/admin'));

function shell(title, text) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500&display=swap"><link rel="stylesheet" href="/css/event-base.css"><link rel="stylesheet" href="/templates/vertuz/style.css"></head>
<body class="tpl tpl-vertuz"><div class="bg"></div><main class="page" style="padding-top:22vh;text-align:center"><img src="/brand/mascot.png" width="64" height="64" alt="" style="filter:drop-shadow(0 8px 20px rgba(0,99,242,.5))">
<h1 style="margin-top:16px;padding:0 16px">${title}</h1><p class="subtitle" style="padding:0 16px">${text}</p></main></body></html>`;
}
function notFound() { return shell('Evento não encontrado', 'O link pode estar errado ou o evento ainda não foi publicado.'); }
function locked(slug) { return shell('Acesso restrito', `Informe seu e-mail na <a href="/e/${slug}" style="text-decoration:underline">página do evento</a> para liberar o arquivo da agenda.`); }
