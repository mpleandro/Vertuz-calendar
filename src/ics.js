import { zonedToUtc, toIcsUtc, addMinutes } from './time.js';

function esc(s = '') {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// RFC 5545: linhas com no máximo 75 octetos, continuação com espaço.
function fold(line) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > (out.length ? 74 : 75)) { out.push(cur); cur = ch; }
    else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** Resolve início/fim em UTC a partir do evento. */
export function eventTimes(ev) {
  const start = zonedToUtc(ev.start_local, ev.timezone);
  const end = ev.end_local ? zonedToUtc(ev.end_local, ev.timezone) : addMinutes(start, 60);
  return { start, end: end > start ? end : addMinutes(start, 60) };
}

export function buildIcs(ev, { baseUrl }) {
  const { start, end } = eventTimes(ev);
  const pageUrl = `${baseUrl}/e/${ev.slug}`;
  const descParts = [ev.description, ev.details].filter(Boolean);
  if (ev.url) descParts.push(`Link: ${ev.url}`);
  else descParts.push('Link do evento: ainda não divulgado. Acompanhe pela página do evento.');
  descParts.push(`Página do evento: ${pageUrl}`);
  const description = descParts.join('\n\n');
  const seq = Math.floor(new Date((ev.updated_at || '2000-01-01 00:00:00').replace(' ', 'T') + 'Z').getTime() / 1000) % 2147483647;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vertuz//Agenda//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${ev.uid}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${esc(ev.title)}`,
    `DESCRIPTION:${esc(description)}`,
    `X-ALT-DESC;FMTTYPE=text/html:${esc(description.replace(/\n/g, '<br>'))}`,
    ev.location ? `LOCATION:${esc(ev.location)}` : null,
    `URL:${esc(ev.url || pageUrl)}`,
    ev.organizer_name ? `ORGANIZER;CN=${esc(ev.organizer_name)}:mailto:noreply@vertuz.app` : null,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    `SEQUENCE:${seq}`,
  ].filter(Boolean);

  if (ev.reminder_minutes && ev.reminder_minutes > 0) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.title)}`, `TRIGGER:-PT${ev.reminder_minutes}M`, 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
