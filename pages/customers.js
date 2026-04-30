import {
  supabase, dbInsert, dbUpdate, dbDelete,
  getCustomerLedger, getBulkCustomerCrates,
  addAuditLog, ensureUser
} from '../data.js';
import { toast, inputModal, confirmModal, formatCurrency, formatDate, emptyState } from '../ui.js';

/**
 * Market Pro – customers.js  v5.1 Supernova
 * ✅ FIXED: N+1 Query for crate badges replaced with bulk fetch
 * ✅ PRESERVED: All original customer management & ledger display logic
 */

export async function renderCustomersPage(app) {
  const user = await ensureUser();
  const [{ data: customers }, { data: balances }] = await Promise.all([
    supabase.from('customers').select('*').eq('user_id', user.id).order('full_name'),
    supabase.from('customer_balances').select('customer_id,balance').eq('user_id', user.id)
  ]);

  const balMap = {};
  (balances || []).forEach(b => { balMap[b.customer_id] = Number(b.balance || 0); });
  const totalReceivables = Object.values(balMap).filter(v => v > 0).reduce((s, v) => s + v, 0);

  app.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">👥 العملاء</div>
      <div class="page-subtitle">${(customers||[]).length} عميل • ذمم ${formatCurrency(totalReceivables)}</div>
    </div>
    <div class="page-actions">
      <button class="btn" onclick="openAddCustomer()" data-permission="create">+ إضافة عميل</button>
    </div>
  </div>

  <div class="sort-bar">
    <input id="cust-search" type="search" placeholder="🔍 بحث بالاسم أو الهاتف..."
      oninput="filterCustomers(this.value)"
      style="flex:1;padding:8px 14px;border:1px solid var(--c-border);border-radius:10px;background:var(--c-surface);font-family:Cairo;font-size:13px;">
    <select onchange="sortCustomers(this.value)"
      style="padding:7px 28px 7px 10px;border:1px solid var(--c-border);border-radius:10px;font-family:Cairo;font-size:12px;background:var(--c-surface);">
      <option value="name-asc">الاسم أ–ي</option>
      <option value="name-desc">الاسم ي–أ</option>
      <option value="bal-desc">الرصيد ↓</option>
      <option value="bal-asc">الرصيد ↑</option>
    </select>
  </div>

  <div id="customers-list">
    ${renderCustomerCards(customers||[], balMap)}
  </div>`;

  window._allCustomers = customers || [];
  window._balMap = balMap;

  // ✅ Bulk fetch crate badges (no N+1)
  const custIds = (customers || []).map(c => c.id);
  const crateMap = await getBulkCustomerCrates(custIds);
  loadCrateBadgesFromMap(crateMap);
}

function renderCustomerCards(list, balMap) {
  if (!list.length) {
    return emptyState('👥', 'لا يوجد عملاء', 'أضف عميلاً للبدء',
      `<button class="btn" onclick="openAddCustomer()">+ إضافة عميل</button>`);
  }

  return list.map(c => {
    const bal = balMap[c.id] || 0;
    const balColor = bal > 0 ? 'var(--c-negative)' : bal < 0 ? 'var(--c-positive)' : 'var(--c-text-muted)';
    const balLabel = bal > 0 ? 'مدين' : bal < 0 ? 'دائن' : 'مسوّى';

    return `
    <div class="card" style="cursor:pointer;"
      onclick="openCustomer('${c.id}','${(c.full_name||'').replace(/'/g,"&#39;")}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:15px;">${c.full_name}</div>
          ${c.phone?`<div style="font-size:12px;color:var(--c-text-muted);">📞 ${c.phone}</div>`:''}
          <div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <span id="crate-badge-${c.id}" class="crate-badge" style="display:none;"
              onclick="event.stopPropagation();navigate('crates')">🧺 ...</span>
          </div>
        </div>
        <div style="text-align:left;flex-shrink:0;">
          <div style="font-size:18px;font-weight:800;color:${balColor};">${formatCurrency(Math.abs(bal))}</div>
          <div style="font-size:11px;color:${balColor};">${balLabel}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;" onclick="event.stopPropagation();">
        <button class="btn btn-sm btn-ghost edit" onclick="editCustomer('${c.id}','${(c.full_name||'').replace(/'/g,"&#39;")}','${c.phone||''}')" data-permission="edit">✏️</button>
        <button class="btn btn-sm btn-icon" onclick="deleteCustomer('${c.id}','${(c.full_name||'').replace(/'/g,"&#39;")}')" data-permission="delete">🗑️</button>
        <button class="btn btn-sm" onclick="openCustomer('${c.id}','${(c.full_name||'').replace(/'/g,"&#39;")}')">كشف الحساب ←</button>
      </div>
    </div>`;
  }).join('');
}

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

window.filterCustomers = function(q) {
  const list = window._allCustomers || [];
  q = (q || '').toLowerCase();
  const filtered = q ? list.filter(c =>
    (c.full_name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
  ) : list;
  document.getElementById('customers-list').innerHTML = renderCustomerCards(filtered, window._balMap || {});
  loadCrateBadgesFiltered(filtered);
};

window.sortCustomers = function(by) {
  const list = [...(window._allCustomers || [])];
  const bm = window._balMap || {};
  if (by === 'name-asc') list.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'ar'));
  if (by === 'name-desc') list.sort((a, b) => (b.full_name || '').localeCompare(a.full_name || '', 'ar'));
  if (by === 'bal-desc') list.sort((a, b) => (bm[b.id] || 0) - (bm[a.id] || 0));
  if (by === 'bal-asc') list.sort((a, b) => (bm[a.id] || 0) - (bm[b.id] || 0));
  document.getElementById('customers-list').innerHTML = renderCustomerCards(list, bm);
  loadCrateBadgesFiltered(list);
};

window.openAddCustomer = async function() {
  inputModal({
    title: 'إضافة عميل جديد',
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
    title: 'تعديل بيانات العميل',
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
      toast('تم الحذف', 'success');
      navigate('customers');
    }
  );
};

window.openCustomer = async function(id, name) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>`;

  const [
    { data: custData },
    ledger,
    { data: collections },
    { data: allowances },
    crateData
  ] = await Promise.all([
    supabase.from('customers').select('*').eq('id', id).single(),
    getCustomerLedger(id),
    supabase.from('collections').select('*').eq('customer_id', id).order('date', { ascending: false }),
    supabase.from('customer_allowances').select('*').eq('customer_id', id).order('date', { ascending: false }),
    (async () => {
      const { adaya, barnika } = await getBulkCustomerCrates([id]);
      return { adaya: (adaya?.[id]?.adaya)||0, barnika: (adaya?.[id]?.barnika)||0 };
    })()
  ]);

  const openingBal = Number(custData?.opening_balance || 0);
  const orderRows = (ledger || []).filter(r => Number(r.debit || 0) > 0);
  const totalOrders = orderRows.reduce((s, r) => s + Number(r.debit || 0), 0);
  const grandTotal = openingBal + totalOrders;
  const totalCollections = (collections || []).reduce((s, c) => s + Number(c.amount || 0), 0);
  const totalAllowances = (allowances || []).reduce((s, a) => s + Number(a.amount || 0), 0);
  const remaining = grandTotal - totalCollections - totalAllowances;

  const crateLabel = (crateData.adaya > 0 || crateData.barnika > 0)
    ? `<button class="crate-badge" onclick="navigate('crates')" style="margin-right:8px;">🧺 ${crateData.adaya} عداية | ${crateData.barnika} برنيكة</button>`
    : '';

  app.innerHTML = `
  <button class="btn btn-ghost btn-sm" onclick="navigate('customers')">← رجوع</button>

  <div class="page-header" style="margin-top:12px;">
    <div class="page-header-left">
      <div class="page-title">👤 ${name} ${crateLabel}</div>
      ${custData?.phone ? `<div class="page-subtitle">📞 ${custData.phone}</div>` : ''}
    </div>
    <div class="page-actions">
      <button class="btn btn-sm" onclick="recordCollection('${id}','${name}')">💵 تحصيل</button>
      <button class="btn btn-warning btn-sm" onclick="recordAllowance('${id}','${name}')">✂️ قطعية</button>
    </div>
  </div>

  <div class="card" style="margin-bottom:16px;">
    <div class="card-header"><span class="card-title">📊 ملخص الحساب</span></div>
    <table style="width:100%;font-size:14px;border-collapse:collapse;">
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:8px 4px;color:var(--c-text-muted);">رصيد مبدئي</td>
        <td style="padding:8px 4px;text-align:left;font-weight:700;color:var(--c-positive);">${formatCurrency(openingBal)}</td>
      </tr>
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:8px 4px;color:var(--c-text-muted);">طلبات / مبيعات</td>
        <td style="padding:8px 4px;text-align:left;font-weight:700;color:var(--c-positive);">${formatCurrency(totalOrders)}</td>
      </tr>
      <tr style="border-bottom:2px solid var(--c-border-2);background:var(--c-surface-3);">
        <td style="padding:10px 4px;font-weight:800;">الإجمالي</td>
        <td style="padding:10px 4px;text-align:left;font-weight:800;font-size:16px;">${formatCurrency(grandTotal)}</td>
      </tr>
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:8px 4px;color:var(--c-text-muted);">تحصيلات</td>
        <td style="padding:8px 4px;text-align:left;font-weight:700;color:var(--c-negative);">(${formatCurrency(totalCollections)})</td>
      </tr>
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:8px 4px;color:var(--c-text-muted);">قطعيات</td>
        <td style="padding:8px 4px;text-align:left;font-weight:700;color:var(--c-negative);">(${formatCurrency(totalAllowances)})</td>
      </tr>
      <tr style="background:${remaining>0?'var(--c-danger-bg)':'var(--c-success-bg)'};">
        <td style="padding:10px 4px;font-weight:800;font-size:15px;">المتبقي</td>
        <td style="padding:10px 4px;text-align:left;font-weight:800;font-size:18px;color:${remaining>0?'var(--c-negative)':'var(--c-positive)'};">${formatCurrency(Math.abs(remaining))}</td>
      </tr>
    </table>
  </div>

  <!-- Orders detail -->
  <div class="card" style="margin-bottom:16px;">
    <div class="card-header">
      <span class="card-title">📦 تفاصيل الطلبات</span>
      <span class="badge">${orderRows.length} عملية</span>
    </div>
    ${orderRows.length
      ? `<div class="table-wrapper">
          <table class="table">
            <thead><tr><th>التاريخ</th><th>البيان</th><th>المبلغ</th></tr></thead>
            <tbody>
            ${orderRows.map(r=>`
            <tr>
              <td style="color:var(--c-text-muted);font-size:12px;">${formatDate(r.trx_date)}</td>
              <td>${r.description||'–'}</td>
              <td class="amount-positive">${formatCurrency(r.debit)}</td>
            </tr>`).join('')}
            </tbody>
          </table>
         </div>`
      : `<div style="text-align:center;color:var(--c-text-muted);padding:16px;">لا توجد طلبات</div>`}
  </div>

  <!-- Collections -->
  <div class="card" style="margin-bottom:16px;">
    <div class="card-header">
      <span class="card-title">💵 التحصيلات</span>
      <span class="badge badge-green">${formatCurrency(totalCollections)}</span>
    </div>
    ${(collections||[]).length
      ? `<div class="table-wrapper">
          <table class="table">
            <thead><tr><th>التاريخ</th><th>المبلغ</th><th></th></tr></thead>
            <tbody>
            ${(collections||[]).map(c=>`
            <tr>
              <td style="font-size:12px;color:var(--c-text-muted);">${formatDate(c.date)}</td>
              <td class="amount-negative">${formatCurrency(c.amount)}</td>
              <td><button class="btn btn-icon btn-sm" onclick="deleteCollection('${c.id}','${id}','${name}')">🗑️</button></td>
            </tr>`).join('')}
            </tbody>
          </table>
         </div>`
      : `<div style="text-align:center;color:var(--c-text-muted);padding:12px;">لا توجد تحصيلات</div>`}
  </div>

  <!-- Allowances -->
  <div class="card">
    <div class="card-header">
      <span class="card-title">✂️ القطعيات</span>
      <span class="badge badge-yellow">${formatCurrency(totalAllowances)}</span>
    </div>
    ${(allowances||[]).length
      ? `<div class="table-wrapper">
          <table class="table">
            <thead><tr><th>التاريخ</th><th>السبب</th><th>المبلغ</th><th></th></tr></thead>
            <tbody>
            ${(allowances||[]).map(a=>`
            <tr>
              <td style="font-size:12px;color:var(--c-text-muted);">${formatDate(a.date)}</td>
              <td>${a.reason||'–'}</td>
              <td class="amount-negative">${formatCurrency(a.amount)}</td>
              <td><button class="btn btn-icon btn-sm" onclick="deleteAllowance('${a.id}','${id}','${name}')">🗑️</button></td>
            </tr>`).join('')}
            </tbody>
          </table>
         </div>`
      : `<div style="text-align:center;color:var(--c-text-muted);padding:12px;">لا توجد قطعيات</div>`}
  </div>`;
};

window.deleteCollection = function(id, custId, custName) {
  confirmModal('حذف هذا التحصيل؟', async () => {
    await dbDelete('collections', id);
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

window.recordCollection = async function(customerId, customerName) {
  inputModal({
    title: '💵 تسجيل تحصيل',
    fields: [
      { id: 'amount', label: 'مبلغ التحصيل', type: 'number', required: true, min: '0' },
      { id: 'allowance', label: 'قطعية (اختياري)', type: 'number', value: 0, min: '0' }
    ],
    submitLabel: 'تأكيد التحصيل',
    onSubmit: async (vals) => {
      const amount = Number(vals.amount || 0);
      const allowance = Number(vals.allowance || 0);
      const inserted = await dbInsert('collections', {
        customer_id: customerId,
        amount,
        date: new Date().toISOString()
      });
      if (!inserted) throw new Error('فشل التحصيل');
      if (allowance > 0) {
        await dbInsert('customer_allowances', {
          customer_id: customerId,
          amount: allowance,
          reason: 'قطعية تحصيل',
          date: new Date().toISOString()
        });
        await addAuditLog('customer_allowance', { customerId, allowance });
      }
      await addAuditLog('collection', { customerId, amount });
      closeModal();
      toast('تم التحصيل ✅', 'success');
      openCustomer(customerId, customerName);
    }
  });
};

window.recordAllowance = async function(customerId, customerName) {
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

window.showAgingReport = async function() {
  const user = await ensureUser();
  const { data: balances } = await supabase
    .from('customer_balances')
    .select(`customer_id,balance,customers(full_name)`)
    .eq('user_id', user.id)
    .gt('balance', 0);
  console.log(balances);
};