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
/** " · Dono" só quando ajuda (master vendo pasta cujo nome não é o do dono). */
const ownerSuffix = (f, isMaster) => isMaster && f.owner_name && f.owner_name !== f.name ? ` · ${f.owner_name}` : '';
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

/** Cabeçalho de seção com ícone. */
const head = (icon, title, sub = '') => `<div class="card__head"><span class="ic">${icon}</span><div><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div></div>`;

const WEBHOOK_HINT = 'O app envia um JSON (POST) sempre que alguém salva/baixa o evento na agenda. Rascunhos e pré-visualizações não disparam.';

// ---------------------------------------------------------------------------
// Layout com menu
// ---------------------------------------------------------------------------
function layout({ title, body, flash, error, nav }) {
  const { user, active = '', menuFolders = [], menuEvents = [], noFolderCount = 0 } = nav;
  const item = (key, href, icon, label) => `<a class="nav__item${active === key ? ' is-active' : ''}" href="${href}">${icon}<span>${label}</span></a>`;
  // Pasta aberta no menu: a ativa ou a do evento aberto.
  const evActive = active.startsWith('event-') ? menuEvents.find(e => `event-${e.id}` === active) : null;
  const openFolder = active.startsWith('folder-') ? Number(active.slice(7)) : evActive ? (evActive.folder_id || 'none') : null;
  const evItem = e => `<a class="nav__event${active === `event-${e.id}` ? ' is-active' : ''}" href="/admin/events/${e.id}"><i class="dot dot--${esc(e.status)}"></i><span>${esc(e.title)}</span><small>${esc(formatLocal(e.start_local).day)}/${esc(e.start_local.slice(5, 7))}</small></a>`;
  const folderItem = (id, name, sub, count, evs) => {
    const open = openFolder === id;
    return `<details class="nav__folder"${open ? ' open' : ''}>
      <summary class="${active === `folder-${id}` ? 'is-active' : ''}">${ICONS.folder}<span>${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><em>${count}</em></summary>
      <div class="nav__events">${evs.length ? evs.map(evItem).join('') : '<div class="nav__empty">Pasta vazia</div>'}
        <a class="nav__event nav__event--add" href="/admin/events/new${id === 'none' ? '' : `?folder=${id}`}">${ICONS.plus}<span>Novo evento aqui</span></a>
        ${id === 'none' ? '' : `<a class="nav__event nav__event--add" href="/admin?folder=${id}">${ICONS.arrow}<span>Abrir pasta</span></a>`}
      </div></details>`;
  };
  const folderList = menuFolders.map(f => folderItem(f.id, f.name, user.isMaster && f.owner_name !== f.name ? (f.owner_name || 'Administrador') : '', f.events_count, menuEvents.filter(e => e.folder_id === f.id))).join('')
    + (noFolderCount ? folderItem('none', 'Sem pasta', '', noFolderCount, menuEvents.filter(e => !e.folder_id)) : '');

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
  <div class="mobilebar__right"><a class="iconbtn iconbtn--primary" href="/admin/events/new" aria-label="Novo evento">${ICONS.plus}</a>
  <button class="iconbtn" type="button" id="navOpen" aria-label="Abrir menu" aria-controls="sidebar" aria-expanded="false">${ICONS.menu}</button></div>
</header>
<div class="scrim" id="scrim" hidden></div>
<aside class="sidebar" id="sidebar">
  <div class="sidebar__head">
    <a class="brand" href="/admin"><span class="brand__dot"></span>Vértuz <small>Agenda</small></a>
    <button class="iconbtn iconbtn--close" type="button" id="navClose" aria-label="Fechar menu">${ICONS.close}</button>
  </div>
  <a class="btn btn--primary btn--block" href="/admin/events/new">${ICONS.plus} Novo evento</a>
  <nav class="nav">
    ${item('home', '/admin', ICONS.home, 'Início')}
    ${item('dashboard', '/admin/dashboard', ICONS.chart, 'Dashboard')}
    ${user.isMaster ? item('users', '/admin/users', ICONS.users, 'Usuários') : ''}
    ${user.isMaster ? item('settings', '/admin/settings', ICONS.gear, 'Configurações gerais') : ''}
  </nav>
  <div class="nav__section">
    <div class="nav__title"><span>Pastas</span><a href="/admin#nova-pasta" aria-label="Nova pasta" title="Nova pasta">${ICONS.plus}</a></div>
    <div class="nav__folders">${folderList || '<div class="nav__empty">Nenhuma pasta ainda</div>'}</div>
  </div>
  <div class="sidebar__foot">
    <a class="me${active === 'account' ? ' is-active' : ''}" href="/admin/account"><span class="avatar">${esc(initials(user.name))}</span><span class="me__txt"><b>${esc(user.name)}</b><small>${user.isMaster ? 'Administrador' : 'Profissional'}</small></span></a>
    <form method="post" action="/admin/logout"><button class="iconbtn" type="submit" aria-label="Sair" title="Sair">${ICONS.logout}</button></form>
  </div>
</aside>
<main class="main">
  ${flash ? `<div class="flash">${ICONS.check}<span>${esc(flash)}</span></div>` : ''}
  ${error ? `<div class="flash flash--error">${ICONS.info}<span>${esc(error)}</span></div>` : ''}
  ${body}
</main>
<div class="tooltip" id="tooltip" hidden></div>
<script src="/js/admin.js" defer></script>
</body></html>`;
}

export function renderLogin({ error, username = '' }) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Entrar · Vértuz Agenda</title><link rel="icon" href="/brand/mascot.png" type="image/png">
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap"><link rel="stylesheet" href="/css/admin.css"></head>
<body><div class="login"><form class="card" method="post" action="/admin/login">
<img src="/brand/mascot.png" alt=""><h1>Vértuz Agenda</h1><p>Entre com seu usuário e senha</p>
${error ? `<div class="flash flash--error">${ICONS.info}<span>${esc(error)}</span></div>` : ''}
<label class="f"><span>Usuário</span><span class="input-ic">${ICONS.user}<input type="text" name="username" value="${esc(username)}" ${username ? '' : 'autofocus'} autocomplete="username" autocapitalize="off" spellcheck="false" required></span></label>
<label class="f"><span>Senha</span><span class="input-ic">${ICONS.key}<input type="password" name="password" ${username ? 'autofocus' : ''} autocomplete="current-password" required></span></label>
<button class="btn btn--primary" type="submit">Entrar ${ICONS.arrowUpRight}</button>
</form></div></body></html>`;
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------
function folderOwnerSelect(users, current, { allowNone = true } = {}) {
  return `<select name="owner_id">${allowNone ? `<option value="">Administrador</option>` : ''}${users.map(u => `<option value="${u.id}" ${u.id === current ? 'selected' : ''}>${esc(u.name)} (${esc(u.username)})</option>`).join('')}</select>`;
}

export function renderHome({ events, folders, folder, current, users = [], baseUrl, flash, error, nav }) {
  const user = nav.user;
  const totals = events.reduce((t, e) => ({ views: t.views + (e.views || 0), saves: t.saves + (e.clicks_count || 0), leads: t.leads + (e.leads_count || 0) }), { views: 0, saves: 0, leads: 0 });
  const folderName = id => folders.find(f => f.id === id)?.name;
  const chip = (href, label, count, on, icon = ICONS.folder) => `<a class="chip${on ? ' is-on' : ''}" href="${href}">${icon}<span>${esc(label)}</span><em>${count}</em></a>`;
  const allCount = folders.reduce((n, f) => n + f.events_count, 0) + (nav.noFolderCount || 0);
  const title = current ? esc(current.name) : folder === 'none' ? 'Sem pasta' : `Olá, ${esc(user.name.split(' ')[0])}`;
  const sub = current
    ? `${user.isMaster ? `Pasta de <b>${esc(current.owner_name || 'Administrador')}</b> · ` : ''}${current.webhook_url ? `${ICONS.bolt} webhook próprio` : 'usa o webhook geral'}`
    : folder === 'none' ? 'Eventos que ainda não estão em nenhuma pasta. Abra o evento e escolha uma pasta.'
    : `Seus links ficam em <code>${esc(baseUrl)}/e/</code>`;

  const body = `
<div class="page-head">
  <div><h1>${title}</h1><p>${sub}</p></div>
  <div class="actions">
    ${current ? `<a class="btn" href="/admin/folders/${current.id}">${ICONS.edit} Editar pasta</a>` : ''}
    <a class="btn btn--primary" href="/admin/events/new${current ? `?folder=${current.id}` : ''}">${ICONS.plus} Novo evento</a>
  </div>
</div>

<div class="stats">
  <div class="stat"><span class="stat__ic">${ICONS.calendar}</span><div><b>${nf(events.length)}</b><small>Eventos</small></div></div>
  <div class="stat"><span class="stat__ic">${ICONS.eye}</span><div><b>${nf(totals.views)}</b><small>Visitas</small></div></div>
  <div class="stat"><span class="stat__ic">${ICONS.download}</span><div><b>${nf(totals.saves)}</b><small>Agendamentos</small></div></div>
  <div class="stat"><span class="stat__ic">${ICONS.mail}</span><div><b>${nf(totals.leads)}</b><small>E-mails</small></div></div>
</div>

<div class="chips">
  ${chip('/admin', 'Todas', allCount, !folder, ICONS.home)}
  ${folders.map(f => chip(`/admin?folder=${f.id}`, f.name + ownerSuffix(f, user.isMaster), f.events_count, String(f.id) === String(folder))).join('')}
  ${nav.noFolderCount ? chip('/admin?folder=none', 'Sem pasta', nav.noFolderCount, folder === 'none', ICONS.info) : ''}
  <details class="newfolder" id="nova-pasta">
    <summary class="chip chip--add">${ICONS.folderPlus}<span>Nova pasta</span></summary>
    <form method="post" action="/admin/folders" class="newfolder__form">
      <label class="f"><span>Nome da pasta</span><input type="text" name="name" maxlength="80" required placeholder="Ex.: Lançamento de março"></label>
      ${user.isMaster ? `<label class="f"><span>Dono</span>${folderOwnerSelect(users, null)}</label>` : ''}
      <button class="btn btn--primary" type="submit">${ICONS.check} Criar pasta</button>
    </form>
  </details>
</div>

${events.length === 0 ? `<div class="card empty"><img src="/brand/mascot.png" alt=""><b>${folder ? 'Nenhum evento nesta pasta' : 'Nenhum evento ainda'}</b><span>Crie o primeiro e compartilhe o link.</span>
  <a class="btn btn--primary" href="/admin/events/new${current ? `?folder=${current.id}` : ''}">${ICONS.plus} Criar evento</a></div>` : `
<div class="events">
${events.map(ev => {
    const d = formatLocal(ev.start_local);
    const tpl = getTemplate(ev.template);
    const thumb = ev.hero_image ? `/uploads/${esc(ev.hero_image)}` : (tpl.heroDefault || `/templates/${tpl.id}/thumb.jpg`);
    const link = `${baseUrl}/e/${ev.slug}`;
    const fname = !folder && ev.folder_id ? folderName(ev.folder_id) : '';
    return `<article class="event">
  <a class="event__thumb" href="/admin/events/${ev.id}" style="background-image:url('${thumb}')"><span class="dc"><b>${esc(d.day)}</b>${esc(d.monthShort)}</span></a>
  <div class="event__main">
    <a class="event__title" href="/admin/events/${ev.id}">${esc(ev.title)}</a>
    <div class="event__meta"><span class="status status--${esc(ev.status)}">${STATUS_LABEL[ev.status] || esc(ev.status)}</span>${fname ? `<span class="foldertag">${ICONS.folder}${esc(fname)}</span>` : ''}<span>${ICONS.clock} ${esc(d.time)}</span>${ev.fields.showUrl && !ev.url ? '<span class="pending">Link pendente</span>' : ''}${ev.webhook_url ? `<span class="foldertag" title="Webhook próprio">${ICONS.bolt}webhook</span>` : ''}</div>
    <div class="event__stats"><span>${ICONS.eye} ${nf(ev.views)}</span><span>${ICONS.download} ${nf(ev.clicks_count)}</span><span>${ICONS.mail} ${nf(ev.leads_count)}</span></div>
  </div>
  <div class="event__actions">
    <button class="btn btn--sm btn--soft" type="button" data-copy="${esc(link)}" title="${esc(link)}">${ICONS.copy}<span>Copiar link</span></button>
    <a class="btn btn--sm" href="/admin/events/${ev.id}">${ICONS.edit}<span class="lbl">Editar</span></a>
    <details class="more"><summary class="btn btn--sm" aria-label="Mais ações">•••</summary>
      <div class="more__menu">
        <a href="/e/${esc(ev.slug)}?preview=1" target="_blank">${ICONS.external} Ver página</a>
        <a href="/admin/dashboard?event=${ev.id}">${ICONS.chart} Métricas</a>
        <form method="post" action="/admin/events/${ev.id}/duplicate"><button type="submit">${ICONS.copy} Duplicar</button></form>
        <form method="post" action="/admin/events/${ev.id}/delete" data-confirm="Excluir o evento “${esc(ev.title)}” e todos os e-mails dele? Isso não pode ser desfeito."><button type="submit" class="danger">${ICONS.trash} Excluir</button></form>
      </div>
    </details>
  </div>
</article>`;
  }).join('')}
</div>`}`;
  return layout({ title: current ? current.name : 'Início', body, flash, error, nav });
}

// ---------------------------------------------------------------------------
// Pasta
// ---------------------------------------------------------------------------
export function renderFolderForm({ folder, users, eventsCount, globalWebhook, flash, error, nav }) {
  const user = nav.user;
  const body = `
<div class="page-head"><div><a class="back" href="/admin?folder=${folder.id}">${ICONS.chevron} Voltar para a pasta</a><h1>${esc(folder.name)}</h1><p>${nf(eventsCount)} evento${eventsCount === 1 ? '' : 's'} nesta pasta</p></div></div>
<form method="post" action="/admin/folders/${folder.id}" class="stack">
  <section class="card">
    ${head(ICONS.folder, 'Pasta', 'Nome e dono')}
    <div class="form-row ${user.isMaster ? 'form-row--2' : ''}">
      <label class="f"><span>Nome <b>*</b></span><input type="text" name="name" value="${esc(folder.name)}" maxlength="80" required></label>
      ${user.isMaster ? `<label class="f"><span>Dono</span>${folderOwnerSelect(users, folder.owner_id)}<small class="hint">O dono vê e edita os eventos desta pasta.</small></label>` : ''}
    </div>
  </section>
  <section class="card">
    ${head(ICONS.bolt, 'Webhook da pasta', 'Vale para os eventos desta pasta que não têm webhook próprio')}
    <div class="form-row"><label class="f"><span>URL</span><input type="url" name="webhook_url" value="${esc(folder.webhook_url)}" placeholder="https://" maxlength="500">
      <small class="hint">Ordem: webhook do evento → <b>da pasta</b> → geral${globalWebhook ? '' : ' (nenhum geral configurado)'}. ${WEBHOOK_HINT}</small></label></div>
  </section>
  <div class="actions actions--sticky">
    <button class="btn btn--primary" type="submit">${ICONS.check} Salvar pasta</button>
    <button class="btn btn--soft" type="submit" name="after" value="test">${ICONS.send} Salvar e enviar teste</button>
    <a class="btn btn--ghost" href="/admin?folder=${folder.id}">Cancelar</a>
  </div>
</form>
<section class="card card--danger">
  ${head(ICONS.trash, 'Excluir pasta', eventsCount ? 'Mova ou exclua os eventos antes de excluir a pasta.' : 'A pasta está vazia e pode ser excluída.')}
  <form method="post" action="/admin/folders/${folder.id}/delete" data-confirm="Excluir a pasta “${esc(folder.name)}”?"><button class="btn btn--danger" type="submit" ${eventsCount ? 'disabled' : ''}>${ICONS.trash} Excluir pasta</button></form>
</section>`;
  return layout({ title: folder.name, body, flash, error, nav });
}

// ---------------------------------------------------------------------------
// Usuários (master)
// ---------------------------------------------------------------------------
export function renderUsers({ users, master, flash, error, nav }) {
  const body = `
<div class="page-head">
  <div><h1>Usuários</h1><p>Cada profissional entra com o próprio login e vê só as próprias pastas, eventos, métricas e e-mails.</p></div>
  <div class="actions"><a class="btn btn--primary" href="/admin/users/new">${ICONS.userPlus} Novo usuário</a></div>
</div>
<div class="users">
  <div class="usercard usercard--master"><span class="avatar avatar--lg">${ICONS.shield}</span><div class="usercard__main"><b>Administrador</b><small>@${esc(master)} · definido nas variáveis da VPS (ADMIN_USER / ADMIN_PASSWORD)</small></div><span class="badge">Vê tudo</span></div>
  ${users.map(u => `<a class="usercard" href="/admin/users/${u.id}"><span class="avatar avatar--lg">${esc(initials(u.name))}</span>
    <div class="usercard__main"><b>${esc(u.name)}</b><small>@${esc(u.username)} · ${nf(u.folders_count)} pasta${u.folders_count === 1 ? '' : 's'} · ${nf(u.events_count)} evento${u.events_count === 1 ? '' : 's'}</small></div>
    <span class="status status--${u.active ? 'published' : 'closed'}">${u.active ? 'Ativo' : 'Inativo'}</span>${ICONS.chevron}</a>`).join('')}
  ${users.length ? '' : `<div class="card empty"><img src="/brand/mascot.png" alt=""><b>Nenhum profissional ainda</b><span>Crie um usuário para cada profissional. Ele já ganha uma pasta própria.</span></div>`}
</div>`;
  return layout({ title: 'Usuários', body, flash, error, nav });
}

export function renderUserForm({ u, folders = [], error, nav }) {
  const isNew = !u?.id;
  const body = `
<div class="page-head"><div><a class="back" href="/admin/users">${ICONS.chevron} Usuários</a><h1>${isNew ? 'Novo usuário' : esc(u.name)}</h1><p>${isNew ? 'O usuário ganha uma pasta com o nome dele. Passe o login e a senha por um canal seguro.' : `@${esc(u.username)}`}</p></div></div>
<form method="post" action="/admin/users/${isNew ? 'new' : u.id}" class="stack" autocomplete="off">
  <section class="card">
    ${head(ICONS.user, 'Dados de acesso')}
    <div class="form-row form-row--2">
      <label class="f"><span>Nome <b>*</b></span><input type="text" name="name" value="${esc(u?.name || '')}" maxlength="80" required placeholder="Ex.: Ana Souza"></label>
      <label class="f"><span>Login <b>*</b></span><input type="text" name="username" value="${esc(u?.username || '')}" maxlength="60" required autocapitalize="off" spellcheck="false" placeholder="ex.: ana"></label>
    </div>
    <div class="form-row form-row--2">
      <label class="f"><span>${isNew ? 'Senha <b>*</b>' : 'Nova senha'}</span><input type="password" name="password" minlength="8" ${isNew ? 'required' : ''} autocomplete="new-password" placeholder="${isNew ? 'Mínimo de 8 caracteres' : 'Em branco = manter a atual'}">
        ${isNew ? '' : '<small class="hint">Trocar a senha desconecta o usuário de todos os aparelhos.</small>'}</label>
      ${isNew ? '' : `<div class="f"><span>Situação</span><label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}><span>Pode entrar no painel<small>Desmarque para bloquear o acesso sem apagar nada.</small></span></label></div>`}
    </div>
  </section>
  ${isNew ? '' : `<section class="card">${head(ICONS.folder, 'Pastas deste usuário')}
    ${folders.length ? `<div class="chips chips--flat">${folders.map(f => `<a class="chip" href="/admin?folder=${f.id}">${ICONS.folder}<span>${esc(f.name)}</span><em>${f.events_count}</em></a>`).join('')}</div>` : '<p class="hint">Nenhuma pasta. Crie uma no início e escolha este usuário como dono.</p>'}
  </section>`}
  <div class="actions actions--sticky">
    <button class="btn btn--primary" type="submit">${ICONS.check} ${isNew ? 'Criar usuário' : 'Salvar'}</button>
    <a class="btn btn--ghost" href="/admin/users">Cancelar</a>
  </div>
</form>
${isNew ? '' : `<section class="card card--danger">
  ${head(ICONS.trash, 'Excluir usuário', 'As pastas e eventos dele continuam existindo e passam para o administrador.')}
  <form method="post" action="/admin/users/${u.id}/delete" data-confirm="Excluir o usuário “${esc(u.name)}”?"><button class="btn btn--danger" type="submit">${ICONS.trash} Excluir usuário</button></form>
</section>`}`;
  return layout({ title: isNew ? 'Novo usuário' : u.name, body, error, nav });
}

export function renderAccount({ flash, error, nav }) {
  const user = nav.user;
  const body = `
<div class="page-head"><div><h1>Minha conta</h1><p>${esc(user.name)} · @${esc(user.username)}</p></div></div>
${user.isMaster ? `<section class="card">${head(ICONS.shield, 'Administrador', 'Login e senha do administrador ficam nas variáveis da VPS (ADMIN_USER e ADMIN_PASSWORD). Para trocar, altere no Easypanel e faça o Deploy.')}</section>` : `
<form method="post" action="/admin/account" class="stack">
  <section class="card">
    ${head(ICONS.key, 'Trocar senha', 'Os outros aparelhos conectados serão desconectados.')}
    <div class="form-row"><label class="f"><span>Senha atual</span><input type="password" name="current" required autocomplete="current-password"></label></div>
    <div class="form-row form-row--2">
      <label class="f"><span>Nova senha</span><input type="password" name="password" minlength="8" required autocomplete="new-password" placeholder="Mínimo de 8 caracteres"></label>
      <label class="f"><span>Confirme a nova senha</span><input type="password" name="confirm" minlength="8" required autocomplete="new-password"></label>
    </div>
  </section>
  <div class="actions"><button class="btn btn--primary" type="submit">${ICONS.check} Salvar nova senha</button></div>
</form>`}`;
  return layout({ title: 'Minha conta', body, flash, error, nav });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export function renderDashboard({ data, folders, folder, events, eventId, days, nav }) {
  const t = data.totals;
  const sel = events.find(e => e.id === eventId);
  const selFolder = folder && folder !== 'none' ? folders.find(f => f.id === Number(folder)) : null;
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
  const leadMap = Object.fromEntries((data.leadsBySource || []).map(r => [r.k, r.n]));
  const leadsOf = k => leadMap[k] ? ` · ${nf(leadMap[k])} e-mail${leadMap[k] === 1 ? '' : 's'}` : '';
  const hbars = (rows, names, total) => rows.length ? `<div class="hbars">${rows.map(r => `<div class="hbar" data-tip="<b>${r.n}</b> · ${pct(r.n, total)}${esc(r.tip || '')}"><span class="hbar__k">${esc(names[r.k] || r.k || 'Outro')}</span><span class="hbar__track"><i style="width:${Math.max(2, Math.round(r.n / Math.max(...rows.map(x => x.n)) * 100))}%"></i></span><span class="hbar__v">${nf(r.n)}</span></div>`).join('')}</div>` : '<p class="hint">Ainda sem agendamentos.</p>';
  const qs = new URLSearchParams({ ...(folder ? { folder } : {}), ...(eventId ? { event: eventId } : {}) }).toString();

  const body = `
<div class="page-head">
  <div><h1>Dashboard</h1><p>${sel ? `Métricas de <b>${esc(sel.title)}</b>` : selFolder ? `Pasta <b>${esc(selFolder.name)}</b>` : folder === 'none' ? 'Eventos sem pasta' : nav.user.isMaster ? 'Soma de todos os eventos' : 'Soma dos seus eventos'}</p></div>
  <form class="filters" method="get" action="/admin/dashboard">
    <label class="f f--inline"><span class="sr">Pasta</span><select name="folder" data-autosubmit data-reset="event">
      <option value="">Todas as pastas</option>
      ${folders.map(f => `<option value="${f.id}" ${String(f.id) === String(folder) ? 'selected' : ''}>${esc(f.name + ownerSuffix(f, nav.user.isMaster))}</option>`).join('')}
      ${nav.noFolderCount ? `<option value="none" ${folder === 'none' ? 'selected' : ''}>Sem pasta</option>` : ''}
    </select></label>
    <label class="f f--inline"><span class="sr">Evento</span><select name="event" data-autosubmit>
      <option value="">Todos os eventos</option>
      ${events.map(e => `<option value="${e.id}" ${e.id === eventId ? 'selected' : ''}>${esc(e.title)}</option>`).join('')}
    </select></label>
    <a class="btn btn--soft" href="/admin/leads.csv${qs ? `?${qs}` : ''}">${ICONS.download} Exportar e-mails</a>
  </form>
</div>

<div class="kpis">
  <div class="kpi kpi--hero"><span class="kpi__ic">${ICONS.download}</span><small>Agendamentos</small><b>${nf(t.saves)}</b><span>vezes que salvaram o evento na agenda</span></div>
  <div class="kpi"><span class="kpi__ic">${ICONS.eye}</span><small>Visitas</small><b>${nf(t.views)}</b></div>
  <div class="kpi"><span class="kpi__ic">${ICONS.mail}</span><small>E-mails</small><b>${nf(t.leads)}</b></div>
  <div class="kpi"><span class="kpi__ic">${ICONS.chart}</span><small>Conversão</small><b>${pct(t.saves, t.views)}</b><span>agendamentos ÷ visitas</span></div>
  ${sel ? '' : `<div class="kpi"><span class="kpi__ic">${ICONS.calendar}</span><small>Publicados</small><b>${nf(t.published)}<em> / ${nf(t.events)}</em></b></div>`}
</div>

<section class="card">
  ${head(ICONS.calendar, 'Agendamentos por dia', 'Últimos 30 dias')}
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
  <section class="card">${head(ICONS.tag, 'Por fonte', '<code>utm_source</code> ou o site de origem')}${hbars(data.bySource.map(r => ({ ...r, tip: leadsOf(r.k) })), { '': 'Direto / sem fonte' }, t.saves)}</section>
  <section class="card">${head(ICONS.send, 'Por campanha', '<code>utm_campaign</code>')}${hbars(data.byCampaign, { '': 'Sem campanha' }, t.saves)}</section>
</div>

<div class="grid2">
  <section class="card">${head(ICONS.calendar, 'Por calendário')}${hbars(data.byCalendar, CAL_NAMES, t.saves)}</section>
  <section class="card">${head(ICONS.globe, 'Por dispositivo')}${hbars(data.byPlatform, PLAT_NAMES, t.saves)}</section>
</div>

${sel ? '' : `
<section class="card">
  ${head(ICONS.chart, 'Por evento')}
  ${data.perEvent.length ? `<div class="tablewrap"><table><thead><tr><th>Evento</th><th class="num">Visitas</th><th class="num">Agendamentos</th><th class="num">E-mails</th><th class="num">Conversão</th></tr></thead><tbody>
  ${data.perEvent.map(e => `<tr><td><a href="/admin/dashboard?${folder ? `folder=${esc(folder)}&` : ''}event=${e.id}" class="tlink">${esc(e.title)}</a> <span class="status status--${esc(e.status)}">${STATUS_LABEL[e.status]}</span></td><td class="num">${nf(e.views)}</td><td class="num">${nf(e.saves)}</td><td class="num">${nf(e.leads)}</td><td class="num">${pct(e.saves, e.views)}</td></tr>`).join('')}
  </tbody></table></div>` : '<p class="hint">Nenhum evento ainda.</p>'}
</section>`}

<section class="card">
  ${head(ICONS.mail, 'E-mails mais recentes')}
  ${data.recentLeads.length ? `<div class="tablewrap"><table><thead><tr><th>E-mail</th>${sel ? '' : '<th>Evento</th>'}<th>Nome</th><th>Fonte</th><th>Calendário</th><th>Dispositivo</th><th>Quando</th></tr></thead><tbody>
  ${data.recentLeads.map(l => `<tr><td class="mono">${esc(l.email)}</td>${sel ? '' : `<td>${esc(l.event_title)}</td>`}<td>${esc(l.name || '—')}</td><td>${esc([l.source, l.utm_campaign].filter(Boolean).join(' · ') || 'Direto')}</td><td>${esc(CAL_NAMES[l.calendar] || l.calendar || '—')}</td><td>${esc(PLAT_NAMES[l.platform] || l.platform || '—')}</td><td class="mono">${esc(l.created_local.slice(0, 16))}</td></tr>`).join('')}
  </tbody></table></div>` : '<p class="hint">Nenhum e-mail capturado ainda.</p>'}
</section>`;
  return layout({ title: 'Dashboard', body, nav });
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
const EMAIL_HINT = `<p class="hint hint--box">${ICONS.lock} <span><b>E-mail obrigatório</b> esconde o local, o link do evento e o arquivo .ics até o visitante informar o e-mail. Sem e-mail, ele vê só data, horário e descrição.</span></p>`;

// ---------------------------------------------------------------------------
// Configurações gerais (master)
// ---------------------------------------------------------------------------
export function renderSettings({ defaults, webhook = { url: '', secret: '' }, usingDefaults, flash, error, nav }) {
  const body = `
<div class="page-head"><div><h1>Configurações gerais</h1><p>Valem para todos os eventos em “configurações padrão”. Hoje são <b>${usingDefaults}</b> evento${usingDefaults === 1 ? '' : 's'}. Eventos personalizados não são afetados.</p></div>
  <div class="actions"><a class="btn" href="/admin/users">${ICONS.users} Gerenciar usuários</a></div></div>
<form method="post" action="/admin/settings" class="stack">
  <section class="card">
    ${head(ICONS.palette, 'Aparência', 'Template padrão das páginas de evento')}
    ${templatePicker('template', defaults.template)}
  </section>
  <section class="card">
    ${head(ICONS.sliders, 'Campos visíveis', 'O que aparece na página do evento')}
    ${fieldChecks('fields_', defaults.fields)}
    ${EMAIL_HINT}
  </section>
  <section class="card">
    ${head(ICONS.bolt, 'Webhook geral', 'Usado quando nem o evento nem a pasta têm webhook próprio')}
    <div class="form-row"><label class="f"><span>URL do webhook geral</span><input type="url" name="webhook_url" value="${esc(webhook.url)}" placeholder="https://" maxlength="500"><small class="hint">Ordem: webhook do evento → da pasta → <b>geral</b>. ${WEBHOOK_HINT}</small></label></div>
    <div class="form-row"><label class="f"><span>Segredo de assinatura</span><input type="text" name="webhook_secret" value="${esc(webhook.secret)}" maxlength="200" autocomplete="off" spellcheck="false" placeholder="Opcional"><small class="hint">Se preenchido, cada envio leva o cabeçalho <code>X-Vertuz-Signature: sha256=…</code> (HMAC-SHA256 do corpo). Vale para todos os webhooks (evento, pasta e geral).</small></label></div>
  </section>
  <div class="actions actions--sticky"><button class="btn btn--primary" type="submit">${ICONS.check} Salvar configurações</button><button class="btn btn--soft" type="submit" name="after" value="test">${ICONS.send} Salvar e enviar teste</button></div>
</form>`;
  return layout({ title: 'Configurações gerais', body, flash, error, nav });
}

// ---------------------------------------------------------------------------
// Evento (novo / editar)
// ---------------------------------------------------------------------------
function split(local) { const [d = '', t = ''] = (local || '').split('T'); return { d, t }; }

export function renderForm({ ev, baseUrl, isNew, flash, error, defaultTz, defaults, folders = [], isMaster, nav }) {
  const s = split(ev?.start_local), e = split(ev?.end_local);
  const v = k => esc(ev?.[k] ?? '');
  const mode = ev?.settings_mode === 'custom' ? 'custom' : 'default';
  const own = ev?.own || { template: defaults.template, fields: { ...defaults.fields } };
  const action = isNew ? '/admin/events/new' : `/admin/events/${ev.id}`;
  const hero = ev?.hero_image ? `/uploads/${esc(ev.hero_image)}` : '';
  const defTpl = getTemplate(defaults.template);
  const settingsLink = isMaster ? '<a href="/admin/settings">configurações gerais</a>' : 'configurações gerais';
  const folderOpts = `${isMaster ? `<option value="">Sem pasta</option>` : ''}${folders.map(f => `<option value="${f.id}" ${f.id === ev?.folder_id ? 'selected' : ''}>${esc(f.name + ownerSuffix(f, isMaster))}</option>`).join('')}`;

  const body = `
<div class="page-head">
  <div>${!isNew && ev.folder_id ? `<a class="back" href="/admin?folder=${ev.folder_id}">${ICONS.chevron} Voltar para a pasta</a>` : ''}<h1>${isNew ? 'Novo evento' : esc(ev.title)}</h1>${!isNew ? `<p><span class="status status--${esc(ev.status)}">${STATUS_LABEL[ev.status]}</span> · ${nf(ev.views)} visitas</p>` : '<p>Preencha o básico, a data e o conteúdo. A aparência segue as configurações gerais, a menos que você personalize.</p>'}</div>
  ${!isNew ? `<div class="actions"><a class="btn" href="/e/${esc(ev.slug)}?preview=1" target="_blank">${ICONS.external} Ver página</a><a class="btn" href="/admin/dashboard?event=${ev.id}">${ICONS.chart} Métricas</a></div>` : ''}
</div>
${!isNew ? `<div class="linkbox">${ICONS.link}<a href="${esc(baseUrl)}/e/${esc(ev.slug)}" target="_blank">${esc(baseUrl)}/e/${esc(ev.slug)}</a><button class="btn btn--sm btn--primary" type="button" data-copy="${esc(baseUrl)}/e/${esc(ev.slug)}">${ICONS.copy} Copiar link</button></div>` : ''}

<form method="post" action="${action}" enctype="multipart/form-data" class="stack" id="eventForm">
  <section class="card">
    ${head(ICONS.text, 'Básico', 'Nome, pasta, endereço e status')}
    <div class="form-row"><label class="f"><span>Nome do evento <b>*</b></span><input type="text" name="title" value="${v('title')}" required maxlength="140" id="titleInput" placeholder="Ex.: Workshop de Finanças Pessoais"></label></div>
    <div class="form-row form-row--2">
      <label class="f"><span>Subtítulo</span><input type="text" name="subtitle" value="${v('subtitle')}" maxlength="180" placeholder="Uma linha que resume o evento"></label>
      <label class="f"><span>Pasta${isMaster ? '' : ' <b>*</b>'}</span><select name="folder_id" ${isMaster ? '' : 'required'}>${folderOpts}</select></label>
    </div>
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
    ${head(ICONS.calendar, 'Quando', 'Data, horário, fuso e lembrete')}
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
    ${head(ICONS.pin, 'Conteúdo', 'Texto, local e link da sala')}
    <div class="form-row"><label class="f"><span>Descrição</span><textarea name="description" placeholder="Sobre o evento. Vai para a página e para a descrição no calendário.">${v('description')}</textarea></label></div>
    <div class="form-row"><label class="f"><span>Detalhes</span><textarea name="details" placeholder="Programação, o que levar, requisitos, etc.">${v('details')}</textarea></label></div>
    <div class="form-row form-row--2">
      <label class="f"><span>Local</span><input type="text" name="location" value="${v('location')}" placeholder="Endereço ou “Online”"></label>
      <label class="f"><span>Link do evento</span><input type="url" name="url" value="${v('url')}" placeholder="https://"><small class="hint">Pode preencher depois. Enquanto estiver vazio, a página avisa que o link será divulgado em breve.</small></label>
    </div>
    <div class="form-row"><label class="f"><span>Organização</span><input type="text" name="organizer_name" value="${v('organizer_name')}" placeholder="Ex.: Vértuz"></label></div>
  </section>

  <section class="card">
    ${head(ICONS.image, 'Imagem de destaque', 'PNG, JPG ou WebP até 8 MB · ideal 1600 × 900')}
    <div class="heroimg">
      <div class="heroimg__preview" id="heroPreview" style="${hero ? `background-image:url('${hero}')` : ''}">${hero ? '' : `<span>${ICONS.image}<br>Sem imagem · usa a do template</span>`}</div>
      <div class="heroimg__ctl">
        <label class="btn btn--soft btn--file">${ICONS.download} Escolher imagem<input type="file" name="hero" accept="image/png,image/jpeg,image/webp" id="heroInput"></label>
        ${hero ? `<label class="check check--inline"><input type="checkbox" name="remove_hero"><span>Remover imagem</span></label>` : ''}
      </div>
    </div>
  </section>

  <section class="card">
    ${head(ICONS.bolt, 'Webhook', 'Opcional')}
    <div class="form-row"><label class="f"><span>URL do webhook deste evento</span><input type="url" name="webhook_url" value="${v('webhook_url')}" placeholder="https://" maxlength="500"><small class="hint">Em branco, usa o webhook da pasta e, se a pasta não tiver, o das ${settingsLink}. ${WEBHOOK_HINT}</small></label></div>
  </section>

  <section class="card">
    ${head(ICONS.palette, 'Personalização', 'Aparência e campos da página')}
    <div class="modes" role="radiogroup">
      <label class="mode"><input type="radio" name="settings_mode" value="default" ${mode === 'default' ? 'checked' : ''}><span><b>Configurações padrão</b><small>Usa o template <em>${esc(defTpl.name)}</em> e os campos definidos nas ${settingsLink}.</small></span></label>
      <label class="mode"><input type="radio" name="settings_mode" value="custom" ${mode === 'custom' ? 'checked' : ''}><span><b>Configurações personalizadas</b><small>Escolha um template e os campos só para este evento.</small></span></label>
    </div>
  </section>

  <div class="custom stack" id="customBlock" ${mode === 'custom' ? '' : 'hidden'}>
    <section class="card">
      ${head(ICONS.palette, 'Aparência', 'Template deste evento')}
      ${templatePicker('template', own.template, ev?.id ? `?event=${ev.id}` : '')}
    </section>
    <section class="card">
      ${head(ICONS.sliders, 'Campos visíveis')}
      ${fieldChecks('fields_', own.fields)}
      ${EMAIL_HINT}
    </section>
  </div>

  <div class="actions actions--sticky">
    <button class="btn btn--primary" type="submit" name="after" value="stay">${ICONS.check} Salvar</button>
    <button class="btn btn--soft" type="submit" name="after" value="view">${ICONS.external} Salvar e ver página</button>
    <a class="btn btn--ghost" href="/admin${ev?.folder_id ? `?folder=${ev.folder_id}` : ''}">Cancelar</a>
  </div>
</form>`;
  return layout({ title: isNew ? 'Novo evento' : ev.title, body, flash, error, nav });
}

export { DEFAULT_FIELDS };
