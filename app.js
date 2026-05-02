import { supabase, ensureUser } from './data.js';

/* ── تهيئة التطبيق ──────────────────────── */
(async () => {
  try {
    const user = await ensureUser();
    if (!user) { window.location.href = 'index.html'; return; }

    // تجهيز القائمة
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.onclick = () => {
        const route = btn.dataset.nav;
        navigate(route);
        document.getElementById('sidebar')?.classList.remove('open');
      };
    });

    // فتح الصفحة الرئيسية
    navigate('dashboard');

  } catch (err) {
    alert('خطأ: ' + err.message);
  }
})();

/* ── Navigation ────────────────────────── */
window.navigate = function(route) {
  const app = document.getElementById('app');
  const title = document.getElementById('page-title');
  if (!app) return;

  // Lazy load للصفحات
  const pages = {
    dashboard: './pages/dashboard.js',
    customers: './pages/customers.js',
    suppliers: './pages/suppliers.js',
    invoices: './pages/invoices.js',
    sales: './pages/sales.js',
    tarhil: './pages/tarhil.js',
    market_shops: './pages/market_shops.js',
    khazna: './pages/khazna.js',
    financial: './pages/financial.js',
    partners: './pages/partners.js',
    employees: './pages/employees.js',
    crates: './pages/cartes.js',   // اسم ملفك الحالي
    reconciliation: './pages/reconciliation_page.js',
    audit: './pages/audit.js'
  };

  if (!pages[route]) {
    app.innerHTML = '<p>صفحة غير معروفة</p>';
    return;
  }

  app.innerHTML = '<div class="skeleton skeleton-card"></div>';
  if (title) {
    const titles = {
      dashboard:'الرئيسية', customers:'العملاء', suppliers:'الموردين', invoices:'الفواتير',
      sales:'المبيعات', tarhil:'الترحيلات', market_shops:'محلات السوق', khazna:'الخزنة',
      financial:'المركز المالي', partners:'الشركاء', employees:'الموظفين', crates:'العدايات والبرانيك',
      reconciliation:'تسوية الحسابات', audit:'سجل العمليات'
    };
    title.textContent = titles[route] || route;
  }

  import(pages[route])
    .then(mod => {
      const func = Object.values(mod)[0]; // أول تصدير
      if (typeof func === 'function') func(app);
    })
    .catch(err => {
      app.innerHTML = `<div class="card">خطأ: ${err.message}</div>`;
    });
};
