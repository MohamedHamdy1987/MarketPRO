alert('✅ تم تحميل app.js بنجاح');

// محاولة يدوية لتحميل الصفحات
import { ensureUser } from './data.js';
import { renderDashboard } from './pages/dashboard.js';

(async () => {
  try {
    document.body.innerHTML = '<h1 style="text-align:center;margin-top:40px;">جاري التحميل...</h1>';
    const user = await ensureUser();
    if (!user) { window.location.href = 'index.html'; return; }

    const app = document.getElementById('app');
    if (!app) {
      document.body.innerHTML += '<p>العنصر app غير موجود</p>';
      return;
    }
    renderDashboard(app);
  } catch (e) {
    document.body.innerHTML = '<h1 style="color:red;text-align:center;margin-top:40px;">خطأ: ' + e.message + '</h1>';
  }
})();
