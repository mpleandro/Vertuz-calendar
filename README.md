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
