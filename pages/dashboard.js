import { supabase, ensureUser } from '../data.js';
import { formatCurrency, formatDate } from '../ui.js';

export async function renderDashboard(app) {
  try {
    const user = await ensureUser();
    
    const { data: invoices } = await supabase
      .from('invoices')
      .select('commission')
      .eq('user_id', user.id)
      .eq('status', 'closed');
    
    const totalCommission = (invoices || []).reduce((s, i) => s + Number(i.commission || 0), 0);

    app.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <div class="page-title">📊 لوحة التحكم</div>
          <div class="page-subtitle">نظرة شاملة على أداء السوق</div>
        </div>
      </div>
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-icon">💰</span>
          <div class="kpi-value" style="color:var(--c-primary);">${formatCurrency(totalCommission)}</div>
          <div class="kpi-label">إجمالي العمولات</div>
        </div>
        <div class="kpi-card">
          <span class="kpi-icon">✅</span>
          <div class="kpi-value" style="color:var(--c-success);">يعمل</div>
          <div class="kpi-label">حالة النظام</div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">🎉 تم تحميل لوحة التحكم بنجاح</span>
        </div>
        <p style="text-align:center;padding:20px;color:var(--c-text-muted);">
          كل شيء يعمل بشكل صحيح. يمكنك الآن استخدام القائمة الجانبية للتنقل.
        </p>
      </div>`;
  } catch (e) {
    app.innerHTML = `<div class="card" style="color:var(--c-danger);">❌ خطأ: ${e.message}</div>`;
  }
}
