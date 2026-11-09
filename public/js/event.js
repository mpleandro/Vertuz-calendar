(function () {
  var body = document.body;
  var slug = body.dataset.slug;
  var cfg = window.__EVENT__ || {};
  var state = { links: cfg.links, gated: body.dataset.gated === '1', unlocked: false };
  var requireEmail = body.dataset.requireEmail === '1';
  var $ = function (id) { return document.getElementById(id); };

  // ---- Plataforma -------------------------------------------------------------
  var ua = navigator.userAgent || '';
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);
  var isMac = /Macintosh/.test(ua) && !isIOS;
  var isWindows = /Windows/.test(ua);
  var platform = isIOS ? 'ios' : isAndroid ? 'android' : isMac ? 'mac' : isWindows ? 'windows' : 'other';
  var NAMES = { google: 'Google Agenda', apple: 'Apple Calendar', outlook: 'Outlook.com', office365: 'Office 365', yahoo: 'Yahoo Calendar', ics: 'arquivo .ics' };
  var primary = (isIOS || isMac) ? 'apple' : 'google';
  if ($('saveHint')) $('saveHint').textContent = NAMES[primary];

  // ---- Origem (UTM + referrer) -------------------------------------------------
  // Guardada na sessão para sobreviver a recarregamentos sem os parâmetros na URL.
  var origin = {};
  (function () {
    var key = 'va:origin:' + slug, keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    var params = new URLSearchParams(location.search), fromUrl = {}, has = false;
    keys.forEach(function (k) { var v = params.get(k); if (v) { fromUrl[k] = v; has = true; } });
    var stored = null;
    try { stored = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (_) {}
    if (has) { fromUrl.referrer = document.referrer || ''; origin = fromUrl; }
    else if (stored) origin = stored;
    else origin = { referrer: document.referrer || '' };
    try { sessionStorage.setItem(key, JSON.stringify(origin)); } catch (_) {}
  })();
  function withOrigin(data) { for (var k in origin) data[k] = origin[k]; return data; }

  // ---- Contagem regressiva -----------------------------------------------------
  var cd = $('countdown');
  var startAt = new Date(body.dataset.start).getTime();
  function tick() {
    if (!cd) return;
    var diff = Math.max(0, startAt - Date.now());
    var d = Math.floor(diff / 864e5); diff -= d * 864e5;
    var h = Math.floor(diff / 36e5); diff -= h * 36e5;
    var m = Math.floor(diff / 6e4); diff -= m * 6e4;
    var s = Math.floor(diff / 1e3);
    cd.querySelector('[data-cd=d]').textContent = d;
    cd.querySelector('[data-cd=h]').textContent = String(h).padStart(2, '0');
    cd.querySelector('[data-cd=m]').textContent = String(m).padStart(2, '0');
    cd.querySelector('[data-cd=s]').textContent = String(s).padStart(2, '0');
  }
  tick(); setInterval(tick, 1000);

  // ---- Opções -----------------------------------------------------------------
  var moreBtn = $('moreOptionsBtn'), options = $('options');
  function toggleOptions(force) {
    if (!options) return;
    var open = force === undefined ? options.hidden : force;
    options.hidden = !open;
    if (moreBtn) { moreBtn.classList.toggle('is-open', open); moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  }
  if (moreBtn) moreBtn.addEventListener('click', function () { toggleOptions(); });
  if ($('switchBtn')) $('switchBtn').addEventListener('click', function () { toggleOptions(true); options.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  if (options) options.querySelectorAll('.option').forEach(function (el) {
    el.addEventListener('click', function (e) { e.preventDefault(); save(el.dataset.cal); });
  });

  // ---- Formulário ---------------------------------------------------------------
  var form = $('saveForm');
  var emailInput = form && form.querySelector('input[name=email]');
  var nameInput = form && form.querySelector('input[name=name]');
  var errorEl = $('formError');

  function showError(msg) { if (!errorEl) return; errorEl.textContent = msg; errorEl.hidden = !msg; }
  function validEmail() {
    if (!emailInput) return true;
    var v = emailInput.value.trim();
    var ok = v === '' ? !requireEmail : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    showError(ok ? '' : (v === '' ? 'Informe seu e-mail para liberar o acesso.' : 'Digite um e-mail válido.'));
    if (!ok) { emailInput.focus(); emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    return ok;
  }

  function urlFor(cal) { return (cal === 'apple' || cal === 'ics') ? state.links.ics : (state.links[cal] || state.links.google); }
  function openCal(cal, win) {
    var url = urlFor(cal);
    if (cal === 'apple' || cal === 'ics') { if (win) win.close(); window.location.href = url; return; }
    if (win) { win.location.href = url; return; }
    var w = window.open(url, '_blank');
    if (w) { try { w.opener = null; } catch (_) {} } else { window.location.href = url; }
  }

  var busy = false;
  function save(cal) {
    if (busy) return;
    if (!validEmail()) return;
    track(cal);
    var email = emailInput ? emailInput.value.trim() : '';

    if (state.gated && !state.unlocked) {
      // Abre a aba já no clique (senão o navegador bloqueia o pop-up depois do await).
      var win = (cal !== 'apple' && cal !== 'ics') ? window.open('about:blank', '_blank') : null;
      busy = true; setLoading(true);
      postJSON('/e/' + slug + '/lead', withOrigin({ email: email, name: nameInput ? nameInput.value.trim() : '', calendar: cal, platform: platform }))
        .then(function (data) {
          if (!data || !data.links) throw new Error('sem acesso');
          try { localStorage.setItem('va:' + slug, JSON.stringify({ t: data.token, email: email })); } catch (_) {}
          unlock(data, email);
          toast(cal);
          openCal(cal, win);
        })
        .catch(function () { if (win) win.close(); showError('Não foi possível liberar o acesso. Tente novamente.'); })
        .then(function () { busy = false; setLoading(false); });
      return;
    }

    if (email && !state.leadSent) {
      state.leadSent = true;
      postJSON('/e/' + slug + '/lead', withOrigin({ email: email, name: nameInput ? nameInput.value.trim() : '', calendar: cal, platform: platform })).catch(function () {});
    }
    toast(cal);
    openCal(cal, null);
  }

  function unlock(data, email) {
    state.links = data.links; state.unlocked = true;
    body.classList.add('is-unlocked');
    var row = $('urlRow');
    if (row && data.url) {
      row.href = data.url; row.classList.remove('row--locked');
      $('urlText').textContent = data.url.replace(/^https?:\/\//, '');
      var icon = row.querySelector('.row__icon');
      if (icon) icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1-1"/></svg>';
    }
    var loc = $('locRow');
    if (loc && data.location) {
      loc.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(data.location);
      loc.classList.remove('row--locked');
      $('locText').textContent = data.location;
      var li = loc.querySelector('.row__icon');
      if (li) li.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
    }
    if ($('emailField')) $('emailField').hidden = true;
    if ($('nameField')) $('nameField').hidden = true;
    if ($('unlockedNote')) { $('unlockedNote').hidden = false; $('unlockedEmail').textContent = email; }
    document.querySelectorAll('.btn__label').forEach(function (l) { l.textContent = cfg.ctaLabel; });
    document.querySelectorAll('.btn .btn__icon').forEach(function (i) { i.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'; });
    showError('');
  }

  // Visitante que já liberou o acesso antes neste navegador
  if (state.gated) {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('va:' + slug) || 'null'); } catch (_) {}
    if (saved && saved.t) {
      fetch('/e/' + slug + '/access?t=' + encodeURIComponent(saved.t)).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) { if (data && data.links) unlock(data, saved.email || ''); }).catch(function () {});
    }
  }

  function setLoading(on) { document.querySelectorAll('.btn--primary').forEach(function (b) { b.classList.toggle('is-loading', on); }); }

  if (form) form.addEventListener('submit', function (e) { e.preventDefault(); save(primary); });
  var stickyBtn = $('stickyBtn');
  if (stickyBtn) stickyBtn.addEventListener('click', function () {
    if (emailInput && requireEmail && !state.unlocked && !emailInput.value.trim()) {
      $('cta').scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () { emailInput.focus(); }, 400);
      return;
    }
    save(primary);
  });

  // Barra fixa quando o card de ação sai da tela
  var cta = $('cta'), sticky = $('sticky');
  if (cta && sticky && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { sticky.hidden = entries[0].isIntersecting || entries[0].boundingClientRect.top > 0; }, { threshold: 0 }).observe(cta);
  }

  // ---- Rede ---------------------------------------------------------------------
  function track(cal) {
    var data = withOrigin({ calendar: cal, platform: platform, preview: !!cfg.preview });
    var email = emailInput ? emailInput.value.trim() : '';
    if (!email && state.unlocked && $('unlockedEmail')) email = $('unlockedEmail').textContent.trim();
    if (email) { data.email = email; data.name = nameInput ? nameInput.value.trim() : ''; }
    postJSON('/e/' + slug + '/click', data).catch(function () {});
  }
  function postJSON(url, data) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), keepalive: true })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.status === 204 ? null : r.json(); });
  }

  // ---- Toast --------------------------------------------------------------------
  var toastEl = $('toast'), toastTimer;
  function toast(cal) {
    if (!toastEl) return;
    var file = cal === 'apple' || cal === 'ics';
    $('toastTitle').textContent = file ? 'Arquivo do evento pronto' : 'Abrindo ' + (NAMES[cal] || 'sua agenda');
    $('toastSub').textContent = file ? 'Toque em "Adicionar" no seu calendário.' : 'Confirme o evento na nova aba.';
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 5000);
  }
})();
