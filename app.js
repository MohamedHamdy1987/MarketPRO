/**
 * Market Pro – app.js FINAL v6.0 Production Stable
 */
window.onerror = function(message, source, lineno, colno, error) {
  document.body.innerHTML += `
    <div style="
      position:fixed;
      top:0;left:0;right:0;
      background:#dc2626;
      color:#fff;
      padding:10px;
      font-size:12px;
      z-index:9999;
      direction:ltr;
    ">
      ERROR: ${message} <br>
      ${source}:${lineno}
    </div>
  `;
};

window.addEventListener('unhandledrejection', function(e) {
  document.body.innerHTML += `
    <div style="
      position:fixed;
      top:50px;left:0;right:0;
      background:#b91c1c;
      color:#fff;
      padding:10px;
      font-size:12px;
      z-index:9999;
    ">
      PROMISE ERROR: ${e.reason}
    </div>
  `;
});
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const root = document.getElementById('app');
if (!root) return;
// ✅ منع تشغيل app.js خارج app.html
const root = document.getElementById('app');
if (!root) {
  console.log('Not app page → skip app init');
  throw new Error('Stop app.js');
}

/* ───────────────────────── ERROR HANDLER ───────────────────────── */

function showError(msg) {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed;top:0;left:0;right:0;
    background:#dc2626;color:#fff;
    padding:10px;z-index:9999;
    font-size:13px;text-align:center;
    direction:rtl;
  `;
  el.textContent = msg;
  document.body.prepend(el);
  setTimeout(() => el.remove(), 5000);
}

window.addEventListener('error', (e) => {
  showError('❌ ' + (e.message || 'خطأ غير معروف'));
});

window.addEventListener('unhandledrejection', (e) => {
  showError('❌ ' + (e.reason?.message || 'خطأ في التنفيذ'));
});

/* ───────────────────────── SUPABASE CLIENT (TEMP AUTH ONLY) ───────────────────────── */

const supabaseUrl = 'https://seadlwxlffbgxtxwhuis.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlYWRsd3hsZmZiZ3h0eHdodWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MjEzNTYsImV4cCI6MjA5MzA5NzM1Nn0._CtO7o-ruSpAq-w7Lri3rdbG4Zin6rI8nzFDsinR6Co'; // نفس الموجود في data.js

const _sb = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: window.localStorage,
    persistSession: true,
    detectSessionInUrl: true,
    autoRefreshToken: true
  }
});

/* ───────────────────────── INIT FLOW ───────────────────────── */

(async () => {
  try {
    const { data: { user } } = await _sb.auth.getUser();

    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    setBusinessName(user);
    await loadEmployeeRole(user.id);
    await checkSubscription(user.id); // ✅ أهم إضافة

    initApp();

  } catch (err) {
    showError(err.message);
  }
})();

/* ───────────────────────── SUBSCRIPTION CHECK ───────────────────────── */

async function checkSubscription(userId) {
  try {
    const { data } = await _sb
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!data) return;

    const now = new Date();

    if (
      data.status === 'expired' ||
      (data.subscription_ends_at && new Date(data.subscription_ends_at) < now)
    ) {
      document.body.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px;">
          <h2>🚫 الاشتراك منتهي</h2>
          <p>يرجى التجديد للمتابعة</p>
        </div>
      `;
      throw new Error('SUB_EXPIRED');
    }

  } catch (e) {
    console.warn('[subscription]', e.message);
  }
}

/* ───────────────────────── BUSINESS NAME ───────────────────────── */

function setBusinessName(user) {
  const biz = user.user_metadata?.business_name;
  const el = document.getElementById('business-name');

  if (el && biz) {
    el.textContent = biz;
    el.style.display = 'block';
  }
}

/* ───────────────────────── ROUTING ───────────────────────── */

const PAGE_TITLES = {
  dashboard: 'الرئيسية',
  invoices: 'الفواتير',
  sales: 'المبيعات',
  tarhil: 'الترحيلات',
  customers: 'العملاء',
  suppliers: 'الموردين',
  market_shops: 'محلات السوق',
  khazna: 'الخزنة',
  financial: 'المركز المالي',
  partners: 'الشركاء',
  employees: 'الموظفين',
  crates: 'العدايات والبرانيك',
  reconciliation: 'تسوية الحسابات',
};

async function loadPage(route) {
  if (window._currentRoute === route) return; // ✅ يمنع reload

  const app = document.getElementById('app');
  const titleEl = document.getElementById('page-title');

  if (!app) return;

  app.innerHTML = `
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
  `;

  if (titleEl) titleEl.textContent = PAGE_TITLES[route] || route;

  try {
    switch (route) {

      case 'dashboard':
        (await import('./pages/dashboard.js')).renderDashboard(app);
        break;

      case 'invoices':
        (await import('./pages/invoices.js')).renderInvoicesPage(app);
        break;

      case 'sales':
        (await import('./pages/sales.js')).renderSalesPage(app);
        break;

      case 'tarhil':
        (await import('./pages/tarhil.js')).renderTarhilPage(app);
        break;

      case 'customers':
        (await import('./pages/customers.js')).renderCustomersPage(app);
        break;

      case 'suppliers':
        (await import('./pages/suppliers.js')).renderSuppliersPage(app);
        break;

      case 'market_shops':
        (await import('./pages/market_shops.js')).renderShopsPage(app);
        break;

      case 'khazna':
        (await import('./pages/khazna.js')).renderKhaznaPage(app);
        break;

      case 'financial':
        (await import('./pages/financial.js')).renderFinancialPage(app);
        break;

      case 'partners':
        (await import('./pages/partners.js')).renderPartnersPage(app);
        break;

      case 'employees':
        (await import('./pages/employees.js')).renderEmployeesPage(app);
        break;
case 'audit': {
  const { renderAuditPage } = await import('./pages/audit.js');
  await renderAuditPage(app);
  break;

      case 'crates':
        (await import('./pages/crates.js')).renderCratesPage(app);
        break;

      case 'reconciliation':
        (await import('./pages/reconciliation_page.js')).renderReconciliationPage(app);
        break;

      default:
        app.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-title">الصفحة غير موجودة</div>
          </div>`;
    }

  } catch (err) {
    console.error('[Page Error]', err);
    app.innerHTML = `
      <div class="card" style="color:var(--c-danger)">
        ⚠️ خطأ في تحميل الصفحة<br>${err.message}
      </div>`;
  }

  app.classList.add('fade-in');

  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.nav === route);
  });

  window._currentRoute = route;
  applyRBAC();
}

/* ───────────────────────── NAVIGATION ───────────────────────── */

window.navigate = function(route) {
  if (window._currentRoute === route) return;
  history.pushState({ route }, '', '#' + route);
  loadPage(route);
};

window.addEventListener('popstate', (e) => {
  loadPage(e.state?.route || 'dashboard');
});

/* ───────────────────────── ROLE ───────────────────────── */

async function loadEmployeeRole(userId) {
  try {
    const { data } = await _sb
      .from('employees')
      .select('role, active')
      .eq('user_id', userId)
      .eq('active', true)
      .single();

    window._currentUserRole = data?.role || 'admin';
    window._employeeActive = !!data;

  } catch {
    window._currentUserRole = 'admin';
    window._employeeActive = false;
  }
}

window.canAccess = function(feature) {
  const permissions = {
    admin: ['create','edit','delete','view_sensitive','manage_employees','manage_shops','manage_partners'],
    cashier: ['create','view_sensitive'],
    worker: [],
  };
  return (permissions[window._currentUserRole] || []).includes(feature);
};

/* ───────────────────────── RBAC ───────────────────────── */

function applyRBAC() {
  document.querySelectorAll('[data-permission]').forEach(el => {
    if (!window.canAccess(el.dataset.permission)) {
      el.style.display = 'none';
    }
  });
}

/* ───────────────────────── INIT APP ───────────────────────── */

function initApp() {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.onclick = () => {
      const route = btn.dataset.nav;
      navigate(route);
      document.getElementById('sidebar')?.classList.remove('open');
    };
  });

  const hash = window.location.hash.replace('#', '') || 'dashboard';
  const validRoutes = Object.keys(PAGE_TITLES);
  const startRoute = validRoutes.includes(hash) ? hash : 'dashboard';

  history.replaceState({ route: startRoute }, '', '#' + startRoute);
  loadPage(startRoute);

  /* Network Indicator */
  function updateNetStatus() {
    const el = document.getElementById('net-status');
    if (!el) return;
    el.textContent = navigator.onLine ? '🟢' : '🔴';
  }

  window.addEventListener('online', updateNetStatus);
  window.addEventListener('offline', updateNetStatus);
  updateNetStatus();

  /* RBAC watcher */
  const observer = new MutationObserver(() => applyRBAC());
  observer.observe(document.getElementById('app'), { childList: true, subtree: true });
}
