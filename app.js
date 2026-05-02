/**
 * Market Pro – app.js FINAL v6.0 Production Stable
 * ✅ Fixed: Static imports, unified Supabase client, removed syntax error.
 */
import { supabase, ensureUser } from './data.js';

import { renderDashboard } from './pages/dashboard.js';
import { renderInvoicesPage } from './pages/invoices.js';
import { renderSalesPage } from './pages/sales.js';
import { renderTarhilPage } from './pages/tarhil.js';
import { renderCustomersPage } from './pages/customers.js';
import { renderSuppliersPage } from './pages/suppliers.js';
import { renderShopsPage } from './pages/market_shops.js';
import { renderKhaznaPage } from './pages/khazna.js';
import { renderFinancialPage } from './pages/financial.js';
import { renderPartnersPage } from './pages/partners.js';
import { renderEmployeesPage } from './pages/employees.js';
import { renderCratesPage } from './pages/cartes.js';
import { renderReconciliationPage } from './pages/reconciliation_page.js';
import { renderAuditPage } from './pages/audit.js';

/* ───────────────────────── ERROR HANDLER ───────────────────────── */
function showError(msg) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:10px;z-index:9999;font-size:13px;text-align:center;direction:rtl;`;
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

/* ───────────────────────── PAGE MAP ───────────────────────── */
const PAGE_MAP = {
  dashboard:      { render: renderDashboard,        title: 'الرئيسية' },
  invoices:       { render: renderInvoicesPage,      title: 'الفواتير' },
  sales:          { render: renderSalesPage,         title: 'المبيعات' },
  tarhil:         { render: renderTarhilPage,        title: 'الترحيلات' },
  customers:      { render: renderCustomersPage,     title: 'العملاء' },
  suppliers:      { render: renderSuppliersPage,     title: 'الموردين' },
  market_shops:   { render: renderShopsPage,         title: 'محلات السوق' },
  khazna:         { render: renderKhaznaPage,        title: 'الخزنة' },
  financial:      { render: renderFinancialPage,     title: 'المركز المالي' },
  partners:       { render: renderPartnersPage,      title: 'الشركاء' },
  employees:      { render: renderEmployeesPage,     title: 'الموظفين' },
  crates:         { render: renderCratesPage,        title: 'العدايات والبرانيك' },
  reconciliation: { render: renderReconciliationPage, title: 'تسوية الحسابات' },
  audit:          { render: renderAuditPage,         title: 'سجل العمليات' },
};

/* ───────────────────────── INIT FLOW ───────────────────────── */
(async () => {
  try {
    const user = await ensureUser();
    if (!user) { window.location.href = 'index.html'; return; }

    setBusinessName(user);
    await loadEmployeeRole(user.id);
    initApp();
  } catch (err) { showError(err.message); }
})();

/* ───────────────────────── BUSINESS NAME ───────────────────────── */
function setBusinessName(user) {
  const biz = user.user_metadata?.business_name;
  const el = document.getElementById('business-name');
  if (el && biz) { el.textContent = biz; el.style.display = 'block'; }
}

/* ───────────────────────── NAVIGATION ───────────────────────── */
window.navigate = function(route) {
  if (!PAGE_MAP[route]) return;
  const app = document.getElementById('app');
  const titleEl = document.getElementById('page-title');
  if (!app) return;

  history.pushState({ route }, '', '#' + route);
  document.querySelectorAll('[data-nav]').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`[data-nav="${route}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  if (titleEl) titleEl.textContent = PAGE_MAP[route].title;
  app.innerHTML = '<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>';

  try {
    PAGE_MAP[route].render(app);
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="card" style="color:var(--c-danger)">⚠️ خطأ في تحميل الصفحة<br>${err.message}</div>`;
  }
};

window.addEventListener('popstate', (e) => {
  window.navigate(e.state?.route || 'dashboard');
});

/* ───────────────────────── ROLE ───────────────────────── */
async function loadEmployeeRole(userId) {
  try {
    const { data } = await supabase.from('employees').select('role, active').eq('user_id', userId).eq('active', true).single();
    window._currentUserRole = data?.role || 'admin';
  } catch { window._currentUserRole = 'admin'; }
}

/* ───────────────────────── INIT APP ───────────────────────── */
function initApp() {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.onclick = () => {
      navigate(btn.dataset.nav);
      document.getElementById('sidebar')?.classList.remove('open');
    };
  });

  const hash = window.location.hash.replace('#', '') || 'dashboard';
  navigate(hash);

  function updateNetStatus() {
    const el = document.getElementById('net-status');
    if (el) el.textContent = navigator.onLine ? '🟢' : '🔴';
  }
  window.addEventListener('online', updateNetStatus);
  window.addEventListener('offline', updateNetStatus);
  updateNetStatus();
}
