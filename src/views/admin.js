import { esc, ICONS } from './helpers.js';
import { formatLocal } from '../time.js';
import { FIELD_DEFS, DEFAULT_FIELDS } from '../db.js';
import { TEMPLATE_LIST, getTemplate } from '../templates.js';

const TIMEZONES = [
  'America/Sao_Paulo', 'America/Manaus', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Bahia',
  'America/Cuiaba', 'America/Rio_Branco', 'America/Noronha', 'America/Argentina/Buenos_Aires', 'America/Santiago',
  'America/Bogota', 'America/Lima', 'America/Mexico_City', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'Europe/Lisbon', 'Europe/London', 'Europe/Madrid', 'Europe/Paris', 'Europe/Berlin', 'UTC',
];
const REMINDERS = [[0, 'Sem lembrete'], [10, '10 minutos antes'], [30, '30 minutos antes'], [60, '1 hora antes'], [120, '2 horas antes'], [1440, '1 dia antes'], [2880, '2 dias antes'], [10080, '1 semana antes']];
const STATUS_LABEL = { draft: 'Rascunho', published: 'Publicado', closed: 'Encerrado' };
const CAL_NAMES = { google: 'Google Agenda', apple: 'Apple Calendar', outlook: 'Outlook.com', office365: 'Office 365', yahoo: 'Yahoo', ics: 'Arquivo .ics', other: 'Outro' };
const PLAT_NAMES = { ios: 'iPhone / iPad', android: 'Android', mac: 'Mac', windows: 'Windows', other: 'Outro' };
const nf = n => Number(n || 0).toLocaleString('pt-BR');
const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : '—';

// ---------------------------------------------------------------------------
// Layout com menu
// ---------------------------------------------------------------------------
function layout({ title, active, body, flash, error, menuEvents = [] }) {
  const item = (key, href, icon, label) => `<a class="nav__item${active === key ? ' is-active' : ''}" href="${href}">${icon}<span>${label}</span></a>`;
  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} · Vértuz Agenda</title>
<link rel="icon" href="/brand/mascot.png" type="image/png">
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap">
<link rel="stylesheet" href="/css/admin.css">
</head><body>
<header class="mobilebar">
  <a class="brand" href="/admin"><span class="brand__dot"></span>Vértuz <small>Agenda</small></a>
  <button class="iconbtn" type="button" id="navOpen" aria-label="Abrir menu" aria-controls="sidebar" aria-expanded="false">${ICONS.menu}</button>
</header>
<div class="scrim" id="scrim" hidden></div>
<aside class="sidebar" id="sidebar">
  <div class="sidebar__head">
    <a class="brand" href="/admin"><span class="brand__dot"></span>Vértuz <small>Agenda</small></a>
    <button class="iconbtn iconbtn--close" type="button" id="navClose" aria-label="Fechar menu">${ICONS.close}</button>
  </div>
  <nav class="nav">
    ${item('home', '/admin', ICONS.home, 'Início')}
    ${item('dashboard', '/admin/dashboard', ICONS.chart, 'Dashboard')}
    ${item('settings', '/admin/settings', ICONS.gear, 'Configurações gerais')}
  </nav>
  <div class="nav__section">
    <div class="nav__title"><span>Eventos</span><a href="/admin/events/new" aria-label="Novo evento" title="Novo evento">${ICONS.plus}</a></div>
    <div class="nav__events">
      ${menuEvents.length ? menuEvents.map(e => `<a class="nav__event${active === `event-${e.id}` ? ' is-active' : ''}" href="/admin/events/${e.id}"><i class="dot dot--${esc(e.status)}"></i><span>${esc(e.title)}</span><small>${esc(formatLocal(e.start_local).day)}/${esc(e.start_local.slice(5, 7))}</small></a>`).join('') : '<div class="nav__empty">Nenhum evento ainda</div>'}
    </div>
  </div>
  <form method="post" action="/admin/logout" class="sidebar__foot"><button class="nav__item nav__item--ghost" type="submit">Sair</button></form>
</aside>
<main class="main">
  ${flash ? `<div class="flash">${ICONS.check}<span>${esc(flash)}</span></div>` : ''}
  ${error ? `<div class="flash flash--error">${esc(error)}</div>` : ''}
  ${body}
</main>
<div class="tooltip" id="tooltip" hidden></div>
<script src="/js/admin.js" defer></script>
</body></html>`;
}

export function renderLogin({ error }) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Entrar · Vértuz Agenda</title><link rel="icon" href="/brand/mascot.png" type="image/png">
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap"><link rel="stylesheet" href="/css/admin.css"></head>
<body><div class="login"><form class="card" method="post" action="/admin/login">
<img src="/brand/mascot.png" alt=""><h1>Vértuz Agenda</h1><p>Painel do administrador</p>
${error ? `<div class="flash flash--error">${esc(error)}</div>` : ''}
<label class="f"><span>Senha</span><input type="password" name="password" autofocus autocomplete="current-password" required></label>
<button class="btn btn--primary" type="submit">Entrar</button>
</form></div></body></html>`;
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------
export function renderHome({ events, baseUrl, flash, menuEvents }) {
  const body = `
<div class="page-head"><div><h1>Início</h1><p>Crie um evento e compartilhe o link. A URL base é <code>${esc(baseUrl)}/e/</code></p></div></div>

<a class="create" href="/admin/events/new">
  <span class="create__plus">${ICONS.plus}</span>
  <span class="create__label">Criar novo evento</span>
  <span class="create__hint">Nome, data, conteúdo e link próprio em poucos passos</span>
</a>

<div class="section-head">
  <h2>Seus eventos <span class="count">${events.length}</span></h2>
  <a class="btn btn--soft" href="/admin/dashboard">${ICONS.chart} Abrir dashboard</a>
</div>

${events.length === 0 ? `<div class="card empty"><img src="/brand/mascot.png" alt=""><b>Nenhum evento ainda</b>Use o botão acima para criar o primeiro.</div>` : `
<div class="events">
${events.map(ev => {
    const d = formatLocal(ev.start_local);
    const tpl = getTemplate(ev.template);
    const thumb = ev.hero_image ? `/uploads/${esc(ev.hero_image)}` : (tpl.heroDefault || `/templates/${tpl.id}/thumb.jpg`);
    return `<article class="event">
  <a class="event__thumb" href="/admin/events/${ev.id}" style="background-image:url('${thumb}')"><span class="dc"><b>${esc(d.day)}</b>${esc(d.monthShort)}</span></a>
  <div class="event__main">
    <a class="event__title" href="/admin/events/${ev.id}">${esc(ev.title)}</a>
    <div class="event__meta"><span class="status status--${esc(ev.status)}">${STATUS_LABEL[ev.status] || esc(ev.status)}</span><code>/e/${esc(ev.slug)}</code><span>${esc(d.time)}</span><span class="tplname">${esc(tpl.name)}${ev.settings_mode === 'custom' ? ' · personalizado' : ''}</span></div>
    <div class="event__stats"><span>${ICONS.eye} ${nf(ev.views)} visitas</span><span>${ICONS.calendar} ${nf(ev.clicks_count)} agendamentos</span><span>${ICONS.users} ${nf(ev.leads_count)} e-mails</span></div>
  </div>
  <div class="event__actions">
    <a class="btn btn--sm" href="/e/${esc(ev.slug)}?preview=1" target="_blank">${ICONS.external} Ver</a>
    <a class="btn btn--sm" href="/admin/events/${ev.id}">Editar</a>
    <a class="btn btn--sm" href="/admin/dashboard?event=${ev.id}">${ICONS.chart} Métricas</a>
    <form method="post" action="/admin/events/${ev.id}/duplicate"><button class="btn btn--sm" type="submit" aria-label="Duplicar" title="Duplicar">${ICONS.copy}<span class="lbl">Duplicar</span></button></form>
    <form method="post" action="/admin/events/${ev.id}/delete" data-confirm="Excluir o evento “${esc(ev.title)}” e todos os leads? Isso não pode ser desfeito."><button class="btn btn--sm btn--danger" type="submit" aria-label="Excluir">${ICONS.trash}</button></form>
  </div>
</article>`;
  }).join('')}
</div>`}`;
  return layout({ title: 'Início', active: 'home', body, flash, menuEvents });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export function renderDashboard({ data, events, eventId, days, menuEvents }) {
  const t = data.totals;
  const sel = events.find(e => e.id === eventId);
  const max = Math.max(1, ...days.map(d => d.n));
  const W = 720, H = 210, PL = 30, PB = 24, PT = 12, PR = 4;
  const slot = (W - PL - PR) / days.length, bw = Math.max(4, slot - 3);
  const y = v => PT + (H - PT - PB) * (1 - v / max);
  const ticks = [0, Math.ceil(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const bar = (d, i) => {
    const x = PL + i * slot + (slot - bw) / 2, top = y(d.n), base = H - PB, h = base - top, r = Math.min(4, h, bw / 2);
    const path = d.n ? `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z` : '';
    return `<g class="bar" data-tip="<b>${d.n}</b> agendamento${d.n === 1 ? '' : 's'}<br>${d.label}">${path ? `<path d="${path}"/>` : ''}<rect class="hit" x="${PL + i * slot}" y="${PT}" width="${slot}" height="${H - PT - PB}"/></g>`;
  };
  const xLabels = [0, Math.floor(days.length / 2), days.length - 1].map(i => `<text x="${PL + i * slot + slot / 2}" y="${H - 6}" text-anchor="middle">${days[i].short}</text>`).join('');
  const hbars = (rows, names, total) => rows.length ? `<div class="hbars">${rows.map(r => `<div class="hbar" data-tip="<b>${r.n}</b> · ${pct(r.n, total)}"><span class="hbar__k">${esc(names[r.k] || r.k || 'Outro')}</span><span class="hbar__track"><i style="width:${Math.max(2, Math.round(r.n / Math.max(...rows.map(x => x.n)) * 100))}%"></i></span><span class="hbar__v">${nf(r.n)}</span></div>`).join('')}</div>` : '<p class="hint">Ainda sem agendamentos.</p>';

  const body = `
<div class="page-head">
  <div><h1>Dashboard</h1><p>${sel ? `Métricas de <b>${esc(sel.title)}</b>` : 'Soma de todos os eventos'}</p></div>
  <form class="filters" method="get" action="/admin/dashboard">
    <label class="f f--inline"><span class="sr">Evento</span><select name="event" data-autosubmit>
      <option value="">Todos os eventos</option>
      ${events.map(e => `<option value="${e.id}" ${e.id === eventId ? 'selected' : ''}>${esc(e.title)}</option>`).join('')}
    </select></label>
    <a class="btn btn--soft" href="/admin/leads.csv${eventId ? `?event=${eventId}` : ''}">${ICONS.download} Exportar e-mails</a>
  </form>
</div>

<div class="kpis">
  <div class="kpi kpi--hero"><small>Agendamentos</small><b>${nf(t.saves)}</b><span>cliques em salvar na agenda</span></div>
  <div class="kpi"><small>Visitas</small><b>${nf(t.views)}</b></div>
  <div class="kpi"><small>E-mails</small><b>${nf(t.leads)}</b></div>
  <div class="kpi"><small>Conversão</small><b>${pct(t.saves, t.views)}</b><span>agendamentos ÷ visitas</span></div>
  ${sel ? '' : `<div class="kpi"><small>Eventos publicados</small><b>${nf(t.published)}<em> / ${nf(t.events)}</em></b></div>`}
</div>

<section class="card">
  <div class="card__title">Agendamentos por dia · últimos 30 dias</div>
  <div class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Agendamentos por dia nos últimos 30 dias" preserveAspectRatio="none">
      ${ticks.map(v => `<line class="grid" x1="${PL}" x2="${W - PR}" y1="${y(v)}" y2="${y(v)}"/><text class="ylab" x="${PL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
      ${days.map(bar).join('')}
      <g class="xlab">${xLabels}</g>
    </svg>
  </div>
  <details class="tableview"><summary>Ver como tabela</summary>
    <table><thead><tr><th>Dia</th><th class="num">Agendamentos</th></tr></thead><tbody>${days.filter(d => d.n).reverse().map(d => `<tr><td>${d.label}</td><td class="num">${d.n}</td></tr>`).join('') || '<tr><td colspan="2" class="hint">Sem agendamentos no período.</td></tr>'}</tbody></table>
  </details>
</section>

<div class="grid2">
  <section class="card"><div class="card__title">Por calendário</div>${hbars(data.byCalendar, CAL_NAMES, t.saves)}</section>
  <section class="card"><div class="card__title">Por dispositivo</div>${hbars(data.byPlatform, PLAT_NAMES, t.saves)}</section>
</div>

${sel ? '' : `
<section class="card">
  <div class="card__title">Por evento</div>
  ${data.perEvent.length ? `<div class="tablewrap"><table><thead><tr><th>Evento</th><th class="num">Visitas</th><th class="num">Agendamentos</th><th class="num">E-mails</th><th class="num">Conversão</th></tr></thead><tbody>
  ${data.perEvent.map(e => `<tr><td><a href="/admin/dashboard?event=${e.id}" class="tlink">${esc(e.title)}</a> <span class="status status--${esc(e.status)}">${STATUS_LABEL[e.status]}</span></td><td class="num">${nf(e.views)}</td><td class="num">${nf(e.saves)}</td><td class="num">${nf(e.leads)}</td><td class="num">${pct(e.saves, e.views)}</td></tr>`).join('')}
  </tbody></table></div>` : '<p class="hint">Nenhum evento ainda.</p>'}
</section>`}

<section class="card">
  <div class="card__title">E-mails mais recentes</div>
  ${data.recentLeads.length ? `<div class="tablewrap"><table><thead><tr><th>E-mail</th>${sel ? '' : '<th>Evento</th>'}<th>Nome</th><th>Calendário</th><th>Dispositivo</th><th>Quando</th></tr></thead><tbody>
  ${data.recentLeads.map(l => `<tr><td class="mono">${esc(l.email)}</td>${sel ? '' : `<td>${esc(l.event_title)}</td>`}<td>${esc(l.name || '—')}</td><td>${esc(CAL_NAMES[l.calendar] || l.calendar || '—')}</td><td>${esc(PLAT_NAMES[l.platform] || l.platform || '—')}</td><td class="mono">${esc(l.created_local.slice(0, 16))}</td></tr>`).join('')}
  </tbody></table></div>` : '<p class="hint">Nenhum e-mail capturado ainda.</p>'}
</section>`;
  return layout({ title: 'Dashboard', active: 'dashboard', body, menuEvents });
}

// ---------------------------------------------------------------------------
// Blocos reutilizados: template + campos visíveis
// ---------------------------------------------------------------------------
function templatePicker(name, current, previewQuery = '') {
  return `<div class="tpls">${TEMPLATE_LIST.map(t => `
  <label class="tpl${t.id === current ? ' is-selected' : ''}">
    <input type="radio" name="${name}" value="${t.id}" ${t.id === current ? 'checked' : ''}>
    <span class="tpl__thumb" style="background-image:url('/templates/${t.id}/thumb.jpg')"></span>
    <span class="tpl__body"><b>${esc(t.name)}</b><small>${esc(t.description)}</small></span>
    <a class="tpl__preview" href="/admin/templates/${t.id}/preview${previewQuery}" target="_blank">${ICONS.external} Prévia</a>
  </label>`).join('')}</div>`;
}
function fieldChecks(prefix, fields) {
  return `<div class="checks">${FIELD_DEFS.map(([k, label, hint]) => `
  <label class="check"><input type="checkbox" name="${prefix}${k}" data-field="${k}" ${fields[k] ? 'checked' : ''}><span>${label}${hint ? `<small>${hint}</small>` : ''}</span></label>`).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Configurações gerais
// ---------------------------------------------------------------------------
export function renderSettings({ defaults, usingDefaults, flash, menuEvents }) {
  const body = `
<div class="page-head"><div><h1>Configurações gerais</h1><p>Valem para todos os eventos em “configurações padrão”. Hoje são <b>${usingDefaults}</b> evento${usingDefaults === 1 ? '' : 's'}. Eventos personalizados não são afetados.</p></div></div>
<form method="post" action="/admin/settings" class="stack">
  <section class="card">
    <div class="card__title">Aparência · template</div>
    ${templatePicker('template', defaults.template)}
  </section>
  <section class="card">
    <div class="card__title">Campos visíveis</div>
    ${fieldChecks('fields_', defaults.fields)}
    <p class="hint hint--box">${ICONS.lock} <span><b>E-mail obrigatório</b> esconde o link do evento e o arquivo .ics até o visitante informar o e-mail. Sem e-mail, ele vê só data, horário, descrição e local.</span></p>
  </section>
  <div class="actions actions--sticky"><button class="btn btn--primary" type="submit">${ICONS.check} Salvar configurações</button></div>
</form>`;
  return layout({ title: 'Configurações gerais', active: 'settings', body, flash, menuEvents });
}

// ---------------------------------------------------------------------------
// Evento (novo / editar)
// ---------------------------------------------------------------------------
function split(local) { const [d = '', t = ''] = (local || '').split('T'); return { d, t }; }

export function renderForm({ ev, baseUrl, isNew, flash, error, defaultTz, defaults, menuEvents }) {
  const s = split(ev?.start_local), e = split(ev?.end_local);
  const v = k => esc(ev?.[k] ?? '');
  const mode = ev?.settings_mode === 'custom' ? 'custom' : 'default';
  const own = ev?.own || { template: defaults.template, fields: { ...defaults.fields } };
  const action = isNew ? '/admin/events/new' : `/admin/events/${ev.id}`;
  const hero = ev?.hero_image ? `/uploads/${esc(ev.hero_image)}` : '';
  const defTpl = getTemplate(defaults.template);

  const body = `
<div class="page-head">
  <div><h1>${isNew ? 'Novo evento' : esc(ev.title)}</h1>${!isNew ? `<p><span class="status status--${esc(ev.status)}">${STATUS_LABEL[ev.status]}</span> · ${nf(ev.views)} visitas</p>` : '<p>Preencha o básico, a data e o conteúdo. A aparência segue as configurações gerais, a menos que você personalize.</p>'}</div>
  ${!isNew ? `<div class="actions"><a class="btn btn--soft" href="/e/${esc(ev.slug)}?preview=1" target="_blank">${ICONS.external} Ver página</a><a class="btn btn--soft" href="/admin/dashboard?event=${ev.id}">${ICONS.chart} Métricas</a></div>` : ''}
</div>
${!isNew ? `<div class="linkbox">${ICONS.link}<a href="${esc(baseUrl)}/e/${esc(ev.slug)}" target="_blank">${esc(baseUrl)}/e/${esc(ev.slug)}</a><button class="btn btn--sm" type="button" data-copy="${esc(baseUrl)}/e/${esc(ev.slug)}">${ICONS.copy} Copiar</button></div>` : ''}

<form method="post" action="${action}" enctype="multipart/form-data" class="stack" id="eventForm">
  <section class="card">
    <div class="card__title">Básico</div>
    <div class="form-row"><label class="f"><span>Nome do evento <b>*</b></span><input type="text" name="title" value="${v('title')}" required maxlength="140" id="titleInput" placeholder="Ex.: Workshop de Finanças Pessoais"></label></div>
    <div class="form-row"><label class="f"><span>Subtítulo</span><input type="text" name="subtitle" value="${v('subtitle')}" maxlength="180" placeholder="Uma linha que resume o evento"></label></div>
    <div class="form-row"><label class="f"><span>URL do evento <b>*</b></span><div class="slug"><span>${esc(baseUrl.replace(/^https?:\/\//, ''))}/e/</span><input type="text" name="slug" value="${v('slug')}" id="slugInput" required pattern="[a-z0-9-]+" maxlength="80" placeholder="meu-evento" autocapitalize="off" spellcheck="false"></div><small class="hint">Só letras minúsculas, números e hífen. Sugerido a partir do nome.</small></label></div>
    <div class="form-row form-row--2">
      <label class="f"><span>Status</span><select name="status">
        <option value="draft" ${(ev?.status || 'draft') === 'draft' ? 'selected' : ''}>Rascunho (só você vê)</option>
        <option value="published" ${ev?.status === 'published' ? 'selected' : ''}>Publicado</option>
        <option value="closed" ${ev?.status === 'closed' ? 'selected' : ''}>Encerrado</option>
      </select></label>
      <label class="f"><span>Texto do botão</span><input type="text" name="cta_label" value="${esc(ev?.cta_label || 'Salvar na minha agenda')}" maxlength="40"></label>
    </div>
  </section>

  <section class="card">
    <div class="card__title">Quando</div>
    <div class="form-row form-row--2">
      <label class="f"><span>Data de início <b>*</b></span><input type="date" name="start_date" value="${esc(s.d)}" required></label>
      <label class="f"><span>Horário de início <b>*</b></span><input type="time" name="start_time" value="${esc(s.t)}" required></label>
    </div>
    <div class="form-row form-row--2">
      <label class="f"><span>Data de término</span><input type="date" name="end_date" value="${esc(e.d)}"></label>
      <label class="f"><span>Horário de término</span><input type="time" name="end_time" value="${esc(e.t)}"><small class="hint">Em branco = 1 hora de duração.</small></label>
    </div>
    <div class="form-row form-row--2">
      <label class="f"><span>Fuso horário</span><select name="timezone">${TIMEZONES.map(z => `<option value="${z}" ${(ev?.timezone || defaultTz) === z ? 'selected' : ''}>${z.replace(/_/g, ' ')}</option>`).join('')}</select></label>
      <label class="f"><span>Lembrete no calendário</span><select name="reminder_minutes">${REMINDERS.map(([m, l]) => `<option value="${m}" ${(ev?.reminder_minutes ?? 60) === m ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
  </section>

  <section class="card">
    <div class="card__title">Conteúdo</div>
    <div class="form-row"><label class="f"><span>Descrição</span><textarea name="description" placeholder="Sobre o evento. Vai para a página e para a descrição no calendário.">${v('description')}</textarea></label></div>
    <div class="form-row"><label class="f"><span>Detalhes</span><textarea name="details" placeholder="Programação, o que levar, requisitos, etc.">${v('details')}</textarea></label></div>
    <div class="form-row form-row--2">
      <label class="f"><span>Local</span><input type="text" name="location" value="${v('location')}" placeholder="Endereço ou “Online”"></label>
      <label class="f"><span>Link do evento</span><input type="url" name="url" value="${v('url')}" placeholder="https://"></label>
    </div>
    <div class="form-row"><label class="f"><span>Organização</span><input type="text" name="organizer_name" value="${v('organizer_name')}" placeholder="Ex.: Vértuz"></label></div>
    <div class="form-row">
      <div class="f"><span>Imagem de destaque</span>
        <div class="heroimg">
          <div class="heroimg__preview" id="heroPreview" style="${hero ? `background-image:url('${hero}')` : ''}">${hero ? '' : '<span>Sem imagem · usa a do template</span>'}</div>
          <div class="heroimg__ctl">
            <label class="btn btn--soft btn--file">${ICONS.download} Escolher imagem<input type="file" name="hero" accept="image/png,image/jpeg,image/webp" id="heroInput"></label>
            ${hero ? `<label class="check check--inline"><input type="checkbox" name="remove_hero"><span>Remover imagem</span></label>` : ''}
            <small class="hint">PNG, JPG ou WebP até 8 MB. Ideal 1600 × 900.</small>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="card">
    <div class="card__title">Personalização</div>
    <div class="modes" role="radiogroup">
      <label class="mode"><input type="radio" name="settings_mode" value="default" ${mode === 'default' ? 'checked' : ''}><span><b>Configurações padrão</b><small>Usa o template <em>${esc(defTpl.name)}</em> e os campos definidos nas <a href="/admin/settings">configurações gerais</a>.</small></span></label>
      <label class="mode"><input type="radio" name="settings_mode" value="custom" ${mode === 'custom' ? 'checked' : ''}><span><b>Configurações personalizadas</b><small>Escolha um template e os campos só para este evento.</small></span></label>
    </div>
  </section>

  <div class="custom stack" id="customBlock" ${mode === 'custom' ? '' : 'hidden'}>
    <section class="card">
      <div class="card__title">Aparência · template</div>
      ${templatePicker('template', own.template, ev?.id ? `?event=${ev.id}` : '')}
    </section>
    <section class="card">
      <div class="card__title">Campos visíveis</div>
      ${fieldChecks('fields_', own.fields)}
      <p class="hint hint--box">${ICONS.lock} <span><b>E-mail obrigatório</b> esconde o link do evento e o arquivo .ics até o visitante informar o e-mail. Sem e-mail, ele vê só data, horário, descrição e local.</span></p>
    </section>
  </div>

  <div class="actions actions--sticky">
    <button class="btn btn--primary" type="submit" name="after" value="stay">${ICONS.check} Salvar</button>
    <button class="btn btn--soft" type="submit" name="after" value="view">Salvar e ver página</button>
    <a class="btn btn--ghost" href="/admin">Cancelar</a>
  </div>
</form>`;
  return layout({ title: isNew ? 'Novo evento' : ev.title, active: isNew ? 'new' : `event-${ev.id}`, body, flash, error, menuEvents });
}

export { DEFAULT_FIELDS };
