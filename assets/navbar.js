/* StudyMart - Desktop navbar logic (mobile untouched).
   Handles: active link, search -> courses.html?q=, language BN/EN, theme light/dark, account dropdown, desktop drawer. */
(function () {
  'use strict';

  var I18N = {
    en: { home: 'Home', courses: 'Courses', ebooks: 'Ebooks', free: 'Free Resources', telegram: 'Telegram', searchPh: 'Search courses, subjects, ebooks...', lang: 'বাংলা/English', theme: 'Theme', account: 'Account' },
    bn: { home: 'হোম', courses: 'কোর্স', ebooks: 'ই-বুক', free: 'ফ্রি রিসোর্স', telegram: 'টেলিগ্রাম', searchPh: 'কোর্স, বিষয়, ই-বুক খুঁজুন...', lang: 'বাংলা/English', theme: 'থিম', account: 'অ্যাকাউন্ট' }
  };

  function getLang() { try { return localStorage.getItem('sm_lang') || 'en'; } catch (e) { return 'en'; } }
  function setLang(v) { try { localStorage.setItem('sm_lang', v); } catch (e) {} }
  function getTheme() { try { return localStorage.getItem('sm_theme') || 'light'; } catch (e) { return 'light'; } }
  function setTheme(v) { try { localStorage.setItem('sm_theme', v); } catch (e) {} }
  function getToken() { try { return localStorage.getItem('sm_user_token') || sessionStorage.getItem('sm_user_token') || ''; } catch (e) { return ''; } }

  function applyTheme() {
    var t = getTheme();
    try {
      document.documentElement.classList.toggle('sm-dark', t === 'dark');
      document.documentElement.style.colorScheme = t === 'dark' ? 'dark' : 'light';
    } catch (e) {}
    document.querySelectorAll('[data-sm-theme-icon]').forEach(function (el) {
      el.className = t === 'dark' ? 'fa-solid fa-moon text-[15px] text-[#7AA2FF]' : 'fa-solid fa-sun text-[15px] text-[#F59E0B]';
    });
  }

  // Apply saved theme immediately (no light-flash) — runs before DOMContentLoaded too
  try { applyTheme(); } catch (e) {}
  try {
    window.addEventListener('storage', function (e) {
      if (e && e.key === 'sm_theme') applyTheme();
    });
  } catch (e) {}

  function applyLang() {
    var l = getLang();
    var d = I18N[l] || I18N.en;
    document.documentElement.setAttribute('lang', l === 'bn' ? 'bn' : 'en');
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (d[k]) el.textContent = d[k];
    });
    document.querySelectorAll('[data-i18n-ph="searchPh"]').forEach(function (el) {
      el.setAttribute('placeholder', d.searchPh);
    });
  }

  function paintAccount() {
    var tok = getToken();
    document.querySelectorAll('[data-sm-desk-account-menu]').forEach(function (menu) {
      if (tok) {
        var name = 'Student';
        try {
          var u = JSON.parse(localStorage.getItem('sm_user') || 'null');
          if (u && u.name) name = u.name.split(' ')[0];
        } catch (e) {}
        menu.innerHTML =
          '<div class="px-3 py-2 text-[12px] font-bold text-slate-500">Hi, ' + name.replace(/[<>&"]/g, '') + '</div>' +
          '<a href="dashboard.html"><i class="fa-solid fa-gauge-high w-4 text-center"></i>Dashboard</a>' +
          '<a href="dashboard.html#secOrders"><i class="fa-solid fa-bag-shopping w-4 text-center"></i>My Orders</a>' +
          '<a href="cart.html"><i class="fa-solid fa-cart-shopping w-4 text-center"></i>Cart</a>' +
          '<button type="button" class="sm-mi" data-sm-logout-x><i class="fa-solid fa-right-from-bracket w-4 text-center"></i>Logout</button>';
      } else {
        menu.innerHTML =
          '<a href="auth.html"><i class="fa-solid fa-right-to-bracket w-4 text-center"></i>Login</a>' +
          '<a href="auth.html?tab=signup"><i class="fa-solid fa-user-plus w-4 text-center"></i>Sign Up</a>' +
          '<a href="dashboard.html" data-account-link><i class="fa-solid fa-gauge-high w-4 text-center"></i>Dashboard</a>';
      }
    });
  }

  function markActive() {
    var p = (location.pathname.split('/').pop() || 'index.html').split('?')[0].toLowerCase();
    var key = 'home';
    if (p === 'courses.html' || p === 'course.html' || p === 'batch.html') key = 'courses';
    else if (p === 'ebook.html') key = 'ebooks';
    else if (p === 'index.html' || p === '' ) key = 'home';
    if (p === 'courses.html' && /ebook/i.test(location.search + location.hash)) key = 'ebooks';
    document.querySelectorAll('[data-sm-nav]').forEach(function (a) {
      if (a.getAttribute('data-sm-nav') === key) a.classList.add('sm-active');
      else a.classList.remove('sm-active');
    });
  }

  function closeAllMenus(except) {
    document.querySelectorAll('[data-sm-desk-account-menu],[data-sm-desk-lang-menu]').forEach(function (m) {
      if (m !== except) m.classList.add('hidden');
    });
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]); });
  }

  function goSearch(v) {
    location.href = 'courses.html' + (v ? '?q=' + encodeURIComponent(v) : '');
  }

  /* Live suggestions: typing -> matching courses + ebooks dropdown */
  function bindSuggest(input, box) {
    var timer = null;
    var items = []; // {url}
    var active = -1;

    function hide() {
      box.classList.add('hidden');
      box.innerHTML = '';
      items = [];
      active = -1;
    }

    function paintActive() {
      box.querySelectorAll('.sm-sug-row').forEach(function (row, i) {
        row.classList.toggle('sug-active', i === active);
      });
    }

    function openUrl(url) { if (url) location.href = url; }

    function rowHtml(it) {
      var thumb = it.img
        ? '<img src="' + escHtml(it.img) + '" alt="">'
        : '<i class="fa-solid ' + (it.type === 'ebook' ? 'fa-book-open' : 'fa-book') + '"></i>';
      var price = it.price > 0
        ? '<span class="sm-sug-price">৳' + it.price + '</span>'
        : '<span class="sm-sug-price free">' + (it.type === 'ebook' ? 'FREE' : '৳0') + '</span>';
      return '<div class="sm-sug-thumb">' + thumb + '</div>' +
        '<div class="sm-sug-meta"><div class="sm-sug-title">' + escHtml(it.title) + '</div>' +
        '<div class="sm-sug-sub">' + escHtml(it.sub || '') + '</div></div>' + price;
    }

    function sugRow(it) {
      items.push({ url: it.url });
      return '<div class="sm-sug-row" data-sug="' + (items.length - 1) + '">' + rowHtml(it) + '</div>';
    }

    function render(courses, ebooks, q) {
      items = [];
      var html = '';
      if (courses && courses.length) {
        html += '<div class="sm-sug-group">Courses</div>';
        courses.forEach(function (c) {
          html += sugRow({ url: 'course.html?id=' + c.id, type: 'course', img: c.thumbnail, title: c.title, sub: (c.teacher || c.batchName || c.categoryName || ''), price: Number(c.price) || 0 });
        });
      }
      if (ebooks && ebooks.length) {
        html += '<div class="sm-sug-group">E-Books</div>';
        ebooks.forEach(function (b) {
          html += sugRow({ url: 'ebook.html?id=' + b.id, type: 'ebook', img: b.cover, title: b.title, sub: (b.author ? 'By ' + b.author : (b.ebookBatchName || b.batchName || 'E-Book')), price: Number(b.price) || 0 });
        });
      }
      if (!items.length) {
        box.innerHTML = '<div class="sm-sug-empty">"' + escHtml(q) + '" — kichu pawa jayni</div>' +
          '<button type="button" class="sm-sug-all" data-sug-all>Try full search <i class="fa-solid fa-arrow-right text-[11px]"></i></button>';
      } else {
        box.innerHTML = html + '<button type="button" class="sm-sug-all" data-sug-all>See all results for "' + escHtml(q) + '" <i class="fa-solid fa-arrow-right text-[11px]"></i></button>';
      }
      active = -1;
      box.classList.remove('hidden');
      box.querySelectorAll('.sm-sug-row').forEach(function (row) {
        row.addEventListener('mousedown', function (e) {
          e.preventDefault();
          openUrl(items[Number(row.dataset.sug)].url);
        });
      });
      var allBtn = box.querySelector('[data-sug-all]');
      if (allBtn) allBtn.addEventListener('mousedown', function (e) { e.preventDefault(); goSearch(q); });
    }

    async function lookup(q) {
      try {
        var res = await Promise.all([
          fetch('/api/public/courses?q=' + encodeURIComponent(q) + '&limit=5').then(function (r) { return r.json(); }),
          fetch('/api/public/ebooks?q=' + encodeURIComponent(q) + '&limit=4').then(function (r) { return r.json(); })
        ]);
        if (input.value.trim() !== q) return; // stale response
        render(res[0].data || [], res[1].data || [], q);
      } catch (e) { hide(); }
    }

    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (timer) clearTimeout(timer);
      if (q.length < 2) { hide(); return; }
      timer = setTimeout(function () { lookup(q); }, 220);
    });
    input.addEventListener('focus', function () {
      var q = input.value.trim();
      if (q.length >= 2) lookup(q);
    });
    input.addEventListener('blur', function () {
      setTimeout(hide, 150); // mousedown on rows fires first
    });
    input.addEventListener('keydown', function (e) {
      if (box.classList.contains('hidden')) return;
      var rows = box.querySelectorAll('.sm-sug-row');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!rows.length) return;
        active = e.key === 'ArrowDown' ? (active + 1) % rows.length : (active - 1 + rows.length) % rows.length;
        paintActive();
        if (rows[active] && rows[active].scrollIntoView) rows[active].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Escape') {
        hide();
      } else if (e.key === 'Enter' && active >= 0 && items[active]) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openUrl(items[active].url);
      }
    });
  }

  function bindSearch() {
    document.querySelectorAll('[data-sm-desk-search]').forEach(function (input) {
      // prefill from ?q=
      try {
        var q = new URLSearchParams(location.search).get('q');
        if (q && !input.value) input.value = q;
      } catch (e) {}
      // suggestion dropdown (lives inside the search pill)
      var wrap = input.parentElement;
      var box = document.createElement('div');
      box.className = 'sm-search-suggest hidden';
      wrap.appendChild(box);
      bindSuggest(input, box);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          goSearch(input.value.trim());
        }
      });
      var btn = wrap.querySelector('[data-sm-desk-search-btn]');
      if (btn) btn.addEventListener('click', function () {
        goSearch(input.value.trim());
      });
    });
    // click outside closes any open suggestions
    document.addEventListener('click', function (e) {
      document.querySelectorAll('.sm-search-suggest').forEach(function (b) {
        if (!b.classList.contains('hidden') && !(e.target.closest && e.target.closest('.sm-desk-search'))) b.classList.add('hidden');
      });
    });
  }

  // On courses.html, apply ?q= to backend-backed blocks (app.js reads data-sm-q at hydrate time).
  // navbar.js runs before app.js hydrates if loaded first; also do client-side fallback filtering.
  function applyCoursesQuery() {
    var p = (location.pathname.split('/').pop() || '').toLowerCase();
    if (p !== 'courses.html') return;
    var q = '';
    try { q = new URLSearchParams(location.search).get('q') || ''; } catch (e) {}
    if (!q) return;
    document.querySelectorAll('[data-sm-courses]').forEach(function (b) { b.dataset.smQ = q; });
  }

  /* Compact the pic-like desktop bar at runtime (same markup on all pages):
     - remove the Language pill (not needed)
     - Telegram text link -> round icon button (saves space)
     - add compact/responsive helper classes (see navbar.css) */
  function compactDesktopBar() {
    try {
      setLang('en'); // language UI removed -> force English labels
      document.querySelectorAll('[data-sm-desk-search]').forEach(function (input) {
        var sDiv = input.closest('.sm-desk-search');
        if (!sDiv) return;
        var bar = sDiv.parentElement;
        if (bar) bar.classList.add('sm-desk-bar');
        var nav = bar ? bar.querySelector('nav') : null;
        if (nav) nav.classList.add('sm-desk-links');
        sDiv.classList.add('sm-desk-searchflex');
        var logoTxt = bar ? bar.querySelector('a[href="index.html"] > span') : null;
        if (logoTxt) logoTxt.classList.add('sm-desk-logo-txt');
        var tg = bar ? bar.querySelector('a[data-sm-nav="telegram"]') : null;
        if (tg) {
          var b = document.createElement('a');
          b.href = tg.getAttribute('href') || '#';
          if (tg.hasAttribute('data-sm-telegram')) b.setAttribute('data-sm-telegram', '');
          b.className = 'sm-desk-tg-icon';
          b.title = 'Telegram';
          b.setAttribute('aria-label', 'Telegram');
          b.innerHTML = '<i class="fa-brands fa-telegram" style="font-size:17px"></i>';
          tg.replaceWith(b);
        }
        var lb = bar ? bar.querySelector('[data-sm-desk-lang-btn]') : null;
        if (lb && lb.closest('.sm-desk-drop')) lb.closest('.sm-desk-drop').remove();
        // Remove Free Resources link from desktop nav
        var fr = bar ? bar.querySelector('a[data-sm-nav="free"]') : null;
        if (fr) fr.remove();
        // Cart icon next to Theme -> goes to cart page
        if (bar && !bar.querySelector('a.sm-desk-cart')) {
          var accDrop = bar.querySelector('[data-sm-desk-account-btn]');
          accDrop = accDrop ? accDrop.closest('.sm-desk-drop') : null;
          var cart = document.createElement('a');
          cart.href = 'cart.html';
          cart.className = 'sm-desk-tg-icon sm-desk-cart';
          cart.title = 'Cart';
          cart.setAttribute('aria-label', 'Cart');
          cart.innerHTML = '<i class="fa-solid fa-cart-shopping" style="font-size:15px"></i><span data-sm-cart-count class="sm-desk-cart-badge">0</span>';
          if (accDrop && accDrop.parentElement === bar) bar.insertBefore(cart, accDrop);
          else bar.appendChild(cart);
        }
      });
      // Remove Free Resources from desktop drawer menu(s)
      document.querySelectorAll('#smDeskDrawer nav a').forEach(function (a) {
        if (a.textContent && a.textContent.trim().toLowerCase() === 'free resources') a.remove();
      });
    } catch (e) {}
  }

  /* Same phone drawer items on every page (Android menu button):
     Home, Courses, Ebooks, Free Resources, Telegram, Account / Dashboard, Cart (n).
     Phone top bars themselves are untouched. */
  function unifyMobileMenu() {
    try {
      var html =
        '<a href="index.html" class="px-3 py-2.5 rounded-xl hover:bg-slate-50">Home</a>' +
        '<a href="courses.html" class="px-3 py-2.5 rounded-xl hover:bg-slate-50">Courses</a>' +
        '<a href="index.html#secEbooks" class="px-3 py-2.5 rounded-xl hover:bg-slate-50">Ebooks</a>' +
        '<a href="#" data-sm-telegram class="px-3 py-2.5 rounded-xl hover:bg-slate-50">Telegram</a>' +
        '<a href="dashboard.html" data-account-link class="px-3 py-2.5 rounded-xl hover:bg-slate-50">Account / Dashboard</a>' +
        '<a href="cart.html" class="px-3 py-2.5 rounded-xl hover:bg-slate-50">Cart (<span data-sm-cart-count>0</span>)</a>';
      document.querySelectorAll('#mobileMenu nav').forEach(function (nav) {
        nav.innerHTML = html;
      });
    } catch (e) {}
  }

  /* Account pill label: guest -> "Login", logged-in -> first name / "Dashboard".
     Guest click goes straight to auth.html; logged-in click opens the dropdown. */
  function cachedFirstName() {
    try {
      var u = JSON.parse(localStorage.getItem('sm_user') || 'null');
      if (u && u.name) return String(u.name).split(' ')[0];
    } catch (e) {}
    return '';
  }
  function setAccountBtn(btn, mode, name) {
    var label = btn.querySelector('span');
    var icon = btn.querySelector('i');
    if (mode === 'login') {
      if (label) label.textContent = 'Login';
      if (icon) icon.className = 'fa-solid fa-right-to-bracket text-[15px] text-slate-600';
      btn.setAttribute('data-sm-go-login', '1');
    } else {
      if (label) label.textContent = name || 'Dashboard';
      if (icon) icon.className = 'fa-regular fa-user text-[15px] text-slate-600';
      btn.removeAttribute('data-sm-go-login');
    }
  }
  function paintAccountButton() {
    var btns = document.querySelectorAll('[data-sm-desk-account-btn]');
    if (!btns.length) return;
    var tok = getToken();
    if (!tok) {
      btns.forEach(function (btn) { setAccountBtn(btn, 'login'); });
      return;
    }
    var cached = cachedFirstName();
    btns.forEach(function (btn) { setAccountBtn(btn, 'user', cached); });
    // refresh name from server (guarded: no fetch in some contexts)
    try {
      if (typeof fetch !== 'function') return;
      fetch('/api/public/auth/me', { headers: { 'Authorization': 'Bearer ' + tok } })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
        .then(function (res) {
          if (res.status === 401 || res.status === 403) {
            btns.forEach(function (btn) { setAccountBtn(btn, 'login'); });
            return;
          }
          var nm = res.body && res.body.data && res.body.data.name;
          if (nm) {
            try { localStorage.setItem('sm_user', JSON.stringify({ name: nm })); } catch (e) {}
            var first = String(nm).split(' ')[0];
            btns.forEach(function (btn) { setAccountBtn(btn, 'user', first); });
          }
        })
        .catch(function () {});
    } catch (e) {}
  }

  function init() {
    unifyMobileMenu();
    compactDesktopBar();
    applyTheme();
    applyLang();
    paintAccount();
    paintAccountButton();
    markActive();
    bindSearch();
    applyCoursesQuery();

    // dropdown toggles
    document.querySelectorAll('[data-sm-desk-account-btn]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!getToken()) { location.href = 'auth.html'; return; }
        var menu = btn.parentElement.querySelector('[data-sm-desk-account-menu]');
        if (!menu) return;
        var willOpen = menu.classList.contains('hidden');
        closeAllMenus(menu);
        menu.classList.toggle('hidden', !willOpen);
        if (willOpen) paintAccount();
      });
    });
    document.querySelectorAll('[data-sm-desk-lang-btn]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var menu = btn.parentElement.querySelector('[data-sm-desk-lang-menu]');
        if (!menu) return;
        var willOpen = menu.classList.contains('hidden');
        closeAllMenus(menu);
        menu.classList.toggle('hidden', !willOpen);
      });
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest || (!e.target.closest('[data-sm-desk-account-menu]') && !e.target.closest('[data-sm-desk-lang-menu]'))) closeAllMenus(null);
      var langPick = e.target.closest && e.target.closest('[data-sm-lang-pick]');
      if (langPick) {
        setLang(langPick.getAttribute('data-sm-lang-pick'));
        applyLang();
        closeAllMenus(null);
      }
      var lo = e.target.closest && e.target.closest('[data-sm-logout-x]');
      if (lo) {
        try { localStorage.removeItem('sm_user_token'); sessionStorage.removeItem('sm_user_token'); localStorage.removeItem('sm_user'); } catch (x) {}
        location.href = 'index.html';
      }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAllMenus(null); });

    // theme toggle(s)
    document.querySelectorAll('[data-sm-theme-btn]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTheme(getTheme() === 'dark' ? 'light' : 'dark');
        applyTheme();
      });
    });

    // desktop drawer
    var drawer = document.getElementById('smDeskDrawer');
    document.querySelectorAll('[data-sm-desk-menu-btn]').forEach(function (btn) {
      btn.addEventListener('click', function () { if (drawer) drawer.classList.remove('hidden'); });
    });
    if (drawer) {
      drawer.addEventListener('click', function (e) {
        if (e.target.closest('[data-sm-drawer-close]') || e.target.classList.contains('sm-backdrop')) drawer.classList.add('hidden');
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') drawer.classList.add('hidden'); });
    }

    // sync desktop logo with settings (bootstrap only — NO extra fetch,
    // nahole purono SVG logo age dekhiye pore replace hoye flash korto).
    // app.js hydrateSettings thekeo window.__smSetDeskLogo() call kora hoy.
    function setDeskLogo(url) {
      if (!url || !String(url).trim()) return;
      document.querySelectorAll('[data-sm-desk-logo]').forEach(function (img) { try{ img.src = url; }catch(e){} img.classList.remove('hidden'); });
      document.querySelectorAll('[data-sm-desk-logo-fb]').forEach(function (fb) { fb.classList.add('hidden'); });
    }
    try { window.__smSetDeskLogo = setDeskLogo; } catch (e) {}
    try {
      var b = window.__SM_BOOTSTRAP__ && window.__SM_BOOTSTRAP__.settings;
      var logo = b && b.logoUrl;
      if (logo && String(logo).trim()) setDeskLogo(logo);
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
