import { esc, nl2br, ICONS } from './helpers.js';
import { formatLocal, tzLabel } from '../time.js';
import { eventTimes } from '../ics.js';
import { getTemplate } from '../templates.js';

/**
 * Página pública do evento. A marcação é a mesma para todos os templates;
 * cada template muda o visual por CSS (public/templates/<id>/style.css).
 *
 * links = null quando o e-mail é obrigatório: link do evento e .ics só chegam
 * ao navegador depois que o visitante informa o e-mail.
 */
export function renderEventPage(ev, { baseUrl, links, preview = false, templateOverride = null }) {
  const tpl = getTemplate(templateOverride || ev.template);
  const f = ev.fields;
  const gated = !!f.requireEmail;
  const start = formatLocal(ev.start_local);
  const end = ev.end_local ? formatLocal(ev.end_local) : null;
  const { start: startUtc } = eventTimes(ev);
  const pageUrl = `${baseUrl}/e/${ev.slug}`;
  const heroSrc = ev.hero_image ? `/uploads/${esc(ev.hero_image)}` : tpl.heroDefault;
  const hasHeroImg = f.showHero && !!heroSrc;
  const ogImage = ev.hero_image ? `${baseUrl}/uploads/${esc(ev.hero_image)}` : (tpl.heroDefault ? `${baseUrl}${tpl.heroDefault}` : '');
  const closed = ev.status === 'closed';
  const sameDay = end && end.date === start.date;
  const timeLabel = end && sameDay ? `${start.time} – ${end.time}` : start.time;
  const tz = tzLabel(ev.timezone);
  const cta = esc(ev.cta_label || 'Salvar na minha agenda');
  const linkPending = f.showUrl && !ev.url;
  const opt = (cal, icon, label) => links && !gated
    ? `<a class="option" data-cal="${cal}" href="${esc(cal === 'apple' || cal === 'ics' ? links.ics : links[cal])}"${cal === 'ics' ? ` download="${esc(ev.slug)}.ics"` : ' target="_blank" rel="noopener"'}>${icon}<span>${label}</span></a>`
    : `<button type="button" class="option" data-cal="${cal}">${icon}<span>${label}</span></button>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(ev.title)}</title>
<meta name="description" content="${esc(ev.subtitle || (ev.description || '').slice(0, 150))}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(ev.title)}">
<meta property="og:description" content="${esc(start.weekday)}, ${esc(start.date)} às ${esc(start.time)}${ev.subtitle ? ' · ' + esc(ev.subtitle) : ''}">
${ogImage ? `<meta property="og:image" content="${ogImage}">` : ''}
<meta property="og:url" content="${pageUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="${tpl.themeColor}">
<link rel="icon" href="${tpl.favicon}">
${tpl.fonts.map(h => `<link rel="stylesheet" href="${h}">`).join('\n')}
<link rel="stylesheet" href="/css/event-base.css">
<link rel="stylesheet" href="/templates/${tpl.id}/style.css">
</head>
<body class="tpl tpl-${tpl.id}${gated ? ' is-gated' : ''}" data-slug="${esc(ev.slug)}" data-start="${startUtc.toISOString()}" data-gated="${gated ? 1 : 0}" data-require-email="${f.requireEmail ? 1 : 0}" data-closed="${closed ? 1 : 0}">
<div class="bg" aria-hidden="true"></div>
${preview ? `<div class="preview-bar">Pré-visualização · template <b>${esc(tpl.name)}</b> · status <b>${esc({ draft: 'rascunho', published: 'publicado', closed: 'encerrado' }[ev.status] || ev.status)}</b></div>` : ''}

<main class="page">
  <header class="hero${hasHeroImg ? ' hero--img' : ' hero--noimg'}${f.showHero ? '' : ' hero--compact'}">
    ${hasHeroImg ? `<div class="hero__img" style="background-image:url('${heroSrc}')"></div>` : ''}
    <div class="hero__top">
      <div class="brand">${tpl.logo}</div>
      <span class="tag">${ICONS.calendar}<span>${esc(tpl.tag)}</span></span>
    </div>
    <div class="hero__content">
      <div class="hero__title">
        <h1>${esc(ev.title)}</h1>
        ${f.showSubtitle && ev.subtitle ? `<p class="subtitle">${esc(ev.subtitle)}</p>` : ''}
        <div class="divider" aria-hidden="true"></div>
      </div>
    <div class="hero__body">
      <div class="datechip"><div class="datechip__month">${esc(start.monthShort)}</div><div class="datechip__day">${esc(start.day)}</div></div>
      <div class="hero__meta">
        <div class="hero__weekday">${esc(start.weekday)}</div>
        <div class="hero__time">${ICONS.clock}<span>${esc(timeLabel)}</span><span class="tz">${esc(tz)}</span></div>
      </div>
    </div>
    </div>
  </header>

  ${closed ? `
  <section class="card card--closed">
    <div class="card__label">Evento encerrado</div>
    <p>Este evento já aconteceu ou as inscrições foram encerradas.</p>
  </section>` : ''}

  ${f.showCountdown && !closed ? `
  <section class="countdown" id="countdown" aria-label="Contagem regressiva">
    <div class="countdown__tile"><b data-cd="d">--</b><span>dias</span></div>
    <div class="countdown__tile"><b data-cd="h">--</b><span>horas</span></div>
    <div class="countdown__tile"><b data-cd="m">--</b><span>min</span></div>
    <div class="countdown__tile"><b data-cd="s">--</b><span>seg</span></div>
  </section>` : ''}

  ${!closed ? `
  <section class="card card--cta" id="cta">
    <div class="cta__head">
      <div class="cta__title">${gated ? 'Receba o acesso e salve na sua agenda' : 'Garanta seu lugar na sua agenda'}</div>
      <div class="cta__sub">${gated ? 'Informe seu e-mail para liberar o local, o link do evento e o arquivo da agenda.' : `Lembrete automático ${ev.reminder_minutes > 0 ? `${reminderLabel(ev.reminder_minutes)} antes` : 'desativado'}`}</div>
    </div>
    ${linkPending ? `<p class="notice">${ICONS.clock}<span><b>Evento em preparação.</b> O link ainda não foi divulgado. Salve na agenda agora e volte a esta página para acessá-lo quando estiver disponível.</span></p>` : ''}
    <form id="saveForm" class="cta__form" novalidate>
      ${f.askName ? `<label class="field" id="nameField"><span>Seu nome</span><input type="text" name="name" placeholder="Como quer ser chamado" autocomplete="name"></label>` : ''}
      ${f.askEmail ? `<label class="field" id="emailField"><span>Seu e-mail ${f.requireEmail ? '' : '<em>(opcional)</em>'}</span><input type="email" name="email" placeholder="voce@email.com" autocomplete="email" inputmode="email" ${f.requireEmail ? 'required' : ''}></label>` : ''}
      <p class="unlocked-note" id="unlockedNote" hidden>${ICONS.check}<span>Acesso liberado para <b id="unlockedEmail"></b></span></p>
      <button type="submit" class="btn btn--primary" id="saveBtn">
        <span class="btn__icon">${gated ? ICONS.lock : ICONS.calendar}</span>
        <span class="btn__label" id="saveLabel">${gated ? 'Liberar acesso e salvar' : cta}</span>
      </button>
      <p class="field-error" id="formError" role="alert" hidden></p>
      <p class="cta__hint">Vai abrir no <b id="saveHint">seu calendário</b> · <button type="button" class="cta__switch" id="switchBtn">trocar</button></p>
    </form>
    <button type="button" class="link-btn" id="moreOptionsBtn" aria-expanded="false" aria-controls="options">Outras opções de calendário ${ICONS.chevron}</button>
    <div class="options" id="options" hidden>
      ${opt('google', ICONS.google, 'Google Agenda')}
      ${opt('apple', ICONS.apple, 'Apple Calendar')}
      ${opt('outlook', ICONS.outlook, 'Outlook.com')}
      ${opt('office365', ICONS.outlook, 'Office 365')}
      ${opt('yahoo', ICONS.yahoo, 'Yahoo Calendar')}
      ${opt('ics', ICONS.download, 'Baixar .ics')}
    </div>
  </section>` : ''}

  ${f.showDescription && ev.description ? `
  <section class="card">
    <div class="card__label">Sobre o evento</div>
    <p class="card__text">${nl2br(ev.description)}</p>
  </section>` : ''}

  ${f.showDetails && ev.details ? `
  <section class="card">
    <div class="card__label">Detalhes</div>
    <p class="card__text">${nl2br(ev.details)}</p>
  </section>` : ''}

  <section class="card card--rows">
    <div class="row"><span class="row__icon">${ICONS.calendar}</span><div class="row__body"><div class="row__label">Quando</div><div class="row__value">${esc(start.weekday)}, ${esc(start.date)} às ${esc(start.time)}${end ? `<br><span class="muted">até ${sameDay ? esc(end.time) : esc(end.date) + ' às ' + esc(end.time)}</span>` : ''}</div></div></div>
    ${f.showLocation && ev.location ? (gated
      ? `<a class="row row--link row--locked" id="locRow" target="_blank" rel="noopener"><span class="row__icon">${ICONS.lock}</span><div class="row__body"><div class="row__label">Onde</div><div class="row__value" id="locText">Liberado após informar seu e-mail</div></div><span class="row__chevron">${ICONS.chevron}</span></a>`
      : `<a class="row row--link" href="${mapsUrl(ev.location)}" target="_blank" rel="noopener"><span class="row__icon">${ICONS.pin}</span><div class="row__body"><div class="row__label">Onde</div><div class="row__value">${esc(ev.location)}</div></div><span class="row__chevron">${ICONS.chevron}</span></a>`) : ''}
    ${linkPending ? `<div class="row row--pending"><span class="row__icon">${ICONS.link}</span><div class="row__body"><div class="row__label">Link do evento</div><div class="row__value">Será divulgado em breve</div></div><span class="badge">Pendente</span></div>` : ''}
    ${f.showUrl && ev.url ? (gated
      ? `<a class="row row--link row--locked" id="urlRow" target="_blank" rel="noopener"><span class="row__icon">${ICONS.lock}</span><div class="row__body"><div class="row__label">Link do evento</div><div class="row__value row__value--url" id="urlText">Liberado após informar seu e-mail</div></div><span class="row__chevron">${ICONS.chevron}</span></a>`
      : `<a class="row row--link" href="${esc(ev.url)}" target="_blank" rel="noopener"><span class="row__icon">${ICONS.link}</span><div class="row__body"><div class="row__label">Link do evento</div><div class="row__value row__value--url">${esc(ev.url.replace(/^https?:\/\//, ''))}</div></div><span class="row__chevron">${ICONS.chevron}</span></a>`) : ''}
    ${ev.organizer_name ? `<div class="row"><span class="row__icon">${ICONS.users}</span><div class="row__body"><div class="row__label">Organização</div><div class="row__value">${esc(ev.organizer_name)}</div></div></div>` : ''}
  </section>

  <footer class="footer">
    ${f.showMascot ? tpl.footerMark : ''}
    ${f.showPoweredBy ? `<div class="footer__text">${tpl.poweredBy}</div>` : ''}
  </footer>
</main>

${!closed ? `
<div class="sticky" id="sticky" hidden>
  <button type="button" class="btn btn--primary" id="stickyBtn"><span class="btn__icon">${gated ? ICONS.lock : ICONS.calendar}</span><span class="btn__label">${gated ? 'Liberar acesso e salvar' : cta}</span></button>
</div>` : ''}

<div class="toast" id="toast" role="status" aria-live="polite" hidden>
  <span class="toast__icon">${ICONS.check}</span>
  <div><b id="toastTitle">Evento enviado para sua agenda</b><span id="toastSub">Confirme no seu calendário.</span></div>
</div>

<script>window.__EVENT__ = ${JSON.stringify({ links: gated ? null : links, ctaLabel: ev.cta_label || 'Salvar na minha agenda', preview: !!preview }).replace(/</g, '\\u003c')};</script>
<script src="/js/event.js" defer></script>
</body>
</html>`;
}

function mapsUrl(q) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function reminderLabel(min) {
  if (min % 1440 === 0) return `${min / 1440} dia${min / 1440 > 1 ? 's' : ''}`;
  if (min % 60 === 0) return `${min / 60} hora${min / 60 > 1 ? 's' : ''}`;
  return `${min} min`;
}
