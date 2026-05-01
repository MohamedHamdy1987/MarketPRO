import {
  supabase,
  dbInsert,
  addAuditLog,
  ensureUser
} from "../data.js";

import {
  toast,
  inputModal,
  closeModal,
  formatCurrency,
  formatDate,
  emptyState
} from "../ui.js";

/**
 * Market Pro – partners.js  v5.1 Supernova
 * ✅ FIXED: Properly separates general expenses from partner-specific costs.
 * ✅ NEW: Partner page shows balance between مستحقات and واصل.
 * ✅ NEW: Automatic calculation of remaining balance per partner.
 * ✅ PRESERVED: All original logic for profit sharing and withdrawals.
 */

export async function renderPartnersPage(app) {
  const user = await ensureUser();
  const { data: partners } = await supabase
    .from("partners")
    .select("*")
    .eq("user_id", user.id)
    .order("name");

  app.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">🤝 الشركاء</div>
        <div class="page-subtitle">${(partners || []).length} شريك</div>
      </div>
      <div class="page-actions">
        <button class="btn" onclick="openAddPartner()" data-permission="manage_partners">➕ إضافة شريك</button>
      </div>
    </div>
    <div id="partners-list">
      ${renderPartnerCards(partners || [])}
    </div>`;
}

function esc(v = '') {
  return String(v).replace(/'/g, "&#39;");
}

function renderPartnerCards(list) {
  if (!list.length) {
    return emptyState(
      "🤝",
      "لا يوجد شركاء",
      "أضف شريكاً لبدء المتابعة",
      `<button class="btn" onclick="openAddPartner()">➕ إضافة شريك</button>`
    );
  }

  return list.map(p => `
    <div class="card" style="cursor:pointer;" onclick="openPartner('${p.id}','${esc(p.name)}')">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:700;font-size:15px;">🤝 ${p.name}</div>
          <div style="font-size:12px;color:var(--c-text-muted);">حصة ${Number(p.profit_share || 0)}%</div>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();openPartner('${p.id}','${esc(p.name)}')">حساب →</button>
      </div>
    </div>`).join('');
}

window.openAddPartner = async function () {
  inputModal({
    title: "إضافة شريك",
    fields: [
      { id: "name", label: "اسم الشريك", type: "text", required: true },
      { id: "profit_share", label: "نسبة الربح %", type: "number", required: true },
      { id: "opening_equity", label: "رأس المال الافتتاحي", type: "number", value: 0 }
    ],
    submitLabel: "حفظ",
    onSubmit: async (vals) => {
      if (vals.profit_share <= 0 || vals.profit_share > 100) {
        throw new Error('نسبة الربح غير صحيحة');
      }
      const inserted = await dbInsert("partners", {
        name: vals.name,
        profit_share: vals.profit_share
      });
      if (!inserted) throw new Error('فشل إضافة الشريك');
      await supabase.from("partner_equity").insert({
        partner_id: inserted.id,
        opening_equity: vals.opening_equity || 0
      });
      closeModal();
      toast('تمت الإضافة ✅', 'success');
      navigate("partners");
    }
  });
};

window.openPartner = async function (id, name) {
  const app = document.getElementById("app");
  const user = await ensureUser();

  const [
    { data: partner },
    { data: equity },
    { data: accounts },
    { data: invoices },
    { data: allowances },
    { data: expenses }
  ] = await Promise.all([
    supabase.from("partners").select("*").eq("id", id).single(),
    supabase.from("partner_equity").select("*").eq("partner_id", id).single(),
    supabase.from("partner_current_accounts").select("*").eq("partner_id", id).order("created_at", { ascending: false }),
    supabase.from("invoices").select("commission").eq("user_id", user.id).eq("status", "closed"),
    supabase.from("customer_allowances").select("amount").eq("user_id", user.id),
    supabase.from("expenses").select("amount,expense_type,description").eq("user_id", user.id)
  ]);

  // Calculate net profit
  const totalCommission = (invoices || []).reduce((s, i) => s + Number(i.commission || 0), 0);
  const totalAllowances = (allowances || []).reduce((s, a) => s + Number(a.amount || 0), 0);
  
  // Separate general expenses from partner-specific
  const generalExpenses = (expenses || [])
    .filter(e => !['supplier_payment', 'partner_cost'].includes(e.expense_type))
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const partnerSpecificExpenses = (expenses || [])
    .filter(e => e.expense_type === 'partner_cost')
    .reduce((s, e) => s + Number(e.amount || 0), 0);

  const netProfit = totalCommission - totalAllowances - generalExpenses;

  const sharePercent = Number(partner?.profit_share || 0);
  const openingEquity = Number(equity?.opening_equity || 0);
  const profitShare = netProfit * (sharePercent / 100);

  // مستحقات الشريك = رأس المال + حصة الربح + المصاريف اليومية
  // We need daily expenses for this partner
  const partnerDailyExpenses = (accounts || [])
    .filter(a => a.type === 'daily_expense')
    .reduce((s, a) => s + Number(a.withdrawal_amount || 0), 0);
  
  const totalRights = openingEquity + profitShare + partnerDailyExpenses;

  // الواصل = مسحوبات + allowances
  const withdrawals = (accounts || [])
    .filter(a => a.type === 'withdrawal')
    .reduce((s, a) => s + Number(a.withdrawal_amount || 0), 0);
  const partnerAllow = (accounts || [])
    .filter(a => a.type === 'allowance')
    .reduce((s, a) => s + Number(a.allowance || 0), 0);
  const deductions = (accounts || [])
    .reduce((s, a) => s + Number(a.absence_deduction || 0), 0);
  const totalOut = withdrawals + partnerAllow + deductions;

  const balance = totalRights - totalOut;

  app.innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="navigate('partners')">← رجوع</button>
    <div class="page-header" style="margin-top:12px;">
      <div class="page-header-left">
        <div class="page-title">🤝 ${name}</div>
        <div class="page-subtitle">حصة ${sharePercent}%</div>
      </div>
      <div class="page-actions">
        <button class="btn" onclick="addPartnerWithdrawal('${id}','${esc(name)}')">💸 مسحوبات</button>
        <button class="btn btn-warning btn-sm" onclick="addPartnerDailyExpense('${id}','${esc(name)}')">📋 مصروف يومي</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-value">${formatCurrency(openingEquity)}</div>
        <div class="kpi-label">رأس المال</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value" style="color:${profitShare >= 0 ? 'var(--c-success)' : 'var(--c-danger)'};">${formatCurrency(profitShare)}</div>
        <div class="kpi-label">حصة الربح</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${formatCurrency(totalOut)}</div>
        <div class="kpi-label">الواصل</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value" style="color:${balance >= 0 ? 'var(--c-success)' : 'var(--c-danger)'};">${formatCurrency(balance)}</div>
        <div class="kpi-label">${balance >= 0 ? 'المستحق للشريك' : 'مدين للمحل'}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">📒 كشف حساب الشريك</span>
      </div>
      ${!(accounts || []).length
        ? `<div style="text-align:center;padding:20px;color:var(--c-text-muted);">لا توجد حركات</div>`
        : `<div class="table-wrapper">
            <table class="table">
              <thead><tr><th>تاريخ</th><th>بيان</th><th>مبلغ</th></tr></thead>
              <tbody>
                ${accounts.map(a => `
                  <tr>
                    <td>${formatDate(a.created_at)}</td>
                    <td>${a.type || '–'}</td>
                    <td>${formatCurrency(a.withdrawal_amount || a.allowance || a.absence_deduction || 0)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
           </div>`}
    </div>

    <div class="card">
      <h3>تحليل الأرباح</h3>
      <div class="row"><span>إجمالي العمولات</span><span>${formatCurrency(totalCommission)}</span></div>
      <div class="row"><span>قطعيات</span><span>(${formatCurrency(totalAllowances)})</span></div>
      <div class="row"><span>مصاريف عامة</span><span>(${formatCurrency(generalExpenses)})</span></div>
      <hr>
      <div class="row" style="font-weight:800;">
        <span>صافي الربح</span>
        <span style="color:${netProfit >= 0 ? 'var(--c-success)' : 'var(--c-danger)'};">${formatCurrency(netProfit)}</span>
      </div>
    </div>`;
};

window.addPartnerWithdrawal = async function (partnerId, partnerName) {
  inputModal({
    title: `مسحوبات ${partnerName}`,
    fields: [
      { id: "amount", label: "المبلغ", type: "number", required: true }
    ],
    submitLabel: "حفظ",
    onSubmit: async (vals) => {
      if (vals.amount <= 0) throw new Error('قيمة غير صحيحة');
      await dbInsert("partner_current_accounts", {
        partner_id: partnerId,
        type: "withdrawal",
        withdrawal_amount: vals.amount
      });
      await dbInsert("expenses", {
        description: `سحب شريك ${partnerName}`,
        amount: vals.amount,
        expense_type: "partner_withdrawal",
        treasury_type: "financial_manager",
        date: new Date().toISOString()
      });
      await addAuditLog("partner_withdrawal", { partnerId, amount: vals.amount });
      closeModal();
      toast('تم تسجيل المسحوبات ✅', 'success');
      openPartner(partnerId, partnerName);
    }
  });
};

window.addPartnerDailyExpense = async function (partnerId, partnerName) {
  inputModal({
    title: `مصروف يومي - ${partnerName}`,
    fields: [
      { id: "amount", label: "المبلغ اليومي", type: "number", required: true },
      { id: "days", label: "عدد الأيام", type: "number", value: 1, required: true }
    ],
    submitLabel: "حفظ",
    onSubmit: async (vals) => {
      const total = Number(vals.amount || 0) * Number(vals.days || 1);
      if (total <= 0) throw new Error('قيمة غير صحيحة');
      await dbInsert("partner_current_accounts", {
        partner_id: partnerId,
        type: "daily_expense",
        withdrawal_amount: total
      });
      await addAuditLog("partner_daily_expense", { partnerId, amount: total });
      closeModal();
      toast('تم تسجيل المصروف اليومي ✅', 'success');
      openPartner(partnerId, partnerName);
    }
  });
};