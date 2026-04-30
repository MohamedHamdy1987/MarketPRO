// app.js - إصدار تشخيصي مع alert
(async function() {
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    const { supabase, ensureUser, getCurrentUser } = await import('./data.js');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    // تجربة تحميل أول صفحة
    const app = document.getElementById('app');
    if (!app) throw new Error('عنصر app غير موجود');

    // محاولة استيراد dashboard.js
    const dashboardModule = await import('./pages/dashboard.js');
    if (dashboardModule.renderDashboard) {
      await dashboardModule.renderDashboard(app);
      alert('✅ تم تحميل الصفحة الرئيسية بنجاح!');
    } else {
      throw new Error('dashboard.js لا يصدر renderDashboard');
    }

  } catch (error) {
    alert('❌ خطأ: ' + error.message + '\n\n' + (error.stack || ''));
  }
})();
