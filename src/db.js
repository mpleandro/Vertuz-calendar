import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { TEMPLATES, DEFAULT_TEMPLATE } from './templates.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });

export const db = new Database(path.join(config.dataDir, 'vertuz-agenda.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  uid TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  description TEXT DEFAULT '',
  details TEXT DEFAULT '',
  start_local TEXT NOT NULL,
  end_local TEXT,
  timezone TEXT NOT NULL,
  location TEXT DEFAULT '',
  url TEXT DEFAULT '',
  organizer_name TEXT DEFAULT '',
  reminder_minutes INTEGER DEFAULT 60,
  status TEXT DEFAULT 'draft',
  hero_image TEXT DEFAULT '',
  theme TEXT DEFAULT '{}',
  fields TEXT DEFAULT '{}',
  cta_label TEXT DEFAULT 'Salvar na minha agenda',
  views INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT DEFAULT '',
  calendar TEXT DEFAULT '',
  platform TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  calendar TEXT NOT NULL,
  platform TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  session_ver INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  webhook_url TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_folders_owner ON folders(owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_event ON leads(event_id);
CREATE INDEX IF NOT EXISTS idx_clicks_event ON clicks(event_id);
`);

// ---- migrações -------------------------------------------------------------
const cols = db.prepare('PRAGMA table_info(events)').all().map(c => c.name);
if (!cols.includes('settings_mode')) db.exec(`ALTER TABLE events ADD COLUMN settings_mode TEXT DEFAULT 'default'`);
if (!cols.includes('template')) db.exec(`ALTER TABLE events ADD COLUMN template TEXT DEFAULT '${DEFAULT_TEMPLATE}'`);
if (!cols.includes('webhook_url')) db.exec(`ALTER TABLE events ADD COLUMN webhook_url TEXT DEFAULT ''`);
if (!cols.includes('folder_id')) db.exec(`ALTER TABLE events ADD COLUMN folder_id INTEGER`);
db.exec('CREATE INDEX IF NOT EXISTS idx_events_folder ON events(folder_id)');
// Origem do visitante (UTM + referrer) em leads e cliques
export const UTM_COLS = ['source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer'];
for (const table of ['leads', 'clicks']) {
  const have = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  for (const c of UTM_COLS) if (!have.includes(c)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${c} TEXT DEFAULT ''`);
}

// ---- campos visíveis -------------------------------------------------------
export const FIELD_DEFS = [
  ['showHero', 'Imagem de destaque'],
  ['showSubtitle', 'Subtítulo'],
  ['showCountdown', 'Contagem regressiva'],
  ['showDescription', 'Descrição'],
  ['showDetails', 'Detalhes'],
  ['showLocation', 'Local'],
  ['showUrl', 'Link do evento'],
  ['askEmail', 'Pedir e-mail'],
  ['requireEmail', 'E-mail obrigatório', 'local, link e .ics só após o e-mail'],
  ['askName', 'Pedir nome'],
  ['showMascot', 'Marca no rodapé'],
  ['showPoweredBy', 'Assinatura no rodapé'],
];

export const DEFAULT_FIELDS = {
  showHero: true, showSubtitle: true, showCountdown: true, showDescription: true, showDetails: true,
  showLocation: true, showUrl: true, askEmail: true, requireEmail: false, askName: false,
  showMascot: true, showPoweredBy: true,
};

export function normalizeFields(f) {
  const out = { ...DEFAULT_FIELDS, ...(f || {}) };
  if (out.requireEmail) out.askEmail = true; // e-mail obrigatório implica pedir e-mail
  return out;
}

function parseJson(s, fallback) {
  try { return JSON.parse(s || 'null') ?? fallback; } catch { return fallback; }
}

// ---- configurações gerais --------------------------------------------------
const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const putSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

export function getDefaults() {
  const raw = parseJson(getSetting.get('defaults')?.value, {});
  const template = TEMPLATES[raw.template] ? raw.template : DEFAULT_TEMPLATE;
  return { template, fields: normalizeFields(raw.fields) };
}
export function saveDefaults({ template, fields }) {
  putSetting.run('defaults', JSON.stringify({ template: TEMPLATES[template] ? template : DEFAULT_TEMPLATE, fields: normalizeFields(fields) }));
}

// ---- webhook geral ---------------------------------------------------------
export function getWebhookSettings() {
  const raw = parseJson(getSetting.get('webhook')?.value, {});
  return { url: String(raw.url || ''), secret: String(raw.secret || '') };
}
export function saveWebhookSettings({ url, secret }) {
  putSetting.run('webhook', JSON.stringify({ url: String(url || '').trim(), secret: String(secret || '').trim() }));
}

/** Evento com template/campos efetivos (padrão global ou personalizados). */
export function hydrate(row) {
  if (!row) return null;
  const custom = row.settings_mode === 'custom';
  const ownFields = normalizeFields(parseJson(row.fields, {}));
  const ownTemplate = TEMPLATES[row.template] ? row.template : DEFAULT_TEMPLATE;
  const defs = getDefaults();
  return {
    ...row,
    settings_mode: custom ? 'custom' : 'default',
    own: { template: ownTemplate, fields: ownFields },
    template: custom ? ownTemplate : defs.template,
    fields: custom ? ownFields : defs.fields,
  };
}

// ---- queries ---------------------------------------------------------------
export const q = {
  allEvents: db.prepare(`SELECT e.*, (SELECT COUNT(*) FROM leads l WHERE l.event_id=e.id) AS leads_count,
                         (SELECT COUNT(*) FROM clicks c WHERE c.event_id=e.id) AS clicks_count
                         FROM events e ORDER BY start_local DESC`),
  menuEvents: db.prepare('SELECT id, title, status, start_local, folder_id FROM events ORDER BY start_local DESC'),
  bySlug: db.prepare('SELECT * FROM events WHERE slug = ?'),
  byId: db.prepare('SELECT * FROM events WHERE id = ?'),
  countDefaultMode: db.prepare(`SELECT COUNT(*) AS n FROM events WHERE COALESCE(settings_mode,'default') <> 'custom'`),
  insert: db.prepare(`INSERT INTO events (slug, uid, title, subtitle, description, details, start_local, end_local, timezone,
    location, url, organizer_name, reminder_minutes, status, hero_image, fields, cta_label, settings_mode, template, webhook_url, folder_id)
    VALUES (@slug, @uid, @title, @subtitle, @description, @details, @start_local, @end_local, @timezone,
    @location, @url, @organizer_name, @reminder_minutes, @status, @hero_image, @fields, @cta_label, @settings_mode, @template, @webhook_url, @folder_id)`),
  update: db.prepare(`UPDATE events SET slug=@slug, title=@title, subtitle=@subtitle, description=@description, details=@details,
    start_local=@start_local, end_local=@end_local, timezone=@timezone, location=@location, url=@url,
    organizer_name=@organizer_name, reminder_minutes=@reminder_minutes, status=@status, hero_image=@hero_image,
    fields=@fields, cta_label=@cta_label, settings_mode=@settings_mode, template=@template, webhook_url=@webhook_url, folder_id=@folder_id, updated_at=datetime('now') WHERE id=@id`),
  remove: db.prepare('DELETE FROM events WHERE id = ?'),
  // usuários
  users: db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM folders f WHERE f.owner_id=u.id) folders_count,
    (SELECT COUNT(*) FROM events e JOIN folders f ON f.id=e.folder_id WHERE f.owner_id=u.id) events_count FROM users u ORDER BY u.name COLLATE NOCASE`),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  userByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  insertUser: db.prepare('INSERT INTO users (name, username, password_hash) VALUES (@name, @username, @password_hash)'),
  updateUser: db.prepare('UPDATE users SET name=@name, username=@username, active=@active WHERE id=@id'),
  setPassword: db.prepare('UPDATE users SET password_hash=?, session_ver=session_ver+1 WHERE id=?'),
  bumpSession: db.prepare('UPDATE users SET session_ver=session_ver+1 WHERE id=?'),
  removeUser: db.prepare('DELETE FROM users WHERE id = ?'),
  // pastas
  folders: db.prepare(`SELECT f.*, u.name owner_name, (SELECT COUNT(*) FROM events e WHERE e.folder_id=f.id) events_count
    FROM folders f LEFT JOIN users u ON u.id=f.owner_id ORDER BY COALESCE(u.name,'') COLLATE NOCASE, f.name COLLATE NOCASE`),
  foldersOf: db.prepare(`SELECT f.*, (SELECT COUNT(*) FROM events e WHERE e.folder_id=f.id) events_count
    FROM folders f WHERE f.owner_id = ? ORDER BY f.name COLLATE NOCASE`),
  folderById: db.prepare('SELECT * FROM folders WHERE id = ?'),
  insertFolder: db.prepare('INSERT INTO folders (name, owner_id, webhook_url) VALUES (@name, @owner_id, @webhook_url)'),
  updateFolder: db.prepare('UPDATE folders SET name=@name, owner_id=@owner_id, webhook_url=@webhook_url WHERE id=@id'),
  removeFolder: db.prepare('DELETE FROM folders WHERE id = ?'),
  countInFolder: db.prepare('SELECT COUNT(*) n FROM events WHERE folder_id = ?'),
  countNoFolder: db.prepare('SELECT COUNT(*) n FROM events WHERE folder_id IS NULL'),
  bumpViews: db.prepare('UPDATE events SET views = views + 1 WHERE id = ?'),
  addClick: db.prepare(`INSERT INTO clicks (event_id, calendar, platform, source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer)
    VALUES (@event_id, @calendar, @platform, @source, @utm_source, @utm_medium, @utm_campaign, @utm_content, @utm_term, @referrer)`),
  addLead: db.prepare(`INSERT INTO leads (event_id, email, name, calendar, platform, source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer)
    VALUES (@event_id, @email, @name, @calendar, @platform, @source, @utm_source, @utm_medium, @utm_campaign, @utm_content, @utm_term, @referrer)`),
};

// ---- dashboard -------------------------------------------------------------
/** Agregados para o dashboard. eventId = null soma todos os eventos. */
/** Agregados para o dashboard. eventIds = null soma todos os eventos; array limita a esses ids. */
export function dashboardData(eventIds, tzOffsetMin) {
  const ids = eventIds === null ? null : (eventIds.length ? eventIds.map(Number).filter(Number.isInteger).join(',') : '-1');
  const where = ids ? `WHERE event_id IN (${ids})` : '';
  const whereE = ids ? `WHERE id IN (${ids})` : '';
  const and = w => w ? w + ' AND' : 'WHERE';
  const mod = `${tzOffsetMin >= 0 ? '+' : '-'}${Math.abs(tzOffsetMin)} minutes`;
  const totals = {
    events: db.prepare(`SELECT COUNT(*) n FROM events ${whereE}`).get().n,
    published: db.prepare(`SELECT COUNT(*) n FROM events ${and(whereE)} status = 'published'`).get().n,
    views: db.prepare(`SELECT COALESCE(SUM(views),0) n FROM events ${whereE}`).get().n,
    saves: db.prepare(`SELECT COUNT(*) n FROM clicks ${where}`).get().n,
    leads: db.prepare(`SELECT COUNT(*) n FROM leads ${where}`).get().n,
  };
  const daily = db.prepare(`SELECT date(created_at, '${mod}') d, COUNT(*) n FROM clicks
    ${and(where)} created_at >= datetime('now', '-30 days') GROUP BY d ORDER BY d`).all();
  const byCalendar = db.prepare(`SELECT calendar k, COUNT(*) n FROM clicks ${where} GROUP BY calendar ORDER BY n DESC`).all();
  const byPlatform = db.prepare(`SELECT platform k, COUNT(*) n FROM clicks ${where} GROUP BY platform ORDER BY n DESC`).all();
  const bySource = db.prepare(`SELECT COALESCE(source,'') k, COUNT(*) n FROM clicks ${where} GROUP BY k ORDER BY n DESC LIMIT 12`).all();
  const byCampaign = db.prepare(`SELECT COALESCE(utm_campaign,'') k, COUNT(*) n FROM clicks ${where} GROUP BY k ORDER BY n DESC LIMIT 12`).all();
  const leadsBySource = db.prepare(`SELECT COALESCE(source,'') k, COUNT(*) n FROM leads ${where} GROUP BY k`).all();
  const perEvent = db.prepare(`SELECT e.id, e.title, e.slug, e.status, e.start_local, e.views,
      (SELECT COUNT(*) FROM clicks c WHERE c.event_id=e.id) saves,
      (SELECT COUNT(*) FROM leads l WHERE l.event_id=e.id) leads
      FROM events e ${whereE} ORDER BY saves DESC, e.start_local DESC`).all();
  const recentLeads = db.prepare(`SELECT l.*, datetime(l.created_at, '${mod}') created_local, e.title event_title FROM leads l JOIN events e ON e.id = l.event_id
      ${ids ? `WHERE l.event_id IN (${ids})` : ''} ORDER BY l.created_at DESC LIMIT 25`).all();
  return { totals, daily, byCalendar, byPlatform, bySource, byCampaign, leadsBySource, perEvent, recentLeads };
}

export function leadsForExport(eventIds, tzOffsetMin = 0) {
  const ids = eventIds === null ? null : (eventIds.length ? eventIds.map(Number).filter(Number.isInteger).join(',') : '-1');
  const mod = `${tzOffsetMin >= 0 ? '+' : '-'}${Math.abs(tzOffsetMin)} minutes`;
  return db.prepare(`SELECT l.*, datetime(l.created_at, '${mod}') created_local, e.title event_title, e.slug event_slug FROM leads l JOIN events e ON e.id = l.event_id
    ${ids ? `WHERE l.event_id IN (${ids})` : ''} ORDER BY l.created_at DESC`).all();
}
