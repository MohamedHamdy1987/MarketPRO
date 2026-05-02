import { supabase, ensureUser } from './data.js';

/* ── استيراد ثابت لكل الصفحات من مجلد pages ── */
import { renderDashboard } from './pages/dashboard.js';
import { renderCustomersPage } from './pages/customers.js';
import { renderSuppliersPage } from './pages/suppliers.js';
import { renderInvoicesPage } from './pages/invoices.js';
import { renderSalesPage } from './pages/sales.js';
import { renderTarhilPage } from './pages/tarhil.js';
import { renderShopsPage } from './pages/market_shops.js';
import { renderKhaznaPage } from './pages/khazna.js';
import { renderFinancialPage } from './pages/financial.js';
import { renderPartnersPage } from './pages/partners.js';
import { renderEmployeesPage } from './pages/employees.js';
import { renderCratesPage } from './pages/cartes.js';  // استخدم اسم ملفك الفعلي هنا
import { renderReconciliationPage } from './pages/reconciliation_page.js';
import { renderAuditPage } from './pages/audit.js';

/* ── ربط المسارات بالصفحات ── */
const pages = {
  dashboard: renderDashboard,
  customers: renderCustomersPage,
  suppliers: renderSuppliersPage,
  invoices: renderInvoicesPage,
  sales: renderSalesPage,
  tarhil: renderTarhilPage,
  market_shops: renderShopsPage,
  khazna: renderKhaznaPage,
  financial: renderFinancialPage,
  partners: renderPartnersPage,
  employees: renderEmployeesPage,
  crates: renderCratesPage,
  reconciliation: renderReconciliationPage,
  audit: renderAuditPage
};

/* ── بدء التطبيق ── */
(async () => {
  try {
    const user = await ensureUser();
    if (!user) { window.location.href = 'index.html'; return; }

    // تجهيز أزرار القائمة الجانبية
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.onclick = () => {
        const route = btn.dataset.nav;
        navigate(route);
        document.getElementById('sidebar')?.classList.remove('open');
      };
    });

    navigate('dashboard');
  } catch (err) {
    alert('خطأ: ' + err.message);
  }
})();

/* ── دالة الانتقال بين الصفحات ── */
window.navigate = function(route) {
  const app = document.getElementById('app');
  const title = document.getElementById('page-title');
  if (!app) return;

  const titles = {
    dashboard: 'الرئيسية', customers: 'العملاء', suppliers: 'الموردين',
    invoices: 'الفواتير', sales: 'المبيعات', tarhil: 'الترحيلات',
    market_shops: 'محلات السوق', khazna: 'الخزنة',
    financial: 'المركز المالي', partners: 'الشركاء',
    employees: 'الموظفين', crates: 'العدايات والبرانيك',
    reconciliation: 'تسوية الحسابات', audit: 'سجل العمليات'
  };
  title.textContent = titles[route] || route;
  app.innerHTML = '<div class="skeleton skeleton-card"></div>';

  const pageFunc = pages[route];
  if (typeof pageFunc === 'function') {
    pageFunc(app);
  } else {
    app.innerHTML = '<p>صفحة غير معروفة</p>';
  }
};
