import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { q, hydrate, getDefaults, saveDefaults, getWebhookSettings, saveWebhookSettings, normalizeFields, dashboardData, leadsForExport, DEFAULT_FIELDS } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireMaster, createSession, destroySession, login, currentUser, hashPassword } from '../auth.js';
import { foldersFor, canAccessFolder, canAccessEvent, eventsFor } from '../access.js';
import {
  renderLogin, renderHome, renderDashboard, renderSettings, renderForm,
  renderUsers, renderUserForm, renderFolderForm, renderAccount,
} from '../views/admin.js';
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

const FLASH = {
  saved: 'Evento salvo.', created: 'Evento criado. Ele fica em rascunho até você publicar.', deleted: 'Evento excluído.',
  dup: 'Evento duplicado como rascunho.', settings: 'Configurações gerais salvas.',
  'folder-new': 'Pasta criada.', 'folder-saved': 'Pasta salva.', 'folder-deleted': 'Pasta excluída.',
  'user-new': 'Usuário criado, com uma pasta própria.', 'user-saved': 'Usuário salvo.', 'user-deleted': 'Usuário excluído. As pastas dele ficaram com o administrador.',
  password: 'Senha alterada.',
};
const ERR = {
  'wh-bad': 'O webhook precisa começar com http:// ou https://.',
  'folder-name': 'Dê um nome para a pasta.',
  'folder-notempty': 'A pasta ainda tem eventos. Mova ou exclua os eventos antes de excluir a pasta.',
  'no-folder': 'Crie uma pasta antes de criar eventos.',
};
const isUrl = s => /^https?:\/\//i.test(s);
const digits = s => String(s ?? '').replace(/[^0-9]/g, '');

/** Dados do menu lateral, sempre limitados ao que o usuário pode ver. */
function nav(req, active) {
  const folders = foldersFor(req.user);
  const events = eventsFor(req.user, q.menuEvents.all());
  return { user: req.user, active, menuFolders: folders, menuEvents: events, noFolderCount: req.user.isMaster ? q.countNoFolder.get().n : 0 };
}
const msgs = req => ({ flash: FLASH[req.query.m] || '', error: ERR[req.query.e] || '' });

// ---- login (com trava simples contra força bruta) --------------------------
const attempts = new Map(); // ip -> { n, until }
function blocked(ip) {
  const a = attempts.get(ip);
  return a && a.n >= 8 && a.until > Date.now();
}
function failed(ip) {
  const a = attempts.get(ip);
  const fresh = !a || a.until < Date.now();
  attempts.set(ip, { n: fresh ? 1 : a.n + 1, until: Date.now() + 15 * 60 * 1000 });
}

adminRouter.get('/admin/login', (req, res) => {
  if (currentUser(req)) return res.redirect('/admin');
  const error = req.query.e === 'lock' ? 'Muitas tentativas. Aguarde 15 minutos.' : req.query.e ? 'Usuário ou senha incorretos.' : '';
  res.send(renderLogin({ error, username: String(req.query.u || '').slice(0, 60) }));
});
adminRouter.post('/admin/login', (req, res) => {
  const ip = req.ip;
  const username = String(req.body?.username || '').trim();
  if (blocked(ip)) return res.redirect('/admin/login?e=lock');
  const user = login(username, req.body?.password);
  if (!user) { failed(ip); return res.redirect(`/admin/login?e=1&u=${encodeURIComponent(username)}`); }
  attempts.delete(ip);
  createSession(res, req, user);
  res.redirect('/admin');
});
adminRouter.post('/admin/logout', (_req, res) => { destroySession(res); res.redirect('/admin/login'); });

adminRouter.use('/admin', requireAuth);
adminRouter.use('/admin', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// ---- início ----------------------------------------------------------------
adminRouter.get('/admin', (req, res) => {
  const folders = foldersFor(req.user);
  let folder = req.query.folder || '';
  if (folder === 'none' && !req.user.isMaster) folder = '';
  if (folder && folder !== 'none' && !folders.some(f => f.id === Number(folder))) folder = '';
  const events = eventsFor(req.user, q.allEvents.all(), folder).map(hydrate);
  const current = folder && folder !== 'none' ? folders.find(f => f.id === Number(folder)) : null;
  res.send(renderHome({ events, folders, folder, current, users: req.user.isMaster ? q.users.all() : [], baseUrl: config.baseUrl, ...msgs(req), nav: nav(req, 'home') }));
});

// ---- pastas ----------------------------------------------------------------
function ownerFrom(req, fallback) {
  if (!req.user.isMaster) return req.user.id;
  const id = Number(req.body?.owner_id) || null;
  return id && q.userById.get(id) ? id : (fallback ?? null);
}
adminRouter.post('/admin/folders', (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  if (!name) return res.redirect('/admin?e=folder-name');
  const info = q.insertFolder.run({ name, owner_id: ownerFrom(req), webhook_url: '' });
  res.redirect(`/admin?folder=${info.lastInsertRowid}&m=folder-new`);
});
function loadFolder(req, res) {
  const f = q.folderById.get(req.params.id);
  if (!canAccessFolder(req.user, f)) { res.redirect('/admin'); return null; }
  return f;
}
adminRouter.get('/admin/folders/:id', (req, res) => {
  const f = loadFolder(req, res); if (!f) return;
  const test = req.query.t;
  const flash = test === 'ok' ? `Teste enviado: o destino respondeu ${digits(req.query.s)}.` : msgs(req).flash;
  const error = test === 'fail' ? `O teste falhou: ${req.query.s === '0' ? 'sem resposta do destino' : `o destino respondeu ${digits(req.query.s)}`}.` : msgs(req).error;
  res.send(renderFolderForm({
    folder: f, users: req.user.isMaster ? q.users.all() : [], eventsCount: q.countInFolder.get(f.id).n,
    globalWebhook: getWebhookSettings().url, flash, error, nav: nav(req, `folder-${f.id}`),
  }));
});
adminRouter.post('/admin/folders/:id', async (req, res) => {
  const f = loadFolder(req, res); if (!f) return;
  const name = String(req.body?.name || '').trim().slice(0, 80);
  const webhook_url = String(req.body?.webhook_url || '').trim().slice(0, 500);
  if (!name) return res.redirect(`/admin/folders/${f.id}?e=folder-name`);
  if (webhook_url && !isUrl(webhook_url)) return res.redirect(`/admin/folders/${f.id}?e=wh-bad`);
  q.updateFolder.run({ id: f.id, name, webhook_url, owner_id: ownerFrom(req, f.owner_id) });
  if (req.body?.after === 'test' && webhook_url) {
    const r = await sendTest(webhook_url, { ...sampleEvent(), folder_id: f.id }, 'folder');
    return res.redirect(`/admin/folders/${f.id}?t=${r.ok ? 'ok' : 'fail'}&s=${r.status}`);
  }
  res.redirect(`/admin?folder=${f.id}&m=folder-saved`);
});
adminRouter.post('/admin/folders/:id/delete', (req, res) => {
  const f = loadFolder(req, res); if (!f) return;
  if (q.countInFolder.get(f.id).n) return res.redirect(`/admin/folders/${f.id}?e=folder-notempty`);
  q.removeFolder.run(f.id);
  res.redirect('/admin?m=folder-deleted');
});

// ---- usuários (só master) --------------------------------------------------
const USER_RE = /^[a-z0-9._@-]{3,60}$/i;
adminRouter.get('/admin/users', requireMaster, (req, res) => {
  res.send(renderUsers({ users: q.users.all(), master: config.adminUser, ...msgs(req), nav: nav(req, 'users') }));
});
adminRouter.get('/admin/users/new', requireMaster, (req, res) => {
  res.send(renderUserForm({ u: null, nav: nav(req, 'users') }));
});
function readUser(body) {
  return {
    name: String(body?.name || '').trim().slice(0, 80),
    username: String(body?.username || '').trim().toLowerCase().slice(0, 60),
    password: String(body?.password || ''),
    active: body?.active === 'on' ? 1 : 0,
  };
}
function userError(d, { isNew, id }) {
  if (!d.name) return 'Informe o nome.';
  if (!USER_RE.test(d.username)) return 'O login precisa ter de 3 a 60 caracteres: letras, números, ponto, hífen, _ ou @.';
  if (d.username === config.adminUser.toLowerCase()) return 'Esse login é reservado ao administrador.';
  const clash = q.userByUsername.get(d.username);
  if (clash && clash.id !== id) return 'Já existe um usuário com esse login.';
  if ((isNew || d.password) && d.password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  return '';
}
adminRouter.post('/admin/users/new', requireMaster, (req, res) => {
  const d = readUser(req.body); d.active = 1;
  const error = userError(d, { isNew: true });
  if (error) return res.status(400).send(renderUserForm({ u: d, error, nav: nav(req, 'users') }));
  const info = q.insertUser.run({ name: d.name, username: d.username, password_hash: hashPassword(d.password) });
  q.insertFolder.run({ name: d.name, owner_id: Number(info.lastInsertRowid), webhook_url: '' });
  res.redirect('/admin/users?m=user-new');
});
adminRouter.get('/admin/users/:id', requireMaster, (req, res) => {
  const u = q.userById.get(req.params.id);
  if (!u) return res.redirect('/admin/users');
  res.send(renderUserForm({ u, folders: q.foldersOf.all(u.id), nav: nav(req, 'users') }));
});
adminRouter.post('/admin/users/:id', requireMaster, (req, res) => {
  const u = q.userById.get(req.params.id);
  if (!u) return res.redirect('/admin/users');
  const d = readUser(req.body);
  const error = userError(d, { isNew: false, id: u.id });
  if (error) return res.status(400).send(renderUserForm({ u: { ...u, ...d }, folders: q.foldersOf.all(u.id), error, nav: nav(req, 'users') }));
  q.updateUser.run({ id: u.id, name: d.name, username: d.username, active: d.active });
  if (d.password) q.setPassword.run(hashPassword(d.password), u.id);
  else if (!d.active && u.active) q.bumpSession.run(u.id); // desativar derruba a sessão
  res.redirect('/admin/users?m=user-saved');
});
adminRouter.post('/admin/users/:id/delete', requireMaster, (req, res) => {
  const u = q.userById.get(req.params.id);
  if (u) q.removeUser.run(u.id); // pastas ficam sem dono (visíveis só ao master)
  res.redirect('/admin/users?m=user-deleted');
});

// ---- minha conta -----------------------------------------------------------
adminRouter.get('/admin/account', (req, res) => {
  res.send(renderAccount({ ...msgs(req), nav: nav(req, 'account') }));
});
adminRouter.post('/admin/account', (req, res) => {
  if (req.user.isMaster) return res.redirect('/admin/account');
  const row = q.userById.get(req.user.id);
  const current = String(req.body?.current || ''), next = String(req.body?.password || ''), confirm = String(req.body?.confirm || '');
  let error = '';
  if (!login(row.username, current)) error = 'A senha atual não confere.';
  else if (next.length < 8) error = 'A nova senha precisa ter pelo menos 8 caracteres.';
  else if (next !== confirm) error = 'A confirmação não é igual à nova senha.';
  if (error) return res.status(400).send(renderAccount({ error, nav: nav(req, 'account') }));
  q.setPassword.run(hashPassword(next), row.id);
  createSession(res, req, q.userById.get(row.id)); // mantém este navegador logado
  res.redirect('/admin/account?m=password');
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
/** Filtro de pasta/evento já limitado ao usuário. */
function scope(req) {
  const folders = foldersFor(req.user);
  let folder = String(req.query.folder || '');
  if (folder === 'none' ? !req.user.isMaster : folder && !folders.some(f => f.id === Number(folder))) folder = '';
  const inFolder = eventsFor(req.user, q.menuEvents.all(), folder);
  const eventId = inFolder.some(e => e.id === Number(req.query.event)) ? Number(req.query.event) : null;
  const ids = eventId ? [eventId] : (req.user.isMaster && !folder ? null : inFolder.map(e => e.id));
  return { folders, folder, events: inFolder, eventId, ids };
}
adminRouter.get('/admin/dashboard', (req, res) => {
  const s = scope(req);
  const data = dashboardData(s.ids, tzOffsetMinutes(config.defaultTz));
  const byDay = Object.fromEntries(data.daily.map(r => [r.d, r.n]));
  const days = last30Days(config.defaultTz).map(d => ({ ...d, n: byDay[d.iso] || 0 }));
  res.send(renderDashboard({ data, ...s, days, nav: nav(req, 'dashboard') }));
});
adminRouter.get('/admin/events/:id/leads', (req, res) => res.redirect(`/admin/dashboard?event=${Number(req.params.id) || ''}`));
adminRouter.get('/admin/leads.csv', (req, res) => {
  const s = scope(req);
  const rows = leadsForExport(s.ids, tzOffsetMinutes(config.defaultTz));
  const cell = v => `"${String(v ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
  const csv = ['email,nome,evento,calendario,dispositivo,data,fonte,utm_source,utm_medium,utm_campaign,utm_content,utm_term,referrer']
    .concat(rows.map(r => [r.email, r.name, r.event_title, r.calendar, r.platform, r.created_local, r.source, r.utm_source, r.utm_medium, r.utm_campaign, r.utm_content, r.utm_term, r.referrer].map(cell).join(',')))
    .join('\r\n');
  const ev = s.eventId ? q.byId.get(s.eventId) : null;
  const fo = !ev && s.folder && s.folder !== 'none' ? q.folderById.get(s.folder) : null;
  const name = ev ? ev.slug : fo ? `pasta-${slugify(fo.name) || fo.id}` : 'todos';
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="leads-${name}.csv"` });
  res.send('﻿' + csv);
});

// ---- configurações gerais (só master) -------------------------------------
function readFields(body) {
  const f = {};
  for (const k of Object.keys(DEFAULT_FIELDS)) f[k] = body?.[`fields_${k}`] === 'on';
  return normalizeFields(f);
}
adminRouter.get('/admin/settings', requireMaster, (req, res) => {
  const test = req.query.t;
  const flash = test === 'ok' ? `Teste enviado: o destino respondeu ${digits(req.query.s)}.` : msgs(req).flash;
  const error = test === 'fail' ? `O teste falhou: ${req.query.s === '0' ? 'sem resposta do destino' : `o destino respondeu ${digits(req.query.s)}`}.` : msgs(req).error;
  res.send(renderSettings({ defaults: getDefaults(), webhook: getWebhookSettings(), usingDefaults: q.countDefaultMode.get().n, flash, error, nav: nav(req, 'settings') }));
});
adminRouter.post('/admin/settings', requireMaster, async (req, res) => {
  const url = String(req.body?.webhook_url || '').trim().slice(0, 500);
  if (url && !isUrl(url)) return res.redirect('/admin/settings?e=wh-bad');
  saveDefaults({ template: req.body?.template, fields: readFields(req.body) });
  saveWebhookSettings({ url, secret: String(req.body?.webhook_secret || '').slice(0, 200) });
  if (req.body?.after === 'test') {
    if (!url) return res.redirect('/admin/settings?m=settings');
    const r = await sendTest(url, sampleEvent());
    return res.redirect(`/admin/settings?t=${r.ok ? 'ok' : 'fail'}&s=${r.status}`);
  }
  res.redirect('/admin?m=settings');
});

// ---- prévia de template ----------------------------------------------------
adminRouter.get('/admin/templates/:id/preview', (req, res) => {
  if (!TEMPLATES[req.params.id]) return res.status(404).send('Template não encontrado');
  const row = req.query.event ? q.byId.get(req.query.event) : null;
  const base = row && canAccessEvent(req.user, row) ? hydrate(row) : null;
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
function formView(req, extra) {
  return { baseUrl: config.baseUrl, defaultTz: config.defaultTz, defaults: getDefaults(), folders: foldersFor(req.user), isMaster: req.user.isMaster, nav: nav(req, extra.active), ...extra };
}
adminRouter.get('/admin/events/new', (req, res) => {
  const folders = foldersFor(req.user);
  if (!req.user.isMaster && !folders.length) return res.redirect('/admin?e=no-folder');
  const pre = folders.some(f => f.id === Number(req.query.folder)) ? Number(req.query.folder) : (req.user.isMaster ? null : folders[0].id);
  res.send(renderForm(formView(req, { ev: { folder_id: pre }, isNew: true, active: 'new' })));
});
function loadEvent(req, res) {
  const row = q.byId.get(req.params.id);
  if (!canAccessEvent(req.user, row)) { res.redirect('/admin'); return null; }
  return row;
}
adminRouter.get('/admin/events/:id', (req, res) => {
  const row = loadEvent(req, res); if (!row) return;
  const ev = hydrate(row);
  res.send(renderForm(formView(req, { ev, isNew: false, flash: FLASH[req.query.m] || '', active: `event-${ev.id}` })));
});

function readForm(req, existing) {
  const b = req.body || {};
  const sd = String(b.start_date || ''), st = String(b.start_time || '');
  const ed = String(b.end_date || ''), et = String(b.end_time || '');
  const start_local = sd && st ? `${sd}T${st}` : '';
  const end_local = ed && et ? `${ed}T${et}` : (ed && !et ? `${ed}T${st}` : (et && !ed && sd ? `${sd}T${et}` : null));
  const custom = b.settings_mode === 'custom';
  const folderId = Number(b.folder_id) || null;
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
    folder_id: folderId,
  };
}
function safeJson(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }

function validate(d, user) {
  if (!d.title) return 'Informe o nome do evento.';
  if (!d.slug) return 'Informe a URL do evento.';
  if (!d.start_local) return 'Informe data e horário de início.';
  if (d.url && !isUrl(d.url)) return 'O link do evento precisa começar com http:// ou https://';
  if (d.webhook_url && !isUrl(d.webhook_url)) return 'O webhook precisa começar com http:// ou https://';
  if (d.folder_id ? !canAccessFolder(user, q.folderById.get(d.folder_id)) : !user.isMaster) return 'Escolha uma das suas pastas.';
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
function formAgain(req, res, { data, existing, isNew, error }) {
  const ev = hydrate({ ...(existing || {}), ...data, id: existing?.id ?? null, views: existing?.views ?? 0, created_at: existing?.created_at || '' });
  res.status(400).send(renderForm(formView(req, { ev, isNew, error, active: isNew ? 'new' : `event-${existing.id}` })));
}

adminRouter.post('/admin/events/new', handleUpload, (req, res) => {
  const data = readForm(req, null);
  const error = req.uploadError || validate(data, req.user) || (q.bySlug.get(data.slug) ? 'Já existe um evento com essa URL.' : '');
  if (error) { removeFile(req.file?.filename); return formAgain(req, res, { data, isNew: true, error }); }
  if (req.file) data.hero_image = req.file.filename;
  data.uid = `${crypto.randomUUID()}@vertuz-agenda`;
  q.insert.run(data);
  if (req.body.after === 'view') return res.redirect(`/e/${data.slug}?preview=1`);
  res.redirect(`/admin?m=created${data.folder_id ? `&folder=${data.folder_id}` : ''}`);
});

adminRouter.post('/admin/events/:id', handleUpload, (req, res) => {
  const existing = loadEvent(req, res); if (!existing) { removeFile(req.file?.filename); return; }
  const data = readForm(req, existing);
  const clash = q.bySlug.get(data.slug);
  const error = req.uploadError || validate(data, req.user) || (clash && clash.id !== existing.id ? 'Já existe um evento com essa URL.' : '');
  if (error) { removeFile(req.file?.filename); return formAgain(req, res, { data, existing, isNew: false, error }); }
  if (req.body.remove_hero === 'on') { removeFile(existing.hero_image); data.hero_image = ''; }
  if (req.file) { removeFile(existing.hero_image); data.hero_image = req.file.filename; }
  q.update.run({ ...data, id: existing.id });
  if (req.body.after === 'view') return res.redirect(`/e/${data.slug}?preview=1`);
  res.redirect(`/admin?m=saved${data.folder_id ? `&folder=${data.folder_id}` : ''}`);
});

adminRouter.post('/admin/events/:id/delete', (req, res) => {
  const ev = loadEvent(req, res); if (!ev) return;
  removeFile(ev.hero_image); q.remove.run(ev.id);
  res.redirect(`/admin?m=deleted${ev.folder_id ? `&folder=${ev.folder_id}` : ''}`);
});

adminRouter.post('/admin/events/:id/duplicate', (req, res) => {
  const ev = loadEvent(req, res); if (!ev) return;
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
    webhook_url: ev.webhook_url || '', folder_id: ev.folder_id ?? null,
  });
  res.redirect(`/admin?m=dup${ev.folder_id ? `&folder=${ev.folder_id}` : ''}`);
});
