# Vértuz Agenda

Páginas de evento com botão **"Salvar na minha agenda"** que funciona em iPhone, Android, Mac, Windows, Google Agenda, Outlook e Yahoo, mais um painel admin para criar e personalizar cada evento.

## Rodando local

```bash
cp .env.example .env     # edite ADMIN_PASSWORD e SESSION_SECRET
npm install
npm start                # http://localhost:3000/admin
```

## Como funciona o botão

| Dispositivo detectado | Ação padrão | Mecanismo |
|---|---|---|
| iPhone / iPad / Mac | Apple Calendar | Download de `.ics` (`/e/<slug>/evento.ics`) |
| Android / Windows / outros | Google Agenda | Deep link com o evento preenchido |
| Menu "outras opções" | Google, Apple, Outlook.com, Office 365, Yahoo, `.ics` | Sempre disponível |

O `.ics` usa um `UID` fixo por evento: se você editar a data e a pessoa salvar de novo, o calendário atualiza em vez de duplicar. O horário é convertido para UTC a partir do fuso escolhido no admin.

## Painel admin

| Menu | O que faz |
|---|---|
| Início | Botão grande para criar evento e a lista de eventos, com atalho para o dashboard |
| Dashboard | Soma de agendamentos, visitas, e-mails e conversão de todos os eventos, ou de um só pelo filtro |
| Configurações gerais | Template e campos visíveis aplicados a todos os eventos em "configurações padrão" |
| Eventos | Um item por evento. Básico, Quando e Conteúdo sempre; Aparência e Campos só se "personalizadas" |

## Templates

| id | Nome | Fonte usada | Observação |
|---|---|---|---|
| `vertuz` | Vértuz | Satoshi | Identidade original |
| `plenitude` | Jornada Plenitude | Libre Caslon Text + Figtree | Substitutas de Halidary e Sintece, que são fontes próprias do site |
| `milmilionarios` | Mentoria Mil Milionários | Montserrat | Substituta de Gotham; símbolo e logo extraídos do manual |

Para adicionar um template: crie uma entrada em `src/templates.js` e uma pasta `public/templates/<id>/` com `style.css` e `thumb.jpg`. A marcação HTML é a mesma para todos; o template só define variáveis e decoração em CSS.

## E-mail obrigatório

Com o campo ligado, a página não envia ao navegador o local, o link do evento nem os links de calendário. Depois que o visitante informa o e-mail, o servidor devolve um token assinado que libera o link e o `.ics`. Sem token válido, `/e/<slug>/evento.ics` responde 403.

## Link pendente

O link do evento pode ser preenchido depois. Enquanto estiver vazio, a página mostra o aviso "Evento em preparação" e marca o link como pendente, e o calendário do visitante registra que o link ainda não foi divulgado. No admin, o evento aparece com o selo "Link pendente".

## Webhooks

O webhook dispara **somente quando o visitante salva/baixa o evento** na agenda (Google, Apple, Outlook, Office 365, Yahoo ou arquivo .ics). Informar o e-mail sozinho não dispara.

- `event.saved`: o visitante escolheu uma agenda. Leva o e-mail/nome (se informados) e a origem (UTM + referrer).
- `webhook.test`: enviado pelo botão "Salvar e enviar teste" nas configurações gerais.

**Qual URL recebe:** a do evento (campo *Webhook* no formulário do evento). Se estiver vazia, vale a URL geral (*Configurações gerais > Webhook*). Sem nenhuma das duas, nada é enviado. Rascunhos e pré-visualizações não disparam.

**Cabeçalhos:** `X-Vertuz-Event` (tipo), `X-Vertuz-Delivery` (id único, útil para ignorar repetidos) e, se houver segredo configurado, `X-Vertuz-Signature: sha256=<HMAC-SHA256 do corpo>`.

**Entrega:** em segundo plano, com até 3 tentativas (na hora, +5 s, +30 s). Respostas 4xx (exceto 408/429) não são repetidas. Falhas aparecem no log.

```json
{
  "id": "whk_8f3c2a1e-6b4d-4f0a-9c2e-1d7b5a9e3f10",
  "type": "event.saved",
  "version": 1,
  "occurred_at": "2026-11-09T10:45:12-03:00",
  "source": "https://cal.vertuzclub.com.br",
  "webhook_scope": "event",
  "event": {
    "id": 12, "uid": "…@vertuz-agenda", "slug": "imersao", "title": "Imersão", "subtitle": "",
    "status": "published", "template": "vertuz", "timezone": "America/Sao_Paulo",
    "start": "2026-11-20T19:00:00-03:00", "end": "2026-11-20T21:00:00-03:00",
    "location": "Av. Paulista, 1000", "online_url": "https://zoom.us/j/123", "organizer_name": "Vértuz",
    "page_url": "https://cal.vertuzclub.com.br/e/imersao", "require_email": true
  },
  "click": { "calendar": "google", "platform": "ios", "created_at": "2026-11-09T10:45:12-03:00" },
  "lead": { "email": "maria@exemplo.com", "name": "Maria" },
  "utm": { "source": "instagram", "medium": "stories", "campaign": "black-friday", "content": "", "term": "" },
  "referrer": "instagram.com"
}
```

`lead` é `null` quando o visitante não informou e-mail.

## UTM e fontes

Use links como `https://cal.vertuzclub.com.br/e/imersao?utm_source=instagram&utm_medium=stories&utm_campaign=black-friday`. A página guarda os parâmetros na sessão do navegador e envia junto com o e-mail e o clique em salvar.

- **Fonte** = `utm_source` (em minúsculas). Sem UTM, vale o site de onde a pessoa veio (ex.: `youtube.com`). Sem nenhum dos dois, aparece como *Direto*.
- O dashboard mostra agendamentos **por fonte** e **por campanha**, e a fonte de cada e-mail.
- O CSV de e-mails traz `fonte`, todos os `utm_*` e `referrer`.

## Rotas

| Rota | Descrição |
|---|---|
| `GET /e/:slug` | Página pública do evento (404 se rascunho) |
| `GET /e/:slug?preview=1` | Pré-visualização (admin logado vê rascunhos) |
| `GET /e/:slug/evento.ics` | Arquivo iCalendar |
| `POST /e/:slug/lead` | Grava e-mail; se e-mail obrigatório, devolve token e links |
| `GET /e/:slug/access?t=` | Revalida um acesso já liberado |
| `POST /e/:slug/click` | Métrica de clique por calendário/dispositivo |
| `GET /admin` | Painel |
| `GET /admin/dashboard?event=` | Dashboard geral ou de um evento |
| `GET /admin/settings` | Configurações gerais |
| `GET /admin/templates/:id/preview` | Prévia de um template |
| `GET /admin/leads.csv?event=` | Exporta e-mails |

## Deploy na VPS (Docker + Caddy)

```bash
git clone https://github.com/mpleandro/Vertuz-calendar.git && cd Vertuz-calendar
cp .env.example .env
nano .env                       # senha forte em ADMIN_PASSWORD e SESSION_SECRET de 64 caracteres
docker compose up -d --build
```

Gere o segredo com `openssl rand -hex 32`. O domínio `cal.vertuzclub.com.br` já está no `Caddyfile`.

Em produção o app **não sobe** se `ADMIN_PASSWORD` for `admin` ou `TROQUE-ESTA-SENHA`, ou se `SESSION_SECRET` for o padrão de desenvolvimento. Outros valores fracos geram só um aviso no log.

Se usar um painel (Easypanel, Coolify, Dokploy) em vez do `docker-compose.yml`: aponte para este repositório com o `Dockerfile`, porta interna `3000`, defina as variáveis do `.env` no painel e monte volumes persistentes em `/app/data` e `/app/uploads`.

### Erro 502 no domínio

O proxy está no ar, mas o app não respondeu. Veja o log do contêiner (`docker compose logs app` ou a aba de logs do painel). Se aparecer `ERRO: defina ADMIN_PASSWORD e SESSION_SECRET`, troque os valores no `.env` ou nas variáveis do painel e reinicie. O endereço `/healthz` responde `{"ok":true}` quando o app está saudável.

Dados ficam em `data/` (SQLite) e imagens em `uploads/`. Faça backup dessas duas pastas.

## Estrutura

```
server.js              entrada Express
src/db.js              schema SQLite + queries
src/ics.js             gerador iCalendar (RFC 5545)
src/calendarLinks.js   deep links Google / Outlook / Yahoo
src/time.js            fuso horário, formatação pt-BR
src/auth.js            sessão do admin (cookie assinado)
src/routes/public.js   página pública, .ics, leads, cliques
src/routes/admin.js    CRUD de eventos, upload, leads, CSV
src/templates.js       registro dos templates
src/views/             HTML (página do evento + admin)
public/css, public/js  estilos e scripts (event-base.css = layout responsivo comum)
public/templates/<id>/ estilo, logos e miniatura de cada template
public/brand/          mascote, fundo estrelado, imagem padrão
```
