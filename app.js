// اختبار الاتصال: هل يعمل app.js من الأساس؟
alert('🚀 تم تشغيل app.js بنجاح');

import { ensureUser } from './data.js';
import { renderDashboard } from './pages/dashboard.js';

(async () => {
  try {
    const user = await ensureUser();
    if (!user) {
      document.body.innerHTML = '<h1 style="text-align:center;margin-top:50px;">❌ لم يتم تسجيل الدخول</h1>';
      return;
    }

    const appDiv = document.getElementById('app');
    if (!appDiv) {
      document.body.innerHTML = '<h1 style="text-align:center;margin-top:50px;">❌ عنصر app غير موجود في HTML</h1>';
      return;
    }

    // المحاولة النهائية
    document.body.innerHTML = '<h1 style="text-align:center;margin-top:50px;">⏳ جاري تحميل لوحة التحكم...</h1>';
    await renderDashboard(appDiv);
    
  } catch (error) {
    document.body.innerHTML = '<h1 style="color:red;text-align:center;margin-top:50px;">❌ فشل التحميل: ' + error.message + '</h1>';
  }
})();
