import { ensureUser } from './data.js';

(async () => {
  try {
    const user = await ensureUser();
    if (!user) { window.location.href = 'index.html'; return; }

    // نحاول تحميل dashboard
    const { renderDashboard } = await import('./pages/dashboard.js');
    const app = document.getElementById('app');
    await renderDashboard(app);
  } catch (err) {
    // عرض الخطأ على الشاشة
    document.body.innerHTML = `
      <div style="padding:20px;margin:20px;background:#fff;border:2px solid red;border-radius:12px;font-family:Cairo;direction:rtl;">
        <h2 style="color:red;">❌ خطأ: ${err.message}</h2>
        <pre style="background:#f5f5f5;padding:10px;overflow:auto;font-size:12px;">${err.stack}</pre>
      </div>`;
  }
})();
