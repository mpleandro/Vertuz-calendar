// Utilidades de data/hora sem dependências.

/** Converte "YYYY-MM-DDTHH:MM" em um fuso IANA para um Date UTC. */
export function zonedToUtc(localIso, timeZone) {
  const [d, t = '00:00'] = localIso.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, da, h, mi, 0);
  let guess = naive;
  for (let i = 0; i < 2; i++) guess = naive - tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

function tzOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - date.getTime();
}

/** Date -> "20261120T220000Z" */
export function toIcsUtc(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function addMinutes(date, min) {
  return new Date(date.getTime() + min * 60000);
}

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Formata "YYYY-MM-DDTHH:MM" para exibição em pt-BR. */
export function formatLocal(localIso) {
  if (!localIso) return { date: '', time: '', weekday: '', day: '', month: '', monthShort: '' };
  const [d, t = ''] = localIso.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, da));
  return {
    date: `${da} de ${MONTHS[mo - 1]} de ${y}`,
    time: t,
    weekday: WEEKDAYS[dt.getUTCDay()],
    day: String(da).padStart(2, '0'),
    month: MONTHS[mo - 1],
    monthShort: MONTHS[mo - 1].slice(0, 3).toUpperCase(),
  };
}

export function tzLabel(tz) {
  try {
    const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date());
    return parts.find(p => p.type === 'timeZoneName')?.value || tz;
  } catch { return tz; }
}

/** Offset atual do fuso em minutos (ex.: São Paulo = -180). */
export function tzOffsetMinutes(tz) {
  try {
    const now = new Date();
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(now).map(x => [x.type, x.value]));
    return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - now.getTime()) / 60000);
  } catch { return 0; }
}
