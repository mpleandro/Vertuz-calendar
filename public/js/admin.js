(function () {
  var $ = function (id) { return document.getElementById(id); };

  // ---- menu (gaveta no celular) ----
  var openBtn = $('navOpen'), closeBtn = $('navClose'), scrim = $('scrim');
  function setNav(open) {
    document.body.classList.toggle('nav-open', open);
    if (scrim) scrim.hidden = !open;
    if (openBtn) openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (openBtn) openBtn.addEventListener('click', function () { setNav(true); });
  if (closeBtn) closeBtn.addEventListener('click', function () { setNav(false); });
  if (scrim) scrim.addEventListener('click', function () { setNav(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });

  // ---- slug automático ----
  var title = $('titleInput'), slug = $('slugInput');
  function slugify(s, keepTrailing) {
    var out = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '');
    if (!keepTrailing) out = out.replace(/-+$/, '');
    return out.slice(0, 80);
  }
  if (title && slug) {
    var touched = slug.value.length > 0;
    slug.addEventListener('input', function () { touched = true; slug.value = slugify(slug.value, true); });
    title.addEventListener('input', function () { if (!touched) slug.value = slugify(title.value); });
  }

  // ---- padrão x personalizado ----
  var custom = $('customBlock');
  document.querySelectorAll('input[name=settings_mode]').forEach(function (r) {
    r.addEventListener('change', function () { if (custom) custom.hidden = r.value !== 'custom' || !r.checked; });
  });

  // ---- e-mail obrigatório implica pedir e-mail ----
  document.querySelectorAll('.checks').forEach(function (group) {
    var req = group.querySelector('[data-field=requireEmail]'), ask = group.querySelector('[data-field=askEmail]');
    if (!req || !ask) return;
    function sync() {
      if (req.checked) ask.checked = true;
      ask.disabled = req.checked;
      ask.closest('.check').classList.toggle('is-disabled', req.checked);
    }
    req.addEventListener('change', sync); sync();
    // campo desabilitado não é enviado: reabilita no submit
    var form = group.closest('form');
    if (form) form.addEventListener('submit', function () { ask.disabled = false; });
  });

  // ---- imagem de destaque ----
  var heroInput = $('heroInput'), heroPreview = $('heroPreview');
  if (heroInput && heroPreview) heroInput.addEventListener('change', function () {
    var f = heroInput.files && heroInput.files[0];
    if (!f) return;
    heroPreview.style.backgroundImage = 'url(' + URL.createObjectURL(f) + ')';
    heroPreview.innerHTML = '';
  });

  // ---- copiar link ----
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(b.dataset.copy).then(function () {
        var old = b.innerHTML; b.textContent = 'Copiado!'; setTimeout(function () { b.innerHTML = old; }, 1500);
      });
    });
  });

  // ---- confirmação ----
  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) { if (!confirm(f.dataset.confirm)) e.preventDefault(); });
  });

  // ---- filtro do dashboard ----
  document.querySelectorAll('[data-autosubmit]').forEach(function (s) {
    s.addEventListener('change', function () {
      if (s.dataset.reset && s.form.elements[s.dataset.reset]) s.form.elements[s.dataset.reset].value = '';
      s.form.submit();
    });
  });

  // ---- menus "mais ações": fecha ao clicar fora / abrir outro ----
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.more[open], details.newfolder[open]').forEach(function (d) { if (!d.contains(e.target)) d.open = false; });
  });
  // "Nova pasta" pelo link do menu (#nova-pasta)
  function openNewFolder() {
    var d = $('nova-pasta'); if (!d || location.hash !== '#nova-pasta') return;
    d.open = true; setNav(false); var i = d.querySelector('input'); if (i) setTimeout(function () { i.focus(); }, 50);
  }
  openNewFolder(); window.addEventListener('hashchange', openNewFolder);

  // ---- tooltip dos gráficos ----
  var tip = $('tooltip');
  function show(el, x, y) { tip.innerHTML = el.getAttribute('data-tip'); tip.hidden = false; tip.style.left = x + 'px'; tip.style.top = y + 'px'; }
  document.querySelectorAll('[data-tip]').forEach(function (el) {
    el.addEventListener('mousemove', function (e) { show(el, e.clientX, e.clientY); });
    el.addEventListener('mouseleave', function () { tip.hidden = true; });
    el.addEventListener('touchstart', function (e) { var t = e.touches[0]; show(el, t.clientX, t.clientY); setTimeout(function () { tip.hidden = true; }, 1800); }, { passive: true });
  });
})();
