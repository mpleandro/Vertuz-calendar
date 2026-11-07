// Registro de templates da página pública.
// Para criar um novo: adicione uma entrada aqui e uma pasta public/templates/<id>/ com style.css (+ thumb.jpg).

export const DEFAULT_TEMPLATE = 'vertuz';

export const TEMPLATES = {
  vertuz: {
    id: 'vertuz',
    name: 'Vértuz',
    description: 'Azul profundo, cards de vidro e céu estrelado.',
    fonts: ['https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap'],
    themeColor: '#00050d',
    favicon: '/brand/mascot.png',
    heroDefault: '/brand/hero-default.jpg',
    tag: 'Evento',
    logo: '<span class="logo-vertuz"><span class="logo-vertuz__dot"></span>Vértuz</span>',
    footerMark: '<img class="footer__mark" src="/brand/mascot.png" alt="" width="40" height="40">',
    poweredBy: 'Agenda inteligente por <b>Vértuz</b>',
  },
  ignis: {
    id: 'ignis',
    name: 'IGNIS',
    description: 'Preto, laranja e tipografia de impacto. Clima de laboratório ao vivo.',
    fonts: ['https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap'],
    themeColor: '#080808',
    favicon: '/templates/ignis/logo.png',
    heroDefault: '/templates/ignis/hero.jpg',
    tag: 'Ao vivo',
    logo: '<img class="logo-ignis" src="/templates/ignis/logo.png" alt="Método Ignis" width="132" height="35">',
    footerMark: '<img class="footer__mark footer__mark--ignis" src="/templates/ignis/logo.png" alt="" width="120" height="32">',
    poweredBy: 'Método <b>Ignis</b>',
  },
  plenitude: {
    id: 'plenitude',
    name: 'Jornada Plenitude',
    description: 'Verde profundo, dourado e serifas elegantes.',
    fonts: ['https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap'],
    themeColor: '#0b1309',
    favicon: '/templates/plenitude/logo.svg',
    heroDefault: '',
    tag: 'Mentoria',
    logo: '<img class="logo-plenitude" src="/templates/plenitude/logo.svg" alt="Mentoria Jornada Plenitude" width="220" height="97">',
    footerMark: '<img class="footer__mark footer__mark--plenitude" src="/templates/plenitude/ornament.svg" alt="" width="320" height="9">',
    poweredBy: 'Mentoria <b>Jornada Plenitude</b>',
  },
  milmilionarios: {
    id: 'milmilionarios',
    name: 'Mentoria Mil Milionários',
    description: 'Marrom, laranja e degradês granulados. Tipografia geométrica.',
    fonts: ['https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap'],
    themeColor: '#2a120e',
    favicon: '/templates/milmilionarios/symbol.png',
    heroDefault: '/templates/milmilionarios/hero.jpg',
    tag: 'Mentoria',
    logo: '<span class="logo-mmm" role="img" aria-label="Mentoria Mil Milionários"></span>',
    footerMark: '<span class="footer__mark logo-mmm-symbol" aria-hidden="true"></span>',
    poweredBy: 'Mentoria <b>Mil Milionários</b>',
  },
};

export const TEMPLATE_LIST = Object.values(TEMPLATES);

export function getTemplate(id) {
  return TEMPLATES[id] || TEMPLATES[DEFAULT_TEMPLATE];
}
