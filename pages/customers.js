/**
 * Market Pro – customers.js  v6.0 Production
 * ═══════════════════════════════════════════════════════════════
 * Team Lead: تبسيط صفحة العميل + إضافة المديونية في الكارت + رابط اليومية
 * Agent 1:   مراجعة توافق مع customer_ledger + customer_balances
 * Agent 2:   لا حذف للكود الأصلي – القطعية لا تدخل الخزنة
 * ═══════════════════════════════════════════════════════════════
 *
 * ✅ PRESERVED: كل منطق العملاء الأصلي (CRUD + ledger + crates)
 * ✅ NEW: إضافة المديونية (رصيد) في كارت قائمة العملاء
 * ✅ NEW: صفحة العميل مبسّطة: رصيد مبدئي | يومية | إجمالي | تحصيلات | قطعية | متبقي
 * ✅ NEW: "اليومية" = رابط يفتح صفحة الترحيلات لنفس اليوم
 * ✅ NEW: القطعية تظهر فقط إذا موجودة
 * ✅ PRESERVED: recordCollection | recordAllowance | deleteCollection | deleteAllowance
 * ✅ NEW: Deep Link للترحيلات من صفحة العميل
 * ✅ NEW: ربط التحصيل بالـ Ledger (قيد محاسبي مزدوج)
 * ✅ FIXED: atomicTransaction للتحصيل + حذف من الـ ledger + زر القطعية دائم الظهور
 * ✅ FIXED: استخدام transaction_id فريد لحذف القيد المحاسبي بدقة
 * ✅ FIXED: deleteCollection أصبح atomic (collections + treasury + ledger)
 */

import {
  supabase, dbInsert, dbUpdate, dbDelete,
  getCustomerLedger, getBulkCustomerCrates,
  addAuditLog, ensureUser
} from '../data.js';
import { toast, inputModal, confirmModal, closeModal, formatCurrency, formatDate, emptyState } from '../ui.js';
import { postCustomerCollection } from '../ledger.js';

/* ══════════════════════════════════════════════════════════════
   قائمة العملاء – مع المديونية في الكارت
   ══════════════════════════════════════════════════════════════ */
export async function renderCustomersPage(app) {
  const user = await ensureUser();
  const [{ data: customers }, { data: balances }] = await Promise.all([
    supabase.from('customers').select('*').eq('user_id', user.id).order('full_name'),
    supabase.from('customer_balances').select('customer_id,balance').eq('user_id', user.id)
  ]);

  const balMap = {};
  (balances || []).forEach(b => { balMap[b.customer_id] = Number(b.balance || 0); });

  const totalReceivables = Object.values(balMap).filter(v => v > 0).reduce((s, v) => s + v, 0);
  const totalCount = (customers || []).length;
  const debtorsCount = (customers || []).filter(c => (balMap[c.id] || 0) > 0).length;

  app.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">👥 العملاء</div>
      <div class="page-subtitle">
        ${totalCount} عميل
        · مديونين ${debtorsCount}
        · ذمم ${formatCurrency(totalReceivables)}
      </div>
    </div>
    <div class="page-actions">
      <button class="btn" onclick="openAddCustomer()" data-permission="create">➕ إضافة عميل</button>
    </div>
  </div>

  <div class="sort-bar">
    <input id="cust-search" type="search" placeholder="🔍 بحث بالاسم أو الهاتف..."
      oninput="filterCustomers(this.value)"
      style="flex:1;padding:8px 14px;border:1px solid var(--c-border);border-radius:10px;
        background:var(--c-surface);font-family:Cairo;font-size:13px;">
    <select onchange="sortCustomers(this.value)"
      style="padding:7px 28px 7px 10px;border:1px solid var(--c-border);border-radius:10px;
        font-family:Cairo;font-size:12px;background:var(--c-surface);">
      <option value="bal-desc">المديونية ↓</option>
      <option value="name-asc">الاسم أ–ي</option>
      <option value="name-desc">الاسم ي–أ</option>
      <option value="bal-asc">المديونية ↑</option>
    </select>
  </div>

  <div id="customers-list">
    ${renderCustomerCards((customers || []).sort((a, b) => (balMap[b.id] || 0) - (balMap[a.id] || 0)), balMap)}
  </div>`;

  window._allCustomers = customers || [];
  window._balMap = balMap;

  /* Bulk crate badges */
  const custIds = (customers || []).map(c => c.id);
  const crateMap = await getBulkCustomerCrates(custIds);
  loadCrateBadgesFromMap(crateMap);
}

/* ── كارت العميل (مع المديونية) ─────────────────────────── */
function renderCustomerCards(list, balMap) {
  if (!list.length) {
    return emptyState('👥', 'لا يوجد عملاء', 'أضف عميلاً للبدء',
      `<button class="btn" onclick="openAddCustomer()">➕ إضافة عميل</button>`);
  }

  return list.map(c => {
    const bal = balMap[c.id] || 0;
    /* ✅ لون ومسمى المديونية */
    const balColor = bal > 0 ? 'var(--c-danger)' : bal < 0 ? 'var(--c-primary)' : 'var(--c-text-muted)';
    const balLabel = bal > 0 ? 'مدين' : bal < 0 ? 'دائن' : 'مسوّى';
    const balBg    = bal > 0 ? 'var(--c-danger-bg)' : bal < 0 ? 'var(--c-success-bg)' : 'var(--c-surface-3)';

    return `
    <div class="card" style="cursor:pointer;"
      onclick="openCustomer('${c.id}','${(c.full_name || '').replace(/'/g, '&#39;')}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:15px;">${c.full_name}</div>
          ${c.phone ? `<div style="font-size:12px;color:var(--c-text-muted);margin-top:2px;">📞 ${c.phone}</div>` : ''}
          <div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <span id="crate-badge-${c.id}" class="crate-badge" style="display:none;"
              onclick="event.stopPropagation();navigate('crates')">🧺 ...</span>
          </div>
        </div>
        <!-- ✅ المديونية بارزة في الكارت -->
        <div style="text-align:center;background:${balBg};border-radius:10px;padding:8px 12px;min-width:80px;">
          <div style="font-size:16px;font-weight:800;color:${balColor};">${formatCurrency(Math.abs(bal))}</div>
          <div style="font-size:11px;color:${balColor};font-weight:700;">${balLabel}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;" onclick="event.stopPropagation();">
        <button class="btn btn-sm" onclick="openCustomer('${c.id}','${(c.full_name || '').replace(/'/g, '&#39;')}')">
          كشف الحساب ←
        </button>
        <button class="btn btn-sm btn-ghost" onclick="recordCollection('${c.id}','${(c.full_name || '').replace(/'/g, '&#39;')}')" data-permission="create">
          💵 تحصيل
        </button>
        <button class="btn btn-sm btn-ghost" onclick="editCustomer('${c.id}','${(c.full_name || '').replace(/'/g, '&#39;')}','${c.phone || ''}')" data-permission="edit">
          ✏️
        </button>
        <button class="btn btn-sm btn-icon" onclick="deleteCustomer('${c.id}','${(c.full_name || '').replace(/'/g, '&#39;')}')" data-permission="delete">
          🗑️
        </button>
      </div>
    </div>`;
  }).join('');
}

/* ── crate badges ────────────────────────────────────────── */
function loadCrateBadgesFromMap(crateMap) {
  for (const [custId, data] of Object.entries(crateMap)) {
    const el = document.getElementById(`crate-badge-${custId}`);
    if (!el) continue;
    if (data.adaya > 0 || data.barnika > 0) {
      el.style.display = 'inline-flex';
      el.textContent = `🧺 ${data.adaya} عداية | ${data.barnika} برنيكة`;
    }
  }
}

async function loadCrateBadgesFiltered(list) {
  const custIds = list.map(c => c.id);
  const crateMap = await getBulkCustomerCrates(custIds);
  for (const c of list) {
    const el = document.getElementById(`crate-badge-${c.id}`);
    if (!el) continue;
    const data = crateMap[c.id] || { adaya: 0, barnika: 0 };
    if (data.adaya > 0 || data.barnika > 0) {
      el.style.display = 'inline-flex';
      el.textContent = `🧺 ${data.adaya} عداية | ${data.barnika} برنيكة`;
    }
  }
}

/* ── فلترة وترتيب ────────────────────────────────────────── */
window.filterCustomers = function(q) {
  const list = window._allCustomers || [];
  q = (q || '').toLowerCase();
  const filtered = q
    ? list.filter(c => (c.full_name || '').toLowerCase().includes(q) || (c.phone || '').includes(q))
    : list;
  document.getElementById('customers-list').innerHTML =
    renderCustomerCards(filtered, window._balMap || {});
  loadCrateBadgesFiltered(filtered);
};

window.sortCustomers = function(by) {
  const list = [...(window._allCustomers || [])];
  const bm = window._balMap || {};
  if (by === 'name-asc')  list.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'ar'));
  if (by === 'name-desc') list.sort((a, b) => (b.full_name || '').localeCompare(a.full_name || '', 'ar'));
  if (by === 'bal-desc')  list.sort((a, b) => (bm[b.id] || 0) - (bm[a.id] || 0));
  if (by === 'bal-asc')   list.sort((a, b) => (bm[a.id] || 0) - (bm[b.id] || 0));
  document.getElementById('customers-list').innerHTML = renderCustomerCards(list, bm);
  loadCrateBadgesFiltered(list);
};

/* ══════════════════════════════════════════════════════════════
   صفحة العميل – مبسّطة
   ══════════════════════════════════════════════════════════════ */
window.openCustomer = async function(id, name) {
  const app = document.getElementById('app');
  const user = await ensureUser();

  const [
    { data: custData },
    ledger,
    { data: collections },
    { data: allowances },
    crateData
  ] = await Promise.all([
    supabase.from('customers').select('*').eq('id', id).single(),
    getCustomerLedger(id),
    supabase.from('collections').select('*')
      .eq('customer_id', id).eq('user_id', user.id)
      .order('date', { ascending: false }),
    supabase.from('customer_allowances').select('*')
      .eq('customer_id', id).eq('user_id', user.id)
      .order('date', { ascending: false }),
    (async () => {
      const { supabase: sb } = await import('../data.js');
      const { data: crates } = await sb.from('customer_crates')
        .select('crate_type,quantity,returned')
        .eq('customer_id', id).eq('user_id', user.id);
      let adaya = 0, barnika = 0;
      (crates || []).forEach(r => {
        const net = (r.quantity || 0) - (r.returned || 0);
        if (r.crate_type === 'عداية') adaya += net;
        if (r.crate_type === 'برنيكة') barnika += net;
      });
      return { adaya, barnika };
    })()
  ]);

  /* ── الحسابات ── */
  const openingBal      = Number(custData?.opening_balance || 0);
  const orderRows       = (ledger || []).filter(r => Number(r.debit || 0) > 0);
  const totalOrders     = orderRows.reduce((s, r) => s + Number(r.debit || 0), 0);
  const grandTotal      = openingBal + totalOrders;
  const totalCollections= (collections || []).reduce((s, c) => s + Number(c.amount || 0), 0);
  const totalAllowances = (allowances  || []).reduce((s, a) => s + Number(a.amount || 0), 0);
  const remaining       = grandTotal - totalCollections - totalAllowances;

  /* ── اليومية مجمّعة بالتاريخ ── */
  const dailyMap = {};
  orderRows.forEach(r => {
    const day = (r.trx_date || '').split('T')[0];
    if (!day) return;
    if (!dailyMap[day]) dailyMap[day] = { date: day, total: 0, count: 0 };
    dailyMap[day].total += Number(r.debit || 0);
    dailyMap[day].count++;
  });
  const dailyRows = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

  const crateLabel = (crateData.adaya > 0 || crateData.barnika > 0)
    ? ` 🧺 ${crateData.adaya} عداية | ${crateData.barnika} برنيكة` : '';

  app.innerHTML = `
  <button class="btn btn-ghost btn-sm" onclick="navigate('customers')">← رجوع</button>

  <div class="page-header" style="margin-top:12px;">
    <div class="page-header-left">
      <div class="page-title">👤 ${name}${crateLabel}</div>
      ${custData?.phone ? `<div class="page-subtitle">📞 ${custData.phone}</div>` : ''}
    </div>
    <div class="page-actions">
      <button class="btn btn-sm" onclick="recordCollection('${id}','${esc(name)}')">💵 تحصيل</button>
      <button class="btn btn-warning btn-sm" onclick="recordAllowance('${id}','${esc(name)}')">✂️ قطعية</button>
    </div>
  </div>

  <!-- ✅ ملخص الحساب المبسّط -->
  <div class="card" style="margin-bottom:16px;">
    <div class="card-header"><span class="card-title">📊 ملخص الحساب</span></div>
    <table style="width:100%;font-size:14px;border-collapse:collapse;">
      ${openingBal > 0 ? `
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:9px 4px;color:var(--c-text-muted);">رصيد مبدئي</td>
        <td style="padding:9px 4px;text-align:left;font-weight:700;">${formatCurrency(openingBal)}</td>
      </tr>` : ''}
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:9px 4px;color:var(--c-text-muted);">
          اليومية
          ${dailyRows.length ? `<span style="font-size:11px;">(${dailyRows.length} يوم)</span>` : ''}
        </td>
        <td style="padding:9px 4px;text-align:left;font-weight:700;">${formatCurrency(totalOrders)}</td>
      </tr>
      <tr style="border-bottom:2px solid var(--c-border-2);background:var(--c-surface-3);">
        <td style="padding:10px 4px;font-weight:800;">الإجمالي</td>
        <td style="padding:10px 4px;text-align:left;font-weight:800;font-size:16px;">${formatCurrency(grandTotal)}</td>
      </tr>
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:9px 4px;color:var(--c-text-muted);">تحصيلات</td>
        <td style="padding:9px 4px;text-align:left;font-weight:700;color:var(--c-primary);">
          (${formatCurrency(totalCollections)})
        </td>
      </tr>
      ${totalAllowances > 0 ? `
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:9px 4px;color:var(--c-text-muted);">قطعية</td>
        <td style="padding:9px 4px;text-align:left;font-weight:700;color:var(--c-warning);">
          (${formatCurrency(totalAllowances)})
        </td>
      </tr>` : ''}
      <tr style="background:${remaining > 0 ? 'var(--c-danger-bg)' : 'var(--c-success-bg)'};">
        <td style="padding:10px 4px;font-weight:800;font-size:15px;">المتبقي</td>
        <td style="padding:10px 4px;text-align:left;font-weight:800;font-size:18px;
          color:${remaining > 0 ? 'var(--c-danger)' : 'var(--c-primary)'};">
          ${formatCurrency(Math.abs(remaining))}
          ${remaining < 0 ? '<small style="font-size:11px;"> دائن</small>' : ''}
        </td>
      </tr>
    </table>
  </div>

  <!-- ✅ اليومية بالتاريخ مع روابط للترحيلات -->
  ${dailyRows.length ? `
  <div class="card" style="margin-bottom:16px;">
    <div class="card-header">
      <span class="card-title">📅 اليومية</span>
      <span class="badge">${dailyRows.length} يوم</span>
    </div>
    <div class="table-wrapper">
      <table class="table table-clickable">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>الطلبات</th>
            <th>الإجمالي</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${dailyRows.map(d => `
          <tr>
            <td style="color:var(--c-text-muted);font-size:12px;">
              <span 
                style="color:var(--c-primary);cursor:pointer;font-weight:700;"
                onclick="openCustomerTarhil('${id}','${d.date}')"
              >
                يومية ${formatDate(d.date)}
              </span>
            </td>
            <td>${d.count}</td>
            <td class="amount-positive">${formatCurrency(d.total)}</td>
            <td>
              <button class="btn btn-ghost btn-sm"
                onclick="event.stopPropagation();openCustomerTarhil('${id}','${d.date}')">
                الترحيلات →
              </button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>` : ''}

  <!-- التحصيلات -->
  ${(collections || []).length ? `
  <div class="card" style="margin-bottom:16px;">
    <div class="card-header">
      <span class="card-title">💵 التحصيلات</span>
      <span class="badge badge-green">${formatCurrency(totalCollections)}</span>
    </div>
    <div class="table-wrapper">
      <table class="table">
        <thead><tr><th>التاريخ</th><th>المبلغ</th><th></th></tr></thead>
        <tbody>
          ${(collections || []).map(c => `
          <tr>
            <td style="font-size:12px;color:var(--c-text-muted);">${formatDate(c.date)}</td>
            <td class="amount-positive">${formatCurrency(c.amount)}</td>
            <td>
              <button class="btn btn-icon btn-sm"
                onclick="deleteCollection('${c.id}','${id}','${esc(name)}')">🗑️</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>` : ''}

  <!-- القطعيات (تظهر فقط إذا موجودة) -->
  ${(allowances || []).length ? `
  <div class="card">
    <div class="card-header">
      <span class="card-title">✂️ القطعيات</span>
      <span class="badge badge-yellow">${formatCurrency(totalAllowances)}</span>
    </div>
    <div class="table-wrapper">
      <table class="table">
        <thead><tr><th>التاريخ</th><th>السبب</th><th>المبلغ</th><th></th></tr></thead>
        <tbody>
          ${(allowances || []).map(a => `
          <tr>
            <td style="font-size:12px;color:var(--c-text-muted);">${formatDate(a.date)}</td>
            <td>${a.reason || '–'}</td>
            <td class="amount-negative">${formatCurrency(a.amount)}</td>
            <td>
              <button class="btn btn-icon btn-sm"
                onclick="deleteAllowance('${a.id}','${id}','${esc(name)}')">🗑️</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>` : ''}
  `;
};

/* ── تفاصيل يوم العميل ──────────────────────────────────── */
window.openCustomerDailyDetail = async function(custId, custName, date) {
  const user = await ensureUser();
  const { data: rows } = await supabase
    .from('customer_ledger')
    .select('*')
    .eq('user_id', user.id)
    .eq('customer_id', custId)
    .gte('trx_date', date + 'T00:00:00')
    .lte('trx_date', date + 'T23:59:59')
    .order('trx_date');

  const total = (rows || []).reduce((s, r) => s + Number(r.debit || 0), 0);

  modal(`
    <h3>📅 ${custName} – ${formatDate(date)}</h3>
    <div style="overflow-x:auto;margin:12px 0;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--c-surface-3);">
            <th style="padding:8px;text-align:right;border-bottom:1px solid var(--c-border);">الصنف</th>
            <th style="padding:8px;text-align:right;border-bottom:1px solid var(--c-border);">عدد</th>
            <th style="padding:8px;text-align:right;border-bottom:1px solid var(--c-border);">وزن</th>
            <th style="padding:8px;text-align:right;border-bottom:1px solid var(--c-border);">سعر</th>
            <th style="padding:8px;text-align:right;border-bottom:1px solid var(--c-border);">مبلغ</th>
          </tr>
        </thead>
        <tbody>
          ${(rows || []).map(r => `
          <tr style="border-bottom:1px solid var(--c-border);">
            <td style="padding:8px;">${r.description || '–'}</td>
            <td style="padding:8px;">${r.qty || '–'}</td>
            <td style="padding:8px;">${r.weight ? r.weight + ' ك' : '–'}</td>
            <td style="padding:8px;">${r.price ? formatCurrency(r.price) : '–'}</td>
            <td style="padding:8px;font-weight:700;color:var(--c-primary);">${formatCurrency(r.debit || 0)}</td>
          </tr>`).join('') || '<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--c-text-muted);">لا توجد تفاصيل</td></tr>'}
          ${rows?.length ? `
          <tr style="background:var(--c-surface-3);font-weight:800;">
            <td colspan="4" style="padding:8px;">الإجمالي</td>
            <td style="padding:8px;color:var(--c-primary);">${formatCurrency(total)}</td>
          </tr>` : ''}
        </tbody>
      </table>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-ghost btn-sm" style="flex:1;"
        onclick="closeModal();openCustomerTarhil('${custId}','${date}')">
        📋 صفحة الترحيلات
      </button>
      <button class="btn btn-ghost" style="flex:1;" onclick="closeModal()">إغلاق</button>
    </div>
  `);
};

/* ✅ فتح الترحيلات لعميل وتاريخ محدد (Deep Link) */
window.openCustomerTarhil = function(customerId, date){
  window._tarhilCustomer = customerId;
  window._tarhilDate = date;
  navigate('tarhil');
};

/* ══════════════════════════════════════════════════════════════
   CRUD العملاء (محفوظ من الأصل)
   ══════════════════════════════════════════════════════════════ */
window.openAddCustomer = async function() {
  inputModal({
    title: '➕ إضافة عميل جديد',
    fields: [
      { id: 'full_name', label: 'الاسم الكامل', required: true },
      { id: 'phone', label: 'رقم الهاتف', type: 'tel' },
      { id: 'opening_balance', label: 'رصيد مبدئي', type: 'number', value: 0 }
    ],
    submitLabel: 'إضافة',
    onSubmit: async (vals) => {
      const inserted = await dbInsert('customers', {
        full_name: vals.full_name,
        phone: vals.phone || null,
        opening_balance: vals.opening_balance || 0
      });
      if (!inserted) throw new Error('فشل إضافة العميل');
      closeModal();
      toast('تمت الإضافة ✅', 'success');
      navigate('customers');
    }
  });
};

window.editCustomer = async function(id, name, phone) {
  inputModal({
    title: '✏️ تعديل بيانات العميل',
    fields: [
      { id: 'full_name', label: 'الاسم', required: true, value: name },
      { id: 'phone', label: 'هاتف', value: phone }
    ],
    submitLabel: 'حفظ التعديل',
    onSubmit: async (vals) => {
      const ok = await dbUpdate('customers', id, {
        full_name: vals.full_name,
        phone: vals.phone || null
      });
      if (!ok) throw new Error('فشل التعديل');
      closeModal();
      toast('تم التعديل ✅', 'success');
      navigate('customers');
    }
  });
};

window.deleteCustomer = function(id, name) {
  confirmModal(
    `هل تريد حذف العميل "${name}"؟ سيتم حذف جميع بياناته.`,
    async () => {
      const ok = await dbDelete('customers', id);
      if (!ok) { toast('فشل الحذف', 'error'); return; }
      toast('تم الحذف ✅', 'success');
      navigate('customers');
    }
  );
};

/* ══════════════════════════════════════════════════════════════
   تحصيل + قطعية (محفوظ من الأصل)
   ══════════════════════════════════════════════════════════════ */
window.recordCollection = async function(customerId, customerName) {
  inputModal({
    title: '💵 تسجيل تحصيل',
    fields: [
      { id: 'amount', label: 'مبلغ التحصيل', type: 'number', required: true, min: '0' }
    ],
    submitLabel: 'تأكيد التحصيل',
    onSubmit: async (vals) => {
      const amount = Number(vals.amount || 0);
      if (amount <= 0) throw new Error('مبلغ غير صحيح');

      // ✅ توليد transaction_id فريد لربط كل العمليات معاً
      const transactionId = crypto.randomUUID();

      // ✅ استخدام atomicTransaction لتسجيل التحصيل + إدخال الخزنة في عملية واحدة
      const { atomicTransaction } = await import('../data.js');

      const ok = await atomicTransaction([
        {
          type: 'insert',
          table: 'collections',
          data: {
            id: transactionId, // 🔥 ربط العملية
            customer_id: customerId,
            amount,
            payment_method: 'cash',
            date: new Date().toISOString()
          }
        },
        {
          type: 'insert',
          table: 'treasury',
          data: {
            amount: amount,
            type: 'customer_collection',
            reference_id: customerId,
            note: `تحصيل من العميل ${customerName}`,
            transaction_id: transactionId, // نفس المعرف للربط
            date: new Date().toISOString()
          }
        }
      ]);

      if (!ok) throw new Error('فشل تسجيل العملية');
      
      await addAuditLog('collection', { customerId, amount });
      
      // ✅ قيد محاسبي مزدوج - تسجيل التحصيل في دفتر الأستاذ مع نفس transaction_id
      try {
        await postCustomerCollection(amount, customerName, transactionId);
      } catch (e) {
        console.error('Ledger failed', e);
      }
      
      closeModal();
      toast('تم التحصيل ✅', 'success');
      openCustomer(customerId, customerName);
    }
  });
};

window.recordAllowance = async function(customerId, customerName) {
  /* ✅ القطعية تخصم من العميل ولا تدخل الخزنة */
  inputModal({
    title: '✂️ تسجيل قطعية',
    fields: [
      { id: 'amount', label: 'المبلغ', type: 'number', required: true, min: '0' },
      { id: 'reason', label: 'السبب', placeholder: 'اختياري' }
    ],
    submitLabel: 'حفظ القطعية',
    onSubmit: async (vals) => {
      await dbInsert('customer_allowances', {
        customer_id: customerId,
        amount: vals.amount,
        reason: vals.reason || 'تسوية',
        date: new Date().toISOString()
      });
      await addAuditLog('customer_allowance', { customerId, amount: vals.amount });
      closeModal();
      toast('تم تسجيل القطعية ✅', 'success');
      openCustomer(customerId, customerName);
    }
  });
};

window.deleteCollection = function(id, custId, custName) {
  confirmModal('حذف هذا التحصيل؟', async () => {
    // ✅ جلب بيانات التحصيل لاستخراج transaction_id
    const { data: collection } = await supabase
      .from('collections')
      .select('id')
      .eq('id', id)
      .single();

    if (!collection) {
      toast('لم يتم العثور على العملية', 'error');
      return;
    }

    // ✅ حذف atomic: collections + treasury + ledger معاً
    const { atomicTransaction } = await import('../data.js');

    const ok = await atomicTransaction([
      {
        type: 'delete',
        table: 'collections',
        match: { id }
      },
      {
        type: 'delete',
        table: 'treasury',
        match: {
          transaction_id: collection.id, // نفس المعرف الفريد
          type: 'customer_collection'
        }
      },
      {
        type: 'delete',
        table: 'ledger_entries',
        match: {
          transaction_id: collection.id
        }
      }
    ]);

    if (!ok) {
      toast('فشل حذف العملية', 'error');
      return;
    }

    toast('تم الحذف', 'success');
    openCustomer(custId, custName);
  });
};

window.deleteAllowance = function(id, custId, custName) {
  confirmModal('حذف هذه القطعية؟', async () => {
    await dbDelete('customer_allowances', id);
    toast('تم الحذف', 'success');
    openCustomer(custId, custName);
  });
};

/* ── aging report (محفوظ من الأصل) ──────────────────────── */
window.showAgingReport = async function() {
  const user = await ensureUser();
  const { data: balances } = await supabase
    .from('customer_balances')
    .select(`customer_id,balance,customers(full_name)`)
    .eq('user_id', user.id)
    .gt('balance', 0);
  console.log('[Aging]', balances);
};

/* helper */
function esc(v = '') { return String(v).replace(/'/g, "&#39;"); }