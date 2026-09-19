/* =========================================================
   StudyMart - Admin Panel Application
   Sections: Dashboard, Courses, Batches, Categories,
             Platforms, Coupons, Users, Orders, Settings
   ========================================================= */
(function () {
  'use strict';

  const API = '';
  const state = {
    token: sessionStorage.getItem('sm_admin_token') || '',
    admin: null,
    meta: { batches: [], ebookBatches: [], categories: [], platforms: [] },
    lists: {}
  };

  /* ---------------- helpers ---------------- */
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const cur = n => '৳' + Number(n || 0).toLocaleString('en-IN');
  const dt = v => {
    if (!v) return '-';
    const d = new Date(v);
    if (isNaN(d.getTime())) return esc(v);
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  let toastTimer = null;
  function toast(msg, ok) {
    const t = $('toast');
    t.textContent = msg;
    t.style.background = ok === false ? '#DC2626' : '#0F2043';
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
  }

  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {});
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    const res = await fetch(API + path, Object.assign({}, opts, { headers }));
    let json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    if (res.status === 401) {
      logout(true);
      throw new Error((json && json.message) || 'Session expired, please login again');
    }
    if (!res.ok || !json || json.success === false) {
      throw new Error((json && json.message) || ('Request failed (HTTP ' + res.status + ')'));
    }
    return json;
  }

  /* ---------------- modal ---------------- */
  function openModal(html) {
    $('modalBox').innerHTML = html;
    $('modalWrap').classList.remove('hidden');
  }
  function closeModal() {
    $('modalWrap').classList.add('hidden');
    $('modalBox').innerHTML = '';
  }
  window.closeModal = closeModal;
  $('modalWrap').addEventListener('click', e => { if (e.target === $('modalWrap')) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  function confirmDialog(title, text, onYes, yesLabel) {
    openModal(`
      <div class="p-6">
        <div class="flex items-start gap-3">
          <div class="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <i class="fa-solid fa-triangle-exclamation text-red-600 text-[18px]"></i>
          </div>
          <div>
            <h3 class="text-[16px] font-extrabold text-[#0F2043]">${esc(title)}</h3>
            <p class="text-[13px] text-slate-600 mt-1">${esc(text)}</p>
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-6">
          <button onclick="closeModal()" class="px-4 py-2 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700">Cancel</button>
          <button id="confirmYes" class="px-4 py-2 rounded-[10px] bg-red-600 hover:bg-red-700 font-bold text-[13px] text-white">${esc(yesLabel || 'Yes, Delete')}</button>
        </div>
      </div>`);
    $('confirmYes').addEventListener('click', function () {
      closeModal();
      onYes();
    });
  }

  /* ---------------- auth ---------------- */
  function showLogin() {
    $('loginScreen').classList.remove('hidden');
    $('appShell').classList.add('hidden');
  }
  function showApp() {
    $('loginScreen').classList.add('hidden');
    $('appShell').classList.remove('hidden');
    if (state.admin) {
      $('adminName').textContent = state.admin.name || 'Admin';
      $('adminAvatar').textContent = (state.admin.name || 'A').charAt(0).toUpperCase();
    }
  }
  async function logout(silent) {
    if (state.token) {
      try {
        await fetch(API + '/api/admin/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + state.token } });
      } catch (e) {}
    }
    sessionStorage.removeItem('sm_admin_token');
    state.token = '';
    state.admin = null;
    showLogin();
    if (!silent) toast('Logged out');
  }

  $('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const errBox = $('loginError');
    errBox.classList.add('hidden');
    try {
      const json = await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username: $('loginUser').value.trim(), password: $('loginPass').value })
      });
      state.token = json.token;
      state.admin = json.data;
      sessionStorage.setItem('sm_admin_token', json.token);
      showApp();
      await boot();
      toast('Welcome back, ' + (json.data.name || 'Admin'));
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  });

  $('logoutBtn').addEventListener('click', function () { logout(false); });
  $('menuBtn').addEventListener('click', function () {
    $('sidebar').classList.toggle('-translate-x-full');
    $('backdrop').classList.toggle('hidden');
  });
  $('backdrop').addEventListener('click', function () {
    $('sidebar').classList.add('-translate-x-full');
    $('backdrop').classList.add('hidden');
  });

  /* ---------------- navigation ---------------- */
  const NAV = [
    { key: 'dashboard', label: 'Dashboard', icon: 'fa-chart-line', sub: 'Overview of your platform' },
    { key: 'homepage', label: 'Home Page', icon: 'fa-house-chimney', sub: 'Edit / Modify hero & sections' },
    { key: 'courses', label: 'Course List', icon: 'fa-book-open', sub: 'Add / edit / delete courses' },
    { key: 'batches', label: 'Batch Manage', icon: 'fa-layer-group', sub: 'HSC, SSC & Admission batches' },
    { key: 'ebookBatches', label: 'E-Book Batch', icon: 'fa-book-open', sub: 'Alada E-Book batch create korun' },
    { key: 'categories', label: 'Category Manage', icon: 'fa-tags', sub: 'Course categories' },
    { key: 'platforms', label: 'Platform Manage', icon: 'fa-share-nodes', sub: 'Where courses are delivered' },
    { key: 'ebooks', label: 'E-Book Manage', icon: 'fa-book', sub: 'PDF books students can download' },
    { key: 'coupons', label: 'Coupon Manage', icon: 'fa-ticket', sub: 'Discount coupons' },
    { key: 'users', label: 'User List', icon: 'fa-users', sub: 'All registered students' },
    { key: 'orders', label: 'Orders', icon: 'fa-cart-shopping', sub: 'All orders & payments' },
    { key: 'settings', label: 'Settings', icon: 'fa-gear', sub: 'Site settings & admin password' }
  ];

  function renderNav(active) {
    const pagesHeader = '<div class="px-3 pt-3 pb-1 text-[10px] font-black tracking-[0.14em] text-white/40 uppercase">Pages</div>';
    let html = '';
    NAV.forEach(n => {
      if (n.key === 'homepage') html += pagesHeader;
      html += `<a href="#/${n.key}" class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-slate-300 hover:bg-white/10 transition ${n.key === active ? 'active' : ''}"><i class="fa-solid ${n.icon} w-5 text-center text-[14px]"></i> ${esc(n.label)}</a>`;
    });
    $('sideNav').innerHTML = html;
  }

  function route() {
    const key = (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
    const page = NAV.find(n => n.key === key) || NAV[0];
    renderNav(page.key);
    $('pageTitle').textContent = page.label;
    $('pageSub').textContent = page.sub;
    $('view').classList.remove('fade');
    void $('view').offsetWidth;
    $('view').classList.add('fade');
    $('backdrop').classList.add('hidden');
    if (window.innerWidth < 1024) $('sidebar').classList.add('-translate-x-full');
    if (page.key === 'dashboard') return renderDashboard();
    if (page.key === 'homepage') return renderHomePage();
    if (page.key === 'users') return renderUsers();
    if (page.key === 'orders') return renderOrders();
    if (page.key === 'settings') return renderSettings();
    return renderResource(page.key);
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('load', function () {
    if (window.innerWidth >= 1024) $('sidebar').classList.remove('-translate-x-full');
  });

  /* ---------------- Dashboard ---------------- */
  function statCard(icon, label, value, color, bg, extra) {
    return `
      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-4">
        <div class="flex items-start justify-between">
          <div class="w-11 h-11 rounded-[12px] flex items-center justify-center" style="background:${bg}">
            <i class="fa-solid ${icon}" style="color:${color}"></i>
          </div>
          ${extra ? `<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500">${esc(extra)}</span>` : ''}
        </div>
        <div class="text-[22px] font-extrabold text-[#0F2043] mt-3">${value}</div>
        <div class="text-[11.5px] font-semibold text-slate-500">${esc(label)}</div>
      </div>`;
  }

  function statusClass(status) {
    return {
      pending: 'bg-[#FFF2E6] text-[#F59E0B]',
      confirmed: 'bg-[#E6F0FF] text-[#1A56FF]',
      completed: 'bg-[#E6F4EA] text-[#16A34A]',
      cancelled: 'bg-red-50 text-red-600',
      active: 'bg-[#E6F4EA] text-[#16A34A]',
      inactive: 'bg-slate-100 text-slate-500',
      blocked: 'bg-red-50 text-red-600',
      banned: 'bg-red-50 text-red-600'
    }[status] || 'bg-slate-100 text-slate-500';
  }

  function errorBox(msg) {
    return `<div class="bg-red-50 border border-red-100 rounded-[14px] p-6 text-center">
      <i class="fa-solid fa-circle-exclamation text-red-500 text-[22px]"></i>
      <p class="text-[13px] font-semibold text-red-700 mt-2">${esc(msg)}</p>
      <button onclick="location.reload()" class="mt-3 px-4 py-2 rounded-[10px] bg-red-600 text-white font-bold text-[12px]">Reload</button>
    </div>`;
  }

  function emptyRow(cols, text) {
    return `<tr><td colspan="${cols}" class="px-5 py-10 text-center text-slate-400 text-[13px]">
      <i class="fa-regular fa-folder-open text-[20px] block mb-1"></i>${esc(text || 'No data found')}</td></tr>`;
  }

  async function renderDashboard() {
    const view = $('view');
    view.innerHTML = `<div class="text-center py-20 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-[22px]"></i><p class="text-[13px] mt-2">Loading dashboard...</p></div>`;
    try {
      const json = await api('/api/admin/stats');
      const d = json.data;
      const t = d.totals;
      const v = d.todayVisitors || { total: 0, pc: 0, phone: 0, pcPercent: 0, phonePercent: 0, views: 0, pcViews: 0, phoneViews: 0 };
      const maxRev = Math.max(1, ...d.last7Days.map(x => x.revenue));
      const maxOrders = Math.max(1, ...d.last7Days.map(x => x.orders));

      view.innerHTML = `
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          ${statCard('fa-sack-dollar', 'Total Revenue', cur(t.revenue), '#16A34A', '#E6F4EA', 'paid orders')}
          ${statCard('fa-cart-shopping', 'Total Orders', t.orders, '#1A56FF', '#E6F0FF', t.pendingOrders + ' pending')}
          ${statCard('fa-users', 'Total Students', t.users, '#7C3AED', '#EDE9FF', '')}
          ${statCard('fa-book-open', 'Total Courses', t.courses, '#F59E0B', '#FFF2E6', t.activeCourses + ' active')}
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4">
          ${statCard('fa-layer-group', 'Batches', t.batches, '#4F46E5', '#EDE9FF', '')}
          ${statCard('fa-tags', 'Categories', t.categories, '#0EA5E9', '#E0F2FE', '')}
          ${statCard('fa-share-nodes', 'Platforms', t.platforms, '#DB2777', '#FCE7F3', '')}
          ${statCard('fa-ticket', 'Coupons', t.coupons, '#CA8A04', '#FEF9C3', 'unpaid ' + cur(t.pendingRevenue))}
        </div>

        <!-- ================= TODAYS VISITOR SECTION ================= -->
        <div class="bg-white rounded-[16px] border border-slate-100 shadow-sm p-5 sm:p-6 mt-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#1A56FF] to-[#4F46E5] text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                <i class="fa-solid fa-users-viewfinder text-[17px]"></i>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-[16px] font-extrabold text-[#0F2043]">Todays Visitor</h3>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Live Today
                  </span>
                </div>
                <p class="text-[11.5px] text-slate-500 mt-0.5">Real-time visitor breakdown by device (PC vs Phone)</p>
              </div>
            </div>
            <div class="flex items-center gap-2 text-[12px] font-bold text-slate-500">
              <span class="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                <i class="fa-regular fa-calendar text-slate-400"></i> ${esc(v.date || 'Today')}
              </span>
              <button onclick="window.location.reload()" class="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 transition" title="Refresh">
                <i class="fa-solid fa-arrows-rotate"></i>
              </button>
            </div>
          </div>

          <!-- 3 Device Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-4">
            <!-- Total Visitors -->
            <div class="bg-slate-50/80 border border-slate-200/70 rounded-[14px] p-4 flex items-center justify-between">
              <div>
                <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Visitors</div>
                <div class="text-[26px] font-black text-[#0F2043] mt-1">${v.total}</div>
                <div class="text-[11px] font-medium text-slate-500 mt-0.5"><i class="fa-regular fa-eye mr-1 text-slate-400"></i>${v.views} Page Views</div>
              </div>
              <div class="w-12 h-12 rounded-[12px] bg-white border border-slate-200 text-[#0F2043] flex items-center justify-center text-[20px] shadow-sm">
                <i class="fa-solid fa-chart-pie text-[#1A56FF]"></i>
              </div>
            </div>

            <!-- PC Users -->
            <div class="bg-gradient-to-br from-blue-50/60 to-white border border-blue-100 rounded-[14px] p-4 flex items-center justify-between">
              <div>
                <div class="flex items-center gap-1.5">
                  <span class="text-[11px] font-bold text-blue-900 uppercase tracking-wider">PC Users</span>
                  <span class="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">${v.pcPercent}%</span>
                </div>
                <div class="text-[26px] font-black text-blue-900 mt-1">${v.pc}</div>
                <div class="text-[11px] font-medium text-blue-600/80 mt-0.5"><i class="fa-solid fa-desktop mr-1 text-blue-400"></i>${v.pcViews} Desktop Views</div>
              </div>
              <div class="w-12 h-12 rounded-[12px] bg-[#1A56FF] text-white flex items-center justify-center text-[20px] shadow-md shadow-blue-500/25">
                <i class="fa-solid fa-desktop"></i>
              </div>
            </div>

            <!-- Phone Users -->
            <div class="bg-gradient-to-br from-purple-50/60 to-white border border-purple-100 rounded-[14px] p-4 flex items-center justify-between">
              <div>
                <div class="flex items-center gap-1.5">
                  <span class="text-[11px] font-bold text-purple-900 uppercase tracking-wider">Phone Users</span>
                  <span class="text-[10px] font-black px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">${v.phonePercent}%</span>
                </div>
                <div class="text-[26px] font-black text-purple-900 mt-1">${v.phone}</div>
                <div class="text-[11px] font-medium text-purple-600/80 mt-0.5"><i class="fa-solid fa-mobile-screen-button mr-1 text-purple-400"></i>${v.phoneViews} Mobile Views</div>
              </div>
              <div class="w-12 h-12 rounded-[12px] bg-[#7C3AED] text-white flex items-center justify-center text-[20px] shadow-md shadow-purple-500/25">
                <i class="fa-solid fa-mobile-screen-button"></i>
              </div>
            </div>
          </div>

          <!-- Ratio Progress Bar -->
          <div class="mt-4 pt-3.5 border-t border-slate-100">
            <div class="flex items-center justify-between text-[12px] font-bold mb-2">
              <span class="flex items-center gap-1.5 text-blue-700">
                <i class="fa-solid fa-desktop text-[12px]"></i> PC Users: <span class="text-[#0F2043]">${v.pc}</span> (${v.pcPercent}%)
              </span>
              <span class="flex items-center gap-1.5 text-purple-700">
                Phone Users: <span class="text-[#0F2043]">${v.phone}</span> (${v.phonePercent}%) <i class="fa-solid fa-mobile-screen-button text-[12px]"></i>
              </span>
            </div>
            <div class="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex p-0.5 gap-0.5">
              <div class="h-full bg-[#1A56FF] rounded-full transition-all duration-500" style="width:${v.total ? Math.max(5, v.pcPercent) : 50}%" title="PC Users: ${v.pcPercent}%"></div>
              <div class="h-full bg-[#7C3AED] rounded-full transition-all duration-500" style="width:${v.total ? Math.max(5, v.phonePercent) : 50}%" title="Phone Users: ${v.phonePercent}%"></div>
            </div>
            <div class="flex items-center justify-between text-[10.5px] text-slate-400 mt-1.5">
              <span><i class="fa-solid fa-circle text-[7px] text-[#1A56FF] mr-1"></i>Computer / Laptop / Windows / macOS</span>
              <span>Android / iPhone / Smartphone<i class="fa-solid fa-circle text-[7px] text-[#7C3AED] ml-1"></i></span>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-4 mt-4">
          <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
            <div class="flex items-center justify-between mb-5">
              <div>
                <h3 class="text-[15px] font-extrabold text-[#0F2043]">Last 7 Days Performance</h3>
                <p class="text-[11px] text-slate-500">Orders &amp; revenue trend</p>
              </div>
              <div class="flex items-center gap-3 text-[11px] font-semibold text-slate-500">
                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-[#1A56FF] inline-block"></span>Revenue</span>
                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-[#C7D9FF] inline-block"></span>Orders</span>
              </div>
            </div>
            <div class="flex items-end justify-between gap-2 sm:gap-4 h-[190px]">
              ${d.last7Days.map(day => `
                <div class="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                  <div class="text-[10px] font-bold text-[#16A34A]">${day.revenue ? cur(day.revenue) : ''}</div>
                  <div class="w-full flex items-end justify-center gap-1 h-full">
                    <div class="w-[45%] bg-[#1A56FF] rounded-t-[6px]" style="height:${Math.max(3, (day.revenue / maxRev) * 100)}%"></div>
                    <div class="w-[45%] bg-[#C7D9FF] rounded-t-[6px]" style="height:${Math.max(3, (day.orders / maxOrders) * 100)}%"></div>
                  </div>
                  <div class="text-[10px] font-semibold text-slate-500">${day.date.slice(5)}</div>
                </div>`).join('')}
            </div>
          </div>

          <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
            <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-1">Order Status</h3>
            <p class="text-[11px] text-slate-500 mb-4">Distribution of all orders</p>
            <div class="space-y-3">
              ${d.byStatus.map(s => {
                const pct = t.orders ? Math.round((s.count / t.orders) * 100) : 0;
                const color = { pending: '#F59E0B', confirmed: '#1A56FF', completed: '#16A34A', cancelled: '#DC2626' }[s.status] || '#64748B';
                return `
                <div>
                  <div class="flex items-center justify-between text-[12px] font-semibold text-slate-600 mb-1">
                    <span class="capitalize">${esc(s.status)}</span><span>${s.count} (${pct}%)</span>
                  </div>
                  <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full rounded-full" style="width:${pct}%;background:${color}"></div>
                  </div>
                </div>`;
              }).join('')}
            </div>
            <div class="mt-5 pt-4 border-t border-slate-100">
              <h4 class="text-[12px] font-extrabold text-[#0F2043] mb-2">Courses per Batch</h4>
              <div class="space-y-2">
                ${d.byBatch.map(b => `
                  <div class="flex items-center justify-between text-[12px]">
                    <span class="flex items-center gap-2 font-semibold text-slate-600">
                      <span class="w-2.5 h-2.5 rounded-full" style="background:${b.color || '#1A56FF'}"></span>${esc(b.batch)}
                    </span>
                    <span class="font-bold text-[#0F2043]">${b.courses}</span>
                  </div>`).join('') || '<p class="text-[12px] text-slate-400">No batches yet</p>'}
              </div>
            </div>
          </div>
        </div>
        ${dashboardBottom(d)}
      `;
    } catch (err) {
      view.innerHTML = errorBox(err.message);
    }
  }

  function dashboardBottom(d) {
    return `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 class="text-[14px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-clock-rotate-left text-[#1A56FF] mr-1"></i> Recent Orders</h3>
              <a href="#/orders" class="text-[12px] font-bold text-[#1A56FF]">View all</a>
            </div>
            <div class="divide-y divide-slate-100">
              ${d.recentOrders.length ? d.recentOrders.map(o => `
                <div class="px-5 py-3 flex items-center justify-between gap-3 hover:bg-[#F8F9FD]">
                  <div class="min-w-0">
                    <div class="text-[13px] font-bold text-[#0F2043] truncate">${esc(o.orderNo)} <span class="font-medium text-slate-500">- ${esc((o.customer && o.customer.name) || 'Guest')}</span></div>
                    <div class="text-[11px] text-slate-500">${o.items.length} course(s) - ${dt(o.createdAt)}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-[13px] font-extrabold text-[#0F2043]">${cur(o.total)}</div>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${statusClass(o.status)}">${esc(o.status)}</span>
                  </div>
                </div>`).join('') : '<p class="px-5 py-8 text-center text-[13px] text-slate-400">No orders yet</p>'}
            </div>
          </div>

          <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 class="text-[14px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-user-plus text-[#1A56FF] mr-1"></i> New Students</h3>
              <a href="#/users" class="text-[12px] font-bold text-[#1A56FF]">View all</a>
            </div>
            <div class="divide-y divide-slate-100">
              ${d.recentUsers.length ? d.recentUsers.map(u => `
                <div class="px-5 py-3 flex items-center gap-3 hover:bg-[#F8F9FD]">
                  <div class="w-9 h-9 rounded-full bg-[#EDE9FF] text-[#4F46E5] font-extrabold text-[13px] flex items-center justify-center">${esc((u.name || 'U').charAt(0).toUpperCase())}</div>
                  <div class="min-w-0 flex-1">
                    <div class="text-[13px] font-bold text-[#0F2043] truncate">${esc(u.name)}</div>
                    <div class="text-[11px] text-slate-500 truncate">${esc(u.email)}</div>
                  </div>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${statusClass(u.status)}">${esc(u.status || 'active')}</span>
                </div>`).join('') : '<p class="px-5 py-8 text-center text-[13px] text-slate-400">No students registered yet</p>'}
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <a href="#/courses" class="bg-[#0F2043] text-white rounded-[14px] p-5 hover:bg-[#16294F] transition">
            <i class="fa-solid fa-plus-circle text-[22px] text-[#4D8BFF]"></i>
            <div class="text-[14px] font-extrabold mt-3">Add New Course</div>
            <p class="text-[11.5px] text-slate-300">Create a course under any batch</p>
          </a>
          <a href="#/coupons" class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5 hover:shadow-md transition">
            <i class="fa-solid fa-ticket text-[22px] text-[#CA8A04]"></i>
            <div class="text-[14px] font-extrabold mt-3 text-[#0F2043]">Create Coupon</div>
            <p class="text-[11.5px] text-slate-500">Percent or flat discount codes</p>
          </a>
          <a href="#/settings" class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5 hover:shadow-md transition">
            <i class="fa-solid fa-sliders text-[22px] text-[#7C3AED]"></i>
            <div class="text-[14px] font-extrabold mt-3 text-[#0F2043]">Site Settings</div>
            <p class="text-[11.5px] text-slate-500">Telegram, phone, currency &amp; more</p>
          </a>
        </div>`;
  }

  /* ---------------- Resource definitions ---------------- */
  const REL = {
    batch: () => state.meta.batches.map(b => ({ value: b.id, label: b.name })),
    ebookBatch: () => (state.meta.ebookBatches || []).map(b => ({ value: b.id, label: b.name })),
    category: () => state.meta.categories.map(c => ({ value: c.id, label: c.name })),
    platform: () => state.meta.platforms.map(p => ({ value: p.id, label: p.name })),
    status: () => [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]
  };

  function relName(kind, id) {
    const list = state.meta[kind === 'batch' ? 'batches' : kind === 'category' ? 'categories' : 'platforms'] || [];
    const found = list.find(i => String(i.id) === String(id));
    return found ? found.name : '-';
  }

  function badge(text) {
    return `<span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${statusClass(text)}">${esc(text)}</span>`;
  }

  function fmtSize(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + 'MB';
    if (n >= 1024) return Math.round(n / 1024) + 'KB';
    return n + 'B';
  }

  const RESOURCES = {
    courses: {
      endpoint: '/api/admin/courses',
      singular: 'Course',
      addLabel: 'Add New Course',
      columns: [
        { key: 'id', label: '#', cell: r => `<span class="text-slate-400 font-bold">${r.id}</span>` },
        { key: 'title', label: 'Course', cell: r => `
            <div class="font-bold text-[#0F2043]">${esc(r.title)}</div>
            <div class="text-[11px] text-slate-500">${esc(r.teacher || 'No teacher')}${r.featured ? ' - <span class="text-[#F59E0B] font-bold">Featured</span>' : ''}</div>` },
        { key: 'batchId', label: 'Batch', cell: r => `<span class="px-2 py-0.5 rounded-full bg-[#EDE9FF] text-[#4F46E5] text-[11px] font-bold">${esc(relName('batch', r.batchId))}</span>` },
        { key: 'categoryId', label: 'Category', cell: r => esc(relName('category', r.categoryId)) },
        { key: 'platformId', label: 'Platform', cell: r => esc(relName('platform', r.platformId)) },
        { key: 'price', label: 'Price', cell: r => `<span class="font-bold text-[#0F2043]">${cur(r.price)}</span>${r.oldPrice ? ` <span class="text-[11px] text-slate-400 line-through">${cur(r.oldPrice)}</span>` : ''}` },
        { key: 'status', label: 'Status', cell: r => badge(r.status || 'active') }
      ],
      filters: [
        { field: 'batchId', allLabel: 'All Batches', options: () => REL.batch() },
        { field: 'categoryId', allLabel: 'All Categories', options: () => REL.category() },
        { field: 'platformId', allLabel: 'All Platforms', options: () => REL.platform() }
      ],
      fields: [
        { name: 'title', label: 'Course Title', type: 'text', required: true, span: 2 },
        { name: 'teacher', label: 'Teacher Name', type: 'text' },
        { name: 'batchId', label: 'Batch', type: 'select', options: REL.batch, required: true },
        { name: 'categoryId', label: 'Category', type: 'select', options: REL.category, required: true },
        { name: 'platformId', label: 'Platform', type: 'select', options: REL.platform },
        { name: 'price', label: 'Price (৳)', type: 'number' },
        { name: 'oldPrice', label: 'Old Price (৳)', type: 'number' },
        { name: 'duration', label: 'Duration', type: 'text', placeholder: '3 Months' },
        { name: 'totalClass', label: 'Total Class', type: 'number' },
        { name: 'thumbnail', label: 'Thumbnail URL', type: 'text', span: 2 },
        { name: 'description', label: 'Description', type: 'textarea', span: 3 },
        { name: 'featured', label: 'Show as Featured on homepage', type: 'checkbox' },
        { name: 'status', label: 'Status', type: 'select', options: REL.status }
      ]
    },
    batches: {
      endpoint: '/api/admin/batches',
      singular: 'Batch',
      addLabel: 'Add New Batch',
      columns: [
        { key: 'order', label: '#', cell: r => `<span class="px-2 py-1 rounded bg-slate-100 text-[#0F2043] text-[11px] font-bold">${r.order || '-'}</span>` },
        { key: 'name', label: 'Batch', cell: r => `
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0" style="background:${esc(r.color||'#EEF2FF')};border:1px solid #E2E8F0">
              ${r.iconUrl ? `<img src="${esc(r.iconUrl)}" class="w-full h-full object-contain p-1">` : `<i class="fa-solid ${esc(r.icon||'fa-layer-group')} text-[13px]" style="color:${esc(r.color||'#6366F1')}"></i>`}
            </div>
            <div>
              <div class="font-bold text-[#0F2043] text-[13px]">${esc(r.name)}</div>
              <div class="text-[11px] text-slate-500">slug: ${esc(r.slug || '-')}</div>
            </div>
          </div>` },
        { key: 'color', label: 'Theme', cell: r => `<span class="inline-flex items-center gap-2"><span class="w-4 h-4 rounded" style="background:${esc(r.color||'#6366F1')};border:1px solid #E2E8F0"></span>${esc(r.color||'-')}</span>` },
        { key: 'status', label: 'Status', cell: r => badge(r.status || 'active') }
      ],
      fields: [
        { name: 'name', label: 'Batch Name', type: 'text', required: true, placeholder: 'HSC 26' },
        { name: 'slug', label: 'Slug (auto)', type: 'text', placeholder: 'hsc26' },
        { name: 'order', label: 'Serial (show order)', type: 'number', placeholder: '1' },
        { name: 'icon', label: 'Icon (FontAwesome)', type: 'text', placeholder: 'fa-graduation-cap' },
        { name: 'iconUrl', label: 'Icon Image (Upload)', type: 'image', placeholder: 'Upload or paste URL' },
        { name: 'color', label: 'Theme Color', type: 'color' },
        { name: 'status', label: 'Status', type: 'select', options: REL.status }
      ]
    },
    ebookBatches: {
      endpoint: '/api/admin/ebookBatches',
      singular: 'E-Book Batch',
      addLabel: 'Add New E-Book Batch',
      columns: [
        { key: 'order', label: '#', cell: r => `<span class="px-2 py-1 rounded bg-slate-100 text-[#0F2043] text-[11px] font-bold">${r.order || '-'}</span>` },
        { key: 'name', label: 'E-Book Batch', cell: r => `
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0" style="background:${esc(r.color||'#E0F2FE')};border:1px solid #E2E8F0">
              ${r.iconUrl ? `<img src="${esc(r.iconUrl)}" class="w-full h-full object-contain p-1">` : `<i class="fa-solid ${esc(r.icon||'fa-book-open')} text-[13px]" style="color:${esc(r.color||'#0EA5E9')}"></i>`}
            </div>
            <div>
              <div class="font-bold text-[#0F2043] text-[13px]">${esc(r.name)}</div>
              <div class="text-[11px] text-slate-500">slug: ${esc(r.slug || '-')}</div>
            </div>
          </div>` },
        { key: 'color', label: 'Theme', cell: r => `<span class="inline-flex items-center gap-2"><span class="w-4 h-4 rounded" style="background:${esc(r.color||'#0EA5E9')};border:1px solid #E2E8F0"></span>${esc(r.color||'-')}</span>` },
        { key: 'status', label: 'Status', cell: r => badge(r.status || 'active') }
      ],
      fields: [
        { name: 'name', label: 'E-Book Batch Name', type: 'text', required: true, placeholder: 'HSC 26 E-Book' },
        { name: 'slug', label: 'Slug (auto)', type: 'text', placeholder: 'hsc26-ebook' },
        { name: 'order', label: 'Serial (show order)', type: 'number', placeholder: '1' },
        { name: 'icon', label: 'Icon (FontAwesome)', type: 'text', placeholder: 'fa-book-open' },
        { name: 'iconUrl', label: 'Icon Image (Upload)', type: 'image', placeholder: 'Upload or paste URL' },
        { name: 'color', label: 'Theme Color', type: 'color' },
        { name: 'status', label: 'Status', type: 'select', options: REL.status }
      ]
    },
    categories: {
      endpoint: '/api/admin/categories',
      singular: 'Category',
      addLabel: 'Add New Category',
      columns: [
        { key: 'id', label: '#', cell: r => `<span class="text-slate-400 font-bold">${r.id}</span>` },
        { key: 'name', label: 'Category', cell: r => `<div class="font-bold text-[#0F2043]"><i class="fa-solid ${esc(r.icon || 'fa-tag')} mr-1 text-[#1A56FF]"></i>${esc(r.name)}</div><div class="text-[11px] text-slate-500">slug: ${esc(r.slug || '-')}</div>` },
        { key: 'color', label: 'Color', cell: r => `<span class="inline-flex items-center gap-2"><span class="w-4 h-4 rounded" style="background:${esc(r.color || '#EDE9FF')};border:1px solid #E2E8F0"></span>${esc(r.color || '-')}</span>` },
        { key: 'status', label: 'Status', cell: r => badge(r.status || 'active') }
      ],
      fields: [
        { name: 'name', label: 'Category Name', type: 'text', required: true, placeholder: 'Academic' },
        { name: 'icon', label: 'FontAwesome Icon', type: 'text', placeholder: 'fa-graduation-cap' },
        { name: 'slug', label: 'Slug (auto)', type: 'text', placeholder: 'academic' },
        { name: 'color', label: 'Background Color', type: 'color' },
        { name: 'status', label: 'Status', type: 'select', options: REL.status }
      ]
    },
    platforms: {
      endpoint: '/api/admin/platforms',
      singular: 'Platform',
      addLabel: 'Add New Platform',
      columns: [
        { key: 'id', label: '#', cell: r => `<span class="text-slate-400 font-bold">${r.id}</span>` },
        { key: 'name', label: 'Platform', cell: r => `<div class="font-bold text-[#0F2043]">${esc(r.name)}</div>` },
        { key: 'status', label: 'Status', cell: r => badge(r.status || 'active') }
      ],
      fields: [
        { name: 'name', label: 'Platform Name', type: 'text', required: true, span: 2, placeholder: 'ACS' },
        { name: 'status', label: 'Status', type: 'select', options: REL.status }
      ]
    },
    ebooks: {
      endpoint: '/api/admin/ebooks',
      singular: 'E-Book',
      addLabel: 'Add New E-Book',
      columns: [
        { key: 'id', label: '#', cell: r => `<span class="text-slate-400 font-bold">${r.id}</span>` },
        { key: 'ebookBatchId', label: 'E-Book Batch', cell: r => {
          const eb = (state.meta.ebookBatches || []).find(x => String(x.id) === String(r.ebookBatchId));
          if (eb) return `<span class="px-2 py-0.5 rounded-full bg-[#E0F2FE] text-[#0284C7] text-[11px] font-bold whitespace-nowrap">${esc(eb.name)}</span>`;
          if (r.batchId) return `<span class="px-2 py-0.5 rounded-full bg-[#EDE9FF] text-[#4F46E5] text-[11px] font-bold whitespace-nowrap">${esc(relName('batch', r.batchId))}</span>`;
          return '<span class="text-slate-400 text-[11px]">—</span>';
        } },
        { key: 'title', label: 'E-Book', cell: r => `
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-12 rounded-[6px] bg-[#F8F9FD] border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
              ${r.cover ? `<img src="${esc(r.cover)}" class="w-full h-full object-cover">` : `<i class="fa-solid fa-book text-slate-300"></i>`}
            </div>
            <div class="min-w-0">
              <div class="font-bold text-[#0F2043] truncate max-w-[220px]">${esc(r.title)}</div>
              <div class="text-[11px] text-slate-500 truncate max-w-[220px]">${esc(r.details || 'No details')}</div>
            </div>
          </div>` },
        { key: 'fileUrl', label: 'File', cell: r => (r.fileUrl
            ? `<a href="${esc(r.fileUrl)}" target="_blank" class="px-2 py-0.5 rounded-full bg-[#E6F4EA] text-[#16A34A] text-[11px] font-bold"><i class="fa-solid fa-file-pdf mr-0.5"></i> PDF${r.fileSize ? ' • ' + fmtSize(r.fileSize) : ''}</a>`
            : r.linkUrl
              ? `<span class="px-2 py-0.5 rounded-full bg-[#E0F2FE] text-[#0EA5E9] text-[11px] font-bold"><i class="fa-solid fa-link mr-0.5"></i> Link</span>`
              : '<span class="text-slate-400 text-[11px]">—</span>') },
        { key: 'price', label: 'Price', cell: r => (Number(r.price) > 0
            ? `<span class="font-bold text-[#0F2043]">৳${esc(r.price)}</span>${Number(r.oldPrice) > Number(r.price) ? ` <span class="text-[11px] text-slate-400 line-through">৳${esc(r.oldPrice)}</span>` : ''}`
            : `<span class="px-2 py-0.5 rounded-full bg-[#E6F4EA] text-[#16A34A] text-[11px] font-bold">FREE</span>`) },
        { key: 'downloads', label: 'Downloads', cell: r => `<span class="font-bold text-[#0F2043]">${Number(r.downloads || 0)}</span>` },
        { key: 'status', label: 'Status', cell: r => badge(r.status || 'active') }
      ],
      fields: []
    },
    coupons: {
      endpoint: '/api/admin/coupons',
      singular: 'Coupon',
      addLabel: 'Create Coupon',
      columns: [
        { key: 'code', label: 'Code', cell: r => `<span class="px-2 py-1 rounded-[6px] bg-[#0F2043] text-white text-[12px] font-extrabold tracking-wider">${esc(r.code)}</span>` },
        { key: 'type', label: 'Discount', cell: r => `<span class="font-bold text-[#0F2043]">${r.type === 'percent' ? esc(r.value) + '%' : cur(r.value)}</span> <span class="text-slate-500 text-[11px]">off</span>` },
        { key: 'courseIds', label: 'Applies To', cell: r => (!Array.isArray(r.courseIds) || !r.courseIds.length
          ? '<span class="px-2 py-0.5 rounded-full bg-[#EDE9FF] text-[#4F46E5] text-[11px] font-bold">All Courses</span>'
          : `<span class="px-2 py-0.5 rounded-full bg-[#E6F4EA] text-[#16A34A] text-[11px] font-bold">${r.courseIds.length === 1 ? '1 Course' : r.courseIds.length + ' Courses'}</span>`) },
        { key: 'minOrder', label: 'Min Order', cell: r => cur(r.minOrder) },
        { key: 'maxDiscount', label: 'Max Discount', cell: r => cur(r.maxDiscount) },
        { key: 'used', label: 'Used', cell: r => `<span class="font-bold text-[#0F2043]">${Number(r.used || 0)}</span><span class="text-slate-400"> / ${Number(r.usageLimit || 0)}</span>` },
        { key: 'expiresAt', label: 'Expires', cell: r => esc(r.expiresAt || '-') },
        { key: 'status', label: 'Status', cell: r => badge(r.status || 'active') }
      ],
      fields: [
        { name: 'code', label: 'Coupon Code', type: 'text', required: true, placeholder: 'SAVE10' },
        { name: 'type', label: 'Discount Type', type: 'select', options: () => [{ value: 'percent', label: 'Percent (%)' }, { value: 'fixed', label: 'Fixed Amount' }] },
        { name: 'value', label: 'Discount Value', type: 'number', required: true },
        { name: 'minOrder', label: 'Minimum Order', type: 'number' },
        { name: 'maxDiscount', label: 'Maximum Discount', type: 'number' },
        { name: 'usageLimit', label: 'Usage Limit', type: 'number' },
        { name: 'expiresAt', label: 'Expiry Date', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', options: REL.status },
        { name: 'courseIds', label: 'Applies To — Single / Multi Course (tick na dile SOB course-e cholbe)', type: 'courses' }
      ]
    }
  };

  /* ---------------- Generic resource page ---------------- */
  async function renderResource(key) {
    const cfg = RESOURCES[key];
    const view = $('view');
    if (!cfg) { view.innerHTML = errorBox('Unknown section: ' + esc(key)); return; }
    view.innerHTML = `<div class="text-center py-20 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-[22px]"></i><p class="text-[13px] mt-2">Loading ${esc(cfg.singular)}s...</p></div>`;

    const json = await api(cfg.endpoint);
    state.lists[key] = json.data || [];
    if (key === 'batches') {
      state.lists[key].sort((a,b)=> ((Number(a.order)||999) - (Number(b.order)||999)) || (Number(a.id) - Number(b.id)));
    }

    view.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div class="relative flex-1 max-w-[320px]">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[13px]"></i>
          <input id="resSearch" placeholder="Search ${esc(cfg.singular.toLowerCase())}..."
            class="w-full bg-white border border-slate-200 rounded-[10px] pl-9 pr-3 py-2.5 text-[13px] outline-none focus:border-[#1A56FF]">
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[12px] font-bold text-slate-500 px-3 py-2.5 rounded-[10px] bg-white border border-slate-200">
            Total: <span id="resCount">${state.lists[key].length}</span>
          </span>
          <button id="resAdd" class="px-4 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px] transition">
            <i class="fa-solid fa-plus mr-1"></i> ${esc(cfg.addLabel)}
          </button>
        </div>
      </div>
      ${cfg.filters ? `
      <div class="flex flex-wrap items-center gap-2 mb-4">
        ${cfg.filters.map(f => `
          <select data-filter="${esc(f.field)}"
            class="bg-white border border-slate-200 rounded-[10px] px-3 py-2 text-[12.5px] font-semibold text-slate-700 outline-none focus:border-[#1A56FF] cursor-pointer max-w-[200px]">
            <option value="">${esc(f.allLabel)}</option>
            ${(f.options ? f.options() : []).map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}
          </select>`).join('')}
        <button id="resClearFilters" class="hidden px-3 py-2 rounded-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[12px] transition">
          <i class="fa-solid fa-xmark mr-1"></i> Clear
        </button>
      </div>` : ''}

      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-[13px]">
            <thead class="bg-[#F8F9FD] text-slate-500 text-[11px] uppercase">
              <tr>
                ${cfg.columns.map(c => `<th class="px-5 py-3 text-left font-bold whitespace-nowrap">${esc(c.label)}</th>`).join('')}
                <th class="px-5 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody id="resBody"></tbody>
          </table>
        </div>
      </div>`;

    function paint(list) {
      $('resCount').textContent = list.length;
      $('resBody').innerHTML = list.length ? list.map((r, idx) => `
        <tr class="border-t border-slate-100 hover:bg-[#F8F9FD]">
          ${cfg.columns.map(c => `<td class="px-5 py-3 align-middle">${c.cell(r)}</td>`).join('')}
          <td class="px-5 py-3 text-right whitespace-nowrap">
            <button data-edit="${r.id}" class="w-9 h-9 rounded-full bg-[#E6F0FF] text-[#1A56FF] hover:bg-[#DDE8FF] transition" title="Edit"><i class="fa-solid fa-pen text-[12px]"></i></button>
            ${key === 'courses' ? `<button data-dup="${r.id}" class="w-9 h-9 rounded-full bg-[#E6F4EA] text-[#16A34A] hover:bg-[#D3EBD8] transition" title="Duplicate (copy with classes)"><i class="fa-solid fa-copy text-[12px]"></i></button>` : ''}
            <button data-del="${r.id}" class="w-9 h-9 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition" title="Delete"><i class="fa-solid fa-trash text-[12px]"></i></button>
          </td>
        </tr>`).join('') : emptyRow(cfg.columns.length + 1, 'No ' + cfg.singular.toLowerCase() + ' found');
    }

    $('resBody').addEventListener('click', function (e) {
      const editBtn = e.target.closest('[data-edit]');
      const delBtn = e.target.closest('[data-del]');
      const dupBtn = e.target.closest('[data-dup]');
      if (editBtn) { if (key === 'courses') openCourseWizard(editBtn.dataset.edit); else if (key === 'ebooks') openEbookForm(editBtn.dataset.edit); else openForm(key, editBtn.dataset.edit); return; }
      if (dupBtn && key === 'courses') { openCourseDuplicate(dupBtn.dataset.dup); return; }
      if (delBtn) {
        const item = state.lists[key].find(x => String(x.id) === String(delBtn.dataset.del));
        const label = (item && (item.title || item.name || item.code)) || '';
        confirmDialog('Delete ' + cfg.singular + '?',
          'This will permanently remove "' + label + '".',
          async function () {
            try {
              await api(cfg.endpoint + '/' + delBtn.dataset.del, { method: 'DELETE' });
              toast(cfg.singular + ' deleted');
              refreshMeta().then(() => renderResource(key));
            } catch (err) { toast(err.message, false); }
          });
        return;
      }
    });

    function applyFilters() {
      const term = ($('resSearch').value || '').toLowerCase();
      const fvals = {};
      document.querySelectorAll('[data-filter]').forEach(s => { fvals[s.dataset.filter] = s.value; });
      const anyFilter = term || Object.keys(fvals).some(k => fvals[k]);
      const clearBtn = $('resClearFilters');
      if (clearBtn) clearBtn.classList.toggle('hidden', !anyFilter);
      paint(state.lists[key].filter(r => {
        if (term && !JSON.stringify(r).toLowerCase().includes(term)) return false;
        for (const k in fvals) {
          if (fvals[k] && String(r[k]) !== String(fvals[k])) return false;
        }
        return true;
      }));
    }
    $('resSearch').addEventListener('input', applyFilters);
    document.querySelectorAll('[data-filter]').forEach(s => s.addEventListener('change', applyFilters));
    const resClear = $('resClearFilters');
    if (resClear) resClear.addEventListener('click', function () {
      $('resSearch').value = '';
      document.querySelectorAll('[data-filter]').forEach(s => { s.value = ''; });
      applyFilters();
    });

    $('resAdd').addEventListener('click', function () { if (key === 'courses') openCourseWizard(null); else if (key === 'ebooks') openEbookForm(null); else openForm(key, null); });
    paint(state.lists[key]);
  }

  /* ---------------- Add / Edit form ---------------- */
  function fieldHtml(f, value) {
    const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white';
    const lbl = `<label class="text-[11px] font-bold text-slate-600 uppercase">${esc(f.label)}${f.required ? ' <span class="text-red-500">*</span>' : ''}</label>`;
    const span = f.span ? `sm:col-span-${f.span}` : '';

    if (f.type === 'textarea') {
      return `<div class="${span}">${lbl}<textarea data-field="${f.name}" rows="3" class="${base} mt-1" placeholder="${esc(f.placeholder || '')}">${esc(value || '')}</textarea></div>`;
    }
    if (f.type === 'select') {
      const opts = (f.options ? f.options() : []).map(o =>
        `<option value="${esc(o.value)}" ${String(o.value) === String(value == null ? '' : value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
      return `<div class="${span}">${lbl}<select data-field="${f.name}" class="${base} mt-1" ${f.required ? 'required' : ''}><option value="">-- Select --</option>${opts}</select></div>`;
    }
    if (f.type === 'checkbox') {
      return `<div class="${span} flex items-center gap-2 pt-5">
          <input data-field="${f.name}" type="checkbox" class="w-4 h-4 accent-[#1A56FF]" ${value ? 'checked' : ''}>
          <span class="text-[12.5px] font-semibold text-slate-700">${esc(f.label)}</span>
        </div>`;
    }
    if (f.type === 'courses') {
      // single/multi course target — checkbox list, async load (see openForm)
      return `<div class="sm:col-span-3">${lbl}<div data-coursebox class="mt-1 bg-[#F8F9FD] rounded-[8px] border border-slate-200 p-3 space-y-1.5 max-h-[220px] overflow-y-auto">
          <p class="text-[12px] text-slate-400 py-2 text-center"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading courses...</p>
        </div><p class="text-[10px] text-slate-400 mt-1">1 ta tick = single course, onek gula = multi course, kichu na = sob course-e cholbe</p></div>`;
    }
    if (f.type === 'color') {
      return `<div class="${span}">${lbl}<div class="flex items-center gap-2 mt-1">
          <input data-field="${f.name}" type="color" value="${esc(value || '#1A56FF')}" class="w-10 h-9 rounded border border-slate-200">
          <input data-field="${f.name}_text" type="text" value="${esc(value || '')}" class="${base}" placeholder="#1A56FF">
        </div></div>`;
    }
    if (f.type === 'image') {
      return `<div class="${span}">${lbl}<div class="mt-1 bg-[#F8F9FD] rounded-[8px] border border-slate-200 p-2">
        <div class="flex items-center gap-2">
          <div class="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
            ${value ? `<img src="${esc(value)}" class="w-full h-full object-contain p-1">` : `<i class="fa-solid fa-image text-slate-400"></i>`}
          </div>
          <input data-field="${f.name}" type="text" value="${esc(value||'')}" placeholder="${esc(f.placeholder||'Paste URL or upload')}" class="${base} flex-1">
        </div>
        <label class="mt-2 flex items-center justify-center gap-1 px-3 py-1.5 rounded-[8px] bg-[#0F2043] text-white text-[11px] font-bold cursor-pointer hover:bg-[#16294F]">
          <i class="fa-solid fa-upload text-[10px]"></i> Upload Icon
          <input type="file" data-upload="${f.name}" accept="image/*" class="hidden">
        </label>
        <p class="text-[10px] text-slate-400 mt-1">Properly fit - object-contain</p>
      </div></div>`;
    }
    return `<div class="${span}">${lbl}<input data-field="${f.name}" type="${f.type}" value="${esc(value == null ? '' : value)}" ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}" class="${base} mt-1"></div>`;
  }

  function openForm(key, id) {
    const cfg = RESOURCES[key];
    const item = id ? state.lists[key].find(x => String(x.id) === String(id)) : null;
    const defaults = {
      status: 'active', featured: false, type: key === 'coupons' ? 'percent' : 'web',
      color: key === 'batches' ? '#4F46E5' : '#EDE9FF'
    };
    const data = Object.assign({}, defaults, item || {});

    openModal(`
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-[16px] z-10">
        <div>
          <h3 class="text-[16px] font-extrabold text-[#0F2043]">
            <i class="fa-solid ${item ? 'fa-pen' : 'fa-plus'} text-[#1A56FF] mr-1"></i>
            ${item ? 'Edit ' + cfg.singular + ' #' + item.id : cfg.addLabel}
          </h3>
          <p class="text-[11px] text-slate-500">${item ? 'Update the details below' : 'Fill in the details to create a new ' + cfg.singular.toLowerCase()}</p>
        </div>
        <button onclick="closeModal()" class="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="resForm" class="p-6">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          ${cfg.fields.map(f => fieldHtml(f, data[f.name])).join('')}
        </div>
        <p id="formError" class="hidden mt-4 text-[12px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"></p>
        <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <button type="button" onclick="closeModal()" class="px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700">Cancel</button>
          <button type="submit" class="px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]">
            <i class="fa-solid fa-floppy-disk mr-1"></i> ${item ? 'Update' : 'Create'}
          </button>
        </div>
      </form>`);
    // image upload handlers (Batch Icon)
    $('resForm').querySelectorAll('[data-upload]').forEach(inp=>{
      inp.addEventListener('change', function(e){
        const file=e.target.files[0];
        if(!file) return;
        if(file.size>2*1024*1024){ toast('Image must be <2MB', false); return; }
        const reader=new FileReader();
        reader.onload=function(ev){
          const dataUrl=ev.target.result;
          const fieldName=inp.dataset.upload;
          const textEl=$('resForm').querySelector('[data-field="'+fieldName+'"]');
          if(textEl) textEl.value=dataUrl;
          const preview=inp.closest('div').previousElementSibling?.querySelector('img') || inp.parentElement.previousElementSibling?.querySelector('img');
          if(preview) preview.src=dataUrl;
          // update preview container
          const container=inp.closest('.bg-\\[\\#F8F9FD\\]');
          if(container){ const imgEl=container.querySelector('img'); if(imgEl) imgEl.src=dataUrl; else { const div=container.querySelector('.rounded-full'); if(div) div.innerHTML='<img src="'+dataUrl+'" class="w-full h-full object-contain p-1">'; } }
          toast('Icon loaded');
        };
        reader.readAsDataURL(file);
      });
    });

    // course targeting checkboxes (coupons) — async fill
    (function fillCourseBox() {
      const box = $('resForm').querySelector('[data-coursebox]');
      if (!box) return;
      const sel = (Array.isArray(data.courseIds) ? data.courseIds : []).map(String);
      api('/api/admin/courses?limit=200').then(json => {
        const list = (json.data || []).filter(c => (c.status || 'active') === 'active');
        if (!list.length) { box.innerHTML = '<p class="text-[12px] text-slate-400 py-2 text-center">No courses yet</p>'; return; }
        box.innerHTML = list.map(c =>
          `<label class="flex items-center gap-2 bg-white rounded-[8px] border border-slate-100 px-3 py-2 hover:border-[#1A56FF] cursor-pointer">
            <input type="checkbox" data-course-pick="${esc(c.id)}" ${sel.includes(String(c.id)) ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF] flex-shrink-0">
            <span class="text-[12.5px] font-bold text-[#0F2043] truncate">${esc(c.title)}</span>
            <span class="ml-auto text-[11px] font-bold text-[#1A56FF] flex-shrink-0">৳${esc(c.price)}</span>
          </label>`).join('');
      }).catch(() => { box.innerHTML = '<p class="text-[12px] text-red-500 py-2 text-center">Could not load courses</p>'; });
    })();

    $('resForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      const payload = {};
      cfg.fields.forEach(f => {
        if (f.type === 'courses') return; // alada kore collect hobe
        const el = $('resForm').querySelector('[data-field="' + f.name + '"]');
        if (!el) return;
        if (f.type === 'checkbox') payload[f.name] = el.checked;
        else payload[f.name] = el.value;
      });
      if ($('resForm').querySelector('[data-coursebox]')) {
        payload.courseIds = Array.from($('resForm').querySelectorAll('[data-course-pick]:checked')).map(el => el.dataset.coursePick);
      }
      const missing = cfg.fields.filter(f => f.required && !payload[f.name]);
      if (missing.length) {
        const box = $('formError');
        box.textContent = 'Please fill: ' + missing.map(f => f.label).join(', ');
        box.classList.remove('hidden');
        return;
      }
      try {
        await api(item ? cfg.endpoint + '/' + item.id : cfg.endpoint, {
          method: item ? 'PUT' : 'POST',
          body: JSON.stringify(payload)
        });
        closeModal();
        toast(cfg.singular + (item ? ' updated' : ' created'));
        await refreshMeta();
        renderResource(key);
      } catch (err) {
        const box = $('formError');
        box.textContent = err.message;
        box.classList.remove('hidden');
      }
    });
  }

  /* ---------------- Course wizard (3 steps) ----------------
   * Step 1: Basic Info | Step 2: Thumbnail + Description + Links | Step 3: Classes
   * YouTube links are converted to videoIds; raw links never leave this panel. */
  function wizYtId(s) {
    s = String(s || '').trim();
    if (!s) return '';
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    let m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  /* ---------- Duplicate course (Copy-Paste with classes) ----------
   * Akei course onno batch/category-te nite chaile notun kore class upload
   * korte hobe na — sob class copy hoye jabe. */
  function openCourseDuplicate(id) {
    const src = state.lists.courses.find(x => String(x.id) === String(id));
    if (!src) { toast('Course not found', false); return; }
    const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white';
    const lbl = t => `<label class="text-[11px] font-bold text-slate-600 uppercase">${t}</label>`;
    const opts = (list, val) => `<option value="">-- Same as original --</option>` + list.map(o =>
      `<option value="${esc(o.value)}" ${String(o.value) === String(val) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
    openModal(`
      <div class="px-5 sm:px-6 py-4 border-b border-slate-100">
        <h3 class="text-[15px] sm:text-[16px] font-extrabold text-[#0F2043]">
          <i class="fa-solid fa-copy text-[#16A34A] mr-1"></i> Duplicate Course
        </h3>
      </div>
      <div class="p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="sm:col-span-2">${lbl('New Course Title')}<input id="dTitle" value="${esc(src.title + ' (Copy)')}" class="${base} mt-1"></div>
        <div>${lbl('Target Batch')}<select id="dBatch" class="${base} mt-1">${opts(REL.batch(), src.batchId)}</select></div>
        <div>${lbl('Target Category')}<select id="dCategory" class="${base} mt-1">${opts(REL.category(), src.categoryId)}</select></div>
        <p id="dupError" class="hidden sm:col-span-2 text-[12px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"></p>
      </div>
      <div class="flex justify-end gap-2 px-5 sm:px-6 py-4 border-t border-slate-100">
        <button id="dupCancel" class="px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700">Cancel</button>
        <button id="dupGo" class="px-5 py-2.5 rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-[13px]"><i class="fa-solid fa-copy mr-1"></i> Duplicate</button>
      </div>`);
    $('dupCancel').addEventListener('click', closeModal);
    $('dupGo').addEventListener('click', async function () {
      const errBox = $('dupError');
      const btn = $('dupGo');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Copying...';
      try {
        const json = await api('/api/admin/courses/' + id + '/duplicate', {
          method: 'POST',
          body: JSON.stringify({
            title: $('dTitle').value.trim(),
            batchId: $('dBatch').value,
            categoryId: $('dCategory').value
          })
        });
        closeModal();
        toast(json.message || 'Course duplicated');
        await refreshMeta();
        renderResource('courses');
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-copy mr-1"></i> Duplicate';
      }
    });
  }

  async function openCourseWizard(id) {
    const existing = id ? state.lists.courses.find(x => String(x.id) === String(id)) : null;
    const wiz = {
      id: existing ? existing.id : null,
      step: 1,
      saving: false,
      course: Object.assign({
        title: '', teacher: '', batchId: '', categoryId: '', platformId: '',
        price: '', oldPrice: '', duration: '', totalClass: '',
        thumbnail: '', description: '', telegramLink: '', telegramLinks: [], telegramChatIds: [], previewYoutube: '',
        features: '', tags: '', bannerColor: '#5745f7',
        featured: false, status: 'active'
      }, existing || {}),
      lessons: [],
      removedLessonIds: []
    };
    // map stored previewVideoId back to a watch url for editing
    if (wiz.course.previewVideoId && !wiz.course.previewYoutube) {
      wiz.course.previewYoutube = 'https://www.youtube.com/watch?v=' + wiz.course.previewVideoId;
    }
    // backward compat: purono single telegramLink thakle multi list-e naw (error-proof)
    if (!Array.isArray(wiz.course.telegramLinks)) wiz.course.telegramLinks = [];
    if (!Array.isArray(wiz.course.telegramChatIds)) wiz.course.telegramChatIds = [];
    if (!wiz.course.telegramLinks.length && wiz.course.telegramLink) {
      wiz.course.telegramLinks = [{ label: 'Main Channel', url: wiz.course.telegramLink }];
    }
    if (wiz.id) {
      try {
        const json = await api('/api/admin/courses/' + wiz.id + '/lessons');
        wiz.lessons = (json.data || []).map(l => ({
          lid: l.id, section: l.section || '', title: l.title || '',
          youtube: '', hasVideo: true, duration: l.duration || '', isFree: !!l.isFree
        }));
      } catch (e) { wiz.lessons = []; }
    }
    paintWiz();

    function stepPills() {
      const steps = [
        { n: 1, label: 'Basic Info', icon: 'fa-circle-info' },
        { n: 2, label: 'Media & Details', icon: 'fa-photo-film' },
        { n: 3, label: 'Classes', icon: 'fa-circle-play' }
      ];
      return `<div class="flex items-center gap-1 sm:gap-2">` + steps.map((s, i) => `
        ${i ? '<div class="flex-1 h-[2px] rounded ' + (wiz.step > s.n - 1 ? 'bg-[#1A56FF]' : 'bg-slate-200') + '"></div>' : ''}
        <div class="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-[12px] font-bold whitespace-nowrap
          ${wiz.step === s.n ? 'bg-[#1A56FF] text-white shadow' : wiz.step > s.n ? 'bg-[#E6F4EA] text-[#16A34A]' : 'bg-slate-100 text-slate-500'}">
          <i class="fa-solid ${wiz.step > s.n ? 'fa-check' : s.icon}"></i><span class="hidden sm:inline">${s.label}</span><span class="sm:hidden">${s.n}</span>
        </div>`).join('') + `</div>`;
    }

    function selOpts(list, val) {
      return `<option value="">-- Select --</option>` + list.map(o =>
        `<option value="${esc(o.value)}" ${String(o.value) === String(val == null ? '' : val) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
    }

    function stepBody() {
      const c = wiz.course;
      const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white';
      const lbl = t => `<label class="text-[11px] font-bold text-slate-600 uppercase">${t}</label>`;
      if (wiz.step === 1) {
        return `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="sm:col-span-2">${lbl('Course Title <span class="text-red-500">*</span>')}<input id="wTitle" value="${esc(c.title)}" placeholder="HSC 27 Physics Academic Cycle 01" class="${base} mt-1"></div>
          <div>${lbl('Teacher Name')}<input id="wTeacher" value="${esc(c.teacher)}" placeholder="Apurbo Sir" class="${base} mt-1"></div>
          <div>${lbl('Duration')}<input id="wDuration" value="${esc(c.duration)}" placeholder="3 Months" class="${base} mt-1"></div>
          <div>${lbl('Batch <span class="text-red-500">*</span>')}<select id="wBatch" class="${base} mt-1">${selOpts(REL.batch(), c.batchId)}</select></div>
          <div>${lbl('Category <span class="text-red-500">*</span>')}<select id="wCategory" class="${base} mt-1">${selOpts(REL.category(), c.categoryId)}</select></div>
          <div>${lbl('Platform')}<select id="wPlatform" class="${base} mt-1">${selOpts(REL.platform(), c.platformId)}</select></div>
          <div>${lbl('Status')}<select id="wStatus" class="${base} mt-1">${selOpts(REL.status(), c.status)}</select></div>
          <div>${lbl('Price (৳)')}<input id="wPrice" type="number" min="0" value="${esc(c.price)}" placeholder="500" class="${base} mt-1"></div>
          <div>${lbl('Old Price (৳)')}<input id="wOldPrice" type="number" min="0" value="${esc(c.oldPrice)}" placeholder="1000" class="${base} mt-1"></div>
          <div>${lbl('Total Class')}<input id="wTotalClass" type="number" min="0" value="${esc(c.totalClass)}" placeholder="36" class="${base} mt-1"></div>
          <div class="flex items-center gap-2 pt-5">
            <input id="wFeatured" type="checkbox" class="w-4 h-4 accent-[#1A56FF]" ${c.featured ? 'checked' : ''}>
            <span class="text-[12.5px] font-semibold text-slate-700">Show as Featured on homepage</span>
          </div>
        </div>`;
      }
      if (wiz.step === 2) {
        return `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="sm:col-span-2">${lbl('Course Thumbnail / Image')}
            <div class="mt-1 bg-[#F8F9FD] rounded-[10px] border border-slate-200 p-3">
              <div class="aspect-[16/9] rounded-[8px] bg-white border border-slate-200 overflow-hidden flex items-center justify-center">
                ${c.thumbnail ? `<img id="wThumbPrev" src="${esc(c.thumbnail)}" class="w-full h-full object-cover">` : `<div id="wThumbPrev" class="text-center text-slate-400"><i class="fa-solid fa-image text-[26px]"></i><p class="text-[11px] font-semibold mt-1">No image yet</p></div>`}
              </div>
              <div class="flex gap-2 mt-2">
                <input id="wThumb" value="${esc(c.thumbnail)}" placeholder="Paste image URL or upload" class="${base} flex-1">
                <label class="px-3 py-2 rounded-[8px] bg-[#0F2043] text-white text-[12px] font-bold cursor-pointer hover:bg-[#16294F] flex items-center gap-1 whitespace-nowrap">
                  <i class="fa-solid fa-upload text-[11px]"></i> Upload
                  <input id="wThumbFile" type="file" accept="image/*" class="hidden">
                </label>
              </div>
              <p class="text-[10px] text-slate-400 mt-1">JPG/PNG, max 2MB. Saved inside the course.</p>
            </div>
          </div>
          <div class="sm:col-span-2">${lbl('Description (কোর্সের বিবরণ)')}<textarea id="wDesc" rows="4" placeholder="What will students learn in this course?" class="${base} mt-1">${esc(c.description)}</textarea></div>
          <div class="sm:col-span-2">${lbl('এই কোর্সে আপনি পাচ্ছেন (one per line)')}<textarea id="wFeatures" rows="4" placeholder="অভিজ্ঞ শিক্ষক দ্বারা ৪০ টি তথ্যবহুল ক্লাস&#10;নিয়মিত পরীক্ষা ও মডেল টেস্ট&#10;সার্বক্ষণিক Q&A সার্ভিস" class="${base} mt-1">${esc(c.features || '')}</textarea></div>
          <div class="sm:col-span-2">${lbl('Tags (comma separated)')}<input id="wTags" value="${esc(c.tags || '')}" placeholder="Offline & Online, Bangla" class="${base} mt-1"></div>
          <div class="sm:col-span-2">${lbl('Title Banner Color')}
            <div class="flex items-center gap-2 mt-1">
              <input id="wBannerColor" type="color" value="${esc(c.bannerColor || '#5745f7')}" class="w-10 h-9 rounded border border-slate-200">
              <input id="wBannerColorText" type="text" value="${esc(c.bannerColor || '#5745f7')}" class="${base}" placeholder="#5745f7">
            </div>
            <p class="text-[10px] text-slate-400 mt-1">Course page-এর উপরের banner-এর background color (default #5745f7)</p>
          </div>
          <div class="sm:col-span-2">
            ${lbl('Telegram Channels (ekadhik link add kora jabe — only enrolled students see it)')}
            <div id="tgLinksBox" class="space-y-2 mt-1">
              ${(Array.isArray(c.telegramLinks) && c.telegramLinks.length ? c.telegramLinks : [{ label: '', url: '' }]).map((x, i) => `
                <div class="flex gap-2" data-tg-link-row="${i}">
                  <input data-tg-link-label value="${esc(x.label || '')}" placeholder="Label (e.g. Main Channel)" class="${base} w-[38%]">
                  <input data-tg-link-url value="${esc(x.url || '')}" placeholder="https://t.me/+xxxx" class="${base} flex-1">
                  <button type="button" data-tg-link-rm="${i}" class="w-9 rounded-[8px] bg-red-50 text-red-600 hover:bg-red-100 flex-shrink-0" title="Remove"><i class="fa-solid fa-trash text-[11px]"></i></button>
                </div>`).join('')}
            </div>
            <button type="button" id="wAddTgLink" class="mt-2 px-3 py-1.5 rounded-[8px] bg-[#E6F0FF] text-[#1A56FF] font-bold text-[12px] hover:bg-[#DDE8FF]"><i class="fa-solid fa-plus mr-1"></i> Add Channel Link</button>
          </div>
          <div class="sm:col-span-2">
            ${lbl('Telegram Group / Channel ID (auto single-use invite-er jonno — ekadhik add kora jabe)')}
            <div id="tgIdsBox" class="space-y-2 mt-1">
              ${(Array.isArray(c.telegramChatIds) && c.telegramChatIds.length ? c.telegramChatIds : []).map((x, i) => `
                <div class="flex gap-2" data-tg-id-row="${i}">
                  <input data-tg-id-label value="${esc(x.label || '')}" placeholder="Label (e.g. Batch Group)" class="${base} w-[38%]">
                  <input data-tg-id-val value="${esc(x.chatId || '')}" placeholder="-100xxxxxxxxxx" class="${base} flex-1">
                  <button type="button" data-tg-id-rm="${i}" class="w-9 rounded-[8px] bg-red-50 text-red-600 hover:bg-red-100 flex-shrink-0" title="Remove"><i class="fa-solid fa-trash text-[11px]"></i></button>
                </div>`).join('') || '<p class="text-[11px] text-slate-400">No Group ID yet — thakle Order Approve-এ auto single-use invite link banbe (Bot-er moto).</p>'}
            </div>
            <button type="button" id="wAddTgId" class="mt-2 px-3 py-1.5 rounded-[8px] bg-[#E6F4EA] text-[#16A34A] font-bold text-[12px] hover:bg-[#D3EBD8]"><i class="fa-solid fa-plus mr-1"></i> Add Group / Channel ID</button>
            <p class="text-[10px] text-slate-400 mt-1">Bot-ke oi group/channel-e Admin + <b>Invite Users</b> permission daw. ID ber koro @getmyid_bot diye. Same BOT_TOKEN use hobe, Bot code-e hat dite hobe na.</p>
          </div>
          <div class="sm:col-span-2">${lbl('Preview / Intro YouTube Link (free for everyone)')}
            <input id="wPreview" value="${esc(c.previewYoutube)}" placeholder="https://www.youtube.com/watch?v=..." class="${base} mt-1">
            <p class="text-[10px] text-slate-400 mt-1"><i class="fa-solid fa-lock mr-0.5"></i> Only the video ID is stored. Keep the video <b>Unlisted</b> so outsiders can't find it.</p>
          </div>
        </div>`;
      }
      // step 3: classes
      return `<div>
        <div class="flex items-center justify-between mb-3">
          <p class="text-[12px] text-slate-500"><b class="text-[#0F2043]">${wiz.lessons.length}</b> class(es) — YouTube link is stored privately, students can't copy it.</p>
          <button id="wAddLesson" class="px-3 py-2 rounded-[8px] bg-[#E6F0FF] text-[#1A56FF] font-bold text-[12px] hover:bg-[#DDE8FF]"><i class="fa-solid fa-plus mr-1"></i> Add Class</button>
        </div>
        <div id="wLessonRows" class="space-y-3">
          ${wiz.lessons.map((l, i) => lessonRow(l, i)).join('') || '<p class="text-[12px] text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-[10px]">No classes yet — click "Add Class"</p>'}
        </div>
      </div>`;
    }

    function lessonRow(l, i) {
      return `<div class="border border-slate-200 rounded-[10px] p-3 bg-[#F8F9FD]" data-row="${i}">
        <div class="flex items-center justify-between mb-2">
          <span class="text-[11px] font-extrabold text-[#1A56FF]">CLASS ${i + 1}</span>
          <button class="w-7 h-7 rounded-full bg-red-50 text-red-600 hover:bg-red-100" data-rm="${i}" title="Remove"><i class="fa-solid fa-trash text-[11px]"></i></button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input data-l="section" value="${esc(l.section)}" placeholder="Section (e.g. ভৌতজগত ও পরিমাপ)" class="border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white">
          <input data-l="duration" value="${esc(l.duration)}" placeholder="Duration (e.g. 45 min)" class="border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white">
          <input data-l="title" value="${esc(l.title)}" placeholder="Class title *" class="sm:col-span-2 border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white font-semibold">
          <input data-l="youtube" value="${esc(l.youtube)}" placeholder="${l.hasVideo ? '✓ Video saved — paste new link only to replace' : 'YouTube link * (paste watch / share link)'}" class="sm:col-span-2 border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white">
          <label class="sm:col-span-2 flex items-center gap-2 text-[12px] font-semibold text-slate-600">
            <input data-l="isFree" type="checkbox" class="w-4 h-4 accent-[#16A34A]" ${l.isFree ? 'checked' : ''}> Free preview (anyone can watch this class)
          </label>
        </div>
      </div>`;
    }

    function paintWiz() {
      openModal(`
        <div class="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-[16px] z-10">
          <div>
            <h3 class="text-[15px] sm:text-[16px] font-extrabold text-[#0F2043]">
              <i class="fa-solid ${wiz.id ? 'fa-pen' : 'fa-plus'} text-[#1A56FF] mr-1"></i>
              ${wiz.id ? 'Edit Course #' + wiz.id : 'Add New Course'}
            </h3>
            <p class="text-[11px] text-slate-500">Step ${wiz.step} of 3</p>
          </div>
          <button id="wizClose" class="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500 flex-shrink-0"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="px-5 sm:px-6 pt-4">${stepPills()}</div>
        <div id="wizBody" class="p-5 sm:p-6">${stepBody()}</div>
        <p id="wizError" class="hidden mx-5 sm:mx-6 -mt-2 mb-2 text-[12px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"></p>
        <div class="flex justify-between gap-2 px-5 sm:px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-[16px]">
          <button id="wizBack" class="${wiz.step === 1 ? 'invisible' : ''} px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700"><i class="fa-solid fa-arrow-left mr-1"></i> Back</button>
          ${wiz.step < 3
            ? `<button id="wizNext" class="px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]">Next <i class="fa-solid fa-arrow-right ml-1"></i></button>`
            : `<button id="wizSave" class="px-5 py-2.5 rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-[13px]"><i class="fa-solid fa-floppy-disk mr-1"></i> ${wiz.id ? 'Update Course' : 'Publish Course'}</button>`}
        </div>`);
      wireWiz();
    }

    function wizErr(msg) {
      const box = $('wizError');
      if (!msg) { box.classList.add('hidden'); return; }
      box.textContent = msg;
      box.classList.remove('hidden');
    }

    function collectStep() {
      const v = id => { const el = $(id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
      if (wiz.step === 1) {
        Object.assign(wiz.course, {
          title: v('wTitle'), teacher: v('wTeacher'), duration: v('wDuration'),
          batchId: v('wBatch'), categoryId: v('wCategory'), platformId: v('wPlatform'),
          status: v('wStatus') || 'active', price: v('wPrice'), oldPrice: v('wOldPrice'),
          totalClass: v('wTotalClass'), featured: !!v('wFeatured')
        });
        if (!wiz.course.title) return 'Course Title is required';
        if (!wiz.course.batchId) return 'Please select a Batch';
        if (!wiz.course.categoryId) return 'Please select a Category';
      }
      if (wiz.step === 2) {
        // multi telegram collect (khali row auto bad, vul format bad, error khabe na)
        const tgLinks = Array.from(document.querySelectorAll('[data-tg-link-row]')).map(row => ({
          label: (row.querySelector('[data-tg-link-label]') || {}).value || '',
          url: (row.querySelector('[data-tg-link-url]') || {}).value || ''
        })).filter(x => String(x.url || '').trim());
        const tgIds = Array.from(document.querySelectorAll('[data-tg-id-row]')).map(row => ({
          label: (row.querySelector('[data-tg-id-label]') || {}).value || '',
          chatId: (row.querySelector('[data-tg-id-val]') || {}).value || ''
        })).filter(x => String(x.chatId || '').trim());
        Object.assign(wiz.course, {
          thumbnail: v('wThumb'), description: v('wDesc'),
          telegramLinks: tgLinks,
          telegramChatIds: tgIds,
          telegramLink: tgLinks.length ? String(tgLinks[0].url || '').trim() : '',
          previewYoutube: v('wPreview'),
          features: $('wFeatures').value, tags: v('wTags'),
          bannerColor: ($('wBannerColorText').value.trim() || $('wBannerColor').value || '#5745f7')
        });
        if (wiz.course.previewYoutube && !wizYtId(wiz.course.previewYoutube)) {
          return 'Preview link is not a valid YouTube link';
        }
      }
      if (wiz.step === 3) collectLessons();
      return '';
    }

    function collectLessons() {
      const rows = Array.from(document.querySelectorAll('#wLessonRows [data-row]'));
      wiz.lessons = rows.map((row, idx) => {
        const g = n => row.querySelector('[data-l="' + n + '"]');
        const prev = wiz.lessons[idx] || {};
        return {
          lid: prev.lid || null,
          hasVideo: prev.hasVideo || false,
          section: g('section').value.trim(),
          title: g('title').value.trim(),
          youtube: g('youtube').value.trim(),
          duration: g('duration').value.trim(),
          isFree: g('isFree').checked
        };
      });
    }

    function wireWiz() {
      $('wizClose').addEventListener('click', closeModal);
      const back = $('wizBack');
      if (back) back.addEventListener('click', () => { collectStep(); wiz.step = Math.max(1, wiz.step - 1); wizErr(''); paintWiz(); });
      const next = $('wizNext');
      if (next) next.addEventListener('click', () => {
        const err = collectStep();
        if (err) { wizErr(err); return; }
        wizErr('');
        wiz.step++;
        paintWiz();
      });
      // thumbnail upload (base64, max 2MB)
      const fileInp = $('wThumbFile');
      if (fileInp) fileInp.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { toast('Image must be under 2MB', false); return; }
        const reader = new FileReader();
        reader.onload = ev => {
          $('wThumb').value = ev.target.result;
          const prev = $('wThumbPrev');
          if (prev) {
            if (prev.tagName === 'IMG') prev.src = ev.target.result;
            else prev.outerHTML = `<img id="wThumbPrev" src="${ev.target.result}" class="w-full h-full object-cover">`;
          }
          toast('Thumbnail loaded');
        };
        reader.readAsDataURL(file);
      });
      // banner color picker <-> text sync
      const bcPick = $('wBannerColor'), bcText = $('wBannerColorText');
      if (bcPick && bcText) {
        bcPick.addEventListener('input', () => { bcText.value = bcPick.value; });
        bcText.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(bcText.value)) bcPick.value = bcText.value; });
      }
      // multi telegram add/remove (collect kore repaint, data harabe na)
      const addTgLink = $('wAddTgLink');
      if (addTgLink) addTgLink.addEventListener('click', () => {
        collectStep();
        if (!Array.isArray(wiz.course.telegramLinks)) wiz.course.telegramLinks = [];
        if (!wiz.course.telegramLinks.length) wiz.course.telegramLinks = [{ label: '', url: '' }];
        else wiz.course.telegramLinks.push({ label: '', url: '' });
        paintWiz();
      });
      document.querySelectorAll('[data-tg-link-rm]').forEach(btn => {
        btn.addEventListener('click', () => {
          collectStep();
          wiz.course.telegramLinks.splice(Number(btn.dataset.tgLinkRm), 1);
          if (!wiz.course.telegramLinks.length) wiz.course.telegramLinks = [{ label: '', url: '' }];
          wiz.course.telegramLink = wiz.course.telegramLinks[0].url || '';
          paintWiz();
        });
      });
      const addTgId = $('wAddTgId');
      if (addTgId) addTgId.addEventListener('click', () => {
        collectStep();
        if (!Array.isArray(wiz.course.telegramChatIds)) wiz.course.telegramChatIds = [];
        wiz.course.telegramChatIds.push({ label: '', chatId: '' });
        paintWiz();
      });
      document.querySelectorAll('[data-tg-id-rm]').forEach(btn => {
        btn.addEventListener('click', () => {
          collectStep();
          wiz.course.telegramChatIds.splice(Number(btn.dataset.tgIdRm), 1);
          paintWiz();
        });
      });
      // lesson rows
      const addBtn = $('wAddLesson');
      if (addBtn) addBtn.addEventListener('click', () => {
        collectLessons();
        wiz.lessons.push({ lid: null, section: '', title: '', youtube: '', hasVideo: false, duration: '', isFree: false });
        paintWiz();
      });
      document.querySelectorAll('#wLessonRows [data-rm]').forEach(btn => {
        btn.addEventListener('click', () => {
          collectLessons();
          const idx = Number(btn.dataset.rm);
          const removed = wiz.lessons.splice(idx, 1)[0];
          if (removed && removed.lid) wiz.removedLessonIds.push(removed.lid);
          paintWiz();
        });
      });
      const save = $('wizSave');
      if (save) save.addEventListener('click', saveWiz);
    }

    async function saveWiz() {
      if (wiz.saving) return;
      collectLessons();
      // validate lessons
      for (let i = 0; i < wiz.lessons.length; i++) {
        const l = wiz.lessons[i];
        if (!l.title) { wizErr('Class ' + (i + 1) + ': title is required'); return; }
        if (!l.lid && !wizYtId(l.youtube)) { wizErr('Class ' + (i + 1) + ': valid YouTube link is required'); return; }
        if (l.lid && l.youtube && !wizYtId(l.youtube)) { wizErr('Class ' + (i + 1) + ': YouTube link is not valid'); return; }
      }
      wiz.saving = true;
      const saveBtn = $('wizSave');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Saving...'; }
      try {
        const c = wiz.course;
        const payload = {
          title: c.title, teacher: c.teacher, duration: c.duration,
          batchId: c.batchId, categoryId: c.categoryId, platformId: c.platformId || '',
          status: c.status || 'active', price: c.price === '' ? 0 : c.price,
          oldPrice: c.oldPrice === '' ? 0 : c.oldPrice,
          totalClass: c.totalClass === '' ? 0 : c.totalClass,
          thumbnail: c.thumbnail, description: c.description,
          telegramLink: c.telegramLink || (Array.isArray(c.telegramLinks) && c.telegramLinks[0] ? c.telegramLinks[0].url : ''),
          telegramLinks: Array.isArray(c.telegramLinks) ? c.telegramLinks : [],
          telegramChatIds: Array.isArray(c.telegramChatIds) ? c.telegramChatIds : [],
          previewVideoId: c.previewYoutube ? wizYtId(c.previewYoutube) : '',
          features: c.features || '', tags: c.tags || '',
          bannerColor: c.bannerColor || '#5745f7',
          featured: !!c.featured
        };
        let courseId = wiz.id;
        if (courseId) {
          await api('/api/admin/courses/' + courseId, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          const created = await api('/api/admin/courses', { method: 'POST', body: JSON.stringify(payload) });
          courseId = created.data.id;
        }
        // sync lessons (order = row sequence)
        for (let i = 0; i < wiz.lessons.length; i++) {
          const l = wiz.lessons[i];
          const body = { section: l.section, title: l.title, duration: l.duration, isFree: l.isFree, order: i + 1 };
          if (l.youtube) body.youtubeUrl = l.youtube;
          if (l.lid) await api('/api/admin/lessons/' + l.lid, { method: 'PUT', body: JSON.stringify(body) });
          else await api('/api/admin/courses/' + courseId + '/lessons', { method: 'POST', body: JSON.stringify(body) });
        }
        for (const lid of wiz.removedLessonIds) {
          try { await api('/api/admin/lessons/' + lid, { method: 'DELETE' }); } catch (e) { /* already gone */ }
        }
        closeModal();
        toast(wiz.id ? 'Course updated' : 'Course published with ' + wiz.lessons.length + ' class(es)');
        await refreshMeta();
        renderResource('courses');
      } catch (err) {
        wizErr(err.message);
        wiz.saving = false;
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> ' + (wiz.id ? 'Update Course' : 'Publish Course'); }
      }
    }
  }

  /* ---------------- E-Book form (cover + PDF upload / link) ---------------- */
  function openEbookForm(id) {
    const item = id ? state.lists.ebooks.find(x => String(x.id) === String(id)) : null;
    const d = Object.assign({ title: '', cover: '', details: '', author: '', price: '', oldPrice: '', linkUrl: '', status: 'active', batchId: '', ebookBatchId: '', categoryId: '' }, item || {});
    const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white';
    const lbl = t => `<label class="text-[11px] font-bold text-slate-600 uppercase">${t}</label>`;
    const ebOpts = (list, val) => `<option value="">-- Select --</option>` + list.map(o =>
      `<option value="${esc(o.value)}" ${String(o.value) === String(val == null ? '' : val) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');

    openModal(`
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-[16px] z-10">
        <div>
          <h3 class="text-[16px] font-extrabold text-[#0F2043]">
            <i class="fa-solid ${item ? 'fa-pen' : 'fa-plus'} text-[#1A56FF] mr-1"></i>
            ${item ? 'Edit E-Book #' + item.id : 'Add New E-Book'}
          </h3>
          <p class="text-[11px] text-slate-500">Cover image, details ar PDF file / link</p>
        </div>
        <button onclick="closeModal()" class="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="p-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="sm:col-span-2">${lbl('E-Book Name <span class="text-red-500">*</span>')}<input id="ebTitle" value="${esc(d.title)}" placeholder="Higher Mathematics E-Book" class="${base} mt-1"></div>
          <div class="sm:col-span-2">${lbl('Cover Image')}
            <div class="mt-1 bg-[#F8F9FD] rounded-[10px] border border-slate-200 p-3 flex items-center gap-3">
              <div class="w-14 h-[72px] rounded-[6px] bg-white border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                ${d.cover ? `<img id="ebCoverPrev" src="${esc(d.cover)}" class="w-full h-full object-cover">` : `<span id="ebCoverPrev"><i class="fa-solid fa-book text-slate-300 text-[20px]"></i></span>`}
              </div>
              <div class="flex-1 min-w-0">
                <input id="ebCover" value="${esc(d.cover)}" placeholder="Paste image URL or upload" class="${base}">
                <label class="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-[8px] bg-[#0F2043] text-white text-[11px] font-bold cursor-pointer hover:bg-[#16294F]">
                  <i class="fa-solid fa-upload text-[10px]"></i> Upload Cover
                  <input id="ebCoverFile" type="file" accept="image/*" class="hidden">
                </label>
                <p class="text-[10px] text-slate-400 mt-1">JPG/PNG, max 2MB</p>
              </div>
            </div>
          </div>
          <div class="sm:col-span-2">${lbl('Details')}<textarea id="ebDetails" rows="3" placeholder="What's inside this book?" class="${base} mt-1">${esc(d.details)}</textarea></div>
          <div>${lbl('Author')}<input id="ebAuthor" value="${esc(d.author)}" placeholder="Author name" class="${base} mt-1"></div>
          <div>${lbl('E-Book Batch (alada — E-Book Batch menu theke create korun)')}<select id="ebBatch" class="${base} mt-1">${ebOpts(REL.ebookBatch(), d.ebookBatchId)}</select></div>
          <div>${lbl('Category')}<select id="ebCategory" class="${base} mt-1">${ebOpts(REL.category(), d.categoryId)}</select></div>
          <div class="grid grid-cols-2 gap-3">
            <div>${lbl('Price (৳) — 0 = Free')}<input id="ebPrice" type="number" min="0" value="${esc(d.price)}" placeholder="0" class="${base} mt-1"></div>
            <div>${lbl('Old Price (৳)')}<input id="ebOldPrice" type="number" min="0" value="${esc(d.oldPrice)}" placeholder="" class="${base} mt-1"></div>
          </div>
          <div class="sm:col-span-2">${lbl('PDF File (max 50MB)')}
            <div class="mt-1 bg-[#F8F9FD] rounded-[10px] border border-slate-200 p-3">
              <div id="ebFileNow" class="text-[12px] font-semibold text-slate-600 mb-2">
                ${d.fileUrl ? `<i class="fa-solid fa-file-pdf text-[#16A34A] mr-1"></i> Current: <a href="${esc(d.fileUrl)}" target="_blank" class="text-[#1A56FF]">View PDF</a>${d.fileSize ? ' (' + fmtSize(d.fileSize) + ')' : ''}` : 'No PDF uploaded yet'}
              </div>
              <label class="inline-flex items-center gap-1 px-3 py-2 rounded-[8px] bg-[#1A56FF] text-white text-[12px] font-bold cursor-pointer hover:bg-[#1445D6]">
                <i class="fa-solid fa-upload text-[11px]"></i> ${d.fileUrl ? 'Replace PDF' : 'Upload PDF'}
                <input id="ebFile" type="file" accept="application/pdf,.pdf" class="hidden">
              </label>
              <span id="ebFileName" class="text-[11px] text-slate-500 ml-2"></span>
            </div>
          </div>
          <div class="sm:col-span-2">${lbl('Or External Link (Drive / Telegram)')}<input id="ebLink" value="${esc(d.linkUrl)}" placeholder="https://drive.google.com/..." class="${base} mt-1">
            <p class="text-[10px] text-slate-400 mt-1">PDF upload thakle link lagbe na — file tai use hobe</p>
          </div>
          <div>${lbl('Status')}<select id="ebStatus" class="${base} mt-1">
            <option value="active" ${d.status !== 'inactive' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${d.status === 'inactive' ? 'selected' : ''}>Inactive</option>
          </select></div>
        </div>
        <p id="ebError" class="hidden mt-4 text-[12px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"></p>
        <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <button type="button" onclick="closeModal()" class="px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700">Cancel</button>
          <button id="ebSave" class="px-5 py-2.5 rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-[13px]">
            <i class="fa-solid fa-floppy-disk mr-1"></i> ${item ? 'Update' : 'Publish'}
          </button>
        </div>
      </div>`);

    // cover upload (base64, max 2MB)
    $('ebCoverFile').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { toast('Cover image must be under 2MB', false); return; }
      const reader = new FileReader();
      reader.onload = ev => {
        $('ebCover').value = ev.target.result;
        const prev = $('ebCoverPrev');
        if (prev) {
          if (prev.tagName === 'IMG') prev.src = ev.target.result;
          else prev.outerHTML = `<img id="ebCoverPrev" src="${ev.target.result}" class="w-full h-full object-cover">`;
        }
        toast('Cover loaded');
      };
      reader.readAsDataURL(file);
    });
    // pdf picker label
    $('ebFile').addEventListener('change', e => {
      const file = e.target.files[0];
      $('ebFileName').textContent = file ? file.name + ' (' + fmtSize(file.size) + ')' : '';
    });

    $('ebSave').addEventListener('click', async () => {
      const box = $('ebError');
      box.classList.add('hidden');
      const title = $('ebTitle').value.trim();
      if (!title) { box.textContent = 'E-Book Name is required'; box.classList.remove('hidden'); return; }
      const pdf = $('ebFile').files[0];
      if (pdf && pdf.size > 50 * 1024 * 1024) { box.textContent = 'PDF must be under 50MB'; box.classList.remove('hidden'); return; }
      const btn = $('ebSave');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Saving...';
      try {
        const payload = {
          title, cover: $('ebCover').value.trim(), details: $('ebDetails').value.trim(),
          author: $('ebAuthor').value.trim(),
          batchId: '', ebookBatchId: $('ebBatch').value, categoryId: $('ebCategory').value,
          price: $('ebPrice').value === '' ? 0 : $('ebPrice').value,
          oldPrice: $('ebOldPrice').value === '' ? 0 : $('ebOldPrice').value,
          linkUrl: $('ebLink').value.trim(), status: $('ebStatus').value
        };
        let eid = item ? item.id : null;
        if (eid) {
          await api('/api/admin/ebooks/' + eid, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          const created = await api('/api/admin/ebooks', { method: 'POST', body: JSON.stringify(payload) });
          eid = created.data.id;
        }
        if (pdf) {
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Uploading PDF...';
          const up = await fetch(API + '/api/admin/ebooks/' + eid + '/file', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + state.token, 'Content-Type': 'application/pdf', 'x-file-name': encodeURIComponent(pdf.name) },
            body: pdf
          });
          const uj = await up.json();
          if (!up.ok || uj.success === false) throw new Error(uj.message || 'PDF upload failed');
        }
        closeModal();
        toast(item ? 'E-Book updated' : 'E-Book published');
        await refreshMeta();
        renderResource('ebooks');
      } catch (err) {
        box.textContent = err.message;
        box.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> ' + (item ? 'Update' : 'Publish');
      }
    });
  }

  /* ---------------- Users ---------------- */
  async function renderUsers() {
    const view = $('view');
    view.innerHTML = `<div class="text-center py-20 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-[22px]"></i><p class="text-[13px] mt-2">Loading users...</p></div>`;
    try {
      const json = await api('/api/admin/users');
      state.lists.users = json.data || [];
    } catch (err) {
      view.innerHTML = errorBox(err.message);
      return;
    }

    view.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div class="relative flex-1 max-w-[320px]">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[13px]"></i>
          <input id="userSearch" placeholder="Search name, email or phone..."
            class="w-full bg-white border border-slate-200 rounded-[10px] pl-9 pr-3 py-2.5 text-[13px] outline-none focus:border-[#1A56FF]">
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[12px] font-bold text-slate-500 px-3 py-2.5 rounded-[10px] bg-white border border-slate-200">Total: <span id="userCount">${state.lists.users.length}</span></span>
          <button id="userAdd" class="px-4 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]">
            <i class="fa-solid fa-user-plus mr-1"></i> Add User
          </button>
        </div>
      </div>
      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-[13px]">
            <thead class="bg-[#F8F9FD] text-slate-500 text-[11px] uppercase">
              <tr>
                <th class="px-4 py-3 text-left font-bold">#</th>
                <th class="px-4 py-3 text-left font-bold">Student</th>
                <th class="px-4 py-3 text-left font-bold">Phone</th>
                <th class="px-4 py-3 text-left font-bold">Enrolled</th>
                <th class="px-4 py-3 text-left font-bold">Orders</th>
                <th class="px-4 py-3 text-left font-bold">Spent</th>
                <th class="px-4 py-3 text-left font-bold">Joined</th>
                <th class="px-4 py-3 text-left font-bold">Status</th>
                <th class="px-4 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody id="userBody"></tbody>
          </table>
        </div>
      </div>`;

    function paint(list) {
      $('userCount').textContent = list.length;
      $('userBody').innerHTML = list.length ? list.map(u => {
        const isBanned = u.status === 'banned' || u.status === 'blocked';
        const enrolledCount = Number(u.enrolledCount || 0);
        return `
        <tr class="border-t border-slate-100 hover:bg-[#F8F9FD]">
          <td class="px-4 py-3 text-slate-400 font-bold">${u.id}</td>
          <td class="px-4 py-3">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-full bg-[#EDE9FF] text-[#4F46E5] font-extrabold text-[13px] flex items-center justify-center flex-shrink-0">${esc((u.name || 'U').charAt(0).toUpperCase())}</div>
              <div class="min-w-0">
                <div class="font-bold text-[#0F2043] truncate">${esc(u.name)}</div>
                <div class="text-[11px] text-slate-500 truncate">${esc(u.email)}</div>
              </div>
            </div>
          </td>
          <td class="px-4 py-3 text-slate-600">${esc(u.phone || '-')}</td>
          <td class="px-4 py-3">
            <button data-profile="${u.id}" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${enrolledCount > 0 ? 'bg-[#EEF2FF] text-[#1A56FF] hover:bg-[#E0E7FF]' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'} transition" title="Click to view and manage enrolled courses">
              <i class="fa-solid fa-graduation-cap text-[11px] ${enrolledCount > 0 ? 'text-[#1A56FF]' : 'text-slate-400'}"></i>
              <span>${enrolledCount} Course${enrolledCount !== 1 ? 's' : ''}</span>
            </button>
          </td>
          <td class="px-4 py-3"><span class="font-bold text-[#0F2043]">${Number(u.orderCount || 0)}</span></td>
          <td class="px-4 py-3 font-bold text-[#16A34A]">${cur(u.totalSpent)}</td>
          <td class="px-4 py-3 text-slate-500 text-[11.5px]">${dt(u.createdAt)}</td>
          <td class="px-4 py-3">
            ${isBanned ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-red-100 text-red-700 border border-red-200 inline-flex items-center gap-1"><i class="fa-solid fa-ban text-[9px]"></i> ${esc(u.status)}</span>` : badge(u.status || 'active')}
          </td>
          <td class="px-4 py-3 text-right whitespace-nowrap">
            <button data-profile="${u.id}" class="w-8 h-8 rounded-full bg-[#E0F2FE] text-[#0EA5E9] hover:bg-[#BAE6FD] transition inline-flex items-center justify-center mr-1" title="View Profile & Manage Course Access"><i class="fa-solid fa-eye text-[12px]"></i></button>
            ${isBanned ? `
              <button data-user-ban="${u.id}" data-action="unban" class="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition inline-flex items-center justify-center mr-1" title="Unban Student"><i class="fa-solid fa-user-check text-[12px]"></i></button>
            ` : `
              <button data-user-ban="${u.id}" data-action="ban" class="w-8 h-8 rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100 transition inline-flex items-center justify-center mr-1" title="Ban Student"><i class="fa-solid fa-ban text-[12px]"></i></button>
            `}
            <button data-user-edit="${u.id}" class="w-8 h-8 rounded-full bg-[#E6F0FF] text-[#1A56FF] hover:bg-[#DDE8FF] transition inline-flex items-center justify-center mr-1" title="Edit"><i class="fa-solid fa-pen text-[12px]"></i></button>
            <button data-user-del="${u.id}" class="w-8 h-8 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition inline-flex items-center justify-center" title="Delete"><i class="fa-solid fa-trash text-[12px]"></i></button>
          </td>
        </tr>`;
      }).join('') : emptyRow(9, 'No students registered yet');
    }

    $('userBody').addEventListener('click', function (e) {
      const profileBtn = e.target.closest('[data-profile]');
      const editBtn = e.target.closest('[data-user-edit]');
      const delBtn = e.target.closest('[data-user-del]');
      const banBtn = e.target.closest('[data-user-ban]');
      if (profileBtn) { openUserProfile(profileBtn.dataset.profile); return; }
      if (editBtn) { openUserForm(editBtn.dataset.userEdit); return; }
      if (banBtn) {
        const uid = banBtn.dataset.userBan;
        const action = banBtn.dataset.action;
        const u = state.lists.users.find(x => String(x.id) === String(uid));
        const title = action === 'unban' ? 'Unban Student?' : 'Ban Student?';
        const text = action === 'unban' ? `Reactivate and unban "${(u && u.name) || 'this student'}"?` : `Are you sure you want to ban "${(u && u.name) || 'this student'}"? They will be locked out and cannot log in or access courses.`;
        confirmDialog(title, text, async function () {
          try {
            const res = await api('/api/admin/users/' + uid + '/ban', {
              method: 'POST',
              body: JSON.stringify({ status: action === 'unban' ? 'active' : 'banned' })
            });
            toast(res.message);
            renderUsers();
          } catch (err) { toast(err.message, false); }
        }, action === 'unban' ? 'Yes, Unban' : 'Yes, Ban Student');
        return;
      }
      if (delBtn) {
        const u = state.lists.users.find(x => String(x.id) === String(delBtn.dataset.userDel));
        confirmDialog('Delete user?', 'Remove "' + ((u && u.name) || '') + '" permanently?', async function () {
          try {
            await api('/api/admin/users/' + delBtn.dataset.userDel, { method: 'DELETE' });
            toast('User deleted');
            renderUsers();
          } catch (err) { toast(err.message, false); }
        });
      }
    });

    $('userSearch').addEventListener('input', function (e) {
      const term = e.target.value.toLowerCase();
      paint(state.lists.users.filter(u => (u.name + ' ' + u.email + ' ' + (u.phone || '')).toLowerCase().includes(term)));
    });
    $('userAdd').addEventListener('click', function () { openUserForm(null); });
    paint(state.lists.users);
  }

  function openUserForm(id) {
    const u = id ? state.lists.users.find(x => String(x.id) === String(id)) : null;
    const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF]';
    openModal(`
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h3 class="text-[16px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-user-pen text-[#1A56FF] mr-1"></i>${u ? 'Edit User #' + u.id : 'Add New User'}</h3>
        <button onclick="closeModal()" class="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="userForm" class="p-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Full Name *</label>
            <input id="uName" required value="${esc(u ? u.name : '')}" class="${base} mt-1"></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Email *</label>
            <input id="uEmail" type="email" required value="${esc(u ? u.email : '')}" class="${base} mt-1"></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Phone</label>
            <input id="uPhone" value="${esc(u ? (u.phone || '') : '')}" class="${base} mt-1"></div>
          <div><label class="text-[11px] font-bold text-slate-600 uppercase">Status</label>
            <select id="uStatus" class="${base} mt-1">
              <option value="active" ${!u || u.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="banned" ${u && u.status === 'banned' ? 'selected' : ''}>Banned</option>
              <option value="blocked" ${u && u.status === 'blocked' ? 'selected' : ''}>Blocked</option>
            </select></div>
          <div class="sm:col-span-2"><label class="text-[11px] font-bold text-slate-600 uppercase">Password ${u ? '(empty = keep current)' : '*'}</label>
            <input id="uPass" type="text" ${u ? '' : 'required'} placeholder="At least 6 characters" class="${base} mt-1"></div>
        </div>
        <p id="userFormError" class="hidden mt-4 text-[12px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"></p>
        <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <button type="button" onclick="closeModal()" class="px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700">Cancel</button>
          <button type="submit" class="px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]"><i class="fa-solid fa-floppy-disk mr-1"></i>${u ? 'Update' : 'Create'}</button>
        </div>
      </form>`);

    $('userForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      const payload = {
        name: $('uName').value.trim(),
        email: $('uEmail').value.trim(),
        phone: $('uPhone').value.trim(),
        status: $('uStatus').value
      };
      if ($('uPass').value) payload.password = $('uPass').value;
      try {
        await api(u ? '/api/admin/users/' + u.id : '/api/admin/users', {
          method: u ? 'PUT' : 'POST',
          body: JSON.stringify(payload)
        });
        closeModal();
        toast(u ? 'User updated' : 'User created');
        renderUsers();
      } catch (err) {
        const box = $('userFormError');
        box.textContent = err.message;
        box.classList.remove('hidden');
      }
    });
  }

  async function openUserProfile(id) {
    try {
      const json = await api('/api/admin/users/' + id);
      const u = json.data;
      const enrolled = u.enrolledCourses || [];

      // Make sure courses list is loaded
      let allCourses = [];
      try {
        const cJson = await api('/api/admin/courses?limit=200');
        allCourses = cJson.data || [];
        state.lists.courses = allCourses;
      } catch (e) {
        allCourses = state.lists.courses || [];
      }

      const enrolledIds = enrolled.map(c => String(c.id));
      const availableCourses = allCourses.filter(c => !enrolledIds.includes(String(c.id)));
      const isBanned = u.status === 'banned' || u.status === 'blocked';

      openModal(`
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div class="flex items-center gap-2">
            <h3 class="text-[16px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-id-card text-[#1A56FF] mr-1.5"></i>Student Details &amp; Course Access</h3>
          </div>
          <button onclick="closeModal()" class="w-9 h-9 rounded-full hover:bg-slate-200/70 text-slate-500 flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="p-6 max-h-[82vh] overflow-y-auto space-y-5">
          <!-- Student Header Card -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-[14px] bg-[#F8FAFD] border border-slate-100">
            <div class="flex items-center gap-3.5">
              <div class="w-[52px] h-[52px] rounded-full bg-[#EDE9FF] text-[#4F46E5] font-black text-[20px] flex items-center justify-center border-2 border-[#DDD6FE] flex-shrink-0">
                ${esc((u.name || 'U').charAt(0).toUpperCase())}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h4 class="text-[16px] font-extrabold text-[#0F2043]">${esc(u.name)}</h4>
                  ${isBanned ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-red-100 text-red-700 border border-red-200 inline-flex items-center gap-1"><i class="fa-solid fa-ban text-[9px]"></i> ${esc(u.status)}</span>` : badge(u.status || 'active')}
                </div>
                <div class="text-[12px] text-slate-500 mt-0.5">
                  <span class="mr-2"><i class="fa-regular fa-envelope mr-1 text-slate-400"></i>${esc(u.email)}</span>
                  ${u.phone ? `<span><i class="fa-solid fa-phone mr-1 text-slate-400"></i>${esc(u.phone)}</span>` : ''}
                </div>
              </div>
            </div>

            <!-- Quick Ban/Unban Button -->
            <div class="flex-shrink-0">
              <button id="modalBanBtn" class="px-3.5 py-2 rounded-[9px] font-bold text-[12px] transition flex items-center gap-1.5 ${isBanned ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'}">
                <i class="fa-solid ${isBanned ? 'fa-user-check' : 'fa-ban'}"></i>
                ${isBanned ? 'Unban Student' : 'Ban Student'}
              </button>
            </div>
          </div>

          <!-- Quick Stats -->
          <div class="grid grid-cols-3 gap-3">
            <div class="bg-white border border-slate-200/80 rounded-[12px] p-3 text-center">
              <div class="text-[11px] font-bold text-slate-500 uppercase">Enrolled Courses</div>
              <div class="text-[20px] font-black text-[#1A56FF] mt-0.5">${enrolled.length}</div>
            </div>
            <div class="bg-white border border-slate-200/80 rounded-[12px] p-3 text-center">
              <div class="text-[11px] font-bold text-slate-500 uppercase">Total Orders</div>
              <div class="text-[20px] font-black text-[#0F2043] mt-0.5">${u.orders.length}</div>
            </div>
            <div class="bg-white border border-slate-200/80 rounded-[12px] p-3 text-center">
              <div class="text-[11px] font-bold text-slate-500 uppercase">Joined Date</div>
              <div class="text-[12px] font-bold text-slate-700 mt-1.5 truncate">${dt(u.createdAt)}</div>
            </div>
          </div>

          <!-- ================= COURSE ACCESS MANAGEMENT SECTION ================= -->
          <div class="border border-slate-200 rounded-[14px] p-4 sm:p-5 bg-white shadow-sm">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h4 class="text-[14px] font-extrabold text-[#0F2043] flex items-center gap-2">
                  <i class="fa-solid fa-graduation-cap text-[#1A56FF]"></i> Enrolled Courses (${enrolled.length})
                </h4>
                <p class="text-[11px] text-slate-500 mt-0.5">Courses currently accessible by this student</p>
              </div>
            </div>

            <!-- Grant New Access Box -->
            <div class="p-3.5 bg-[#F0F4FF] rounded-[11px] border border-[#D5E2FF] mb-4">
              <label class="block text-[11px] font-extrabold text-[#1A56FF] uppercase mb-1.5">
                <i class="fa-solid fa-plus-circle mr-1"></i> Give Course Access to Student
              </label>
              <div class="flex flex-col sm:flex-row gap-2">
                <select id="modalCourseSelect" class="flex-1 bg-white border border-slate-300 rounded-[8px] px-3 py-2 text-[12.5px] outline-none focus:border-[#1A56FF]">
                  <option value="">-- Select a course to grant access --</option>
                  ${availableCourses.map(c => `
                    <option value="${c.id}">${esc(c.title)} ${c.batchName ? '(' + esc(c.batchName) + ')' : ''} - ৳${c.price || 0}</option>
                  `).join('')}
                </select>
                <button id="modalGrantBtn" class="bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[12.5px] px-4 py-2 rounded-[8px] transition flex items-center justify-center gap-1.5 whitespace-nowrap">
                  <i class="fa-solid fa-user-plus text-[11px]"></i> Grant Access
                </button>
              </div>
            </div>

            <!-- List of Enrolled Courses -->
            <div class="space-y-2.5" id="modalEnrolledList">
              ${enrolled.length ? enrolled.map(c => `
                <div class="flex items-center justify-between gap-3 p-3 rounded-[10px] border border-slate-100 bg-[#FAFBFD] hover:bg-white transition">
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="w-10 h-10 rounded-[8px] bg-[#0F2043] flex items-center justify-center text-white flex-shrink-0 text-[14px] overflow-hidden">
                      ${c.thumbnail ? `<img src="${esc(c.thumbnail)}" class="w-full h-full object-cover">` : `<i class="fa-solid fa-book-open"></i>`}
                    </div>
                    <div class="min-w-0">
                      <div class="text-[13px] font-bold text-[#0F2043] truncate">${esc(c.title)}</div>
                      <div class="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                        ${c.batchName ? `<span class="font-semibold text-indigo-600">${esc(c.batchName)}</span><span>&bull;</span>` : ''}
                        <span class="inline-flex items-center gap-1 text-emerald-600 font-bold"><i class="fa-solid fa-circle-check text-[9px]"></i> Active Access</span>
                        ${c.isManual ? `<span class="px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 text-[9.5px] font-bold">Admin Granted</span>` : `<span class="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[9.5px] font-bold">Order</span>`}
                      </div>
                    </div>
                  </div>
                  <button data-revoke-cid="${c.id}" data-course-title="${esc(c.title)}" class="flex-shrink-0 px-3 py-1.5 rounded-[8px] bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[11.5px] transition flex items-center gap-1">
                    <i class="fa-solid fa-trash-can text-[11px]"></i> Remove Access
                  </button>
                </div>
              `).join('') : `
                <div class="text-center py-6 text-slate-400 bg-slate-50/50 rounded-[10px] border border-dashed border-slate-200">
                  <i class="fa-solid fa-graduation-cap text-[24px] block mb-1 text-slate-300"></i>
                  <p class="text-[12.5px] font-semibold text-slate-600">No courses enrolled yet</p>
                  <p class="text-[11px] text-slate-400 mt-0.5">Select a course above to grant access</p>
                </div>
              `}
            </div>
          </div>

          <!-- Order History -->
          <div class="border border-slate-200 rounded-[14px] p-4 bg-white shadow-xs">
            <h4 class="text-[13px] font-extrabold text-[#0F2043] mb-2.5 flex items-center gap-1.5">
              <i class="fa-solid fa-receipt text-slate-400"></i> Order History (${u.orders.length})
            </h4>
            <div class="divide-y divide-slate-100 max-h-[180px] overflow-y-auto">
              ${u.orders.length ? u.orders.map(o => `
                <div class="py-2.5 flex items-center justify-between gap-3 text-[12px]">
                  <div>
                    <span class="font-bold text-[#0F2043]">${esc(o.orderNo)}</span>
                    <span class="text-slate-400 ml-1">(${o.items.length} item(s)) &middot; ${dt(o.createdAt)}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-[#0F2043]">${cur(o.total)}</span>
                    ${badge(o.status)}
                  </div>
                </div>
              `).join('') : '<p class="py-4 text-center text-[12px] text-slate-400">No orders found</p>'}
            </div>
          </div>
        </div>
      `);

      // Event: Grant Course Access
      $('modalGrantBtn').addEventListener('click', async function () {
        const sel = $('modalCourseSelect');
        const courseId = sel.value;
        if (!courseId) { toast('Please select a course to grant access', false); return; }
        try {
          const res = await api('/api/admin/users/' + u.id + '/access', {
            method: 'POST',
            body: JSON.stringify({ courseId })
          });
          toast(res.message || 'Course access granted');
          openUserProfile(u.id); // re-render modal
          renderUsers(); // refresh table
        } catch (err) { toast(err.message, false); }
      });

      // Event: Revoke Course Access
      $('modalEnrolledList').addEventListener('click', function (e) {
        const btn = e.target.closest('[data-revoke-cid]');
        if (!btn) return;
        const cId = btn.dataset.revokeCid;
        const cTitle = btn.dataset.courseTitle || 'this course';
        confirmDialog('Remove Course Access?', `Are you sure you want to revoke access to "${cTitle}" for ${u.name}? The student will immediately lose access.`, async function () {
          try {
            await api('/api/admin/users/' + u.id + '/access/' + cId, { method: 'DELETE' });
            toast('Course access removed');
            openUserProfile(u.id);
            renderUsers();
          } catch (err) { toast(err.message, false); }
        }, 'Yes, Remove Access');
      });

      // Event: Toggle Ban in Modal
      $('modalBanBtn').addEventListener('click', function () {
        const nextStatus = isBanned ? 'active' : 'banned';
        const title = isBanned ? 'Unban Student?' : 'Ban Student?';
        const msg = isBanned ? `Activate and unban ${u.name}? They will be able to log in and access courses again.` : `Are you sure you want to ban ${u.name}? They will be locked out and cannot log in or access courses.`;
        confirmDialog(title, msg, async function () {
          try {
            const res = await api('/api/admin/users/' + u.id + '/ban', {
              method: 'POST',
              body: JSON.stringify({ status: nextStatus })
            });
            toast(res.message);
            openUserProfile(u.id);
            renderUsers();
          } catch (err) { toast(err.message, false); }
        }, isBanned ? 'Yes, Unban' : 'Yes, Ban Student');
      });

    } catch (err) {
      toast(err.message, false);
    }
  }

  /* ---------------- Orders ---------------- */
  const ORDER_STATUS = ['pending', 'confirmed', 'completed', 'cancelled'];

  async function renderOrders() {
    const view = $('view');
    view.innerHTML = `<div class="text-center py-20 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-[22px]"></i><p class="text-[13px] mt-2">Loading orders...</p></div>`;
    try {
      const json = await api('/api/admin/orders');
      state.lists.orders = json.data || [];
    } catch (err) {
      view.innerHTML = errorBox(err.message);
      return;
    }

    const counts = ORDER_STATUS.reduce((acc, s) => {
      acc[s] = state.lists.orders.filter(o => o.status === s).length;
      return acc;
    }, {});

    view.innerHTML = `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        ${ORDER_STATUS.map(s => `
          <button data-filter="${s}" class="text-left bg-white rounded-[14px] border border-slate-100 shadow-sm p-4 hover:shadow-md transition">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold uppercase text-slate-500">${s}</span>
              <span class="w-2.5 h-2.5 rounded-full" style="background:${{ pending: '#F59E0B', confirmed: '#1A56FF', completed: '#16A34A', cancelled: '#DC2626' }[s]}"></span>
            </div>
            <div class="text-[20px] font-extrabold text-[#0F2043] mt-2">${counts[s]}</div>
          </button>`).join('')}
      </div>

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div class="relative flex-1 max-w-[320px]">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[13px]"></i>
          <input id="orderSearch" placeholder="Search order no, name, email..."
            class="w-full bg-white border border-slate-200 rounded-[10px] pl-9 pr-3 py-2.5 text-[13px] outline-none focus:border-[#1A56FF]">
        </div>
        <div class="flex items-center gap-2">
          <button id="orderAll" class="px-3 py-2.5 rounded-[10px] bg-white border border-slate-200 font-bold text-[12.5px] text-slate-600">Show All</button>
          <span class="text-[12px] font-bold text-slate-500 px-3 py-2.5 rounded-[10px] bg-white border border-slate-200">Total: <span id="orderCount">${state.lists.orders.length}</span></span>
        </div>
      </div>

      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-[13px]">
            <thead class="bg-[#F8F9FD] text-slate-500 text-[11px] uppercase">
              <tr>
                <th class="px-5 py-3 text-left font-bold">Order</th>
                <th class="px-5 py-3 text-left font-bold">Customer</th>
                <th class="px-5 py-3 text-left font-bold">Courses</th>
                <th class="px-5 py-3 text-left font-bold">Total</th>
                <th class="px-5 py-3 text-left font-bold">Coupon</th>
                <th class="px-5 py-3 text-left font-bold">Date</th>
                <th class="px-5 py-3 text-left font-bold">Status</th>
                <th class="px-5 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody id="orderBody"></tbody>
          </table>
        </div>
      </div>`;

    function paint(list) {
      $('orderCount').textContent = list.length;
      $('orderBody').innerHTML = list.length ? list.map(o => `
        <tr class="border-t border-slate-100 hover:bg-[#F8F9FD]">
          <td class="px-5 py-3">
            <div class="font-extrabold text-[#0F2043]">${esc(o.orderNo)}</div>
            <div class="text-[11px] text-slate-500">#${o.id}</div>
          </td>
          <td class="px-5 py-3">
            <div class="font-bold text-[#0F2043]">${esc((o.customer && o.customer.name) || 'Guest')}</div>
            <div class="text-[11px] text-slate-500">${esc((o.customer && o.customer.email) || '-')}</div>
          </td>
          <td class="px-5 py-3">
            <div class="text-slate-700 max-w-[230px] truncate" title="${esc(o.items.map(i => i.title).join(', '))}">
              ${esc(o.items[0] ? o.items[0].title : '')}${o.items.length > 1 ? ' <span class="text-[#1A56FF] font-bold">+' + (o.items.length - 1) + '</span>' : ''}
            </div>
          </td>
          <td class="px-5 py-3">
            <div class="font-extrabold text-[#0F2043]">${cur(o.total)}</div>
            ${o.discount ? `<div class="text-[11px] text-[#16A34A]">-${cur(o.discount)}</div>` : ''}
          </td>
          <td class="px-5 py-3">${o.couponCode ? `<span class="px-2 py-0.5 rounded-[6px] bg-[#FEF9C3] text-[#CA8A04] text-[11px] font-bold">${esc(o.couponCode)}</span>` : '-'}</td>
          <td class="px-5 py-3 text-slate-500 text-[11.5px]">${dt(o.createdAt)}</td>
          <td class="px-5 py-3">
            <select data-status="${o.id}" class="border border-slate-200 rounded-[8px] px-2 py-1 text-[12px] font-bold outline-none focus:border-[#1A56FF]">
              ${ORDER_STATUS.map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
          <td class="px-5 py-3 text-right whitespace-nowrap">
            <button data-order-view="${o.id}" class="w-9 h-9 rounded-full bg-[#E0F2FE] text-[#0EA5E9] hover:bg-[#BAE6FD] transition" title="View"><i class="fa-solid fa-eye text-[12px]"></i></button>
            <button data-order-del="${o.id}" class="w-9 h-9 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition" title="Delete"><i class="fa-solid fa-trash text-[12px]"></i></button>
          </td>
        </tr>`).join('') : emptyRow(8, 'No orders found');
    }

    $('orderBody').addEventListener('change', async function (e) {
      const sel = e.target.closest('[data-status]');
      if (!sel) return;
      try {
        await api('/api/admin/orders/' + sel.dataset.status, { method: 'PUT', body: JSON.stringify({ status: sel.value }) });
        toast('Order status changed to ' + sel.value);
        renderOrders();
      } catch (err) { toast(err.message, false); }
    });

    $('orderBody').addEventListener('click', function (e) {
      const viewBtn = e.target.closest('[data-order-view]');
      const delBtn = e.target.closest('[data-order-del]');
      if (viewBtn) { openOrderDetail(viewBtn.dataset.orderView); return; }
      if (delBtn) {
        confirmDialog('Delete order?', 'This order will be permanently removed.', async function () {
          try {
            await api('/api/admin/orders/' + delBtn.dataset.orderDel, { method: 'DELETE' });
            toast('Order deleted');
            renderOrders();
          } catch (err) { toast(err.message, false); }
        });
      }
    });

    $('orderSearch').addEventListener('input', function (e) {
      const term = e.target.value.toLowerCase();
      paint(state.lists.orders.filter(o => JSON.stringify(o).toLowerCase().includes(term)));
    });
    $('orderAll').addEventListener('click', function () {
      $('orderSearch').value = '';
      paint(state.lists.orders);
    });
    view.querySelectorAll('[data-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        paint(state.lists.orders.filter(o => o.status === btn.dataset.filter));
      });
    });
    paint(state.lists.orders);
  }

  function openOrderDetail(id) {
    const o = state.lists.orders.find(x => String(x.id) === String(id));
    if (!o) { toast('Order not found', false); return; }
    openModal(`
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h3 class="text-[16px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-receipt text-[#1A56FF] mr-1"></i>Order ${esc(o.orderNo)}</h3>
          <p class="text-[11px] text-slate-500">${dt(o.createdAt)}</p>
        </div>
        <button onclick="closeModal()" class="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="p-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="bg-[#F8F9FD] rounded-[12px] p-4">
            <div class="text-[11px] font-bold uppercase text-slate-500 mb-2">Customer</div>
            <div class="text-[14px] font-extrabold text-[#0F2043]">${esc((o.customer && o.customer.name) || 'Guest')}</div>
            <div class="text-[12px] text-slate-600">${esc((o.customer && o.customer.email) || '-')}</div>
            <div class="text-[12px] text-slate-600">${esc((o.customer && o.customer.phone) || '-')}</div>
          </div>
          <div class="bg-[#F8F9FD] rounded-[12px] p-4">
            <div class="text-[11px] font-bold uppercase text-slate-500 mb-2">Payment</div>
            <div class="flex items-center justify-between text-[12.5px] mb-1"><span class="text-slate-600">Method</span><b class="text-[#0F2043]">${esc(o.paymentMethod || 'manual')}</b></div>
            <div class="flex items-center justify-between text-[12.5px] mb-1"><span class="text-slate-600">Status</span>${badge(o.status)}</div>
            <div class="flex items-center justify-between text-[12.5px]"><span class="text-slate-600">Coupon</span><b class="text-[#0F2043]">${esc(o.couponCode || 'none')}</b></div>
          </div>
        </div>

        <h4 class="text-[13px] font-extrabold text-[#0F2043] mt-5 mb-2">Courses in this order</h4>
        <div class="border border-slate-100 rounded-[10px] divide-y divide-slate-100">
          ${o.items.map(i => `
            <div class="px-4 py-3 flex items-center justify-between gap-3">
              <span class="text-[12.5px] font-semibold text-slate-700">${esc(i.title)}</span>
              <b class="text-[12.5px] text-[#0F2043]">${cur(i.price)}</b>
            </div>`).join('')}
        </div>

        <div class="mt-4 ml-auto max-w-[300px] space-y-1.5">
          <div class="flex justify-between text-[12.5px]"><span class="text-slate-600">Subtotal</span><b>${cur(o.subtotal)}</b></div>
          <div class="flex justify-between text-[12.5px]"><span class="text-slate-600">Discount</span><b class="text-[#16A34A]">-${cur(o.discount)}</b></div>
          <div class="flex justify-between text-[15px] pt-2 border-t border-slate-200"><span class="font-extrabold text-[#0F2043]">Total</span><span class="font-extrabold text-[#1A56FF]">${cur(o.total)}</span></div>
        </div>

        ${o.note ? `<p class="mt-4 text-[12px] text-slate-600 bg-[#FEF9C3] border border-[#FDE68A] rounded-[10px] px-3 py-2"><b>Note:</b> ${esc(o.note)}</p>` : ''}

        <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <button onclick="closeModal()" class="px-4 py-2.5 rounded-[10px] bg-slate-100 hover:bg-slate-200 font-bold text-[13px] text-slate-700">Close</button>
        </div>
      </div>`);
  }

  /* ---------------- Settings ---------------- */
  async function renderSettings() {
    const view = $('view');
    view.innerHTML = `<div class="text-center py-20 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-[22px]"></i><p class="text-[13px] mt-2">Loading settings...</p></div>`;
    const base = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF]';
    try {
      const json = await api('/api/admin/settings');
      const s = json.data || {};
      view.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
            <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-1"><i class="fa-solid fa-globe text-[#1A56FF] mr-1"></i>Site Information</h3>
            <p class="text-[11px] text-slate-500 mb-4">Empty rakhle empty e thakbe - kono default auto add hobe na</p>
            <!-- Notice Bar -->
            <div class="mb-4 bg-gradient-to-r from-[#EEF2FF] to-[#F5F3FF] rounded-[12px] border border-[#E0D8FF] p-4">
              <div class="flex items-center justify-between mb-2">
                <label class="text-[11px] font-bold text-slate-600 uppercase"><i class="fa-solid fa-bullhorn text-[#7C3AED] mr-1"></i>Notice Bar (Nav er upore)</label>
                <label class="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                  <input id="sNoticeEnabled" type="checkbox" ${s.noticeEnabled ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF]"> Enable
                </label>
              </div>
              <div id="sNoticePreview" class="rounded-[8px] py-2.5 px-3 flex items-center justify-center gap-2 text-[12px] font-semibold text-center" style="background:${esc(s.noticeBg && String(s.noticeBg).trim()!=='' ? s.noticeBg : 'linear-gradient(90deg,#1A56FF 0%,#4F46E5 50%,#7C3AED 100%)')};color:${esc(s.noticeColor || '#ffffff')}">
                <i class="fa-solid fa-bullhorn text-[#FACC15]"></i>
                <span id="sNoticePreviewText">${esc(s.noticeText || 'Preview: Notice text ekhane dekhabe')}</span>
                <span id="sNoticePreviewLink" class="${s.noticeLink ? '' : 'hidden'} ml-1 px-2 py-0.5 rounded-full bg-white text-[#1A56FF] text-[10px] font-bold">View</span>
              </div>
              <div class="grid grid-cols-1 gap-3 mt-3">
                <div><label class="text-[10px] font-bold text-slate-500 uppercase">Notice Text</label><input id="sNoticeText" value="${esc(s.noticeText || '')}" class="${base} mt-1" placeholder="e.g. Admission Open! Special 20% discount..."></div>
                <div><label class="text-[10px] font-bold text-slate-500 uppercase">Link URL (optional)</label><input id="sNoticeLink" value="${esc(s.noticeLink || '')}" class="${base} mt-1" placeholder="https://..."></div>
                <div class="grid grid-cols-2 gap-3">
                  <div><label class="text-[10px] font-bold text-slate-500 uppercase">Background</label><div class="flex items-center gap-2 mt-1"><input id="sNoticeBg" type="color" value="${esc(s.noticeBg && s.noticeBg.startsWith('#') ? s.noticeBg : '#1A56FF')}" class="w-9 h-8 rounded border border-slate-200"><input id="sNoticeBgText" value="${esc(s.noticeBg || '')}" class="${base}" placeholder="#1A56FF or gradient"></div></div>
                  <div><label class="text-[10px] font-bold text-slate-500 uppercase">Text Color</label><div class="flex items-center gap-2 mt-1"><input id="sNoticeColor" type="color" value="${esc(s.noticeColor || '#ffffff')}" class="w-9 h-8 rounded border border-slate-200"><input id="sNoticeColorText" value="${esc(s.noticeColor || '')}" class="${base}" placeholder="#ffffff"></div></div>
                </div>
                <label class="flex items-center gap-2 text-[11px] font-semibold text-slate-600"><input id="sNoticeDismissible" type="checkbox" ${s.noticeDismissible !== false ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF]"> Dismissible (close button dekhabe)</label>
                <p class="text-[10px] text-slate-400">Empty text rakhle bar auto hide hobe. Sundor gradient default deya ache.</p>
              </div>
            </div>
            <!-- Logo Upload -->
            <div class="mb-4 bg-[#F8F9FD] rounded-[12px] border border-dashed border-slate-200 p-4">
              <label class="text-[11px] font-bold text-slate-600 uppercase"><i class="fa-solid fa-image text-[#1A56FF] mr-1"></i>Site Logo</label>
              <div class="mt-2 bg-white rounded-[10px] border border-slate-200 overflow-hidden min-h-[96px] flex items-center justify-center p-3">
                <img id="sLogoPreview" src="${esc(s.logoUrl || '')}" alt="Logo" class="${s.logoUrl ? '' : 'hidden'} max-h-[96px] max-w-[260px] w-auto h-auto object-contain">
                <div id="sLogoNoImg" class="${s.logoUrl ? 'hidden' : 'flex'} flex-col items-center justify-center py-4 text-slate-400">
                  <i class="fa-regular fa-image text-[26px] mb-1"></i>
                  <p class="text-[11px] font-semibold">No logo uploaded</p>
                  <p class="text-[10px]">Default SVG logo dekhabe</p>
                </div>
              </div>
              <input id="sLogoUrl" value="${esc(s.logoUrl || '')}" class="${base} mt-3" placeholder="https://... ba upload korle auto base64 bosbe">
              <div class="flex items-center gap-2 mt-2">
                <label class="flex-1 px-3 py-2 rounded-[8px] bg-[#0F2043] text-white text-[12px] font-bold text-center cursor-pointer hover:bg-[#16294F]">
                  <i class="fa-solid fa-upload mr-1"></i> Logo Upload
                  <input id="sLogoFile" type="file" accept="image/*,.svg" class="hidden">
                </label>
                <button id="sLogoRemove" type="button" class="px-3 py-2 rounded-[8px] bg-red-50 text-red-600 text-[12px] font-bold border border-red-100 hover:bg-red-100">Remove</button>
              </div>
              <p class="text-[10px] text-slate-400 mt-1">Max 4MB. PNG/JPG/SVG/WebP. Proper fit (object-contain) auto hobe.</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Site Name</label><input id="sSiteName" value="${esc(s.siteName != null ? s.siteName : '')}" placeholder="" class="${base} mt-1"></div>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Tagline</label><input id="sTagline" value="${esc(s.tagline != null ? s.tagline : '')}" placeholder="" class="${base} mt-1"></div>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Currency Symbol</label><input id="sCurrency" value="${esc(s.currency != null ? s.currency : '')}" placeholder="" class="${base} mt-1"></div>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Phone</label><input id="sPhone" value="${esc(s.phone != null ? s.phone : '')}" placeholder="" class="${base} mt-1"></div>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Email</label><input id="sEmail" value="${esc(s.email != null ? s.email : '')}" placeholder="" class="${base} mt-1"></div>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Telegram Link</label><input id="sTelegram" value="${esc(s.telegram != null ? s.telegram : '')}" placeholder="" class="${base} mt-1"></div>
              <div class="sm:col-span-2"><label class="text-[11px] font-bold text-slate-600 uppercase">Address</label><input id="sAddress" value="${esc(s.address != null ? s.address : '')}" placeholder="" class="${base} mt-1"></div>
              <div class="sm:col-span-2"><label class="text-[11px] font-bold text-slate-600 uppercase">Footer Text</label><input id="sFooter" value="${esc(s.footerText != null ? s.footerText : '')}" placeholder="" class="${base} mt-1"></div>
            </div>
            <button id="saveSettings" class="mt-5 px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]">
              <i class="fa-solid fa-floppy-disk mr-1"></i> Save Settings
            </button>
          </div>

          <div class="space-y-4">
            <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
              <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-1"><i class="fa-solid fa-key text-[#1A56FF] mr-1"></i>Change Admin Password</h3>
              <p class="text-[11px] text-slate-500 mb-4">Use a strong password (minimum 6 characters)</p>
              <div class="space-y-3">
                <div><label class="text-[11px] font-bold text-slate-600 uppercase">Current Password</label><input id="pCurrent" type="password" class="${base} mt-1"></div>
                <div><label class="text-[11px] font-bold text-slate-600 uppercase">New Password</label><input id="pNew" type="password" class="${base} mt-1"></div>
                <div><label class="text-[11px] font-bold text-slate-600 uppercase">Confirm New Password</label><input id="pConfirm" type="password" class="${base} mt-1"></div>
              </div>
              <p id="passMsg" class="hidden mt-4 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
              <button id="savePassword" class="mt-5 px-5 py-2.5 rounded-[10px] bg-[#0F2043] hover:bg-[#16294F] text-white font-bold text-[13px]">
                <i class="fa-solid fa-shield-halved mr-1"></i> Update Password
              </button>
            </div>

            <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
              <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-1"><i class="fa-brands fa-google text-[#1A56FF] mr-1"></i>Google Login</h3>
              <p class="text-[11px] text-slate-500 mb-4">Student ra "Continue with Google" diye login korte parbe</p>
              <label class="flex items-center gap-2 text-[12px] font-bold text-slate-700 mb-3">
                <input id="sGoogleEnabled" type="checkbox" ${s.googleLoginEnabled ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF]"> Enable Google Login
              </label>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Google Client ID</label>
              <input id="sGoogleClientId" value="${esc(s.googleClientId || '')}" class="${base} mt-1" placeholder="xxxxxx.apps.googleusercontent.com"></div>
              <p id="googleMsg" class="hidden mt-3 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
              <button id="saveGoogle" class="mt-3 px-5 py-2.5 rounded-[10px] bg-[#0F2043] hover:bg-[#16294F] text-white font-bold text-[13px]">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Save Google Settings
              </button>
            </div>

            <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
              <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-1"><i class="fa-solid fa-credit-card text-[#16A34A] mr-1"></i>PipaPay Payment</h3>
              <p class="text-[11px] text-slate-500 mb-4">Student ra bKash / Nagad / Rocket diye online payment korte parbe</p>
              <label class="flex items-center gap-2 text-[12px] font-bold text-slate-700 mb-3">
                <input id="sPipraEnabled" type="checkbox" ${s.piprapayEnabled ? 'checked' : ''} class="w-4 h-4 accent-[#16A34A]"> Enable Online Payment
              </label>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">PipaPay API Key</label>
              <input id="sPipraKey" type="password" value="${esc(s.piprapayApiKey || '')}" class="${base} mt-1" placeholder="PipaPay dashboard theke API key"></div>
              <div class="mt-3"><label class="text-[11px] font-bold text-slate-600 uppercase">API Base URL</label>
              <input id="sPipraBase" value="${esc(s.piprapayBaseUrl || '')}" class="${base} mt-1" placeholder="https://sandbox.piprapay.com"></div>
              <p id="pipraMsg" class="hidden mt-3 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
              <button id="savePipra" class="mt-3 px-5 py-2.5 rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-[13px]">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Save Payment Settings
              </button>
            </div>

            <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
              <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-4"><i class="fa-brands fa-telegram text-[#229ED9] mr-1"></i>Telegram Bot</h3>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Bot Token (@BotFather)</label>
              <input id="sBotToken" type="password" value="${esc(s.botToken || '')}" class="${base} mt-1" placeholder="123456:ABC-DEF..."></div>
              <p id="botMsg" class="hidden mt-3 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
              <button id="saveBot" class="mt-3 px-5 py-2.5 rounded-[10px] bg-[#229ED9] hover:bg-[#1B8AC0] text-white font-bold text-[13px]">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Save Bot Token
              </button>
            </div>

            <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
              <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-3"><i class="fa-solid fa-server text-[#1A56FF] mr-1"></i>System Info</h3>
              <div id="sysInfo" class="text-[12.5px] text-slate-600 space-y-2">
                <div class="flex items-center gap-2"><i class="fa-solid fa-spinner fa-spin text-slate-400"></i> Checking server...</div>
              </div>
            </div>
          </div>
        </div>`;

      bindSettingsActions();
    } catch (err) {
      view.innerHTML = errorBox(err.message);
    }
  }

  function bindSettingsActions() {
    // logo upload handlers
    const logoFile = $('sLogoFile');
    if (logoFile) logoFile.addEventListener('change', function(e){
      const file = e.target.files[0];
      if(!file) return;
      if(file.size > 4*1024*1024){ toast('Logo size must be < 4MB', false); return; }
      const reader = new FileReader();
      reader.onload = function(ev){
        const dataUrl = ev.target.result;
        $('sLogoUrl').value = dataUrl;
        const img = $('sLogoPreview');
        img.src = dataUrl;
        img.classList.remove('hidden');
        $('sLogoNoImg').classList.add('hidden');
        toast('Logo loaded - Save korun');
      };
      reader.readAsDataURL(file);
    });
    const logoUrlEl = $('sLogoUrl');
    if (logoUrlEl) logoUrlEl.addEventListener('input', function(){
      const v = this.value.trim();
      const img = $('sLogoPreview');
      if(v){ img.src = v; img.classList.remove('hidden'); $('sLogoNoImg').classList.add('hidden'); }
      else { img.classList.add('hidden'); $('sLogoNoImg').classList.remove('hidden'); }
    });
    const logoRemove = $('sLogoRemove');
    if (logoRemove) logoRemove.addEventListener('click', function(){
      $('sLogoUrl').value = '';
      $('sLogoPreview').classList.add('hidden');
      $('sLogoNoImg').classList.remove('hidden');
    });

    // notice preview live
    function updateNoticePreview(){
      const txtEl = $('sNoticeText');
      const linkEl = $('sNoticeLink');
      const bgEl = $('sNoticeBg');
      const bgTextEl = $('sNoticeBgText');
      const colorEl = $('sNoticeColor');
      const colorTextEl = $('sNoticeColorText');
      const prev = $('sNoticePreview');
      const prevText = $('sNoticePreviewText');
      const prevLink = $('sNoticePreviewLink');
      if (!prev) return;
      if (prevText) prevText.textContent = (txtEl && txtEl.value.trim()) || 'Preview: Notice text ekhane dekhabe';
      if (prevLink) {
        if (linkEl && linkEl.value.trim()) prevLink.classList.remove('hidden');
        else prevLink.classList.add('hidden');
      }
      const bgVal = (bgTextEl && bgTextEl.value.trim()) || (bgEl && bgEl.value) || '';
      const colorVal = (colorTextEl && colorTextEl.value.trim()) || (colorEl && colorEl.value) || '#ffffff';
      prev.style.background = bgVal && bgVal.trim() !== '' ? bgVal : 'linear-gradient(90deg,#1A56FF 0%,#4F46E5 50%,#7C3AED 100%)';
      prev.style.color = colorVal || '#ffffff';
    }
    ['sNoticeText','sNoticeLink','sNoticeBg','sNoticeBgText','sNoticeColor','sNoticeColorText'].forEach(id=>{
      const el = $(id);
      if (el) el.addEventListener('input', updateNoticePreview);
    });
    const bgPicker = $('sNoticeBg');
    if (bgPicker) bgPicker.addEventListener('input', function(){ const t=$('sNoticeBgText'); if(t) t.value=this.value; updateNoticePreview(); });
    const colorPicker = $('sNoticeColor');
    if (colorPicker) colorPicker.addEventListener('input', function(){ const t=$('sNoticeColorText'); if(t) t.value=this.value; updateNoticePreview(); });
    const bgText = $('sNoticeBgText');
    if (bgText) bgText.addEventListener('input', function(){ const p=$('sNoticeBg'); if(p && this.value.startsWith('#') && this.value.length===7) p.value=this.value; updateNoticePreview(); });
    const colorText = $('sNoticeColorText');
    if (colorText) colorText.addEventListener('input', function(){ const p=$('sNoticeColor'); if(p && this.value.startsWith('#') && this.value.length===7) p.value=this.value; updateNoticePreview(); });
    // initial preview
    updateNoticePreview();

    $('saveSettings').addEventListener('click', async function () {
      try {
        const bgVal = ($('sNoticeBgText') && $('sNoticeBgText').value.trim()) || ($('sNoticeBg') && $('sNoticeBg').value) || '';
        const colorVal = ($('sNoticeColorText') && $('sNoticeColorText').value.trim()) || ($('sNoticeColor') && $('sNoticeColor').value) || '';
        await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({
            logoUrl: $('sLogoUrl').value.trim(),
            siteName: $('sSiteName').value, tagline: $('sTagline').value, currency: $('sCurrency').value,
            phone: $('sPhone').value, email: $('sEmail').value, telegram: $('sTelegram').value,
            address: $('sAddress').value, footerText: $('sFooter').value,
            noticeEnabled: $('sNoticeEnabled') ? $('sNoticeEnabled').checked : false,
            noticeText: $('sNoticeText') ? $('sNoticeText').value.trim() : '',
            noticeLink: $('sNoticeLink') ? $('sNoticeLink').value.trim() : '',
            noticeBg: bgVal,
            noticeColor: colorVal,
            noticeDismissible: $('sNoticeDismissible') ? $('sNoticeDismissible').checked : true
          })
        });
        toast('Settings saved successfully');
      } catch (err) { toast(err.message, false); }
    });

    const saveGoogleBtn = $('saveGoogle');
    if (saveGoogleBtn) saveGoogleBtn.addEventListener('click', async function () {
      const box = $('googleMsg');
      box.classList.add('hidden');
      const clientId = $('sGoogleClientId').value.trim();
      const enabled = $('sGoogleEnabled').checked;
      if (enabled && !/\.apps\.googleusercontent\.com$/.test(clientId)) {
        box.textContent = 'Enable korle valid Client ID dite hobe (***.apps.googleusercontent.com diye sesh hobe)';
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
        return;
      }
      try {
        await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({ googleLoginEnabled: enabled, googleClientId: clientId })
        });
        box.textContent = 'Google settings saved successfully';
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]';
        box.classList.remove('hidden');
        toast('Google settings saved');
      } catch (err) {
        box.textContent = err.message;
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
      }
    });

    const savePipraBtn = $('savePipra');
    if (savePipraBtn) savePipraBtn.addEventListener('click', async function () {
      const box = $('pipraMsg');
      box.classList.add('hidden');
      const enabled = $('sPipraEnabled').checked;
      const key = $('sPipraKey').value.trim();
      const base = $('sPipraBase').value.trim();
      if (enabled && !key) {
        box.textContent = 'Enable korle PipaPay API Key dite hobe';
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
        return;
      }
      try {
        await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({ piprapayEnabled: enabled, piprapayApiKey: key, piprapayBaseUrl: base })
        });
        box.textContent = 'Payment settings saved successfully';
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]';
        box.classList.remove('hidden');
        toast('Payment settings saved');
      } catch (err) {
        box.textContent = err.message;
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
      }
    });

    const saveBotBtn = $('saveBot');
    if (saveBotBtn) saveBotBtn.addEventListener('click', async function () {
      const box = $('botMsg');
      box.classList.add('hidden');
      const token = $('sBotToken').value.trim();
      if (token && !/^\d+:[\w-]{20,}$/.test(token)) {
        box.textContent = 'Token format thik nai — @BotFather theke copy kore full token daw';
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
        return;
      }
      try {
        await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({ botToken: token })
        });
        box.textContent = 'Bot token saved — ekhon Order Approve-এ auto invite banbe';
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]';
        box.classList.remove('hidden');
        toast('Bot token saved');
      } catch (err) {
        box.textContent = err.message;
        box.className = 'mt-3 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
      }
    });

    $('savePassword').addEventListener('click', async function () {
      const box = $('passMsg');
      box.classList.add('hidden');
      if ($('pNew').value !== $('pConfirm').value) {
        box.textContent = 'New password and confirm password do not match';
        box.className = 'mt-4 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
        return;
      }
      try {
        await api('/api/admin/account/password', {
          method: 'PUT',
          body: JSON.stringify({ currentPassword: $('pCurrent').value, newPassword: $('pNew').value })
        });
        box.textContent = 'Password changed successfully';
        box.className = 'mt-4 text-[12px] font-semibold rounded-lg px-3 py-2 bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]';
        box.classList.remove('hidden');
        $('pCurrent').value = ''; $('pNew').value = ''; $('pConfirm').value = '';
        toast('Password updated');
      } catch (err) {
        box.textContent = err.message;
        box.className = 'mt-4 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        box.classList.remove('hidden');
      }
    });

    fetch('/api/health').then(function (r) { return r.json(); }).then(function (h) {
      const c = h.collections || {};
      $('sysInfo').innerHTML = `
        <div class="flex items-center justify-between"><span>Server status</span><b class="text-[#16A34A]">Online</b></div>
        <div class="flex items-center justify-between"><span>Uptime</span><b>${esc(h.uptime)}</b></div>
        <div class="flex items-center justify-between"><span>Courses / Batches</span><b>${c.courses || 0} / ${c.batches || 0}</b></div>
        <div class="flex items-center justify-between"><span>Users / Orders</span><b>${c.users || 0} / ${c.orders || 0}</b></div>
        <div class="flex items-center justify-between"><span>Coupons / Platforms</span><b>${c.coupons || 0} / ${c.platforms || 0}</b></div>
        <div class="flex items-center justify-between"><span>API Base URL</span><b class="text-[#1A56FF]">/api</b></div>`;
    }).catch(function () {
      $('sysInfo').innerHTML = '<span class="text-red-600 font-semibold">Could not read system info</span>';
    });
  }

  /* ---------------- Home Page Editor ---------------- */
  async function renderHomePage() {
    const view = $('view');
    view.innerHTML = `<div class="text-center py-20 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-[22px]"></i><p class="text-[13px] mt-2">Loading home page...</p></div>`;
    let hp;
    try {
      const json = await api('/api/admin/homepage');
      hp = json.data;
    } catch (err) {
      view.innerHTML = errorBox(err.message);
      return;
    }
    const baseCls = 'w-full border border-slate-200 rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1A56FF] bg-white';
    const hero = hp.hero || {};
    const sec = hp.sections || {};

    view.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 class="text-[16px] font-extrabold text-[#0F2043]">Pages &rarr; Home Page Edit / Modify</h2>
          <p class="text-[12px] text-slate-500">Home page er sob element control koro - text, image, section on/off</p>
        </div>
        <div class="flex items-center gap-2">
          <a href="index.html" target="_blank" class="px-3 py-2 rounded-[10px] bg-white border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50"><i class="fa-solid fa-eye mr-1"></i> Preview Home</a>
          <button id="hpReset" class="px-3 py-2 rounded-[10px] bg-white border border-red-200 text-[12px] font-bold text-red-600 hover:bg-red-50"><i class="fa-solid fa-rotate-left mr-1"></i> Reset Default</button>
          <button id="hpSave" class="px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]"><i class="fa-solid fa-floppy-disk mr-1"></i> Save Changes</button>
        </div>
      </div>

      <!-- Hero Section -->
      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5 mb-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-[15px] font-extrabold text-[#0F2043]"><i class="fa-solid fa-star text-[#F59E0B] mr-1"></i> Hero Section</h3>
          <label class="flex items-center gap-2 text-[12px] font-bold text-slate-700">
            <input id="hpHeroEnabled" type="checkbox" ${hero.enabled !== false ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF]"> Show Hero
          </label>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="space-y-3">
            <div><label class="text-[11px] font-bold text-slate-600 uppercase">Badge Text</label><input id="hpBadge" value="${esc(hero.badge || '')}" class="${baseCls} mt-1" placeholder="Smart Learning, Better Future"></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Title Line 1</label><input id="hpTitle1" value="${esc(hero.titleLine1 || '')}" class="${baseCls} mt-1"></div>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Title Line 2</label><input id="hpTitle2" value="${esc(hero.titleLine2 || '')}" class="${baseCls} mt-1"></div>
            </div>
            <div><label class="text-[11px] font-bold text-slate-600 uppercase">Highlighted Word (blue)</label><input id="hpHighlight" value="${esc(hero.highlight || '')}" class="${baseCls} mt-1" placeholder="Starts Here"></div>
            <div><label class="text-[11px] font-bold text-slate-600 uppercase">Description</label><textarea id="hpDesc" rows="3" class="${baseCls} mt-1" placeholder="Explore...">${esc(hero.description || '')}</textarea><p class="text-[10px] text-slate-400 mt-1">Use &lt;br&gt; for line break</p></div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">Search Placeholder</label><input id="hpSearchPh" value="${esc(hero.searchPlaceholder || '')}" class="${baseCls} mt-1"></div>
              <div><label class="text-[11px] font-bold text-slate-600 uppercase">CTA Button Text</label><input id="hpCtaText" value="${esc(hero.ctaText || '')}" class="${baseCls} mt-1" placeholder="Explore Courses"></div>
            </div>
            <div><label class="text-[11px] font-bold text-slate-600 uppercase">CTA Link</label><input id="hpCtaLink" value="${esc(hero.ctaLink || '')}" class="${baseCls} mt-1" placeholder="#popular or /courses.html"></div>
          </div>

          <div class="space-y-3">
            <div class="bg-[#F8F9FD] rounded-[12px] p-4 border border-dashed border-slate-200">
              <label class="text-[11px] font-bold text-slate-600 uppercase">Hero Image</label>
              <div class="mt-2 relative bg-white rounded-[10px] border border-slate-200 overflow-hidden min-h-[180px] flex items-center justify-center">
                <img id="hpPreview" src="${esc(hero.imageUrl || '')}" class="${hero.imageUrl ? '' : 'hidden'} max-h-[220px] w-full object-contain">
                <div id="hpNoImg" class="${hero.imageUrl ? 'hidden' : 'flex'} flex-col items-center justify-center py-8 text-slate-400">
                  <i class="fa-regular fa-image text-[32px] mb-2"></i>
                  <p class="text-[12px] font-semibold">No image uploaded</p>
                  <p class="text-[11px]">Default illustration will show</p>
                </div>
              </div>
              <div class="grid grid-cols-1 gap-2 mt-3">
                <input id="hpImageUrl" value="${esc(hero.imageUrl || '')}" class="${baseCls}" placeholder="https://... or paste base64 (auto-filled on upload)">
                <div class="flex items-center gap-2">
                  <label class="flex-1 px-3 py-2 rounded-[8px] bg-[#0F2043] text-white text-[12px] font-bold text-center cursor-pointer hover:bg-[#16294F]">
                    <i class="fa-solid fa-upload mr-1"></i> Upload Image
                    <input id="hpFile" type="file" accept="image/*" class="hidden">
                  </label>
                  <button id="hpRemoveImg" class="px-3 py-2 rounded-[8px] bg-red-50 text-red-600 text-[12px] font-bold border border-red-100">Remove</button>
                </div>
                <p class="text-[10px] text-slate-400">Max 4MB. JPG/PNG/WebP. Upload korle auto base64 hoye save hobe.</p>
              </div>
              <div class="mt-3"><label class="text-[11px] font-bold text-slate-600 uppercase">Image Alt Text</label><input id="hpImageAlt" value="${esc(hero.imageAlt || '')}" class="${baseCls} mt-1"></div>
            </div>
            <div class="bg-[#EDE9FF] rounded-[10px] p-3 text-[11px] text-[#4F46E5] font-semibold">
              <i class="fa-solid fa-circle-info mr-1"></i> Tip: Text gulo change kore "Save Changes" dile Home Page instant update hobe.
            </div>
          </div>
        </div>
      </div>

      <!-- Sections Control -->
      <div class="bg-white rounded-[14px] border border-slate-100 shadow-sm p-5">
        <h3 class="text-[15px] font-extrabold text-[#0F2043] mb-4"><i class="fa-solid fa-layer-group text-[#1A56FF] mr-1"></i> Home Page Sections - Show / Hide & Title Edit</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${[
            {key:'categories', label:'Categories Pills', icon:'fa-tags', hasTitle:false},
            {key:'ebookCategory', label:'E-Book Category (Popular-এর উপরে)', icon:'fa-book-open', hasTitle:true, hasRows:true},
            {key:'popular', label:'Popular Courses', icon:'fa-fire', hasTitle:true, hasRows:true},
            {key:'latest', label:'Latest Courses', icon:'fa-clock', hasTitle:true, hasRows:true},
            {key:'ebooks', label:'Ebooks', icon:'fa-book-open', hasTitle:true, hasRows:true},
            {key:'featured', label:'Featured Courses (dynamic)', icon:'fa-star', hasTitle:true, hasSubtitle:true},
            {key:'howToBuy', label:'How To Buy (text + video)', icon:'fa-circle-play', hasTitle:true, hasSubtitle:true},
            {key:'browseCategory', label:'Browse by Category', icon:'fa-table-cells', hasTitle:true},
            {key:'stats', label:'StudyMart at a Glance (stats)', icon:'fa-chart-simple', hasTitle:true},
            {key:'batchesSection', label:'Our Batches', icon:'fa-layer-group', hasTitle:true},
          ].map(s => {
            const cfg = sec[s.key] || {};
            let extra = '';
            if (s.key === 'howToBuy') {
              extra = `
                <div class="mt-3 pt-3 border-t border-slate-200 space-y-3">
                  <div><label class="text-[10px] font-bold text-slate-500 uppercase">Description / Steps (text)</label><textarea data-hb-desc rows="4" class="${baseCls} mt-1" placeholder="1. Buy Now chap dao<br>2. Payment koro...">${esc(cfg.description || '')}</textarea><p class="text-[10px] text-slate-400 mt-1">Use &lt;br&gt; for line break</p></div>
                  <div><label class="text-[10px] font-bold text-slate-500 uppercase">YouTube Video Link</label><input data-hb-video value="${esc(cfg.videoUrl || '')}" class="${baseCls} mt-1" placeholder="https://youtube.com/watch?v=... or video ID"><p class="text-[10px] text-slate-400 mt-1">watch / youtu.be / shorts / embed link ba sudhu video ID dilei hobe</p></div>
                  <div class="grid grid-cols-2 gap-2">
                    <div><label class="text-[10px] font-bold text-slate-500 uppercase">Button Text</label><input data-hb-btntext value="${esc(cfg.btnText || '')}" class="${baseCls} mt-1" placeholder="Browse Courses"></div>
                    <div><label class="text-[10px] font-bold text-slate-500 uppercase">Button Link</label><input data-hb-btnlink value="${esc(cfg.btnLink || '')}" class="${baseCls} mt-1" placeholder="courses.html"></div>
                  </div>
                </div>`;
            }
            if (s.key === 'categories') {
              const batchIds = Array.isArray(cfg.batchIds) ? cfg.batchIds.map(String) : [];
              const isAuto = batchIds.length === 0;
              const batches = state.meta.batches || [];
              extra = `
                <div class="mt-3 pt-3 border-t border-slate-200 space-y-3">
                  <div class="grid grid-cols-2 gap-2">
                    <div><label class="text-[10px] font-bold text-slate-500 uppercase">Koto ta dekhabe (limit)</label><input data-sec-limit="categories" type="number" min="1" max="10" value="${esc(cfg.limit != null ? cfg.limit : 5)}" class="${baseCls} mt-1"></div>
                    <div><label class="text-[10px] font-bold text-slate-500 uppercase">Row Layout</label><select data-sec-layout="categories" class="${baseCls} mt-1"><option value="1row" ${cfg.layout==='2rows'?'':'selected'}>1 Row (scroll)</option><option value="2rows" ${cfg.layout==='2rows'?'selected':''}>2 Rows (grid)</option></select></div>
                  </div>
                  <label class="flex items-center gap-2 text-[11px] font-semibold text-slate-700"><input data-sec-arrows="categories" type="checkbox" ${cfg.showArrows !== false ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF]"> Arrow / Next button show</label>
                  <div class="bg-white rounded-[10px] border border-slate-100 p-3">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-[11px] font-bold text-[#0F2043]"><i class="fa-solid fa-layer-group text-[#1A56FF] mr-1"></i>Batch hisabe — Batch Manage theke auto asbe</span>
                      <label class="flex items-center gap-1.5 text-[10px] font-bold text-[#1A56FF]"><input id="catBatchAuto" type="checkbox" ${isAuto?'checked':''} class="w-3.5 h-3.5 accent-[#1A56FF]"> Auto (sob batch)</label>
                    </div>
                    <div id="catBatchList" class="${isAuto ? 'opacity-50 pointer-events-none' : ''} space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                      ${batches.length ? batches.map(b => `
                        <label class="flex items-center gap-2 bg-[#F8F9FD] rounded-[8px] border border-slate-100 px-3 py-2 hover:bg-white cursor-pointer">
                          <input type="checkbox" data-batch-id="${b.id}" ${isAuto || batchIds.includes(String(b.id)) ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF]">
                          <span class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style="background:${esc(b.color||'#EEF2FF')}"><i class="fa-solid fa-layer-group text-[11px]" style="color:${esc(b.color||'#6366F1')}"></i></span>
                          <span class="text-[12px] font-bold text-[#0F2043]">${esc(b.name)}</span>
                          <span class="ml-auto text-[10px] text-slate-400">${esc(b.slug||'')}</span>
                          <span class="text-[10px] px-1.5 py-0.5 rounded-full ${b.status==='active'?'bg-[#E6F4EA] text-[#16A34A]':'bg-slate-100 text-slate-500'}">${esc(b.status||'active')}</span>
                        </label>
                      `).join('') : '<p class="text-[11px] text-slate-400 py-2">No batches yet — Batch Manage e batch create korun</p>'}
                    </div>
                    <p class="text-[10px] text-slate-400 mt-2">Tick kora batch gulo Home Page e dekhabe. Auto tick thakle notun batch auto add hobe. Limit diye kotogulo dekhabe control korun.</p>
                  </div>
                </div>`;
            }
            if (s.hasRows) {
              const curLimit = cfg.limit != null ? cfg.limit : (s.key === 'ebooks' ? 4 : 8);
              const curRows = cfg.rows != null ? cfg.rows : Math.max(1, Math.ceil(curLimit / 4));
              extra = `
                <div class="mt-3 pt-3 border-t border-slate-200 space-y-2">
                  <div class="grid grid-cols-2 gap-2">
                    <div><label class="text-[10px] font-bold text-slate-500 uppercase">Koita Row Show Korbe</label><select data-sec-rows="${s.key}" class="${baseCls} mt-1"><option value="1" ${String(curRows)==='1'?'selected':''}>1 Row (4 ta)</option><option value="2" ${String(curRows)==='2'?'selected':''}>2 Rows (8 ta)</option><option value="3" ${String(curRows)==='3'?'selected':''}>3 Rows (12 ta)</option></select></div>
                    <div><label class="text-[10px] font-bold text-slate-500 uppercase">Limit (koita item)</label><input data-sec-limit="${s.key}" type="number" min="1" max="20" value="${esc(curLimit)}" class="${baseCls} mt-1"></div>
                  </div>
                  <p class="text-[10px] text-slate-400">Desktop e 1 row = 4 ta card. Row change korle limit auto hobe (4/8/12), chaile limit alada kore dite parben. Mobile e scroll hobe.</p>
                </div>`;
            }
            return `
            <div class="border border-slate-100 rounded-[12px] p-4 bg-[#F8F9FD]/50">
              <div class="flex items-center justify-between mb-2">
                <span class="text-[13px] font-bold text-[#0F2043]"><i class="fa-solid ${s.icon} text-[#1A56FF] mr-1"></i>${s.label}</span>
                <label class="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                  <input data-sec-enabled="${s.key}" type="checkbox" ${cfg.enabled !== false ? 'checked' : ''} class="w-4 h-4 accent-[#1A56FF]"> Show
                </label>
              </div>
              ${s.hasTitle ? `<div><label class="text-[10px] font-bold text-slate-500 uppercase">Section Title</label><input data-sec-title="${s.key}" value="${esc(cfg.title || '')}" class="${baseCls} mt-1" placeholder="${esc(s.label)}"></div>` : '<p class="text-[11px] text-slate-400">No title needed — pills auto</p>'}
              ${s.hasSubtitle ? `<div class="mt-2"><label class="text-[10px] font-bold text-slate-500 uppercase">Subtitle</label><input data-sec-subtitle="${s.key}" value="${esc(cfg.subtitle || '')}" class="${baseCls} mt-1"></div>` : ''}
              ${extra}
            </div>`;
          }).join('')}
        </div>
        <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <button id="hpSave2" class="px-5 py-2.5 rounded-[10px] bg-[#1A56FF] hover:bg-[#1445D6] text-white font-bold text-[13px]"><i class="fa-solid fa-floppy-disk mr-1"></i> Save Changes</button>
        </div>
      </div>
      <p id="hpMsg" class="hidden mt-4 text-[12px] font-semibold rounded-lg px-3 py-2"></p>
    `;

    // file upload handler
    const fileEl = document.getElementById('hpFile');
    if (fileEl) fileEl.addEventListener('change', function(e){
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 4*1024*1024) { toast('Image size must be < 4MB', false); return; }
      const reader = new FileReader();
      reader.onload = function(ev){
        const dataUrl = ev.target.result;
        $('hpImageUrl').value = dataUrl;
        const img = $('hpPreview');
        img.src = dataUrl;
        img.classList.remove('hidden');
        $('hpNoImg').classList.add('hidden');
        toast('Image loaded - click Save to apply');
      };
      reader.readAsDataURL(file);
    });
    $('hpImageUrl').addEventListener('input', function(){
      const v = this.value.trim();
      const img = $('hpPreview');
      if (v) { img.src = v; img.classList.remove('hidden'); $('hpNoImg').classList.add('hidden'); }
      else { img.classList.add('hidden'); $('hpNoImg').classList.remove('hidden'); $('hpNoImg').classList.add('flex'); }
    });
    $('hpRemoveImg').addEventListener('click', function(){
      $('hpImageUrl').value = '';
      $('hpPreview').classList.add('hidden');
      $('hpNoImg').classList.remove('hidden');
      $('hpNoImg').classList.add('flex');
    });
    const catAddBtn = $('catAddBtn');
    if (catAddBtn) catAddBtn.addEventListener('click', function(){
      const items = hp.sections.categories.items || [];
      const newId = 'cat' + Date.now().toString().slice(-4);
      items.push({ id: newId, name: 'New Pill', icon: 'fa-star', color: '#6366F1', bg: '#EEF2FF', link: 'courses.html', enabled: true });
      hp.sections.categories.items = items;
      renderHomePage();
      toast('New pill added - edit name then Save');
    });
    const catAuto = $('catBatchAuto');
    const catList = $('catBatchList');
    if (catAuto && catList) catAuto.addEventListener('change', function(){
      if (this.checked) { catList.classList.add('opacity-50','pointer-events-none'); }
      else { catList.classList.remove('opacity-50','pointer-events-none'); }
    });
    // Row select -> auto set limit = rows*4 (Desktop 1 row = 4 cards)
    view.querySelectorAll('[data-sec-rows]').forEach(rowEl=>{
      rowEl.addEventListener('change', function(){
        const k = this.dataset.secRows;
        const limEl = view.querySelector('[data-sec-limit="'+k+'"]');
        if (limEl) limEl.value = (parseInt(this.value,10)||1) * 4;
      });
    });

    async function doSave(){
      const heroPayload = {
        enabled: $('hpHeroEnabled').checked,
        badge: $('hpBadge').value.trim(),
        titleLine1: $('hpTitle1').value.trim(),
        titleLine2: $('hpTitle2').value.trim(),
        highlight: $('hpHighlight').value.trim(),
        description: $('hpDesc').value.trim(),
        searchPlaceholder: $('hpSearchPh').value.trim(),
        ctaText: $('hpCtaText').value.trim(),
        ctaLink: $('hpCtaLink').value.trim(),
        imageUrl: $('hpImageUrl').value.trim(),
        imageAlt: $('hpImageAlt').value.trim()
      };
      const sectionsPayload = {};
      view.querySelectorAll('[data-sec-enabled]').forEach(el=>{
        const k = el.dataset.secEnabled;
        sectionsPayload[k] = sectionsPayload[k] || {};
        sectionsPayload[k].enabled = el.checked;
      });
      view.querySelectorAll('[data-sec-title]').forEach(el=>{
        const k = el.dataset.secTitle;
        sectionsPayload[k] = sectionsPayload[k] || {};
        sectionsPayload[k].title = el.value.trim();
      });
      view.querySelectorAll('[data-sec-subtitle]').forEach(el=>{
        const k = el.dataset.secSubtitle;
        sectionsPayload[k] = sectionsPayload[k] || {};
        sectionsPayload[k].subtitle = el.value.trim();
      });
      // include toggles without title
      if (!sectionsPayload.categories) sectionsPayload.categories = { enabled: view.querySelector('[data-sec-enabled="categories"]').checked };
      // Row / Limit controls: E-Book Category, Popular, Latest, Ebooks + Categories
      view.querySelectorAll('[data-sec-limit]').forEach(el=>{
        const k = el.dataset.secLimit;
        sectionsPayload[k] = sectionsPayload[k] || {};
        const maxL = (k === 'categories') ? 10 : 20;
        const defL = (k === 'ebooks') ? 4 : 8;
        sectionsPayload[k].limit = Math.max(1, Math.min(maxL, parseInt(el.value,10)||defL));
      });
      view.querySelectorAll('[data-sec-rows]').forEach(el=>{
        const k = el.dataset.secRows;
        sectionsPayload[k] = sectionsPayload[k] || {};
        sectionsPayload[k].rows = Math.max(1, Math.min(3, parseInt(el.value,10)||1));
      });
      // categories extra controls (Batch hisabe)
      const catLayoutEl = view.querySelector('[data-sec-layout="categories"]');
      const catArrowsEl = view.querySelector('[data-sec-arrows="categories"]');
      if (catLayoutEl) sectionsPayload.categories.layout = catLayoutEl.value;
      if (catArrowsEl) sectionsPayload.categories.showArrows = catArrowsEl.checked;
      const catAutoEl = view.querySelector('#catBatchAuto');
      if (catAutoEl) {
        if (catAutoEl.checked) {
          sectionsPayload.categories.batchIds = [];
        } else {
          const checked = Array.from(view.querySelectorAll('[data-batch-id]:checked')).map(el=> el.dataset.batchId);
          sectionsPayload.categories.batchIds = checked;
        }
      }
      // keep legacy items for fallback
      const catRows = view.querySelectorAll('[data-cat-name]');
      if (catRows.length) {
        const baseItems = (hp.sections.categories && hp.sections.categories.items) ? hp.sections.categories.items.slice() : [];
        const newItems = [];
        catRows.forEach((el, idx)=>{
          const base = baseItems[idx] || { id: 'cat'+(idx+1) };
          const enabledEl = view.querySelector('[data-cat-enabled="'+idx+'"]');
          const nameEl = view.querySelector('[data-cat-name="'+idx+'"]');
          const iconEl = view.querySelector('[data-cat-icon="'+idx+'"]');
          newItems.push({
            id: base.id || ('cat'+(idx+1)),
            name: nameEl ? nameEl.value.trim() || base.name : base.name,
            icon: iconEl ? iconEl.value.trim() || base.icon : base.icon,
            color: base.color || '#6366F1',
            bg: base.bg || '#EEF2FF',
            link: base.link || 'courses.html',
            enabled: enabledEl ? enabledEl.checked : true
          });
        });
        sectionsPayload.categories.items = newItems;
      }
      // How To Buy extra fields (text + video + button)
      sectionsPayload.howToBuy = sectionsPayload.howToBuy || {};
      const hbDescEl = view.querySelector('[data-hb-desc]');
      if (hbDescEl) sectionsPayload.howToBuy.description = hbDescEl.value.trim();
      const hbVideoEl = view.querySelector('[data-hb-video]');
      if (hbVideoEl) sectionsPayload.howToBuy.videoUrl = hbVideoEl.value.trim();
      const hbBtnTextEl = view.querySelector('[data-hb-btntext]');
      if (hbBtnTextEl) sectionsPayload.howToBuy.btnText = hbBtnTextEl.value.trim();
      const hbBtnLinkEl = view.querySelector('[data-hb-btnlink]');
      if (hbBtnLinkEl) sectionsPayload.howToBuy.btnLink = hbBtnLinkEl.value.trim();

      const msgBox = $('hpMsg');
      msgBox.classList.add('hidden');
      try {
        await api('/api/admin/homepage', { method: 'PUT', body: JSON.stringify({ hero: heroPayload, sections: sectionsPayload }) });
        msgBox.textContent = 'Home page saved successfully! Preview: index.html';
        msgBox.className = 'mt-4 text-[12px] font-semibold rounded-lg px-3 py-2 bg-[#E6F4EA] text-[#16A34A] border border-[#C8E9D5]';
        msgBox.classList.remove('hidden');
        toast('Home page saved');
      } catch(err){
        msgBox.textContent = err.message;
        msgBox.className = 'mt-4 text-[12px] font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-100';
        msgBox.classList.remove('hidden');
        toast(err.message, false);
      }
    }
    $('hpSave').addEventListener('click', doSave);
    const hpSave2 = $('hpSave2');
    if (hpSave2) hpSave2.addEventListener('click', doSave);
    $('hpReset').addEventListener('click', function(){
      confirmDialog('Reset Home Page?', 'Sob text & image default e firbe. Are you sure?', async function(){
        try { await api('/api/admin/homepage/reset', {method:'POST'}); toast('Reset done'); renderHomePage(); } catch(e){ toast(e.message,false); }
      }, 'Yes, Reset');
    });
  }

  /* ---------------- boot / init ---------------- */
  async function refreshMeta() {
    try {
      const json = await api('/api/admin/batches');
      state.meta.batches = json.data || [];
      try {
        const eb = await api('/api/admin/ebookBatches');
        state.meta.ebookBatches = eb.data || [];
      } catch (e) { state.meta.ebookBatches = []; }
      const c = await api('/api/admin/categories');
      state.meta.categories = c.data || [];
      const p = await api('/api/admin/platforms');
      state.meta.platforms = p.data || [];
    } catch (err) {
      toast('Could not load settings data: ' + err.message, false);
    }
  }

  async function boot() {
    await refreshMeta();
    if (!location.hash) location.hash = '#/dashboard';
    route();
  }

  async function init() {
    if (state.started) return;
    state.started = true;
    if (!state.token) {
      showLogin();
      return;
    }
    try {
      const me = await api('/api/admin/me');
      state.admin = me.data;
      showApp();
      await boot();
    } catch (err) {
      showLogin();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState === 'complete' || document.readyState === 'interactive') init();
})();













