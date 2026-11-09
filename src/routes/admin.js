import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { q, hydrate, getDefaults, saveDefaults, getWebhookSettings, saveWebhookSettings, normalizeFields, dashboardData, leadsForExport, DEFAULT_FIELDS } from '../db.js';
import { config } from '../config.js';
import { requireAuth, createSession, destroySession, checkPassword, isAuthed } from '../auth.js';
import { renderLogin, renderHome, renderDashboard, renderSettings, renderForm } from '../views/admin.js';
import { renderEventPage } from '../views/eventPage.js';
import { calendarLinks } from '../calendarLinks.js';
import { slugify } from '../views/helpers.js';
import { TEMPLATES, DEFAULT_TEMPLATE } from '../templates.js';
import { tzOffsetMinutes } from '../time.js';
import { sendTest } from '../webhooks.js';

export const adminRouter = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (_req, file, cb) => {
      const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[file.mimetype] || '.img';
      cb(null, crypto.randomBytes(8).toString('hex') + ext);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)),
});

const menu = () => q.menuEvents.all();
const FLASH = {
  saved: 'Evento salvo.', created: 'Evento criado. Ele fica em rascunho até você publicar.', deleted: 'Evento excluído.',
  dup: 'Evento duplicado como rascunho.', settings: 'Configurações gerais salvas.',
  'wh-bad': 'O webhook precisa começar com http:// ou https://.',
};

// ---- auth ------------------------------------------------------------------
adminRouter.get('/admin/login', (req, res) => {
  if (isAuthed(req)) return res.redirect('/admin');
  res.send(renderLogin({ error: req.query.e ? 'Senha incorreta.' : '' }));
});
adminRouter.post('/admin/login', (req, res) => {
  if (!checkPassword(req.body?.password)) return res.redirect('/admin/login?e=1');
  createSession(res, req);
  res.redirect('/admin');
});
adminRouter.post('/admin/logout', (_req, res) => { destroySession(res); res.redirect('/admin/login'); });

adminRouter.use('/admin', requireAuth);
adminRouter.use('/admin', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// ---- início ----------------------------------------------------------------
adminRouter.get('/admin', (req, res) => {
  const events = q.allEvents.all().map(hydrate);
  res.send(renderHome({ events, baseUrl: config.baseUrl, flash: FLASH[req.query.m] || '', menuEvents: menu() }));
});

// ---- dashboard -------------------------------------------------------------
function last30Days(tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const out = [];
  for (let i = 29; i >= 0; i--) {
    const iso = fmt.format(new Date(Date.now() - i * 864e5));
    const [, m, d] = iso.split('-');
    out.push({ iso, short: `${d}/${m}`, label: `${d}/${m}/${iso.slice(0, 4)}` });
  }
  return out;
}
adminRouter.get('/admin/dashboard', (req, res) => {
  const events = q.menuEvents.all();
  const eventId = events.some(e => e.id === Number(req.query.event)) ? Number(req.query.event) : null;
  const data = dashboardData(eventId, tzOffsetMinutes(config.defaultTz));
  const byDay = Object.fromEntries(data.daily.map(r => [r.d, r.n]));
  const days = last30Days(config.defaultTz).map(d => ({ ...d, n: byDay[d.iso] || 0 }));
  res.send(renderDashboard({ data, events, eventId, days, menuEvents: events }));
});
adminRouter.get('/admin/events/:id/leads', (req, res) => res.redirect(`/admin/dashboard?event=${Number(req.params.id) || ''}`));
adminRouter.get('/admin/leads.csv', (req, res) => {
  const eventId = Number(req.query.event) || null;
  const rows = leadsForExport(eventId, tzOffsetMinutes(config.defaultTz));
  const csv = ['email,nome,evento,calendario,dispositivo,data']
    .concat(rows.map(r => [r.email, r.name, r.event_title, r.calendar, r.platform, r.created_local].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')))
    .join('\r\n');
  const ev = eventId ? q.byId.get(eventId) : null;
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="leads-${ev ? ev.slug : 'todos'}.csv"` });
  res.send('﻿' + csv);
});

// ---- configurações gerais --------------------------------------------------
function readFields(body) {
  const f = {};
  for (const k of Object.keys(DEFAULT_FIELDS)) f[k] = body?.[`fields_${k}`] === 'on';
  return normalizeFields(f);
}
adminRouter.get('/admin/settings', (req, res) => {
  const test = req.query.t;
  const flash = test ? (test === 'ok' ? `Teste enviado: o destino respondeu ${digits(req.query.s)}.` : '') : (req.query.m === 'wh-bad' ? '' : FLASH[req.query.m] || '');
  const error = test && test !== 'ok' ? `O teste falhou: ${req.query.s === '0' ? 'sem resposta do destino' : `o destino respondeu ${digits(req.query.s)}`}.` : (req.query.m === 'wh-bad' ? FLASH['wh-bad'] : '');
  res.send(renderSettings({ defaults: getDefaults(), webhook: getWebhookSettings(), usingDefaults: q.countDefaultMode.get().n, flash, error, menuEvents: menu() }));
});
adminRouter.post('/admin/settings', async (req, res) => {
  const url = String(req.body?.webhook_url || '').trim().slice(0, 500);
  if (url && !/^https?:\/\//i.test(url)) return res.redirect('/admin/settings?m=wh-bad');
  saveDefaults({ template: req.body?.template, fields: readFields(req.body) });
  saveWebhookSettings({ url, secret: String(req.body?.webhook_secret || '').slice(0, 200) });
  if (req.body?.after === 'test') {
    if (!url) return res.redirect('/admin/settings?m=settings');
    const r = await sendTest(url, sampleEvent());
    return res.redirect(`/admin/settings?t=${r.ok ? 'ok' : 'fail'}&s=${r.status}`);
  }
  res.redirect('/admin?m=settings');
});
const digits = s => String(s ?? '').replace(/[^0-9]/g, '');

// ---- prévia de template ----------------------------------------------------
adminRouter.get('/admin/templates/:id/preview', (req, res) => {
  if (!TEMPLATES[req.params.id]) return res.status(404).send('Template não encontrado');
  const base = req.query.event ? hydrate(q.byId.get(req.query.event)) : null;
  const ev = base || sampleEvent();
  const view = { ...ev, template: req.params.id, fields: base?.own?.fields || getDefaults().fields };
  const links = calendarLinks(view, { baseUrl: config.baseUrl });
  res.send(renderEventPage(view, { baseUrl: config.baseUrl, links: view.fields.requireEmail ? null : links, preview: req.query.bar !== '0' }));
});
function sampleEvent() {
  const d = new Date(Date.now() + 12 * 864e5);
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: config.defaultTz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return {
    id: 0, slug: 'exemplo', uid: 'exemplo@vertuz-agenda', status: 'published', views: 0,
    title: 'Encontro ao vivo: organize suas finanças', subtitle: 'Um passo a passo prático em 90 minutos',
    description: 'Um encontro online para colocar a vida financeira em ordem, com método e sem enrolação.',
    details: 'Traga papel e caneta. O link da sala chega no seu calendário.', location: 'Online',
    url: 'https://meet.google.com/abc-defg-hij', organizer_name: 'Equipe', reminder_minutes: 60,
    start_local: `${iso}T19:00`, end_local: `${iso}T20:30`, timezone: config.defaultTz,
    hero_image: '', cta_label: 'Salvar na minha agenda', updated_at: '2026-01-01 00:00:00',
  };
}

// ---- novo / editar ---------------------------------------------------------
adminRouter.get('/admin/events/new', (_req, res) => {
  res.send(renderForm({ ev: null, baseUrl: config.baseUrl, isNew: true, defaultTz: config.defaultTz, defaults: getDefaults(), menuEvents: menu() }));
});
adminRouter.get('/admin/events/:id', (req, res) => {
  const ev = hydrate(q.byId.get(req.params.id));
  if (!ev) return res.redirect('/admin');
  res.send(renderForm({ ev, baseUrl: config.baseUrl, isNew: false, flash: FLASH[req.query.m] || '', defaultTz: config.defaultTz, defaults: getDefaults(), menuEvents: menu() }));
});

function readForm(body, existing) {
  const b = body || {};
  const sd = String(b.start_date || ''), st = String(b.start_time || '');
  const ed = String(b.end_date || ''), et = String(b.end_time || '');
  const start_local = sd && st ? `${sd}T${st}` : '';
  const end_local = ed && et ? `${ed}T${et}` : (ed && !et ? `${ed}T${st}` : (et && !ed && sd ? `${sd}T${et}` : null));
  const custom = b.settings_mode === 'custom';
  return {
    title: String(b.title || '').trim().slice(0, 140),
    subtitle: String(b.subtitle || '').trim().slice(0, 180),
    slug: slugify(b.slug || b.title),
    description: String(b.description || '').trim().slice(0, 5000),
    details: String(b.details || '').trim().slice(0, 5000),
    start_local, end_local,
    timezone: String(b.timezone || config.defaultTz),
    location: String(b.location || '').trim().slice(0, 300),
    url: String(b.url || '').trim().slice(0, 500),
    organizer_name: String(b.organizer_name || '').trim().slice(0, 120),
    reminder_minutes: Math.max(0, Number(b.reminder_minutes) || 0),
    status: ['draft', 'published', 'closed'].includes(b.status) ? b.status : 'draft',
    cta_label: String(b.cta_label || '').trim().slice(0, 40) || 'Salvar na minha agenda',
    hero_image: existing?.hero_image || '',
    settings_mode: custom ? 'custom' : 'default',
    // Mesmo em "padrão", guardamos a última personalização para não perdê-la ao alternar.
    template: TEMPLATES[b.template] ? b.template : (existing?.template || DEFAULT_TEMPLATE),
    fields: JSON.stringify(custom ? readFields(b) : normalizeFields(safeJson(existing?.fields))),
    webhook_url: String(b.webhook_url || '').trim().slice(0, 500),
  };
}
function safeJson(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }

function validate(d) {
  if (!d.title) return 'Informe o nome do evento.';
  if (!d.slug) return 'Informe a URL do evento.';
  if (!d.start_local) return 'Informe data e horário de início.';
  if (d.url && !/^https?:\/\//i.test(d.url)) return 'O link do evento precisa começar com http:// ou https://';
  if (d.webhook_url && !/^https?:\/\//i.test(d.webhook_url)) return 'O webhook precisa começar com http:// ou https://';
  try { new Intl.DateTimeFormat('en-US', { timeZone: d.timezone }); } catch { return 'Fuso horário inválido.'; }
  return '';
}
function removeFile(name) {
  if (!name) return;
  try { fs.unlinkSync(path.join(config.uploadsDir, path.basename(name))); } catch {}
}
function handleUpload(req, res, next) {
  upload.single('hero')(req, res, err => {
    if (err) req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'Imagem acima de 8 MB.' : 'Falha no upload da imagem.';
    next();
  });
}
function formAgain(res, { data, existing, isNew, error }) {
  const ev = hydrate({ ...(existing || {}), ...data, id: existing?.id ?? null, views: existing?.views ?? 0, created_at: existing?.created_at || '' });
  res.status(400).send(renderForm({ ev, baseUrl: config.baseUrl, isNew, error, defaultTz: config.defaultTz, defaults: getDefaults(), menuEvents: menu() }));
}

adminRouter.post('/admin/events/new', handleUpload, (req, res) => {
  const data = readForm(req.body, null);
  const error = req.uploadError || validate(data) || (q.bySlug.get(data.slug) ? 'Já existe um evento com essa URL.' : '');
  if (error) { removeFile(req.file?.filename); return formAgain(res, { data, isNew: true, error }); }
  if (req.file) data.hero_image = req.file.filename;
  data.uid = `${crypto.randomUUID()}@vertuz-agenda`;
  const info = q.insert.run(data);
  if (req.body.after === 'view') return res.redirect(`/e/${data.slug}?preview=1`);
  res.redirect('/admin?m=created');
});

adminRouter.post('/admin/events/:id', handleUpload, (req, res) => {
  const existing = q.byId.get(req.params.id);
  if (!existing) return res.redirect('/admin');
  const data = readForm(req.body, existing);
  const clash = q.bySlug.get(data.slug);
  const error = req.uploadError || validate(data) || (clash && clash.id !== existing.id ? 'Já existe um evento com essa URL.' : '');
  if (error) { removeFile(req.file?.filename); return formAgain(res, { data, existing, isNew: false, error }); }
  if (req.body.remove_hero === 'on') { removeFile(existing.hero_image); data.hero_image = ''; }
  if (req.file) { removeFile(existing.hero_image); data.hero_image = req.file.filename; }
  q.update.run({ ...data, id: existing.id });
  if (req.body.after === 'view') return res.redirect(`/e/${data.slug}?preview=1`);
  res.redirect('/admin?m=saved');
});

adminRouter.post('/admin/events/:id/delete', (req, res) => {
  const ev = q.byId.get(req.params.id);
  if (ev) { removeFile(ev.hero_image); q.remove.run(ev.id); }
  res.redirect('/admin?m=deleted');
});

adminRouter.post('/admin/events/:id/duplicate', (req, res) => {
  const ev = q.byId.get(req.params.id);
  if (!ev) return res.redirect('/admin');
  let slug = `${ev.slug}-copia`, n = 2;
  while (q.bySlug.get(slug)) slug = `${ev.slug}-copia-${n++}`;
  let hero = '';
  if (ev.hero_image) {
    hero = crypto.randomBytes(8).toString('hex') + path.extname(ev.hero_image);
    try { fs.copyFileSync(path.join(config.uploadsDir, ev.hero_image), path.join(config.uploadsDir, hero)); } catch { hero = ''; }
  }
  q.insert.run({
    ...ev, slug, uid: `${crypto.randomUUID()}@vertuz-agenda`, status: 'draft', hero_image: hero, title: `${ev.title} (cópia)`,
    settings_mode: ev.settings_mode || 'default', template: ev.template || DEFAULT_TEMPLATE, fields: ev.fields || '{}',
  });
  res.redirect('/admin?m=dup');
});
