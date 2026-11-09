// Disparo de webhooks (lead.created, calendar.clicked, webhook.test).
// A URL do evento substitui a URL geral; sem nenhuma das duas, nada é enviado.
import crypto from 'node:crypto';
import { config } from './config.js';
import { getWebhookSettings } from './db.js';
import { zonedToUtc, addMinutes, toZonedIso } from './time.js';

const TIMEOUT_MS = 8000;
const RETRY_DELAYS_MS = [0, 5000, 30000]; // 3 tentativas

/** Decide qual URL usar para o evento. */
export function resolveWebhook(ev) {
  const own = String(ev?.webhook_url || '').trim();
  if (own) return { url: own, scope: 'event' };
  const g = getWebhookSettings();
  if (g.url) return { url: g.url, scope: 'global' };
  return null;
}

function eventBlock(ev) {
  const start = zonedToUtc(ev.start_local, ev.timezone);
  const end = ev.end_local ? zonedToUtc(ev.end_local, ev.timezone) : addMinutes(start, 60);
  return {
    id: ev.id,
    uid: ev.uid,
    slug: ev.slug,
    title: ev.title,
    subtitle: ev.subtitle || '',
    status: ev.status,
    template: ev.template,
    timezone: ev.timezone,
    start: toZonedIso(start, ev.timezone),
    end: toZonedIso(end, ev.timezone),
    location: ev.location || '',
    online_url: ev.url || '',
    organizer_name: ev.organizer_name || '',
    page_url: `${config.baseUrl}/e/${ev.slug}`,
    require_email: !!ev.fields?.requireEmail,
  };
}

/** Monta o JSON do webhook. `data` é { lead } ou { click }. */
export function buildPayload(type, ev, data, scope) {
  return {
    id: `whk_${crypto.randomUUID()}`,
    type,
    version: 1,
    occurred_at: toZonedIso(new Date(), ev.timezone || config.defaultTz),
    source: config.baseUrl,
    webhook_scope: scope,
    event: eventBlock(ev),
    ...data,
  };
}

function sign(body, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/** Envia uma vez. Retorna { ok, status, error }. */
async function postOnce(url, body, payload) {
  const { secret } = getWebhookSettings();
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Vertuz-Agenda-Webhook/1',
    'X-Vertuz-Event': payload.type,
    'X-Vertuz-Delivery': payload.id,
  };
  if (secret) headers['X-Vertuz-Signature'] = sign(body, secret);
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err.name === 'TimeoutError' ? 'timeout' : err.message };
  }
}

/** Envia com novas tentativas, sem bloquear a resposta ao visitante. */
export function sendWebhook(url, payload) {
  const body = JSON.stringify(payload);
  (async () => {
    for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
      if (RETRY_DELAYS_MS[i]) await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[i]));
      const r = await postOnce(url, body, payload);
      if (r.ok) return;
      // 4xx (exceto 408/429) não melhora tentando de novo.
      const final = r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429;
      console.warn(`Webhook ${payload.type} ${payload.id} → ${url} falhou (tentativa ${i + 1}): ${r.status || r.error}`);
      if (final) return;
    }
  })().catch(err => console.error('Webhook erro inesperado:', err));
}

/** Atalho: resolve a URL do evento e dispara, se houver. */
export function dispatch(type, ev, data) {
  const target = resolveWebhook(ev);
  if (!target) return;
  sendWebhook(target.url, buildPayload(type, ev, data, target.scope));
}

/** Envio de teste a partir do admin; aguarda o resultado. */
export async function sendTest(url, ev) {
  const payload = buildPayload('webhook.test', ev, {
    lead: { id: 0, email: 'teste@exemplo.com', name: 'Teste Vértuz', calendar: 'google', platform: 'other', created_at: toZonedIso(new Date(), ev.timezone) },
  }, 'global');
  return postOnce(url, JSON.stringify(payload), payload);
}
