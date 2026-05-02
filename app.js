import { ensureUser } from './data.js';

import { renderDashboard } from './dashboard.js';
import { renderCustomersPage } from './customers.js';
import { renderSuppliersPage } from './suppliers.js';
import { renderInvoicesPage } from './invoices.js';
import { renderSalesPage } from './sales.js';
import { renderTarhilPage } from './tarhil.js';
import { renderShopsPage } from './market_shops.js';
import { renderKhaznaPage } from './khazna.js';
import { renderFinancialPage } from './financial.js';
import { renderPartnersPage } from './partners.js';
import { renderEmployeesPage } from './employees.js';
import { renderCratesPage } from './cartes.js';  // اسم ملفك الحقيقي
import { renderReconciliationPage } from './reconciliation_page.js';
import { renderAuditPage } from './audit.js';

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

const titles = {
  dashboard: 'الرئيسية', customers: 'العملاء', suppliers: 'الموردين',
  invoices: 'الفواتير', sales: 'المبيعات', tarhil: 'الترحيلات',
  market_shops: 'محلات السوق', khazna: 'الخزنة',
  financial: 'المركز المالي', partners: 'الشركاء',
  employees: 'الموظفين', crates: 'العدايات والبرانيك',
  reconciliation: 'تسوية الحسابات', audit: 'سجل العمليات'
};

(async () => {
  try {
    const user = await ensureUser();
    if (!user) { window.location.href = 'index.html'; return; }

    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.onclick = () => {
        navigate(btn.dataset.nav);
        document.getElementById('sidebar')?.classList.remove('open');
      };
    });

    navigate('dashboard');
  } catch (err) {
    document.body.innerHTML = '<h1 style="text-align:center;margin-top:50px;color:red;">خطأ: ' + err.message + '</h1>';
  }
})();

window.navigate = function(route) {
  const app = document.getElementById('app');
  const title = document.getElementById('page-title');
  if (!app || !pages[route]) return;

  title.textContent = titles[route] || route;
  app.innerHTML = '<div class="skeleton skeleton-card"></div>';
  pages[route](app);
};
