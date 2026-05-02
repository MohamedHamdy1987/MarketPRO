import { supabase, ensureUser } from '../data.js';

export async function renderDashboard(app) {
  try {
    const user = await ensureUser();
    
    // اختبار بسيط فقط
    app.innerHTML = `
      <div class="card" style="text-align:center;padding:40px;">
        <h2>✅ Dashboard يعمل!</h2>
        <p>تم تسجيل الدخول بنجاح: ${user.email}</p>
        <p>كل شيء سليم. المشكلة كانت في ui.js.</p>
      </div>`;
      
  } catch (e) {
    app.innerHTML = `<div class="card" style="color:red;">❌ فشل dashboard: ${e.message}</div>`;
  }
}
