/**
 * Market Pro – pages/reconciliation_page.js  v5.1 Supernova
 * 
 * UI for running reconciliation and viewing discrepancies.
 */

import { runFullReconciliation } from '../../reconciliation.js';
import { formatCurrency, formatDate } from '../../ui.js';

export async function renderReconciliationPage(app) {
    app.innerHTML = `
    <div class="page-header">
        <div class="page-header-left">
            <div class="page-title">⚖️ تسوية الحسابات</div>
            <div class="page-subtitle">كشف فروقات الخزينة والعملاء والمبيعات</div>
        </div>
        <div class="page-actions">
            <button class="btn" id="btn-run-reconciliation" onclick="window.runReconciliationCheck()">▶️ بدء التسوية الآن</button>
        </div>
    </div>
    <div id="reconciliation-output">
        <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-title">لم يتم تشغيل التسوية بعد</div>
            <div class="empty-sub">اضغط على الزر أعلاه لفحص سلامة البيانات المالية.</div>
        </div>
    </div>`;

    window.runReconciliationCheck = async function() {
        const output = document.getElementById('reconciliation-output');
        const btn = document.getElementById('btn-run-reconciliation');
        if (btn) btn.disabled = true;
        output.innerHTML = `<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>`;

        try {
            const result = await runFullReconciliation();
            
            if (result.status === 'CLEAN') {
                output.innerHTML = `
                <div class="card" style="text-align:center; padding: 2rem;">
                    <div style="font-size: 3rem;">✅</div>
                    <h3>جميع الحسابات متطابقة</h3>
                    <div style="color: var(--c-text-muted); margin-top: 0.5rem;">
                        وقت آخر فحص: ${formatDate(result.timestamp)}
                    </div>
                </div>`;
            } else if (result.status === 'ERROR') {
                output.innerHTML = `
                <div class="card" style="text-align:center; padding: 2rem; border-color: var(--c-danger);">
                    <div style="font-size: 3rem;">❌</div>
                    <h3>فشلت عملية التسوية</h3>
                    <div style="color: var(--c-danger); margin-top: 0.5rem;">${result.error}</div>
                </div>`;
            } else {
                let html = `<div class="card"><h3 style="color: var(--c-warning);">⚠️ تم العثور على ${result.discrepancies.length} فروقات</h3></div>`;
                result.discrepancies.forEach((d) => {
                    html += `
                    <div class="card" style="border-right: 4px solid ${d.severity === 'HIGH' ? 'var(--c-danger)' : 'var(--c-warning)'};">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                            <h4>${d.type.replace(/_/g, ' ')}</h4>
                            <span class="badge ${d.severity === 'HIGH' ? 'badge-red' : 'badge-yellow'}">${d.severity}</span>
                        </div>
                        <p style="color: var(--c-text-muted); font-size: 0.9rem;">${d.message}</p>
                        <pre style="margin-top: 0.8rem; background: var(--c-surface-3); padding: 0.5rem; border-radius: 8px; font-size: 0.8rem;">${JSON.stringify(d.details, null, 2)}</pre>
                    </div>`;
                });
                output.innerHTML = html;
            }
        } catch (e) {
            output.innerHTML = `<div class="card" style="color: var(--c-danger);">⚠️ خطأ غير متوقع: ${e.message}</div>`;
        } finally {
            if (btn) btn.disabled = false;
        }
    };
}