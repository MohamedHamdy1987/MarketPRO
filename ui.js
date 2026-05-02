/* ============================================================
   Market Pro – ui.js  FINAL v6.0 Production
   UI utilities: toast, modal, confirm, inputModal, formatters + PIN system
   ✅ FIXED: Import path corrected to './data.js'
   ============================================================ */
import { verifyPIN } from './data.js';  // ✅ corrected path

/* ── Toast ───────────────────────────────────────────────── */
export function toast(msg, type = 'success', duration = 3000) {
  const container = document.getElementById('toast');
  if (!container) return;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || '📢'}</span><span>${msg}</span>`;
  container.appendChild(el);
  const timer = setTimeout(remove, duration);
  function remove() {
    el.style.opacity = '0';
    setTimeout(() => { if (el.parentNode) el.remove(); }, 300);
  }
  el.onclick = () => { clearTimeout(timer); remove(); };
}

/* ── Modal ───────────────────────────────────────────────── */
export function modal(content, options = {}) {
  const m = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  if (!m || !body) return;
  body.innerHTML = content;
  m.classList.remove('hidden');
  m.onclick = (e) => { if (e.target === m && !options.preventClose) closeModal(); };
}

export function closeModal() {
  const m = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  if (!m) return;
  m.style.opacity = '0';
  setTimeout(() => {
    m.classList.add('hidden');
    m.style.opacity = '';
    if (body) body.innerHTML = '';
  }, 200);
}
window.closeModal = closeModal;

/* ── Confirm Modal ───────────────────────────────────────── */
export function confirmModal(msg, onConfirm) {
  modal(`
    <h3 style="margin-bottom:12px;">تأكيد العملية</h3>
    <p style="color:var(--c-text-muted);margin-bottom:20px;">${msg}</p>
    <div style="display:flex;gap:8px;flex-direction:row-reverse;">
      <button id='confirm-yes' class='btn btn-danger' style="flex:1;">تأكيد</button>
      <button onclick='closeModal()' class='btn btn-ghost' style="flex:1;">إلغاء</button>
    </div>`);
  document.getElementById('confirm-yes').onclick = async () => {
    closeModal();
    try { if (onConfirm) await onConfirm(); } catch (e) { toast(e?.message || 'خطأ', 'error'); }
  };
}

/* ── Input Modal ─────────────────────────────────────────── */
export function inputModal(config) {
  const safeId = v => String(v).replace(/[^a-z0-9_-]/gi, '');
  const fieldsHtml = config.fields.map(f => {
    const fid = safeId(f.id);
    if (f.type === 'select') {
      return `<div><label>${f.label}</label>
        <select id='ifield-${fid}'>
          <option value=''>-- اختر --</option>
          ${(f.options || []).map(o => `<option value='${o.value}'${f.value === o.value ? " selected" : ''}>${o.label}</option>`).join('')}
        </select></div>`;
    }
    return `<div><label>${f.label}</label>
      <input id='ifield-${fid}' type='${f.type || 'text'}' ${f.value !== undefined ? `value='${f.value}'` : ''} ${f.min !== undefined ? `min='${f.min}'` : ''} placeholder='${f.placeholder || ''}'></div>`;
  }).join('');

  modal(`<h3>${config.title}</h3>${fieldsHtml}<div id='input-error'></div>
    <div style='display:flex;gap:8px;flex-direction:row-reverse;margin-top:8px;'>
      <button id='input-submit' class='btn' style='flex:1;'>${config.submitLabel || 'حفظ'}</button>
      <button onclick='closeModal()' class='btn btn-ghost' style='flex:1;'>إلغاء</button>
    </div>`, { preventClose: true });

  const submitBtn = document.getElementById('input-submit');
  const errorDiv = document.getElementById('input-error');
  submitBtn.onclick = async () => {
    if (window._modalBusy) return;
    window._modalBusy = true;
    const values = {}; let valid = true; errorDiv.style.display = 'none';
    for (const f of config.fields) {
      const el = document.getElementById(`ifield-${safeId(f.id)}`);
      if (!el) continue;
      const raw = el.value.trim();
      if (f.required && !raw) { showError(`${f.label} مطلوب`); valid = false; break; }
      if (f.type === 'number' && raw) { const num = parseFloat(raw); if (isNaN(num)) { showError('رقم غير صحيح'); valid = false; break; } values[f.id] = num; }
      else values[f.id] = raw;
    }
    if (!valid) { window._modalBusy = false; return; }
    submitBtn.disabled = true;
    try { await config.onSubmit(values); } catch (err) { showError(err?.message || 'خطأ'); submitBtn.disabled = false; }
    finally { window._modalBusy = false; }
  };
  function showError(msg) { errorDiv.style.display = 'block'; errorDiv.textContent = msg; }
}

/* ── Formatters ───────────────────────────────────────── */
export function formatCurrency(num) { return (Number(num || 0)).toLocaleString('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ج'; }
export function formatDate(dateStr) { if (!dateStr) return '–'; try { return new Date(dateStr).toLocaleDateString('ar-EG'); } catch { return dateStr; } }
export function emptyState(icon, title, sub, actionHtml = '') {
  return `<div class='empty-state'><div class='empty-icon'>${icon}</div><div class='empty-title'>${title}</div><div class='empty-sub'>${sub}</div>${actionHtml}</div>`;
}
