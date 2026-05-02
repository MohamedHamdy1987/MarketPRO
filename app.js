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

/* ── NAVIGATION ───────────────────────── */
window.navigate = function(route) {
  alert('navigate called: ' + route); // ← اختبار
  if (!PAGE_MAP[route]) return;
  const app = document.getElementById('app');
  const titleEl = document.getElementById('page-title');
  if (!app) return;

  document.querySelectorAll('[data-nav]').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`[data-nav="${route}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  if (titleEl) titleEl.textContent = PAGE_MAP[route].title;
  app.innerHTML = '<div class="skeleton skeleton-card"></div>';

  try {
    PAGE_MAP[route].render(app);
  } catch (err) {
    app.innerHTML = `<div class="card" style="color:red">خطأ: ${err.message}</div>`;
  }
};

/* ── INIT ─────────────────────────────── */
(async () => {
  const user = await ensureUser();
  if (!user) { window.location.href = 'index.html'; return; }

  // ربط الأزرار
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.onclick = () => {
      navigate(btn.dataset.nav);
      document.getElementById('sidebar')?.classList.remove('open');
    };
  });

  navigate('dashboard');
})();
