// تحميل الأدوات الأساسية أولاً
let ensureUser;
try {
  const dataModule = await import('./data.js');
  ensureUser = dataModule.ensureUser;
} catch (e) {
  alert('فشل تحميل البيانات الأساسية: ' + e.message);
  throw e;
}

// التأكد من تسجيل الدخول
(async () => {
  try {
    const user = await ensureUser();
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    // قائمة الصفحات
    window.navigate = async function(route) {
      const app = document.getElementById('app');
      if (!app) return;
      app.innerHTML = '<div class="skeleton skeleton-card"></div>';

      if (route === 'test') {
        app.innerHTML = '<div class="card"><h2>✅ الصفحة التجريبية تعمل!</h2><p>التطبيق يعمل، المشكلة في صفحة dashboard.</p></div>';
        return;
      }

      const PAGE_MAP = {
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
        crates: './pages/cartes.js',
        reconciliation: './pages/reconciliation_page.js',
        audit: './pages/audit.js'
      };

      const modulePath = PAGE_MAP[route];
      if (!modulePath) { app.innerHTML = '<div class="card">صفحة غير معروفة</div>'; return; }

      try {
        const module = await import(modulePath);
        const func = Object.values(module).find(v => typeof v === 'function');
        if (!func) throw new Error('دالة التحميل مفقودة');
        await func(app);
      } catch (e) {
        app.innerHTML = `<div class="card" style="color:red">❌ خطأ: ${e.message}</div>`;
      }
    };

    // تجهيز أزرار القائمة
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.onclick = () => {
        navigate(btn.dataset.nav);
        document.getElementById('sidebar')?.classList.remove('open');
      };
    });

    // 🟢 نبدأ بصفحة الاختبار، وليس dashboard
    navigate('test');

  } catch (err) {
    document.body.innerHTML = '<h1 style="text-align:center;margin-top:50px;color:red;">خطأ: ' + err.message + '</h1>';
  }
})();
