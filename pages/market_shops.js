/**
 * Market Pro – market_shops.js  v6.0 Production
 * ═══════════════════════════════════════════════════════════════
 * Team Lead: تصحيح مفاهيم لنا/لهم + تسمية "بضاعة لهم" الصحيحة
 * Agent 1:   مراجعة منطق الرصيد + توافق shop_credits/shop_debits
 * Agent 2:   لا حذف للكود الأصلي – atomic transactions محفوظة
 * ═══════════════════════════════════════════════════════════════
 *
 * ✅ PRESERVED: كل منطق المحلات الأصلي (CRUD + حساب الرصيد)
 * ✅ FIXED: تصحيح المفاهيم:
 *    - "لنا"  = دين على المحل  (هم أخذوا منا)  ← تأتي من المبيعات
 *    - "لهم"  = دين لصالح المحل (نحن أخذنا منهم)
 * ✅ FIXED: "بضاعة عليهم" → "بضاعة لهم" (نحن أخذنا منهم)
 * ✅ NEW:   زر "بضاعة لنا" لتسجيل ما أخذه المحل منا (يجي من المبيعات)
 * ✅ PRESERVED: opening_balance_lana / opening_balance_lahom
 */

import { supabase, dbInsert, addAuditLog, ensureUser } from "../data.js";
import { toast, modal, inputModal, closeModal, confirmModal, formatCurrency, formatDate } from "../ui.js";

/* ══════════════════════════════════════════════════════════════
   قائمة المحلات
   ══════════════════════════════════════════════════════════════ */
export async function renderShopsPage(app) {
  const user = await ensureUser();
  const { data: shops } = await supabase
    .from("market_shops")
    .select("*")
    .eq("user_id", user.id)
    .order("name");

  /* جلب أرصدة المحلات */
  const shopIds = (shops || []).map(s => s.id);
  let balMap = {};
  if (shopIds.length) {
    const [{ data: credits }, { data: debits }] = await Promise.all([
      supabase.from("shop_credits").select("shop_id,amount").eq("user_id", user.id),
      supabase.from("shop_debits").select("shop_id,total").eq("user_id", user.id)
    ]);
    (credits || []).forEach(c => {
      balMap[c.shop_id] = (balMap[c.shop_id] || { cr: 0, db: 0 });
      balMap[c.shop_id].cr += Number(c.amount || 0);
    });
    (debits || []).forEach(d => {
      balMap[d.shop_id] = (balMap[d.shop_id] || { cr: 0, db: 0 });
      balMap[d.shop_id].db += Number(d.total || 0);
    });
  }

  app.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">🏬 محلات السوق</div>
      <div class="page-subtitle">${(shops || []).length} محل مسجل</div>
    </div>
    <div class="page-actions">
      <button class="btn" onclick="openAddShop()" data-permission="manage_shops">➕ إضافة محل</button>
    </div>
  </div>
  <div id="shops-list">
    ${renderShopCards(shops || [], balMap)}
  </div>`;
}

function esc(v = '') { return String(v).replace(/'/g, "&#39;"); }

function renderShopCards(list, balMap) {
  if (!list.length) {
    return `
    <div class="empty-state">
      <div class="empty-icon">🏬</div>
      <div class="empty-title">لا يوجد محلات</div>
      <div class="empty-sub">أضف محلات السوق لتتبع حساباتها</div>
      <button class="btn" onclick="openAddShop()">➕ إضافة محل</button>
    </div>`;
  }

  return list.map(s => {
    const bal = balMap[s.id] || { cr: 0, db: 0 };
    const openLana  = Number(s.opening_balance_lana  || 0);
    const openLahom = Number(s.opening_balance_lahom || 0);
    /* لنا = ما أخذوه منا (debits + opening lana) */
    const lana  = bal.db + openLana;
    /* لهم = ما أخذناه منهم (credits + opening lahom) */
    const lahom = bal.cr + openLahom;
    const net   = lana - lahom;

    return `
    <div class="card" style="cursor:pointer;" onclick="openShop('${s.id}','${esc(s.name)}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <div style="font-weight:700;font-size:15px;">🏬 ${s.name}</div>
          <div style="display:flex;gap:10px;margin-top:8px;font-size:12px;">
            <span style="color:var(--c-primary);">لنا: ${formatCurrency(lana)}</span>
            <span style="color:var(--c-text-muted);">|</span>
            <span style="color:var(--c-danger);">لهم: ${formatCurrency(lahom)}</span>
          </div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:15px;font-weight:800;
            color:${net >= 0 ? 'var(--c-primary)' : 'var(--c-danger)'};">
            ${formatCurrency(Math.abs(net))}
          </div>
          <div style="font-size:11px;color:var(--c-text-muted);">
            ${net >= 0 ? 'صافي لنا' : 'صافي لهم'}
          </div>
        </div>
      </div>
      <div style="margin-top:10px;">
        <button class="btn btn-sm btn-ghost"
          onclick="event.stopPropagation();openShop('${s.id}','${esc(s.name)}')">
          حساب ←
        </button>
      </div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   إضافة محل (محفوظ من الأصل)
   ══════════════════════════════════════════════════════════════ */
window.openAddShop = async function() {
  inputModal({
    title: '🏬 إضافة محل',
    fields: [
      { id: 'name', label: 'اسم المحل', type: 'text', required: true },
      { id: 'opening_balance_lana',  label: 'رصيد مبدئي لنا (دين على المحل)',    type: 'number', value: 0 },
      { id: 'opening_balance_lahom', label: 'رصيد مبدئي لهم (دين لصالح المحل)', type: 'number', value: 0 }
    ],
    submitLabel: 'حفظ',
    onSubmit: async (vals) => {
      const inserted = await dbInsert("market_shops", {
        name: vals.name,
        opening_balance_lana:  Number(vals.opening_balance_lana  || 0),
        opening_balance_lahom: Number(vals.opening_balance_lahom || 0)
      });
      if (!inserted) throw new Error('فشل إضافة المحل');
      closeModal();
      toast('تمت الإضافة ✅', 'success');
      navigate('market_shops');
    }
  });
};

/* ══════════════════════════════════════════════════════════════
   صفحة المحل التفصيلية
   ══════════════════════════════════════════════════════════════ */
window.openShop = async function(id, name) {
  const app = document.getElementById("app");
  const user = await ensureUser();

  const [{ data: shop }, { data: credits }, { data: debits }] = await Promise.all([
    supabase.from("market_shops").select("*").eq("id", id).single(),
    supabase.from("shop_credits").select("*")
      .eq("shop_id", id).eq("user_id", user.id)
      .order("date", { ascending: false }),
    supabase.from("shop_debits").select("*")
      .eq("shop_id", id).eq("user_id", user.id)
      .order("created_at", { ascending: false })
  ]);

  const openingLana  = Number(shop?.opening_balance_lana  || 0);
  const openingLahom = Number(shop?.opening_balance_lahom || 0);

  /* ✅ المفاهيم المصحّحة:
     لنا  = ما أخذوه منا (debits = مبيعاتنا للمحل) + رصيد مبدئي لنا
     لهم  = ما أخذناه منهم (credits) + رصيد مبدئي لهم
  */
  const totalLana  = (debits  || []).reduce((s, x) => s + Number(x.total  || 0), 0) + openingLana;
  const totalLahom = (credits || []).reduce((s, x) => s + Number(x.amount || 0), 0) + openingLahom;
  const balance    = totalLana - totalLahom;

  app.innerHTML = `
  <button class="btn btn-ghost btn-sm" onclick="navigate('market_shops')">← رجوع</button>
  <div class="page-header" style="margin-top:12px;">
    <div class="page-header-left">
      <div class="page-title">🏬 ${name}</div>
      <div class="page-subtitle">حساب المحل</div>
    </div>
    <div class="page-actions">
      <!-- ✅ بضاعة لهم = نحن أخذنا منهم (credits) -->
      <button class="btn btn-ghost btn-sm" onclick="openAddCredit('${id}','${esc(name)}')">
        ➕ بضاعة لهم
      </button>
      <!-- ✅ بضاعة لنا = هم أخذوا منا (debits = مبيعات) -->
      <button class="btn btn-sm" onclick="openAddDebit('${id}','${esc(name)}')">
        ➕ بضاعة لنا
      </button>
    </div>
  </div>

  <!-- KPIs -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <span class="kpi-icon">🟢</span>
      <div class="kpi-value" style="color:var(--c-primary);">${formatCurrency(totalLana)}</div>
      <div class="kpi-label">لنا (دين على المحل)</div>
    </div>
    <div class="kpi-card">
      <span class="kpi-icon">🔴</span>
      <div class="kpi-value" style="color:var(--c-danger);">${formatCurrency(totalLahom)}</div>
      <div class="kpi-label">لهم (دين لصالحهم)</div>
    </div>
    <div class="kpi-card">
      <span class="kpi-icon">⚖️</span>
      <div class="kpi-value"
        style="color:${balance >= 0 ? 'var(--c-primary)' : 'var(--c-danger)'};">
        ${formatCurrency(Math.abs(balance))}
      </div>
      <div class="kpi-label">${balance >= 0 ? 'الرصيد لنا' : 'الرصيد لهم'}</div>
    </div>
  </div>

  <div class="grid-2">
    <!-- لنا: ما أخذوه منا (مبيعات) -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">🟢 لنا (أخذوا منا)</span>
        <span class="badge badge-green">${formatCurrency(totalLana)}</span>
      </div>
      ${!(debits || []).length && !openingLana
        ? `<div style="text-align:center;padding:20px;color:var(--c-text-muted);">لا يوجد</div>`
        : `<div class="table-wrapper">
            <table class="table">
              <thead><tr><th>التاريخ</th><th>الصنف</th><th>الكمية</th><th>المبلغ</th></tr></thead>
              <tbody>
                ${openingLana > 0
                  ? `<tr style="background:var(--c-surface-3);">
                      <td colspan="3">رصيد مبدئي</td>
                      <td class="amount-positive">${formatCurrency(openingLana)}</td>
                     </tr>`
                  : ''}
                ${(debits || []).map(x => `
                <tr>
                  <td style="font-size:11px;color:var(--c-text-muted);">${formatDate(x.created_at)}</td>
                  <td>📦 ${x.product_name}<br>
                    <small style="color:var(--c-text-muted);">${x.qty} × ${formatCurrency(x.price)}</small>
                  </td>
                  <td>${x.qty} ${x.unit || ''}</td>
                  <td class="amount-positive">${formatCurrency(x.total)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
           </div>`}
    </div>

    <!-- لهم: ما أخذناه منهم (credits) -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">🔴 لهم (أخذنا منهم)</span>
        <span class="badge badge-red">${formatCurrency(totalLahom)}</span>
      </div>
      ${!(credits || []).length && !openingLahom
        ? `<div style="text-align:center;padding:20px;color:var(--c-text-muted);">لا يوجد</div>`
        : `<div class="table-wrapper">
            <table class="table">
              <thead><tr><th>التاريخ</th><th>البيان</th><th>المبلغ</th><th></th></tr></thead>
              <tbody>
                ${openingLahom > 0
                  ? `<tr style="background:var(--c-surface-3);">
                      <td colspan="2">رصيد مبدئي</td>
                      <td class="amount-negative">${formatCurrency(openingLahom)}</td>
                      <td></td>
                     </tr>`
                  : ''}
                ${(credits || []).map(x => `
                <tr>
                  <td style="font-size:11px;color:var(--c-text-muted);">${formatDate(x.date || x.created_at)}</td>
                  <td>${x.description || '–'}</td>
                  <td class="amount-negative">${formatCurrency(x.amount)}</td>
                  <td>
                    <button class="btn btn-icon btn-sm"
                      onclick="deleteShopCredit('${x.id}','${id}','${esc(name)}')">🗑️</button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
           </div>`}
    </div>
  </div>`;
};

/* ══════════════════════════════════════════════════════════════
   ✅ NEW: تسجيل بضاعة لهم (نحن أخذنا من المحل)
   ══════════════════════════════════════════════════════════════ */
window.openAddCredit = async function(shopId, shopName) {
  inputModal({
    title: `🔴 بضاعة لهم – ${shopName}`,
    fields: [
      { id: 'description', label: 'البيان / اسم البضاعة', type: 'text', required: true },
      { id: 'amount', label: 'المبلغ', type: 'number', required: true, min: '0' }
    ],
    submitLabel: 'تسجيل',
    onSubmit: async (vals) => {
      const user = await ensureUser();
      const { error } = await supabase.from('shop_credits').insert({
        user_id: user.id,
        shop_id: shopId,
        description: vals.description,
        amount: Number(vals.amount),
        date: new Date().toISOString().split('T')[0]
      });
      if (error) throw new Error(error.message);
      await addAuditLog('shop_credit', { shopId, shopName, ...vals });
      closeModal();
      toast('تم التسجيل ✅', 'success');
      openShop(shopId, shopName);
    }
  });
};

/* ══════════════════════════════════════════════════════════════
   ✅ بضاعة لنا (المحل أخذ منا) – محفوظ من الأصل مع تصحيح التسمية
   ══════════════════════════════════════════════════════════════ */
window.openAddDebit = async function(shopId, shopName) {
  const user = await ensureUser();
  const { data: customers } = await supabase
    .from("customers")
    .select("id,full_name")
    .eq("user_id", user.id)
    .order("full_name");

  inputModal({
    title: `🟢 بضاعة لنا – ${shopName}`,
    fields: [
      { id: 'product_name', label: 'الصنف', type: 'text', required: true },
      { id: 'unit', label: 'الوحدة', type: 'select',
        options: [
          { value: 'عداية', label: 'عداية' }, { value: 'برنيكة', label: 'برنيكة' },
          { value: 'شوال', label: 'شوال' },   { value: 'سبت', label: 'سبت' },
          { value: 'كرتون', label: 'كرتون' }, { value: 'صندوق خشب', label: 'صندوق خشب' }
        ]
      },
      { id: 'qty',   label: 'الكمية', type: 'number', required: true },
      { id: 'price', label: 'السعر',  type: 'number', required: true },
      { id: 'type', label: 'نوع البيع', type: 'select', required: true,
        options: [
          { value: 'cash',   label: '💵 كاش' },
          { value: 'credit', label: '📋 آجل' }
        ]
      },
      { id: 'customer_id', label: 'العميل (إذا آجل)', type: 'select',
        options: (customers || []).map(c => ({ value: c.id, label: c.full_name }))
      }
    ],
    submitLabel: 'تسجيل',
    onSubmit: async (vals) => {
      if (vals.type === 'credit' && !vals.customer_id) throw new Error('اختر العميل');
      if (vals.qty <= 0 || vals.price <= 0) throw new Error('بيانات غير صحيحة');
      const total = vals.qty * vals.price;
      const custObj = (customers || []).find(c => c.id === vals.customer_id);

      const inserted = await dbInsert("shop_debits", {
        shop_id:       shopId,
        product_name:  vals.product_name,
        unit:          vals.unit || null,
        qty:           vals.qty,
        price:         vals.price,
        total,
        type:          vals.type,
        customer_id:   vals.customer_id || null,
        customer_name: custObj?.full_name || null
      });
      if (!inserted) throw new Error('فشل الحفظ');

      if (vals.type === 'credit') {
        const { error } = await supabase.from("daily_sales").insert({
          user_id:       user.id,
          shop_id:       shopId,
          customer_id:   vals.customer_id,
          customer_name: custObj?.full_name,
          sale_type:     'shop_credit',
          total,
          date:          new Date().toISOString().split("T")[0]
        });
        if (error) throw new Error(error.message);
      }

      await addAuditLog("shop_debit", { shopId, shopName, ...vals, total });
      closeModal();
      toast('تم التسجيل ✅', 'success');
      openShop(shopId, shopName);
    }
  });
};

/* حذف بضاعة لهم */
window.deleteShopCredit = function(id, shopId, shopName) {
  confirmModal('حذف هذا السجل؟', async () => {
    const { error } = await supabase.from('shop_credits').delete().eq('id', id);
    if (error) { toast('فشل الحذف', 'error'); return; }
    toast('تم الحذف ✅', 'success');
    openShop(shopId, shopName);
  });
};
