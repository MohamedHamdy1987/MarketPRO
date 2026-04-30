/**
 * Market Pro – app.js  v5.1 Supernova (مع عرض الأخطاء على الشاشة)
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ─── عرض الأخطاء العامة (للتشخيص) ─────────────────────────────
window.addEventListener('error', (event) => {
  const errEl = document.createElement('div');
  errEl.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px;z-index:9999;font-size:14px;text-align:center;direction:rtl;';
  errEl.textContent = '❌ خطأ: ' + (event.message || event.error?.message || 'حدث خطأ غير معروف');
  document.body.prepend(errEl);
  setTimeout(() => errEl.remove(), 6000);
});

window.addEventListener('unhandledrejection', (event) => {
  const errEl = document.createElement('div');
  errEl.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px;z-index:9999;font-size:14px;text-align:center;direction:rtl;';
  errEl.textContent = '❌ خطأ في التحميل: ' + (event.reason?.message || 'خطأ غير معروف');
  document.body.prepend(errEl);
  setTimeout(() => errEl.remove(), 6000);
});

const supabaseUrl = 'https://seadlwxlffbgxtxwhuis.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlYWRsd3hsZmZiZ3h0eHdodWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MjEzNTYsImV4cCI6MjA5MzA5NzM1Nn0._CtO7o-ruSpAq-w7Lri3rdbG4Zin6rI8nzFDsinR6Co';

const _sb = createClient(supabaseUrl, supabaseKey, {
  auth: { storage: window.localStorage, persistSession: true, detectSessionInUrl: true, autoRefreshToken: true }
});

(async () => {
  const { data: { user } } = await _sb.auth.getUser();
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  const biz = user.user_metadata?.business_name;
  const bizEl = document.getElementById('business-name');
  if (bizEl && biz) {
    bizEl.textContent = biz;
    bizEl.style.display = 'block';
  }
  await loadEmployeeRole(user.id);
  initApp();
})();

const PAGE_TITLES = {
  dashboard: 'الرئيسية', invoices: 'الفواتير', sales: 'المبيعات',
  tarhil: 'الترحيلات', customers: 'العملاء', suppliers: 'الموردين',
  market_shops: 'محلات السوق', khazna: 'الخزنة', financial: 'المركز المالي',
  partners: 'الشركاء', employees: 'الموظفين', crates: 'العدايات والبرانيك',
  reconciliation: 'تسوية الحسابات',
};

async function loadPage(route) {
  const app = document.getElementById('app');
  const titleEl = document.getElementById('page-title');
  if (!app) return;

  app.innerHTML = `<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>`;
  app.className = 'content';
  if (titleEl) titleEl.textContent = PAGE_TITLES[route] || route;

  try {
    switch (route) {
      case 'dashboard': {
        const { renderDashboard } = await import('./pages/dashboard.js');
        await renderDashboard(app);
        break;
      }
      case 'invoices': {
        const { renderInvoicesPage } = await import('./pages/invoices.js');
        await renderInvoicesPage(app);
        break;
      }
      case 'sales': {
        const { renderSalesPage } = await import('./pages/sales.js');
        await renderSalesPage(app);
        break;
      }
      case 'tarhil': {
        const { renderTarhilPage } = await import('./pages/tarhil.js');
        await renderTarhilPage(app);
        break;
      }
      case 'customers': {
        const { renderCustomersPage } = await import('./pages/customers.js');
        await renderCustomersPage(app);
        break;
      }
      case 'suppliers': {
        const { renderSuppliersPage } = await import('./pages/suppliers.js');
        await renderSuppliersPage(app);
        break;
      }
      case 'market_shops': {
        const { renderShopsPage } = await import('./pages/market_shops.js');
        await renderShopsPage(app);
        break;
      }
      case 'khazna': {
        const { renderKhaznaPage } = await import('./pages/khazna.js');
        await renderKhaznaPage(app);
        break;
      }
      case 'financial': {
        const { renderFinancialPage } = await import('./pages/financial.js');
        await renderFinancialPage(app);
        break;
      }
      case 'partners': {
        const { renderPartnersPage } = await import('./pages/partners.js');
        await renderPartnersPage(app);
        break;
      }
      case 'employees': {
        const { renderEmployeesPage } = await import('./pages/employees.js');
        await renderEmployeesPage(app);
        break;
      }
      case 'crates': {
        const { renderCratesPage } = await import('./pages/crates.js');
        await renderCratesPage(app);
        break;
      }
      case 'reconciliation': {
        const { renderReconciliationPage } = await import('./pages/reconciliation_page.js');
        await renderReconciliationPage(app);
        break;
      }
      default: {
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">الصفحة غير موجودة</div></div>`;
      }
    }
  } catch (err) {
    console.error('Page load error:', err);
    app.innerHTML = `<div class="card" style="color:var(--c-danger);">⚠️ خطأ في تحميل الصفحة:<br>${err.message}</div>`;
  }

  app.classList.add('fade-in');
  document.querySelectorAll('[data-nav]').forEach(btn => btn.classList.toggle('active', btn.dataset.nav === route));
  window._currentRoute = route;
}

window.navigate = function(route) {
  history.pushState({ route }, '', '#' + route);
  loadPage(route);
};

window.addEventListener('popstate', (e) => {
  const route = e.state?.route || 'dashboard';
  loadPage(route);
});

async function loadEmployeeRole(userId) {
  try {
    const { data, error } = await _sb.from('employees').select('role, active').eq('user_id', userId).eq('active', true).single();
    if (error || !data) { window._currentUserRole = 'admin'; window._employeeActive = false; }
    else { window._currentUserRole = data.role || 'worker'; window._employeeActive = true; }
  } catch { window._currentUserRole = 'admin'; window._employeeActive = false; }
}

window.canAccess = function(feature) {
  const role = window._currentUserRole || 'admin';
  const permissions = {
    admin: ['create','edit','delete','view_sensitive','manage_employees','manage_shops','manage_partners'],
    cashier: ['create','view_sensitive'],
    worker: [],
  };
  return (permissions[role] || []).includes(feature);
};

function applyRBAC() {
  document.querySelectorAll('[data-permission]').forEach(el => {
    const perm = el.dataset.permission;
    if (perm && !window.canAccess(perm)) el.style.display = 'none';
  });
}

function initApp() {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = btn.dataset.nav;
      window.navigate(route);
      document.getElementById('sidebar')?.classList.remove('open');
    });
  });

  const gs = document.getElementById('global-search');
  if (gs) gs.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    if (typeof window.filterCustomers === 'function' && window._currentRoute === 'customers') window.filterCustomers(q);
  });

  const hamburger = document.getElementById('hamburger');
  if (hamburger) hamburger.addEventListener('click', () => document.getElementById('sidebar')?.classList.toggle('open'));

  const hash = window.location.hash.replace('#', '') || 'dashboard';
  const validRoutes = Object.keys(PAGE_TITLES);
  const startRoute = validRoutes.includes(hash) ? hash : 'dashboard';
  history.replaceState({ route: startRoute }, '', '#' + startRoute);
  loadPage(startRoute);

  function updateNetStatus() {
    const indicator = document.getElementById('net-status');
    if (!indicator) return;
    indicator.textContent = navigator.onLine ? '🟢' : '🔴';
    indicator.title = navigator.onLine ? 'متصل' : 'بدون إنترنت';
  }
  window.addEventListener('online', updateNetStatus);
  window.addEventListener('offline', updateNetStatus);
  updateNetStatus();

  const observer = new MutationObserver(() => applyRBAC());
  observer.observe(document.getElementById('app'), { childList: true, subtree: true });
}
