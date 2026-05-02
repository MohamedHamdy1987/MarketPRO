// تحميل الأدوات الأساسية أولاً
let ensureUser, supabase;
try {
  const dataModule = await import('./data.js');
  ensureUser = dataModule.ensureUser;
  supabase = dataModule.supabase;
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

    // تجهيز أزرار القائمة الجانبية
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.onclick = () => {
        const route = btn.dataset.nav;
        navigate(route);
        document.getElementById('sidebar')?.classList.remove('open');
      };
    });

    // الذهاب للرئيسية
    navigate('dashboard');

    // تحديث حالة الاتصال
    function updateNetStatus() {
      const el = document.getElementById('net-status');
      if (el) el.textContent = navigator.onLine ? '🟢' : '🔴';
    }
    window.addEventListener('online', updateNetStatus);
    window.addEventListener('offline', updateNetStatus);
    updateNetStatus();

  } catch (err) {
    document.body.innerHTML = '<h1 style="text-align:center;margin-top:50px;color:red;">خطأ: ' + err.message + '</h1>';
  }
})();

// قائمة الصفحات ومساراتها
const PAGE_MAP = {
  dashboard:   './pages/dashboard.js',
  invoices:    './pages/invoices.js',
  sales:       './pages/sales.js',
  tarhil:      './pages/tarhil.js',
  customers:   './pages/customers.js',
  suppliers:   './pages/suppliers.js',
  market_shops:'./pages/market_shops.js',
  khazna:      './pages/khazna.js',
  financial:   './pages/financial.js',
  partners:    './pages/partners.js',
  employees:   './pages/employees.js',
  crates:      './pages/cartes.js',  // اسم ملفك الفعلي
  reconciliation: './pages/reconciliation_page.js',
  audit:       './pages/audit.js'
};

const PAGE_TITLES = {
  dashboard: 'الرئيسية', invoices: 'الفواتير', sales: 'المبيعات',
  tarhil: 'الترحيلات', customers: 'العملاء', suppliers: 'الموردين',
  market_shops: 'محلات السوق', khazna: 'الخزنة',
  financial: 'المركز المالي', partners: 'الشركاء',
  employees: 'الموظفين', crates: 'العدايات والبرانيك',
  reconciliation: 'تسوية الحسابات', audit: 'سجل العمليات'
};

// دالة الانتقال بين الصفحات (آمنة تماماً)
window.navigate = async function(route) {
  const app = document.getElementById('app');
  const title = document.getElementById('page-title');
  if (!app) return;

  // تحديث العنوان
  if (title) title.textContent = PAGE_TITLES[route] || route;

  // عرض هيكل تحميل مؤقت
  app.innerHTML = '<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>';

  // محاولة تحميل الصفحة المطلوبة
  const modulePath = PAGE_MAP[route];
  if (!modulePath) {
    app.innerHTML = '<div class="card">الصفحة غير موجودة</div>';
    return;
  }

  try {
    const module = await import(modulePath);
    // كل صفحة تصدّر دالة باسم معين، نبحث عن أول دالة
    const renderFunc = Object.values(module).find(v => typeof v === 'function');
    if (!renderFunc) throw new Error('لم يتم العثور على دالة التصيير');
    
    // استدعاء الدالة وتمرير عنصر app
    await renderFunc(app);
  } catch (error) {
    console.error('فشل تحميل الصفحة:', route, error);
    app.innerHTML = `<div class="card" style="color:var(--c-danger)">
      ⚠️ خطأ في تحميل الصفحة (${route})<br>
      <small>${error.message}</small>
    </div>`;
  }
};
