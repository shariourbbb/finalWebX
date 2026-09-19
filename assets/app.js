/* =========================================================
   StudyMart - Public website script
   Loads data from the Node.js backend so the Admin Panel
   controls every page (courses, batches, categories,
   platforms, coupons, orders).
   ========================================================= */
(function () {
  'use strict';

  const API = '';
  const CART_KEY = 'sm_cart';

  let SMStarted = false;
  const SM = {
    settings: {},
    meta: { batches: [], categories: [], platforms: [] },
    courses: [],
    me: null,
    cart: readCart(),
    coupon: null,
    token: (function () { try { return localStorage.getItem('sm_user_token') || sessionStorage.getItem('sm_user_token') || ''; } catch (e) { return ''; } })()
  };
  window.SM = SM;

  // ----- Bootstrap sync (prevent flicker) -----
  (function applyBootstrapSync(){
    try{
      const b = window.__SM_BOOTSTRAP__;
      if (!b) return;
      if (b.settings && typeof b.settings === 'object') SM.settings = b.settings;
      // apply branding immediately without waiting for fetch
      function doBranding(){
        const s = SM.settings || {};
        // logo
        const logoUrl = s.logoUrl;
        const hi = document.getElementById('siteLogoImg');
        const hf = document.getElementById('siteLogoFallback');
        const fi = document.getElementById('siteFooterLogoImg');
        const ff = document.getElementById('siteFooterLogoFallback');
        if (logoUrl && String(logoUrl).trim() !== '') {
          if (hi) { hi.src = logoUrl; hi.classList.remove('hidden'); }
          if (hf) hf.classList.add('hidden');
          if (fi) { fi.src = logoUrl; fi.classList.remove('hidden'); }
          if (ff) ff.classList.add('hidden');
        } else {
          if (hi) hi.classList.add('hidden');
          if (hf) hf.classList.remove('hidden');
          if (fi) fi.classList.add('hidden');
          if (ff) ff.classList.remove('hidden');
        }
        const sn = s.siteName;
        const hn = document.getElementById('siteNameDisplay');
        const fn = document.getElementById('siteFooterNameDisplay');
        if (sn !== undefined && sn !== null){
          if (hn){ if(sn===''){hn.textContent='';hn.style.display='none';} else {hn.textContent=sn;hn.style.display='';}}
          if (fn){ if(sn===''){fn.textContent='';fn.style.display='none';} else {fn.textContent=sn;fn.style.display='';}}
        }
        const tg = s.tagline;
        const ht = document.getElementById('siteTaglineDisplay');
        const ft = document.getElementById('siteFooterTaglineDisplay');
        if (tg !== undefined && tg !== null){
          if (ht){ ht.textContent=tg; ht.style.display = tg===''?'none':''; }
          if (ft){ ft.textContent=tg; ft.style.display = tg===''?'none':''; }
        }
        // notice bar sync
        (function applyNoticeSync(){
          const s2 = SM.settings || {};
          let bar = document.getElementById('noticeBar');
          if (!bar){
            const b = document.createElement('div');
            b.id = 'noticeBar';
            b.className = 'hidden relative z-[60] text-[13px] font-semibold py-2.5 px-10 flex items-center justify-center gap-3 shadow-sm';
            b.style.cssText = 'background:linear-gradient(90deg,#1A56FF 0%,#4F46E5 50%,#7C3AED 100%);color:#fff';
            b.innerHTML = '<span class="inline-flex items-center gap-2 text-center leading-tight"><i class="fa-solid fa-bullhorn text-[#FACC15] text-[14px]"></i><span id="noticeText"></span></span><a id="noticeLinkBtn" href="#" target="_blank" class="hidden ml-1 px-3 py-1 rounded-full bg-white text-[#1A56FF] text-[11px] font-extrabold">View <i class="fa-solid fa-arrow-right ml-1 text-[10px]"></i></a><button id="noticeClose" class="hidden absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"><i class="fa-solid fa-xmark text-[12px]"></i></button>';
            const header = document.querySelector('header');
            if (header && header.parentNode) header.parentNode.insertBefore(b, header);
            else if (document.body) document.body.insertBefore(b, document.body.firstChild);
            bar = b;
          }
          const txtEl = document.getElementById('noticeText');
          const linkBtn = document.getElementById('noticeLinkBtn');
          const closeBtn = document.getElementById('noticeClose');
          const enabled = s2.noticeEnabled === true || s2.noticeEnabled === 'true';
          const text = s2.noticeText;
          const link = s2.noticeLink;
          const bg = s2.noticeBg;
          const color = s2.noticeColor;
          const dismissible = s2.noticeDismissible !== false;
          try{
            const dismissed = localStorage.getItem('sm_notice_dismissed');
            const curHash = (text||'')+'|'+(link||'');
            if (dismissed === curHash) { if(bar) bar.classList.add('hidden'); return; }
          }catch(e){}
          if (!enabled || !text || String(text).trim()==='') { if(bar) bar.classList.add('hidden'); return; }
          if (txtEl) txtEl.textContent = text;
          if (linkBtn){ if(link && String(link).trim()!==''){ linkBtn.href=link; linkBtn.classList.remove('hidden'); } else linkBtn.classList.add('hidden'); }
          if (closeBtn){
            if(dismissible){ closeBtn.classList.remove('hidden'); closeBtn.onclick=function(){ bar.classList.add('hidden'); try{localStorage.setItem('sm_notice_dismissed',(text||'')+'|'+(link||''));}catch(e){}}; } else closeBtn.classList.add('hidden');
          }
          if (bg && String(bg).trim()!=='') bar.style.background = bg; else bar.style.background='linear-gradient(90deg,#1A56FF 0%,#4F46E5 50%,#7C3AED 100%)';
          if (color && String(color).trim()!=='') bar.style.color = color; else bar.style.color='#fff';
          bar.classList.remove('hidden'); bar.classList.add('flex');
        })();
        // hero may be handled by inline script, but also ensure sm-ready class
        document.documentElement.classList.remove('sm-loading');
        document.documentElement.classList.add('sm-ready');
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', doBranding);
      } else {
        doBranding();
      }
      // also try immediate if DOM already has elements (for head injection case, body not yet)
      try{ doBranding(); }catch(e){}
    } catch(e){}
  })();

  /* ---------------- helpers ---------------- */
  const $ = s => document.querySelector(s);
  const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const cur = n => {
    const c = (SM.settings.currency !== undefined && SM.settings.currency !== null) ? SM.settings.currency : '৳';
    return c + Number(n || 0).toLocaleString('en-IN');
  };

  function toast(msg, ok) {
    let el = $('#smToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'smToast';
      el.className = 'fixed bottom-5 right-5 z-[120] hidden text-white text-[13px] font-semibold px-4 py-3 rounded-[10px] shadow-2xl max-w-[320px]';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = ok === false ? '#DC2626' : '#0F2043';
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 2800);
  }

  function currentToken() {
    try { return localStorage.getItem('sm_user_token') || sessionStorage.getItem('sm_user_token') || ''; } catch (e) { return ''; }
  }

  async function apiGet(path) {
    const token = SM.token || currentToken();
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(API + path, { headers });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || json.success === false) {
      const err = new Error((json && json.message) || 'Failed to load data');
      err.status = res.status;
      throw err;
    }
    return json;
  }

  async function apiSend(path, method, body) {
    const token = SM.token || currentToken();
    const m = (method || 'GET').toUpperCase();
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const opts = { method: m, headers };
    if (body !== undefined && m !== 'GET' && m !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(API + path, opts);
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || json.success === false) {
      const err = new Error((json && json.message) || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return json;
  }

  /* ---------------- cart ---------------- */
  function readCart() {
    try { return JSON.parse(localStorage.getItem('sm_cart')) || []; } catch (e) { return []; }
  }
  function saveCart() {
    try { localStorage.setItem('sm_cart', JSON.stringify(SM.cart)); } catch (e) {}
    paintCartBadges();
  }
  function paintCartBadges() {
    const count = SM.cart.length;
    $$('#cartBadge, [data-sm-cart-badge]').forEach(el => {
      el.textContent = count;
      el.style.display = count ? '' : 'none';
    });
    $$('[data-sm-cart-count]').forEach(el => { el.textContent = count; });
    const total = SM.cart.reduce((s, c) => s + Number(c.price || 0), 0);
    $$('[data-sm-cart-total]').forEach(el => { el.textContent = cur(total); });
  }
  function cartItemOf(item) {
    const isEbook = !!(item && (item.cover || item.fileUrl || item.linkUrl || item.author));
    return {
      id: item.id,
      title: item.title,
      price: Number(item.price) || 0,
      type: isEbook ? 'ebook' : 'course',
      image: item.thumbnail || item.cover || '',
      url: (isEbook ? 'ebook.html?id=' : 'course.html?id=') + item.id
    };
  }
  function addToCart(course) {
    if (SM.cart.some(c => String(c.id) === String(course.id))) {
      toast('Already in cart: ' + course.title);
      return;
    }
    SM.cart.push(cartItemOf(course));
    saveCart();
    toast('Added to cart (' + SM.cart.length + ' item' + (SM.cart.length > 1 ? 's' : '') + ')');
  }
  function removeFromCart(id) {
    SM.cart = SM.cart.filter(c => String(c.id) !== String(id));
    saveCart();
  }

  /* ---------------- renderers ---------------- */
  function courseCard(c) {
    const batch = c.batchName ? `<span class="px-1.5 sm:px-2 py-0.5 rounded-full bg-[#EDE9FF] text-[#4F46E5] text-[9px] sm:text-[10px] font-bold truncate">${esc(c.batchName)}</span>` : '';
    const off = c.discount ? `<span class="px-1.5 sm:px-2 py-0.5 rounded-full bg-[#E6F4EA] text-[#16A34A] text-[9px] sm:text-[10px] font-bold flex-shrink-0">-${c.discount}%</span>` : '';
    return `
      <div class="bg-white rounded-[12px] sm:rounded-[14px] border border-slate-100 shadow-sm hover:shadow-md transition overflow-hidden flex flex-col">
        <a href="course.html?id=${c.id}" class="block">
          <div class="h-[88px] sm:h-[110px] w-full relative overflow-hidden bg-[#0F2043]">
            ${c.thumbnail
              ? `<img src="${esc(c.thumbnail)}" alt="${esc(c.title)}" class="w-full h-full object-cover" loading="lazy">`
              : `<div class="h-full w-full flex items-center justify-center" style="background:linear-gradient(135deg,${esc(c.batchColor || '#1A56FF')} 0%,#0F2043 100%)"><span class="text-white/90 text-[11px] sm:text-[13px] font-extrabold px-2 sm:px-3 text-center leading-tight">${esc(c.batchName || 'Course')}</span></div>`}
            <span class="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 px-2 py-0.5 rounded-full bg-black/45 backdrop-blur border border-white/25 text-white text-[9px] sm:text-[10px] font-bold truncate max-w-[calc(100%-16px)]">${esc(c.batchName || 'Course')}</span>
            <span class="hidden sm:inline absolute top-2 right-2 px-2 py-0.5 rounded-full bg-white/90 text-[#0F2043] text-[10px] font-bold">${esc(c.platformName || 'Online')}</span>
          </div>
        </a>
        <div class="p-2.5 sm:p-3 flex flex-col flex-1">
          <div class="flex items-center gap-1 sm:gap-1.5 mb-1 sm:mb-1.5 flex-wrap">${batch}${off}</div>
          <a href="course.html?id=${c.id}" class="text-[12px] sm:text-[13px] font-bold text-[#0F2043] leading-snug hover:text-[#1A56FF] line-clamp-2 min-h-[32px] sm:min-h-0">${esc(c.title)}</a>
          <p class="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 sm:mt-1 truncate">${esc(c.teacher || '')}</p>
          <div class="mt-auto pt-2 sm:pt-3 flex items-center justify-between gap-1.5 sm:gap-2">
            <div class="min-w-0">
              <span class="text-[13px] sm:text-[14px] font-extrabold text-[#0F2043]">${cur(c.price)}</span>
              ${c.oldPrice ? `<span class="hidden sm:inline text-[11px] text-slate-400 line-through ml-1">${cur(c.oldPrice)}</span>` : ''}
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <button data-sm-add="${c.id}" class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#E6F0FF] text-[#1A56FF] hover:bg-[#DDE8FF] transition" title="Add to cart"><i class="fa-solid fa-cart-plus text-[11px] sm:text-[12px]"></i></button>
              <a href="course.html?id=${c.id}" class="hidden sm:inline-block px-3 py-1.5 rounded-full bg-[#1A56FF] hover:bg-[#1445D6] text-white text-[11px] font-bold">Details</a>
            </div>
          </div>
        </div>
      </div>`;
  }

  function buildQuery(el) {
    const parts = [];
    if (el.dataset.smBatch) parts.push('batch=' + encodeURIComponent(el.dataset.smBatch));
    if (el.dataset.smCategory) parts.push('category=' + encodeURIComponent(el.dataset.smCategory));
    if (el.dataset.smFeatured) parts.push('featured=' + encodeURIComponent(el.dataset.smFeatured));
    if (el.dataset.smLimit) parts.push('limit=' + encodeURIComponent(el.dataset.smLimit));
    if (el.dataset.smQ) parts.push('q=' + encodeURIComponent(el.dataset.smQ));
    return parts.length ? '?' + parts.join('&') : '';
  }

  async function hydrateCourseBlocks() {
    const blocks = $$('[data-sm-courses]');
    for (const block of blocks) {
      const title = block.dataset.smTitle;
      try {
        const json = await apiGet('/api/public/courses' + buildQuery(block));
        SM.courses = SM.courses.concat(json.data);
        const gridClass = block.dataset.smGrid || 'grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4';
        const head = title ? `<h2 class="text-[17px] sm:text-[19px] font-extrabold text-[#0F2043] mb-3">${esc(title)}</h2>` : '';
        block.innerHTML = head + (json.data.length
          ? `<div class="${gridClass}">${json.data.map(courseCard).join('')}</div>`
          : '<p class="text-[13px] text-slate-400 text-center py-8">No course found here yet. Add courses from the Admin Panel.</p>');
      } catch (err) {
        block.innerHTML = (title ? `<h2 class="text-[17px] font-extrabold text-[#0F2043] mb-3">${esc(title)}</h2>` : '') +
          `<p class="text-[13px] text-slate-400 text-center py-6">Could not load courses: ${esc(err.message)}</p>`;
      }
    }
  }

  async function hydrateBatchPills() {
    const els = $$('[data-sm-batches]');
    if (!els.length) return;
    try {
      const json = await apiGet('/api/public/batches');
      SM.meta.batches = (json.data || []).slice().sort((a, b) => ((Number(a.order) || 999) - (Number(b.order) || 999)) || (Number(a.id) - Number(b.id)));
      json.data = SM.meta.batches;
      els.forEach(el => {
        el.innerHTML = json.data.map(b => `
          <a href="batch.html?batch=${encodeURIComponent(b.slug)}" class="bg-white rounded-[14px] border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3 hover:shadow-md transition">
            <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background:${esc(b.color || '#4F46E5')}22">
              <i class="fa-solid fa-graduation-cap text-[17px]" style="color:${esc(b.color || '#4F46E5')}"></i>
            </div>
            <div>
              <div class="text-[13px] font-bold text-[#0F2043]">${esc(b.name)}</div>
              <div class="text-[10.5px] text-slate-500">${esc(b.year || '')}</div>
            </div>
          </a>`).join('');
      });
    } catch (err) {
      els.forEach(el => { el.innerHTML = '<p class="text-[12px] text-slate-400">Could not load batches.</p>'; });
    }
  }

  async function hydrateCategories() {
    const els = $$('[data-sm-categories]');
    if (!els.length) return;
    try {
      const json = await apiGet('/api/public/categories');
      els.forEach(el => {
        el.innerHTML = json.data.map(c => `
          <a href="courses.html?category=${encodeURIComponent(c.slug)}" class="px-3 py-2 rounded-full text-[12px] font-bold text-[#0F2043] hover:opacity-80 transition" style="background:${esc(c.color || '#EDE9FF')}">
            <i class="fa-solid ${esc(c.icon || 'fa-tag')} mr-1 text-[#1A56FF]"></i>${esc(c.name)}
          </a>`).join('');
      });
    } catch (err) {}
  }

  async function hydrateStats() {
    const blocks = $$('[data-sm-stats]');
    if (!blocks.length) return;
    try {
      const json = await apiGet('/api/public/stats');
      const d = json.data;
      const map = { Courses: d.totalCourses, Students: d.totalStudents, Batches: d.totalBatches, Orders: d.totalOrders };
      blocks.forEach(el => {
        el.innerHTML = Object.keys(map).map(k => `
          <div class="text-center">
            <div class="text-[20px] sm:text-[24px] font-extrabold text-[#0F2043]">${map[k]}+</div>
            <div class="text-[11px] font-semibold text-slate-500">${k}</div>
          </div>`).join('');
      });
    } catch (err) {}
  }

  async function hydrateSettings() {
    // Use server bootstrap if available (prevents flicker)
    if (window.__SM_BOOTSTRAP__ && window.__SM_BOOTSTRAP__.settings) {
      SM.settings = window.__SM_BOOTSTRAP__.settings;
    } else {
      try {
        const json = await apiGet('/api/public/settings');
        SM.settings = json.data || {};
      } catch (e) { SM.settings = {}; }
    }
    // text settings - empty string stays empty (hidden if empty)
    $$('[data-sm-setting]').forEach(el => {
      const key = el.dataset.smSetting;
      const value = SM.settings[key];
      if (value !== undefined && value !== null) {
        el.textContent = value;
        // hide tagline/footer if empty to respect "empty stays empty"
        if (value === '' && (key === 'tagline' || key === 'footerText')) {
          el.style.display = 'none';
        } else {
          el.style.display = '';
        }
      }
    });
    // siteName/logo special handling
    (function applySiteBranding(){
      const logoUrl = SM.settings.logoUrl;
      const headerImg = document.getElementById('siteLogoImg');
      const headerFallback = document.getElementById('siteLogoFallback');
      const footerImg = document.getElementById('siteFooterLogoImg');
      const footerFallback = document.getElementById('siteFooterLogoFallback');
      if (logoUrl && String(logoUrl).trim() !== '') {
        if (headerImg) { headerImg.src = logoUrl; headerImg.classList.remove('hidden'); }
        if (headerFallback) headerFallback.classList.add('hidden');
        if (footerImg) { footerImg.src = logoUrl; footerImg.classList.remove('hidden'); }
        if (footerFallback) footerFallback.classList.add('hidden');
      } else {
        if (headerImg) headerImg.classList.add('hidden');
        if (headerFallback) headerFallback.classList.remove('hidden');
        if (footerImg) footerImg.classList.add('hidden');
        if (footerFallback) footerFallback.classList.remove('hidden');
      }
      const siteName = SM.settings.siteName;
      const headerName = document.getElementById('siteNameDisplay');
      const footerName = document.getElementById('siteFooterNameDisplay');
      if (siteName !== undefined && siteName !== null) {
        if (headerName) {
          if (siteName === '') { headerName.textContent = ''; headerName.style.display = 'none'; }
          else { headerName.textContent = siteName; headerName.style.display = ''; }
        }
        if (footerName) {
          if (siteName === '') { footerName.textContent = ''; footerName.style.display = 'none'; }
          else { footerName.textContent = siteName; footerName.style.display = ''; }
        }
      }
      const tagline = SM.settings.tagline;
      const headerTag = document.getElementById('siteTaglineDisplay');
      const footerTag = document.getElementById('siteFooterTaglineDisplay');
      if (tagline !== undefined && tagline !== null) {
        if (headerTag) {
          headerTag.textContent = tagline;
          headerTag.style.display = tagline === '' ? 'none' : '';
        }
        if (footerTag) {
          footerTag.textContent = tagline;
          footerTag.style.display = tagline === '' ? 'none' : '';
        }
      }
    })();
    $$('[data-sm-telegram]').forEach(el => {
      const val = SM.settings.telegram;
      if (val !== undefined && val !== null) {
        if (val === '') { el.style.display = 'none'; }
        else { el.href = val; el.style.display = ''; }
      }
    });
    // hide phone/email elements if empty
    ['phone','email','address'].forEach(k=>{
      const val = SM.settings[k];
      if (val !== undefined && val !== null) {
        document.querySelectorAll('[data-sm-'+k+']').forEach(el=>{
          if (val === '') { el.textContent = ''; el.style.display='none'; }
          else { el.textContent = val; el.style.display=''; }
        });
      }
    });
    // Notice Bar (Nav er upore)
    (function applyNotice(){
      const bar = document.getElementById('noticeBar');
      if (!bar) {
        // auto-create for pages that don't have it (courses, dashboard etc)
        const b = document.createElement('div');
        b.id = 'noticeBar';
        b.className = 'hidden relative z-[60] text-[13px] font-semibold py-2.5 px-10 flex items-center justify-center gap-3 shadow-sm';
        b.style.cssText = 'background:linear-gradient(90deg,#1A56FF 0%,#4F46E5 50%,#7C3AED 100%);color:#fff';
        b.innerHTML = '<span class="inline-flex items-center gap-2 text-center leading-tight"><i class="fa-solid fa-bullhorn text-[#FACC15] text-[14px]"></i><span id="noticeText"></span></span><a id="noticeLinkBtn" href="#" target="_blank" class="hidden ml-1 px-3 py-1 rounded-full bg-white text-[#1A56FF] text-[11px] font-extrabold hover:bg-[#F8F9FD] transition">View <i class="fa-solid fa-arrow-right ml-1 text-[10px]"></i></a><button id="noticeClose" class="hidden absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition"><i class="fa-solid fa-xmark text-[12px]"></i></button>';
        const header = document.querySelector('header');
        if (header && header.parentNode) header.parentNode.insertBefore(b, header);
        else document.body.insertBefore(b, document.body.firstChild);
      }
      const barEl = document.getElementById('noticeBar');
      const txtEl = document.getElementById('noticeText');
      const linkBtn = document.getElementById('noticeLinkBtn');
      const closeBtn = document.getElementById('noticeClose');
      const s = SM.settings || {};
      const enabled = s.noticeEnabled === true || s.noticeEnabled === 'true';
      const text = s.noticeText;
      const link = s.noticeLink;
      const bg = s.noticeBg;
      const color = s.noticeColor;
      const dismissible = s.noticeDismissible !== false;
      // dismissed check
      try{
        const dismissed = localStorage.getItem('sm_notice_dismissed');
        const curHash = (text || '') + '|' + (link || '');
        if (dismissed === curHash) { if(barEl) barEl.classList.add('hidden'); return; }
      }catch(e){}
      if (!enabled || !text || String(text).trim()==='') { if(barEl) barEl.classList.add('hidden'); return; }
      if (txtEl) txtEl.textContent = text;
      if (linkBtn) {
        if (link && String(link).trim()!=='') { linkBtn.href = link; linkBtn.classList.remove('hidden'); }
        else linkBtn.classList.add('hidden');
      }
      if (closeBtn) {
        if (dismissible) {
          closeBtn.classList.remove('hidden');
          closeBtn.onclick = function(){
            barEl.classList.add('hidden');
            try{ localStorage.setItem('sm_notice_dismissed', (text||'')+'|'+(link||'')); }catch(e){}
          };
        } else closeBtn.classList.add('hidden');
      }
      if (bg && String(bg).trim()!=='') barEl.style.background = bg;
      else barEl.style.background = 'linear-gradient(90deg,#1A56FF 0%,#4F46E5 50%,#7C3AED 100%)';
      if (color && String(color).trim()!=='') barEl.style.color = color;
      else barEl.style.color = '#fff';
      barEl.classList.remove('hidden');
      barEl.classList.add('flex');
    })();
  }

  /* ---------------- course detail page ---------------- */
  async function hydrateCourseDetail() {
    const wrap = $('[data-sm-course-detail]');
    if (!wrap) return;
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    if (!id) { wrap.innerHTML = '<p class="text-[13px] text-slate-500">Select a course from the <a href="courses.html" class="text-[#1A56FF] font-bold">Courses page</a>.</p>'; return; }
    try {
      const json = await apiGet('/api/public/courses/' + encodeURIComponent(id));
      const c = json.data;
      document.title = c.title + ' - StudyMart';
      const titleEl = document.getElementById('courseTitleBar');
      if (titleEl) titleEl.textContent = c.title;
      SM.courses = SM.courses.concat([c]);

      wrap.innerHTML = `
        <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-4 sm:p-5">
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <span class="px-2.5 py-1 rounded-full bg-[#EDE9FF] text-[#4F46E5] text-[11px] font-bold">${esc(c.batchName || '-')}</span>
            <span class="px-2.5 py-1 rounded-full bg-[#E0F2FE] text-[#0EA5E9] text-[11px] font-bold">${esc(c.categoryName || '-')}</span>
            <span class="px-2.5 py-1 rounded-full bg-[#E6F4EA] text-[#16A34A] text-[11px] font-bold"><i class="fa-solid ${esc(c.platformIcon || 'fa-globe')} mr-1"></i>${esc(c.platformName || 'Online')}</span>
            ${c.discount ? `<span class="px-2.5 py-1 rounded-full bg-[#FFF2E6] text-[#F59E0B] text-[11px] font-bold">-${c.discount}% OFF</span>` : ''}
          </div>
          <h2 class="text-[17px] sm:text-[20px] font-extrabold text-[#0F2043] leading-snug">${esc(c.title)}</h2>
          <p class="text-[12.5px] text-slate-500 mt-1">By ${esc(c.teacher || 'StudyMart')}</p>
          <p class="text-[13px] text-slate-600 mt-3 leading-relaxed">${esc(c.description || '')}</p>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div class="bg-[#F8F9FD] rounded-[10px] p-3"><div class="text-[10.5px] text-slate-500 font-semibold">Duration</div><div class="text-[13px] font-bold text-[#0F2043]">${esc(c.duration || '-')}</div></div>
            <div class="bg-[#F8F9FD] rounded-[10px] p-3"><div class="text-[10.5px] text-slate-500 font-semibold">Total Class</div><div class="text-[13px] font-bold text-[#0F2043]">${c.totalClass || 0}</div></div>
            <div class="bg-[#F8F9FD] rounded-[10px] p-3"><div class="text-[10.5px] text-slate-500 font-semibold">Price</div><div class="text-[13px] font-bold text-[#1A56FF]">${cur(c.price)}</div></div>
            <div class="bg-[#F8F9FD] rounded-[10px] p-3"><div class="text-[10.5px] text-slate-500 font-semibold">Batch</div><div class="text-[13px] font-bold text-[#0F2043]">${esc(c.batchName || '-')}</div></div>
          </div>
          <div class="flex flex-wrap gap-2 mt-4">
            <button data-sm-buy="${c.id}" class="px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]">
              <i class="fa-solid fa-bolt mr-1"></i> Buy Now ${cur(c.price)}
            </button>
            <button data-sm-add="${c.id}" class="px-5 py-2.5 rounded-[10px] bg-[#E6F0FF] text-[#1A56FF] font-bold text-[13px]">
              <i class="fa-solid fa-cart-plus mr-1"></i> Add to Cart
            </button>
            <button data-sm-cart-open="1" class="px-5 py-2.5 rounded-[10px] bg-white border border-slate-200 text-slate-700 font-bold text-[13px]">
              <i class="fa-solid fa-cart-shopping mr-1"></i> View Cart (<span data-sm-cart-count>0</span>)
            </button>
          </div>
        </div>`;
      paintCartBadges();
    } catch (err) {
      wrap.innerHTML = `<div class="bg-red-50 border border-red-100 text-red-700 text-[13px] font-semibold rounded-[14px] p-4">${esc(err.message)}</div>`;
    }
  }

  /* ---------------- cart + checkout modal ---------------- */
  function openCart() {
    let wrap = $('#smCartModal');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'smCartModal';
      wrap.className = 'hidden fixed inset-0 z-[130] bg-black/50 justify-center p-3 sm:p-6 overflow-y-auto';
      wrap.innerHTML = '<div id="smCartBox" class="bg-white rounded-[16px] shadow-2xl w-full max-w-[720px] my-6"></div>';
      document.body.appendChild(wrap);
      wrap.addEventListener('click', function (e) { if (e.target === wrap) closeCart(); });
    }
    wrap.classList.remove('hidden');
    wrap.classList.add('flex');
    renderCartBox();
  }
  function closeCart() {
    const wrap = $('#smCartModal');
    if (wrap) { wrap.classList.add('hidden'); wrap.classList.remove('flex'); }
  }
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCart(); });

  function renderCartBox() {
    const box = $('#smCartBox');
    if (!box) return;
    const subtotal = SM.cart.reduce((s, c) => s + Number(c.price || 0), 0);
    const discount = SM.coupon ? SM.coupon.discount : 0;
    const total = Math.max(0, subtotal - discount);
    box.innerHTML = `
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h3 class="text-[16px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-cart-shopping text-[#1A56FF] mr-1"></i>Your Cart</h3>
          <p class="text-[11px] text-slate-500">${SM.cart.length} course(s) selected</p>
        </div>
        <button data-sm-cart-close="1" class="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="p-6">
        ${SM.cart.length ? `
          <div class="border border-slate-100 rounded-[10px] divide-y divide-slate-100">
            ${SM.cart.map(i => `
              <div class="px-4 py-3 flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-[12.5px] font-bold text-[#0F2043] truncate">${esc(i.title)}</div>
                  <div class="text-[11px] text-slate-500">${cur(i.price)}</div>
                </div>
                <button data-sm-cart-remove="${i.id}" class="w-8 h-8 rounded-full bg-red-50 text-red-600 hover:bg-red-100"><i class="fa-solid fa-trash text-[11px]"></i></button>
              </div>`).join('')}
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <div>
              <label class="text-[11px] font-bold text-slate-600 uppercase">Coupon Code</label>
              <div class="flex gap-2 mt-1">
                <input id="smCoupon" value="${esc(SM.coupon ? SM.coupon.code : '')}" placeholder="SAVE10" class="flex-1 border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF]">
                <button data-sm-coupon="1" class="px-3 py-2 rounded-[8px] bg-[#0F2043] text-white font-bold text-[12px]">Apply</button>
              </div>
              <p id="smCouponMsg" class="text-[11.5px] mt-1 ${SM.coupon ? 'text-[#16A34A]' : 'text-slate-400'}">${SM.coupon ? 'Coupon applied: -' + cur(SM.coupon.discount) : 'Try SAVE10 or FLAT200'}</p>
            </div>
            <div>
              <label class="text-[11px] font-bold text-slate-600 uppercase">Your Name</label>
              <input id="smName" value="${esc(SM.me ? SM.me.name : '')}" placeholder="Full name" class="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] mt-1 outline-none focus:border-[#1A56FF]">
              <label class="text-[11px] font-bold text-slate-600 uppercase mt-3 block">Email</label>
              <input id="smEmail" value="${esc(SM.me ? SM.me.email : '')}" placeholder="you@email.com" class="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] mt-1 outline-none focus:border-[#1A56FF]">
              <label class="text-[11px] font-bold text-slate-600 uppercase mt-3 block">Phone</label>
              <input id="smPhone" placeholder="01XXXXXXXXX" class="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] mt-1 outline-none focus:border-[#1A56FF]">
            </div>
          </div>

          <div class="mt-5 ml-auto max-w-[300px] space-y-1.5">
            <div class="flex justify-between text-[12.5px]"><span class="text-slate-600">Subtotal</span><b>${cur(subtotal)}</b></div>
            <div class="flex justify-between text-[12.5px]"><span class="text-slate-600">Discount</span><b class="text-[#16A34A]">-${cur(discount)}</b></div>
            <div class="flex justify-between text-[15px] pt-2 border-t border-slate-200"><span class="font-extrabold text-[#0F2043]">Total</span><span class="font-extrabold text-[#1A56FF]">${cur(total)}</span></div>
          </div>
          <p id="smOrderMsg" class="hidden mt-3 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
          <div class="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
            <button data-sm-cart-close="1" class="px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700">Continue Shopping</button>
            <button data-sm-checkout="1" class="px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]"><i class="fa-solid fa-bag-shopping mr-1"></i> Place Order</button>
          </div>`
      : `<div class="text-center py-10">
            <i class="fa-solid fa-cart-shopping text-[28px] text-slate-300"></i>
            <p class="text-[13px] text-slate-500 mt-2">Your cart is empty.</p>
            <a href="courses.html" class="inline-block mt-3 px-4 py-2 rounded-[10px] bg-[#1A56FF] text-white font-bold text-[12.5px]">Browse Courses</a>
         </div>`}
      </div>`;
  }

  async function applyCoupon() {
    const code = $('#smCoupon').value.trim();
    if (!code) { SM.coupon = null; renderCartBox(); return; }
    const subtotal = SM.cart.reduce((s, c) => s + Number(c.price || 0), 0);
    try {
      const json = await apiSend('/api/public/coupons/validate', 'POST', { code: code, subtotal: subtotal });
      SM.coupon = json.data;
      renderCartBox();
      toast(json.message);
    } catch (err) {
      SM.coupon = null;
      const msg = $('#smCouponMsg');
      if (msg) { msg.textContent = err.message; msg.className = 'text-[11.5px] mt-1 text-red-600'; }
      toast(err.message, false);
    }
  }

  async function checkout() {
    const msg = $('#smOrderMsg');
    if (!SM.cart.length) { toast('Your cart is empty', false); return; }
    try {
      const json = await apiSend('/api/public/orders', 'POST', {
        items: SM.cart.map(c => ({ courseId: c.id })),
        couponCode: SM.coupon ? SM.coupon.code : '',
        name: $('#smName').value.trim(),
        email: $('#smEmail').value.trim(),
        phone: $('#smPhone').value.trim()
      });
      SM.cart = [];
      SM.coupon = null;
      saveCart();
      renderCartBox();
      toast(json.message);
      if ($('[data-sm-myorders]')) loadMyOrders();
    } catch (err) {
      if (msg) {
        msg.textContent = err.message;
        msg.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        msg.classList.remove('hidden');
      }
      toast(err.message, false);
    }
  }

  /* ---------------- student auth + dashboard ---------------- */
  function renderAuthBox() {
    const box = $('[data-sm-auth]');
    if (!box) return;
    if (SM.me) {
      box.innerHTML = `
        <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-full bg-[#EDE9FF] text-[#4F46E5] font-extrabold flex items-center justify-center">${esc((SM.me.name || 'U').charAt(0).toUpperCase())}</div>
            <div>
              <div class="text-[14px] font-extrabold text-[#0F2043]">${esc(SM.me.name)}</div>
              <div class="text-[11.5px] text-slate-500">${esc(SM.me.email || '')}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button data-sm-cart-open="1" class="px-3 py-2 rounded-[10px] bg-[#E6F0FF] text-[#1A56FF] font-bold text-[12.5px]"><i class="fa-solid fa-cart-shopping mr-1"></i>Cart (<span data-sm-cart-count>0</span>)</button>
            <button data-sm-logout="1" class="px-3 py-2 rounded-[10px] bg-red-50 text-red-600 font-bold text-[12.5px]">Logout</button>
          </div>
        </div>`;
      paintCartBadges();
      return;
    }
    const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF]';
    box.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
          <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-1"><i class="fa-solid fa-right-to-bracket text-[#1A56FF] mr-1"></i>Student Login</h3>
          <p class="text-[11.5px] text-slate-500 mb-3">Login to see your orders and courses</p>
          <div class="space-y-2">
            <input id="loginEmail" placeholder="Email" class="${base}">
            <input id="loginPass" type="password" placeholder="Password" class="${base}">
          </div>
          <p id="loginMsg" class="hidden mt-3 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
          <button data-sm-login="1" class="mt-3 w-full px-4 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]">Login</button>
        </div>
        <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
          <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-1"><i class="fa-solid fa-user-plus text-[#1A56FF] mr-1"></i>Create Account</h3>
          <p class="text-[11.5px] text-slate-500 mb-3">New here? Register in a few seconds</p>
          <div class="space-y-2">
            <input id="regName" placeholder="Full name" class="${base}">
            <input id="regEmail" placeholder="Email" class="${base}">
            <input id="regPhone" placeholder="Phone (optional)" class="${base}">
            <input id="regPass" type="password" placeholder="Password (min 6 chars)" class="${base}">
          </div>
          <p id="regMsg" class="hidden mt-3 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
          <button data-sm-register="1" class="mt-3 w-full px-4 py-2.5 rounded-[10px] bg-[#0F2043] hover:bg-[#16294F] text-white font-bold text-[13px]">Register</button>
        </div>
      </div>`;
  }

  function setMsg(id, text, ok) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 ' +
      (ok ? 'bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]' : 'bg-red-50 text-red-600 border border-red-100');
    el.classList.remove('hidden');
  }

  async function doLogin() {
    try {
      const json = await apiSend('/api/public/auth/login', 'POST', {
        email: $('#loginEmail').value.trim(), password: $('#loginPass').value
      });
      SM.token = json.token;
      SM.me = json.data;
      try { localStorage.setItem('sm_user_token', json.token); } catch (e) {}
      toast(json.message || 'Logged in');
      renderAuthBox();
      loadMyOrders();
    } catch (err) { setMsg('#loginMsg', err.message, false); }
  }

  async function doRegister() {
    try {
      const json = await apiSend('/api/public/auth/register', 'POST', {
        name: $('#regName').value.trim(),
        email: $('#regEmail').value.trim(),
        phone: $('#regPhone').value.trim(),
        password: $('#regPass').value
      });
      SM.token = json.token;
      SM.me = json.data;
      try { localStorage.setItem('sm_user_token', json.token); } catch (e) {}
      toast(json.message || 'Registered successfully');
      renderAuthBox();
      loadMyOrders();
    } catch (err) { setMsg('#regMsg', err.message, false); }
  }

  async function doLogout() {
    try { await apiSend('/api/public/auth/logout', 'POST', {}); } catch (e) {}
    SM.token = '';
    SM.me = null;
    try { localStorage.removeItem('sm_user_token'); sessionStorage.removeItem('sm_user_token'); } catch (e) {}
    toast('Logged out');
    renderAuthBox();
    loadMyOrders();
  }

  async function loadMyOrders() {
    const box = $('[data-sm-myorders]');
    if (!box) return;
    if (!SM.token) {
      SM.token = currentToken();
    }
    if (!SM.token) {
      box.innerHTML = '<p class="text-[13px] text-slate-400 text-center py-6">Login to see your orders.</p>';
      return;
    }
    try {
      const json = await apiGet('/api/public/my/orders');
      const orders = json.data || [];
      box.innerHTML = orders.length ? `
        <div class="border border-slate-100 rounded-[10px] divide-y divide-slate-100">
          ${orders.map(o => `
            <div class="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div class="text-[12.5px] font-extrabold text-[#0F2043]">${esc(o.orderNo)}</div>
                <div class="text-[11px] text-slate-500">${o.items.length} course(s) - ${new Date(o.createdAt).toLocaleDateString('en-GB')}</div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-[13px] font-extrabold text-[#0F2043]">${cur(o.total)}</span>
                <span class="text-[10.5px] font-bold px-2 py-0.5 rounded-full ${o.status === 'completed' ? 'bg-[#E6F4EA] text-[#16A34A]' : o.status === 'cancelled' ? 'bg-red-50 text-red-600' : o.status === 'confirmed' ? 'bg-[#E6F0FF] text-[#1A56FF]' : 'bg-[#FFF2E6] text-[#F59E0B]'}">${esc(o.status)}</span>
              </div>
            </div>`).join('')}
        </div>` : '<p class="text-[13px] text-slate-400 text-center py-6">You have no orders yet.</p>';
    } catch (err) {
      box.innerHTML = `<p class="text-[13px] text-red-600 text-center py-6">${esc(err.message)}</p>`;
    }
  }

  async function loadMe() {
    if (!SM.token) {
      SM.token = currentToken();
    }
    if (!SM.token) { SM.me = null; renderAuthBox(); return; }
    try {
      const json = await apiGet('/api/public/auth/me');
      SM.me = json.data;
    } catch (err) {
      // ONLY clear token if the server explicitly rejected authentication (401/403)
      if (err.status === 401 || err.status === 403) {
        SM.token = '';
        SM.me = null;
        try { localStorage.removeItem('sm_user_token'); sessionStorage.removeItem('sm_user_token'); } catch (e) {}
      }
    }
    renderAuthBox();
  }

  /* ---------------- global click delegation ---------------- */
  document.addEventListener('click', function (e) {
    const t = e.target;
    const addBtn = t.closest('[data-sm-add]');
    const buyBtn = t.closest('[data-sm-buy]');
    const openBtn = t.closest('[data-sm-cart-open]');
    const closeBtn = t.closest('[data-sm-cart-close]');
    const rmBtn = t.closest('[data-sm-cart-remove]');
    const couponBtn = t.closest('[data-sm-coupon]');
    const checkoutBtn = t.closest('[data-sm-checkout]');
    const loginBtn = t.closest('[data-sm-login]');
    const regBtn = t.closest('[data-sm-register]');
    const logoutBtn = t.closest('[data-sm-logout]');

    function fetchAnyItem(id) {
      // courses first, then e-books (both are buyable)
      return apiGet('/api/public/courses/' + id).catch(function () { return apiGet('/api/public/ebooks/' + id); });
    }
    if (addBtn) {
      e.preventDefault();
      const id = addBtn.dataset.smAdd;
      const found = SM.courses.find(c => String(c.id) === String(id));
      if (found) addToCart(found);
      else fetchAnyItem(id).then(function (j) { addToCart(j.data); }).catch(function (err) { toast(err.message, false); });
      return;
    }
    if (buyBtn) {
      e.preventDefault();
      const id = buyBtn.dataset.smBuy;
      const found = SM.courses.find(c => String(c.id) === String(id));
      const after = function (course) {
        SM.cart = [cartItemOf(course)];
        saveCart();
        window.location.href = 'cart.html';
      };
      if (found) after(found);
      else fetchAnyItem(id).then(function (j) { after(j.data); }).catch(function (err) { toast(err.message, false); });
      return;
    }
    if (openBtn) { e.preventDefault(); window.location.href = 'cart.html'; return; }
    if (closeBtn) { e.preventDefault(); closeCart(); return; }
    if (rmBtn) { e.preventDefault(); removeFromCart(rmBtn.dataset.smCartRemove); renderCartBox(); return; }
    if (couponBtn) { e.preventDefault(); applyCoupon(); return; }
    if (checkoutBtn) { e.preventDefault(); checkout(); return; }
    if (loginBtn) { e.preventDefault(); doLogin(); return; }
    if (regBtn) { e.preventDefault(); doRegister(); return; }
    if (logoutBtn) { e.preventDefault(); doLogout(); return; }

    const cartLink = t.closest('[data-sm-cart-link]') ||
      (t.closest('a') && t.closest('a').querySelector('#cartBadge') ? t.closest('a') : null);
    if (cartLink) { e.preventDefault(); window.location.href = 'cart.html'; }
  });

  /* ---------------- URL filters (courses page) ---------------- */
  function applyUrlFilters() {
    const params = new URLSearchParams(location.search);
    const batch = params.get('batch');
    const category = params.get('category');
    const q = params.get('q');
    const blocks = $$('[data-sm-courses]');
    if (!blocks.length) return;
    if (batch) blocks.forEach(function (b) { b.dataset.smBatch = batch; });
    if (category) blocks.forEach(function (b) { b.dataset.smCategory = category; });
    if (q) blocks.forEach(function (b) { b.dataset.smQ = q; });
  }

  /* ---------------- init ---------------- */
  async function init() {
    if (SMStarted) return;
    SMStarted = true;
    try {
      await hydrateSettings();
      applyUrlFilters();
      paintCartBadges();
      await hydrateBatchPills();
      await hydrateCategories();
      await hydrateStats();
      await hydrateCourseBlocks();
      await hydrateCourseDetail();
      if ($('[data-sm-auth]') || $('[data-sm-myorders]')) {
        await loadMe();
        loadMyOrders();
      }
    } catch (err) {
      console.warn('StudyMart data load warning:', err.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();







