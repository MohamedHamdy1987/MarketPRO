/**
 * Market Pro – crates.js  v5.1 Supernova
 * صفحة تتبع العدايات والبرانيك – Req 19, 20
 *
 * Section A: Customer crate tracking (عداية + برنيكة per customer)
 * Section B: Supplier crate tracking (نازل/واصل per supplier)
 * 
 * ✅ NEW: رهن العبوات على حساب العميل (اختياري)
 * ✅ FIXED: Removed double import of getAllCustomerCrateSummaries
 * ✅ PRESERVED: All original tracking logic
 */
import {
  supabase, dbInsert, dbUpdate, dbDelete, ensureUser,
  getAllCustomerCrateSummaries, getAllSupplierCrateSummaries,
  getBulkCustomerCrates
} from "../data.js";

import {
  toast, inputModal, confirmModal,
  formatCurrency, formatDate, emptyState
} from "../ui.js";

/* ── Main render ─────────────────────────────────────────── */
export async function renderCratesPage(app) {
  const user = await ensureUser();

  app.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">🧺 العدايات والبرانيك</div>
      <div class="page-subtitle">تتبع العبوات عند العملاء والموردين</div>
    </div>
    <div class="page-actions">
      <button class="btn" onclick="openAddCustomerCrate()">+ عميل</button>
      <button class="btn btn-ghost" onclick="openAddSupplierCrate()">+ مورد</button>
    </div>
  </div>

  <div style="display:flex;gap:8px;margin-bottom:20px;border-bottom:2px solid var(--c-border);padding-bottom:0;">
    <button id="tab-btn-customers" class="btn btn-sm"
      onclick="switchCrateTab('customers')"
      style="border-radius:8px 8px 0 0;border-bottom:3px solid var(--c-primary);">
      👥 العملاء
    </button>
    <button id="tab-btn-suppliers" class="btn btn-ghost btn-sm"
      onclick="switchCrateTab('suppliers')"
      style="border-radius:8px 8px 0 0;border-bottom:3px solid transparent;">
      🚚 الموردين
    </button>
  </div>

  <div id="crate-tab-customers">
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
  </div>

  <div id="crate-tab-suppliers" style="display:none;">
    <div class="skeleton skeleton-card"></div>
  </div>`;

  const [custRows, supRows] = await Promise.all([
    getAllCustomerCrateSummaries(),
    getAllSupplierCrateSummaries()
  ]);

  window._crateCustomerRows = custRows;
  window._crateSupplierRows = supRows;

  renderCustomerCrates(document.getElementById('crate-tab-customers'), custRows);
  renderSupplierCrates(document.getElementById('crate-tab-suppliers'), supRows);
}

/* ── Tab switch ──────────────────────────────────────────── */
window.switchCrateTab = function(tab) {
  ['customers','suppliers'].forEach(t => {
    document.getElementById(`crate-tab-${t}`).style.display = t===tab ? 'block' : 'none';
    const btn = document.getElementById(`tab-btn-${t}`);
    if (t===tab) {
      btn.className = 'btn btn-sm';
      btn.style.borderBottom = '3px solid var(--c-primary)';
    } else {
      btn.className = 'btn btn-ghost btn-sm';
      btn.style.borderBottom = '3px solid transparent';
    }
  });
};

/* ══════════════════════════════════════════════════════════
   SECTION A – Customer Crate Tracking (Req 19A, 20)
   Tracks عداية + برنيكة per customer
   ══════════════════════════════════════════════════════════ */
function renderCustomerCrates(container, rows) {
  if (!rows.length) {
    container.innerHTML = emptyState('🧺','لا توجد بيانات عدايات للعملاء','أضف أول سجل',
      `<button class="btn" onclick="openAddCustomerCrate()">+ إضافة</button>`);
    return;
  }

  const custMap = {};
  rows.forEach(r => {
    if (!custMap[r.customer_id]) {
      custMap[r.customer_id] = {
        id: r.customer_id,
        name: r.customer_name||'عميل',
        adaya_out: 0, adaya_ret: 0,
        barnika_out: 0, barnika_ret: 0,
        rows: []
      };
    }
    const c = custMap[r.customer_id];
    if (r.crate_type === 'عداية') {
      c.adaya_out  += Number(r.quantity||0);
      c.adaya_ret  += Number(r.returned||0);
    }
    if (r.crate_type === 'برنيكة') {
      c.barnika_out += Number(r.quantity||0);
      c.barnika_ret += Number(r.returned||0);
    }
    c.rows.push(r);
  });

  const customers = Object.values(custMap)
    .sort((a,b)=>(a.name||'').localeCompare(b.name||'','ar'));

  const totalAdayaNet  = customers.reduce((s,c)=>s+(c.adaya_out-c.adaya_ret),0);
  const totalBarnikaNet = customers.reduce((s,c)=>s+(c.barnika_out-c.barnika_ret),0);

  container.innerHTML = `
  <div class="kpi-grid" style="margin-bottom:16px;">
    <div class="kpi-card">
      <span class="kpi-icon">🧺</span>
      <div class="kpi-value" style="color:var(--c-accent);">${totalAdayaNet}</div>
      <div class="kpi-label">عدايات لدى العملاء</div>
    </div>
    <div class="kpi-card">
      <span class="kpi-icon">🪣</span>
      <div class="kpi-value" style="color:var(--c-accent);">${totalBarnikaNet}</div>
      <div class="kpi-label">برانيك لدى العملاء</div>
    </div>
    <div class="kpi-card">
      <span class="kpi-icon">👥</span>
      <div class="kpi-value">${customers.length}</div>
      <div class="kpi-label">إجمالي العملاء</div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <span class="card-title">📋 تفصيل بالعميل</span>
      <input type="search" placeholder="بحث..." id="crate-cust-search"
        oninput="filterCrateCustomers(this.value)"
        style="padding:6px 12px;border:1px solid var(--c-border);border-radius:8px;
               font-family:Cairo;font-size:12px;width:160px;background:var(--c-surface-3);">
    </div>
    <div id="crate-customer-list">
      ${renderCustomerCrateList(customers)}
    </div>
  </div>`;

  window._crateCustomersAgg = customers;
}

function renderCustomerCrateList(customers) {
  if (!customers.length) return `<div style="text-align:center;color:var(--c-text-muted);padding:16px;">لا توجد نتائج</div>`;

  return `
  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>العميل</th>
          <th>عدايات (خارج)</th>
          <th>عدايات (راجع)</th>
          <th>عدايات (صافي)</th>
          <th>برانيك (خارج)</th>
          <th>برانيك (راجع)</th>
          <th>برانيك (صافي)</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${customers.map(c => {
          const adayaNet  = c.adaya_out  - c.adaya_ret;
          const barnikaNet = c.barnika_out - c.barnika_ret;
          return `
          <tr>
            <td style="font-weight:700;">${c.name}</td>
            <td>${c.adaya_out}</td>
            <td style="color:var(--c-positive);">${c.adaya_ret}</td>
            <td style="font-weight:800;color:${adayaNet>0?'var(--c-accent)':'var(--c-positive)'};">${adayaNet}</td>
            <td>${c.barnika_out}</td>
            <td style="color:var(--c-positive);">${c.barnika_ret}</td>
            <td style="font-weight:800;color:${barnikaNet>0?'var(--c-accent)':'var(--c-positive)'};">${barnikaNet}</td>
            <td>
              <button class="btn btn-sm btn-ghost"
                onclick="openCustomerCrateDetail('${c.id}','${(c.name||'').replace(/'/g,"&#39;")}')">
                تفاصيل
              </button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

/* ── Filter customer list ────────────────────────────────── */
window.filterCrateCustomers = function(q) {
  const list = window._crateCustomersAgg||[];
  q = (q||'').toLowerCase();
  const filtered = q ? list.filter(c=>(c.name||'').toLowerCase().includes(q)) : list;
  const el = document.getElementById('crate-customer-list');
  if (el) el.innerHTML = renderCustomerCrateList(filtered);
};

/* ── Customer crate detail modal ─────────────────────────── */
window.openCustomerCrateDetail = function(custId, custName) {
  const allRows = window._crateCustomerRows||[];
  const rows = allRows.filter(r=>r.customer_id===custId)
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  const { modal } = window;

  const html = `
  <h3 style="margin-bottom:16px;">🧺 ${custName} – تفاصيل العبوات</h3>
  ${!rows.length
    ? `<div style="text-align:center;color:var(--c-text-muted);padding:20px;">لا توجد سجلات</div>`
    : `<div class="table-wrapper">
        <table class="table">
          <thead><tr><th>النوع</th><th>الكمية</th><th>المسترجع</th><th>الصافي</th><th>ملاحظة</th><th>التاريخ</th><th></th></tr></thead>
          <tbody>
          ${rows.map(r=>{
            const net=(r.quantity||0)-(r.returned||0);
            return `
            <tr>
              <td><span class="badge badge-blue">${r.crate_type}</span></td>
              <td>${r.quantity||0}</td>
              <td style="color:var(--c-positive);">${r.returned||0}</td>
              <td style="font-weight:800;color:${net>0?'var(--c-accent)':'var(--c-positive)'};">${net}</td>
              <td style="font-size:12px;color:var(--c-text-muted);">${r.note||'–'}</td>
              <td style="font-size:12px;color:var(--c-text-muted);">${formatDate(r.created_at)}</td>
              <td>
                <button class="btn btn-icon btn-sm"
                  onclick="returnCustomerCrates('${r.id}','${r.returned||0}','${custId}','${custName}')">↩️</button>
                <button class="btn btn-icon btn-sm"
                  onclick="deleteCustomerCrateRow('${r.id}','${custId}','${custName}')">🗑️</button>
              </td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
       </div>`}
  <div style="display:flex;gap:8px;margin-top:16px;flex-direction:row-reverse;">
    <button class="btn btn-sm" onclick="openAddCustomerCrate('${custId}','${custName}')">+ إضافة</button>
    <!-- ✅ NEW: رهن اختياري -->
    <button class="btn btn-warning btn-sm" onclick="pledgeCratesToCustomer('${custId}','${custName}')">🔒 ترحيل ثمن العبوات</button>
    <button class="btn btn-ghost btn-sm" onclick="closeModal()">إغلاق</button>
  </div>`;

  import('../ui.js').then(ui=>ui.modal(html));
};

/* ── ✅ NEW: Pledge crates value to customer account ──────── */
window.pledgeCratesToCustomer = async function(custId, custName) {
  const rows = (window._crateCustomerRows||[]).filter(r => r.customer_id === custId);
  const totalAdaya = rows.filter(r => r.crate_type === 'عداية').reduce((s,r) => s + ((r.quantity||0) - (r.returned||0)), 0);
  const totalBarnika = rows.filter(r => r.crate_type === 'برنيكة').reduce((s,r) => s + ((r.quantity||0) - (r.returned||0)), 0);
  const totalCrates = totalAdaya + totalBarnika;
  
  if (totalCrates <= 0) {
    toast('لا توجد عبوات متبقية لترحيلها', 'warning');
    return;
  }

  inputModal({
    title: `🔒 رهن العبوات - ${custName}`,
    fields: [
      { id: 'price_per_crate', label: 'سعر العبوة الواحدة (جنيه)', type: 'number', value: 50, required: true },
    ],
    submitLabel: 'ترحيل إلى حساب العميل',
    onSubmit: async (vals) => {
      const price = Number(vals.price_per_crate || 0);
      if (price <= 0) throw new Error('السعر غير صحيح');
      
      const totalAmount = totalCrates * price;
      
      // Insert a special ledger entry visible in customer account as "رهن عديات"
      await supabase.from('customer_ledger').insert({
        user_id: (await ensureUser()).id,
        customer_id: custId,
        customer_name: custName,
        debit: totalAmount,
        credit: 0,
        description: `⚠️ رهن ${totalAdaya} عداية + ${totalBarnika} برنيكة × ${price} ج`,
        trx_date: new Date().toISOString()
      });

      // Mark crates as pledged
      for (const row of rows) {
        const remaining = (row.quantity || 0) - (row.returned || 0);
        if (remaining > 0) {
          await dbUpdate('customer_crates', row.id, { note: (row.note || '') + ' [مرهون]' });
        }
      }

      closeModal();
      toast(`تم ترحيل ${formatCurrency(totalAmount)} كرهن عديات ✅`, 'success');
      navigate('crates');
    }
  });
};

/* ── Record crate return for customer row ────────────────── */
window.returnCustomerCrates = async function(rowId, currentReturned, custId, custName) {
  inputModal({
    title: '↩️ تسجيل إرجاع عبوات',
    fields: [
      { id: 'returned', label: 'عدد المسترجع (إضافي)', type: 'number', required: true, min: '1' }
    ],
    submitLabel: 'تسجيل',
    onSubmit: async (vals) => {
      const newRet = Number(currentReturned) + Number(vals.returned);
      const ok = await dbUpdate('customer_crates', rowId, { returned: newRet });
      if (!ok) throw new Error('فشل التسجيل');

      // إذا كانت العبوات مرهونة، نخصم من الرهن
      const { data: crate } = await supabase.from('customer_crates').select('*').eq('id', rowId).single();
      if (crate && crate.note && crate.note.includes('مرهون')) {
        const price = 50; // default, could be stored per record
        const refundAmount = Number(vals.returned) * price;
        await supabase.from('customer_ledger').insert({
          user_id: (await ensureUser()).id,
          customer_id: custId,
          customer_name: custName,
          debit: 0,
          credit: refundAmount,
          description: `🔓 خصم رهنية: إرجاع ${vals.returned} عبوة`,
          trx_date: new Date().toISOString()
        });
      }

      closeModal();
      toast('تم تسجيل الإرجاع ✅', 'success');
      const rows = await getAllCustomerCrateSummaries();
      window._crateCustomerRows = rows;
      const container = document.getElementById('crate-tab-customers');
      if (container) renderCustomerCrates(container, rows);
    }
  });
};

/* ── Delete customer crate row ───────────────────────────── */
window.deleteCustomerCrateRow = function(id, custId, custName) {
  confirmModal('حذف هذا السجل؟', async () => {
    await dbDelete('customer_crates', id);
    toast('تم الحذف ✅', 'success');
    const rows = await getAllCustomerCrateSummaries();
    window._crateCustomerRows = rows;
    const container = document.getElementById('crate-tab-customers');
    if (container) renderCustomerCrates(container, rows);
    closeModal();
  });
};

/* ── Add customer crate record ───────────────────────────── */
window.openAddCustomerCrate = async function(presetCustId, presetCustName) {
  const user = await ensureUser();
  const { data: customers } = await supabase
    .from('customers').select('id,full_name')
    .eq('user_id', user.id).order('full_name');

  inputModal({
    title: '🧺 إضافة عبوات عميل',
    fields: [
      {
        id: 'customer_id', label: 'العميل', type: 'select', required: true,
        value: presetCustId||'',
        options: (customers||[]).map(c=>({ value: c.id, label: c.full_name }))
      },
      {
        id: 'crate_type', label: 'نوع العبوة', type: 'select', required: true,
        options: [
          { value: 'عداية',  label: 'عداية' },
          { value: 'برنيكة', label: 'برنيكة' }
        ]
      },
      { id: 'quantity', label: 'الكمية الخارجة', type: 'number', required: true, min: '1' },
      { id: 'returned', label: 'الكمية المرتجعة', type: 'number', value: 0, min: '0' },
      { id: 'note',     label: 'ملاحظة', placeholder: 'اختياري' }
    ],
    submitLabel: 'حفظ',
    onSubmit: async (vals) => {
      const cust = (customers||[]).find(c=>c.id===vals.customer_id);
      await dbInsert('customer_crates', {
        customer_id:   vals.customer_id,
        customer_name: cust?.full_name||'',
        crate_type:    vals.crate_type,
        quantity:      Number(vals.quantity||0),
        returned:      Number(vals.returned||0),
        note:          vals.note||null
      });
      closeModal();
      toast('تم الحفظ ✅', 'success');
      navigate('crates');
    }
  });
};

/* ══════════════════════════════════════════════════════════
   SECTION B – Supplier Crate Tracking (Req 19B)
   ══════════════════════════════════════════════════════════ */
function renderSupplierCrates(container, rows) {
  if (!rows.length) {
    container.innerHTML = emptyState('🚚','لا توجد بيانات عبوات موردين','أضف أول سجل',
      `<button class="btn" onclick="openAddSupplierCrate()">+ إضافة</button>`);
    return;
  }

  const supMap = {};
  rows.forEach(r => {
    if (!supMap[r.supplier_id]) {
      supMap[r.supplier_id] = {
        id: r.supplier_id,
        name: r.supplier_name||'مورد',
        adaya_out: 0, adaya_in: 0,
        barnika_out: 0, barnika_in: 0,
        rows: []
      };
    }
    const s = supMap[r.supplier_id];
    if (r.crate_type === 'عداية') {
      s.adaya_out += Number(r.outbound||0);
      s.adaya_in  += Number(r.returned||0);
    }
    if (r.crate_type === 'برنيكة') {
      s.barnika_out += Number(r.outbound||0);
      s.barnika_in  += Number(r.returned||0);
    }
    s.rows.push(r);
  });

  const suppliers = Object.values(supMap)
    .sort((a,b)=>(a.name||'').localeCompare(b.name||'','ar'));

  const totalAdayaDef  = suppliers.reduce((s,x)=>s+(x.adaya_out-x.adaya_in),0);
  const totalBarnikaDef = suppliers.reduce((s,x)=>s+(x.barnika_out-x.barnika_in),0);

  container.innerHTML = `
  <div class="kpi-grid" style="margin-bottom:16px;">
    <div class="kpi-card">
      <span class="kpi-icon">🧺</span>
      <div class="kpi-value" style="color:var(--c-warning);">${totalAdayaDef}</div>
      <div class="kpi-label">عجز عدايات الموردين</div>
    </div>
    <div class="kpi-card">
      <span class="kpi-icon">🪣</span>
      <div class="kpi-value" style="color:var(--c-warning);">${totalBarnikaDef}</div>
      <div class="kpi-label">عجز برانيك الموردين</div>
    </div>
    <div class="kpi-card">
      <span class="kpi-icon">🚚</span>
      <div class="kpi-value">${suppliers.length}</div>
      <div class="kpi-label">إجمالي الموردين</div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <span class="card-title">📋 تفصيل بالمورد</span>
    </div>
    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>المورد</th>
            <th>عدايات نازل</th>
            <th>عدايات واصل</th>
            <th>عجز عدايات</th>
            <th>برانيك نازل</th>
            <th>برانيك واصل</th>
            <th>عجز برانيك</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${suppliers.map(s => {
            const adayaDef  = s.adaya_out  - s.adaya_in;
            const barnikaDef = s.barnika_out - s.barnika_in;
            return `
            <tr>
              <td style="font-weight:700;">${s.name}</td>
              <td>${s.adaya_out}</td>
              <td style="color:var(--c-positive);">${s.adaya_in}</td>
              <td style="font-weight:800;color:${adayaDef>0?'var(--c-warning)':'var(--c-positive)'};">${adayaDef}</td>
              <td>${s.barnika_out}</td>
              <td style="color:var(--c-positive);">${s.barnika_in}</td>
              <td style="font-weight:800;color:${barnikaDef>0?'var(--c-warning)':'var(--c-positive)'};">${barnikaDef}</td>
              <td>
                <button class="btn btn-sm btn-ghost"
                  onclick="openSupplierCrateDetail('${s.id}','${(s.name||'').replace(/'/g,"&#39;")}')">
                  تفاصيل
                </button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;

  window._crateSupplierAgg = suppliers;
}

/* ── Supplier crate detail modal ─────────────────────────── */
window.openSupplierCrateDetail = function(supId, supName) {
  const allRows = window._crateSupplierRows||[];
  const rows = allRows.filter(r=>r.supplier_id===supId)
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  const html = `
  <h3 style="margin-bottom:16px;">🚚 ${supName} – تفاصيل العبوات</h3>
  ${!rows.length
    ? `<div style="text-align:center;color:var(--c-text-muted);padding:20px;">لا توجد سجلات</div>`
    : `<div class="table-wrapper">
        <table class="table">
          <thead><tr><th>النوع</th><th>نازل</th><th>واصل</th><th>العجز</th><th>ملاحظة</th><th>التاريخ</th><th></th></tr></thead>
          <tbody>
          ${rows.map(r=>{
            const def=(r.outbound||0)-(r.returned||0);
            return `
            <tr>
              <td><span class="badge badge-blue">${r.crate_type}</span></td>
              <td>${r.outbound||0}</td>
              <td style="color:var(--c-positive);">${r.returned||0}</td>
              <td style="font-weight:800;color:${def>0?'var(--c-warning)':'var(--c-positive)'};">${def}</td>
              <td style="font-size:12px;color:var(--c-text-muted);">${r.note||'–'}</td>
              <td style="font-size:12px;color:var(--c-text-muted);">${formatDate(r.created_at)}</td>
              <td>
                <button class="btn btn-icon btn-sm"
                  onclick="recordSupplierCrateReturn('${r.id}','${r.returned||0}','${supId}','${supName}')">↩️</button>
                <button class="btn btn-icon btn-sm"
                  onclick="deleteSupplierCrateRow('${r.id}','${supId}','${supName}')">🗑️</button>
              </td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
       </div>`}
  <div style="display:flex;gap:8px;margin-top:16px;flex-direction:row-reverse;">
    <button class="btn btn-sm" onclick="openAddSupplierCrate('${supId}','${supName}')">+ إضافة</button>
    <button class="btn btn-ghost btn-sm" onclick="closeModal()">إغلاق</button>
  </div>`;

  import('../ui.js').then(ui=>ui.modal(html));
};

/* ── Record supplier crate return ────────────────────────── */
window.recordSupplierCrateReturn = async function(rowId, currentReturned, supId, supName) {
  inputModal({
    title: '↩️ تسجيل واصل من المورد',
    fields: [
      { id: 'returned', label: 'عدد الواصل (إضافي)', type: 'number', required: true, min: '1' }
    ],
    submitLabel: 'تسجيل',
    onSubmit: async (vals) => {
      const newRet = Number(currentReturned) + Number(vals.returned);
      const ok = await dbUpdate('supplier_crates', rowId, { returned: newRet });
      if (!ok) throw new Error('فشل التسجيل');
      closeModal();
      toast('تم تسجيل الواصل ✅', 'success');
      navigate('crates');
    }
  });
};

/* ── Delete supplier crate row ───────────────────────────── */
window.deleteSupplierCrateRow = function(id) {
  confirmModal('حذف هذا السجل؟', async () => {
    await dbDelete('supplier_crates', id);
    toast('تم الحذف ✅', 'success');
    closeModal();
    navigate('crates');
  });
};

/* ── Add supplier crate record ───────────────────────────── */
window.openAddSupplierCrate = async function(presetSupId, presetSupName) {
  const user = await ensureUser();
  const { data: suppliers } = await supabase
    .from('suppliers').select('id,name')
    .eq('user_id', user.id).order('name');

  inputModal({
    title: '🚚 إضافة عبوات مورد',
    fields: [
      {
        id: 'supplier_id', label: 'المورد', type: 'select', required: true,
        value: presetSupId||'',
        options: (suppliers||[]).map(s=>({ value: s.id, label: s.name }))
      },
      {
        id: 'crate_type', label: 'نوع العبوة', type: 'select', required: true,
        options: [
          { value: 'عداية',  label: 'عداية' },
          { value: 'برنيكة', label: 'برنيكة' }
        ]
      },
      { id: 'outbound', label: 'نازل (خارج للمورد)', type: 'number', required: true, min: '1' },
      { id: 'returned', label: 'واصل (راجع منه)',    type: 'number', value: 0,       min: '0' },
      { id: 'note',     label: 'ملاحظة', placeholder: 'اختياري' }
    ],
    submitLabel: 'حفظ',
    onSubmit: async (vals) => {
      const sup = (suppliers||[]).find(s=>s.id===vals.supplier_id);
      await dbInsert('supplier_crates', {
        supplier_id:   vals.supplier_id,
        supplier_name: sup?.name||'',
        crate_type:    vals.crate_type,
        outbound:      Number(vals.outbound||0),
        returned:      Number(vals.returned||0),
        note:          vals.note||null
      });
      closeModal();
      toast('تم الحفظ ✅', 'success');
      navigate('crates');
    }
  });
};