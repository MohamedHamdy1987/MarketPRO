import {
    supabase,
  ensureUser,
  verifyPIN,
  getTreasuriesForUser,
  addTreasuryTransaction,
  transferBetweenTreasuries
} from "../data.js";

import {
  toast,
  inputModal,
  formatCurrency,
  closeModal
} from "../ui.js";

/* ───────────────── CONFIG ───────────────── */

function isFinanceManager(t) {
  return t?.treasury_type === "financial_manager";
}

function getChannelField(channel) {
  if (channel === "cash") return "cash_balance";
  if (channel === "vodafone_cash") return "vodafone_balance";
  if (channel === "bank") return "bank_balance";
  return null;
}

function channelLabel(channel) {
  if (channel === "cash") return "نقدي 💵";
  if (channel === "vodafone_cash") return "فودافون 📱";
  if (channel === "bank") return "بنك 🏦";
  return channel || "—";
}

function typeLabel(type) {
  if (type === "income") return '<span style="color:#2196F3;font-weight:700;">تحصيل ↑</span>';
  if (type === "expense") return '<span style="color:#f44336;font-weight:700;">مصروف ↓</span>';
  if (type === "transfer_in") return '<span style="color:#4caf50;font-weight:700;">تحويل وارد ↙</span>';
  if (type === "transfer_out") return '<span style="color:#ff9800;font-weight:700;">تحويل صادر ↗</span>';
  return type || "—";
}

function formatDate(str) {
  if (!str) return "—";
  try {
    return new Date(str).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
  } catch { return str; }
}

/* ───────────────── CACHE ───────────────── */

let _customersCache = null;
let _suppliersCache = null;

async function loadCustomers() {
  if (_customersCache) return _customersCache;
  try {
    const user = await ensureUser();
    const { data } = await supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", user.company_id)
      .order("name");
    _customersCache = data || [];
  } catch { _customersCache = []; }
  return _customersCache;
}

async function loadSuppliers() {
  if (_suppliersCache) return _suppliersCache;
  try {
    const user = await ensureUser();
    const { data } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("company_id", user.company_id)
      .order("name");
    _suppliersCache = data || [];
  } catch { _suppliersCache = []; }
  return _suppliersCache;
}

function invalidateCache() {
  _customersCache = null;
  _suppliersCache = null;
}

/* ───────────────── PIN ───────────────── */

async function requirePIN() {
  return new Promise((resolve, reject) => {
    inputModal({
      title: "🔐 تأكيد العملية",
      fields: [
        { id: "pin", label: "أدخل الرقم السري", type: "password", required: true }
      ],
      submitLabel: "تأكيد",
      onSubmit: async (vals) => {
        const ok = await verifyPIN(vals.pin);
        if (!ok) throw new Error("❌ الرقم السري غير صحيح");
        resolve(true);
      }
    });
  });
}

/* ───────────────── SEARCHABLE DROPDOWN ───────────────── */

function buildSearchableDropdown({ containerId, items, placeholder, onSelect }) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  wrap.innerHTML = `
    <input
      type="text"
      id="${containerId}_search"
      placeholder="${placeholder || 'ابحث...'}"
      style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:14px;margin-bottom:4px;box-sizing:border-box;"
      autocomplete="off"
    />
    <div id="${containerId}_list" style="max-height:160px;overflow-y:auto;border:1px solid #ddd;border-radius:6px;background:#fff;"></div>
    <input type="hidden" id="${containerId}_value" />
  `;

  const searchEl = document.getElementById(`${containerId}_search`);
  const listEl = document.getElementById(`${containerId}_list`);
  const valueEl = document.getElementById(`${containerId}_value`);

  function render(filter) {
    const q = (filter || "").trim().toLowerCase();
    const filtered = q ? items.filter(i => (i.name || "").toLowerCase().includes(q)) : items;
    if (!filtered.length) {
      listEl.innerHTML = `<div style="padding:8px;color:#888;text-align:center;">لا توجد نتائج</div>`;
      return;
    }
    listEl.innerHTML = filtered.map(i => `
      <div
        data-id="${i.id}"
        style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:14px;"
        onmouseover="this.style.background='#f5f5f5'"
        onmouseout="this.style.background=''"
      >${i.name}</div>
    `).join("");

    listEl.querySelectorAll("[data-id]").forEach(el => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-id");
        const item = items.find(x => String(x.id) === String(id));
        if (!item) return;
        searchEl.value = item.name;
        valueEl.value = item.id;
        listEl.style.display = "none";
        if (onSelect) onSelect(item);
      });
    });
  }

  searchEl.addEventListener("focus", () => {
    listEl.style.display = "";
    render(searchEl.value);
  });

  searchEl.addEventListener("input", () => {
    valueEl.value = "";
    listEl.style.display = "";
    render(searchEl.value);
  });

  document.addEventListener("click", function hideOnOutside(e) {
    if (!wrap.contains(e.target)) {
      listEl.style.display = "none";
      document.removeEventListener("click", hideOnOutside);
    }
  });

  render("");
}

/* ───────────────── CUSTOM MODAL ───────────────── */

function openCustomModal({ title, contentHtml, onSubmit, submitLabel = "حفظ", submitClass = "btn" }) {
  const existing = document.getElementById("khazna_custom_modal");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "khazna_custom_modal";
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;
    display:flex;align-items:center;justify-content:center;padding:16px;
  `;

  overlay.innerHTML = `
    <div style="
      background:#fff;border-radius:12px;width:100%;max-width:480px;
      max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.25);
      direction:rtl;
    ">
      <div style="
        padding:16px 20px;border-bottom:1px solid #eee;
        display:flex;align-items:center;justify-content:space-between;
      ">
        <span style="font-weight:700;font-size:16px;">${title}</span>
        <button onclick="document.getElementById('khazna_custom_modal').remove()"
          style="background:none;border:none;font-size:20px;cursor:pointer;color:#888;">✕</button>
      </div>
      <div style="padding:20px;" id="khazna_custom_modal_body">
        ${contentHtml}
      </div>
      <div style="padding:12px 20px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="document.getElementById('khazna_custom_modal').remove()"
          style="padding:8px 18px;border:1px solid #ddd;border-radius:6px;background:#f5f5f5;cursor:pointer;">
          إلغاء
        </button>
        <button id="khazna_modal_submit"
          class="${submitClass}"
          style="padding:8px 18px;border-radius:6px;border:none;cursor:pointer;font-weight:700;">
          ${submitLabel}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("khazna_modal_submit").addEventListener("click", async () => {
    const btn = document.getElementById("khazna_modal_submit");
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = "جاري...";
    try {
      await onSubmit();
    } catch (e) {
      toast(e.message || "حدث خطأ", "error");
      btn.disabled = false;
      btn.textContent = submitLabel;
    }
  });
}

/* ───────────────── PAGE ───────────────── */

export async function renderKhaznaPage(app) {
  const user = await ensureUser();
  const treasuries = await getTreasuriesForUser(user.id);

  app.innerHTML = `
    <div class="page-header">
      <div class="page-title">💰 الخزنة</div>
    </div>

    <div class="grid-2">
      ${treasuries.map(t => {
        const isFM = isFinanceManager(t);
        return `
          <div class="card treasury-card" onclick="openTreasuryDetails('${t.id}')" style="cursor:pointer;">
            <div style="font-weight:700;margin-bottom:10px;">
              ${t.name || t.treasury_type}
            </div>
            <div>💵 نقدي: ${formatCurrency(t.cash_balance)}</div>
            <div>📱 فودافون: ${formatCurrency(t.vodafone_balance)}</div>
            ${isFM ? `<div>🏦 بنك: ${formatCurrency(t.bank_balance || 0)}</div>` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

/* ───────────────── TREASURY DETAILS ───────────────── */

window.openTreasuryDetails = async function (treasuryId) {
  const user = await ensureUser();

  const { data: treasury, error: tErr } = await supabase
    .from("treasury_accounts")
    .select("*")
    .eq("id", treasuryId)
    .eq("user_id", user.id)
    .single();

  if (tErr || !treasury) {
    toast("تعذر تحميل بيانات الخزنة", "error");
    return;
  }

  const { data: rawTx } = await supabase
    .from("treasury_transactions")
    .select("*")
    .eq("treasury_id", treasuryId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const transactions = rawTx || [];

  // Fetch customer/supplier names for display
  const customerIds = [...new Set(transactions.filter(t => t.customer_id).map(t => t.customer_id))];
  const supplierIds = [...new Set(transactions.filter(t => t.supplier_id).map(t => t.supplier_id))];

  const customerMap = {};
  const supplierMap = {};

  if (customerIds.length) {
    const { data: cList } = await supabase.from("customers").select("id, name").in("id", customerIds);
    (cList || []).forEach(c => { customerMap[c.id] = c.name; });
  }
  if (supplierIds.length) {
    const { data: sList } = await supabase.from("suppliers").select("id, name").in("id", supplierIds);
    (sList || []).forEach(s => { supplierMap[s.id] = s.name; });
  }

  // Summaries
  const totalIncome = transactions
    .filter(t => t.type === "income" || t.type === "transfer_in")
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  const totalExpense = transactions
    .filter(t => t.type === "expense" || t.type === "transfer_out")
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  const netBalance = totalIncome - totalExpense;

  const incomeRows = transactions.filter(t => t.type === "income" || t.type === "transfer_in");
  const expenseRows = transactions.filter(t => t.type === "expense" || t.type === "transfer_out");

  function txSource(tx) {
    if (tx.customer_id && customerMap[tx.customer_id]) return customerMap[tx.customer_id];
    if (tx.supplier_id && supplierMap[tx.supplier_id]) return supplierMap[tx.supplier_id];
    if (tx.note) return tx.note;
    if (tx.expense_type) return expenseTypeLabel(tx.expense_type);
    return "—";
  }

  function renderTxRow(tx) {
    return `
      <div style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-weight:600;">${formatCurrency(tx.amount)}</span>
          <span style="color:#888;">${channelLabel(tx.channel)}</span>
        </div>
        <div style="margin-top:4px;color:#555;">${txSource(tx)}</div>
        <div style="margin-top:2px;color:#aaa;font-size:12px;">${formatDate(tx.created_at)}</div>
      </div>
    `;
  }

  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="page-header">
      <div class="page-title">🏦 ${treasury.name || treasury.treasury_type}</div>
      <button class="btn btn-ghost" onclick="navigate('khazna')">⬅ رجوع</button>
    </div>

    <!-- SUMMARY BAR -->
    <div style="
      display:flex;gap:12px;flex-wrap:wrap;margin-top:16px;margin-bottom:16px;direction:rtl;
    ">
      <div style="
        flex:1;min-width:140px;background:#86EFAC;border-radius:10px;padding:14px 16px;
        border-right:4px solid #22C55E;
      ">
        <div style="font-size:12px;color:#14532D;margin-bottom:4px;">إجمالي التحصيلات</div>
        <div style="font-weight:700;font-size:18px;color:#14532D;">${formatCurrency(totalIncome)}</div>
      </div>
      <div style="
        flex:1;min-width:140px;background:#FED7AA;border-radius:10px;padding:14px 16px;
        border-right:4px solid #F97316;
      ">
        <div style="font-size:12px;color:#9A3412;margin-bottom:4px;">إجمالي المصروفات</div>
        <div style="font-weight:700;font-size:18px;color:#9A3412;">${formatCurrency(totalExpense)}</div>
      </div>
      <div style="
        flex:1;min-width:140px;background:#F0FDF4;
        border-radius:10px;padding:14px 16px;
        border-right:4px solid #22C55E;
      ">
        <div style="font-size:12px;color:#166534;margin-bottom:4px;">صافي الرصيد</div>
        <div style="font-weight:700;font-size:18px;color:#166534;">${formatCurrency(netBalance)}</div>
      </div>
    </div>

    <!-- BALANCES CARD -->
    <div class="card" style="margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap;direction:rtl;">
      <div>💵 نقدي: <strong>${formatCurrency(treasury.cash_balance || 0)}</strong></div>
      <div>📱 فودافون: <strong>${formatCurrency(treasury.vodafone_balance || 0)}</strong></div>
      ${isFinanceManager(treasury) ? `<div>🏦 بنك: <strong>${formatCurrency(treasury.bank_balance || 0)}</strong></div>` : ""}
    </div>

    <!-- SPLIT LAYOUT -->
    <div style="display:flex;gap:14px;direction:rtl;align-items:flex-start;flex-wrap:wrap;">

      <!-- RIGHT: INCOME -->
      <div style="flex:1;min-width:260px;">
        <div style="
          background:#DCFCE7;
          border-radius:10px 10px 0 0;padding:12px 16px;
          display:flex;align-items:center;justify-content:space-between;
        ">
          <span style="color:#166534;font-weight:700;font-size:15px;">📥 التحصيلات</span>
          <button
            onclick="khazna_income_for('${treasuryId}')"
            style="
              background:#4ADE80;color:#1A472A;border:none;border-radius:6px;
              padding:6px 12px;font-weight:700;cursor:pointer;font-size:13px;
            ">
            ➕ تحصيل
          </button>
        </div>
        <div style="
          background:#F0FDF4;border:1px solid #BBF7D0;border-top:none;
          border-radius:0 0 10px 10px;padding:12px;min-height:100px;
        ">
          ${incomeRows.length
            ? incomeRows.map(renderTxRow).join("")
            : `<div style="text-align:center;color:#aaa;padding:20px;">لا توجد تحصيلات</div>`
          }
        </div>
      </div>

      <!-- LEFT: EXPENSES -->
      <div style="flex:1;min-width:260px;">
        <div style="
          background:#FEE2E2;
          border-radius:10px 10px 0 0;padding:12px 16px;
          display:flex;align-items:center;justify-content:space-between;
        ">
          <span style="color:#991B1B;font-weight:700;font-size:15px;">📤 المصروفات</span>
          <button
            onclick="khazna_expense_for('${treasuryId}')"
            style="
              background:#F87171;color:#fff;border:none;border-radius:6px;
              padding:6px 12px;font-weight:700;cursor:pointer;font-size:13px;
            ">
            ➖ مصروف
          </button>
        </div>
        <div style="
          background:#FEF2F2;border:1px solid #FECACA;border-top:none;
          border-radius:0 0 10px 10px;padding:12px;min-height:100px;
        ">
          ${expenseRows.length
            ? expenseRows.map(renderTxRow).join("")
            : `<div style="text-align:center;color:#aaa;padding:20px;">لا توجد مصروفات</div>`
          }
        </div>
      </div>

    </div>
  `;
};

/* ───────────────── EXPENSE TYPE LABEL ───────────────── */

function expenseTypeLabel(type) {
  const map = {
    supplier: "مورد",
    general: "مصروف عام",
    rent: "إيجار",
    salary_employee: "مرتب موظف",
    salary_partner: "مرتب شريك",
    misc: "متنوع"
  };
  return map[type] || type || "—";
}

/* ───────────────── INCOME MODAL (GLOBAL) ───────────────── */

window.khazna_income = async function (prefillTreasuryId) {
  const user = await ensureUser();
  const treasuries = await getTreasuriesForUser(user.id);
  const customers = await loadCustomers();

  const treasuryOptions = treasuries.map(t =>
    `<option value="${t.id}" ${prefillTreasuryId === t.id ? "selected" : ""}>${t.name || t.treasury_type}</option>`
  ).join("");

  openCustomModal({
    title: "➕ إضافة تحصيل",
    submitLabel: "حفظ التحصيل",
    submitClass: "btn",
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:14px;direction:rtl;">

        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">الخزنة</label>
          <select id="ki_treasury" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
            ${treasuryOptions}
          </select>
        </div>

        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">نوع المصدر</label>
          <select id="ki_source_type" onchange="khazna_income_source_toggle()"
            style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
            <option value="customer">عميل</option>
            <option value="other">أخرى</option>
          </select>
        </div>

        <div id="ki_customer_wrap">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">العميل</label>
          <div id="ki_customer_dd"></div>
        </div>

        <div id="ki_other_wrap" style="display:none;">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">ملاحظة</label>
          <input id="ki_note" type="text" placeholder="أدخل بيان..."
            style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;" />
        </div>

        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">القناة</label>
          <select id="ki_channel" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
            <option value="cash">نقدي 💵</option>
            <option value="vodafone_cash">فودافون 📱</option>
            <option value="bank">بنك 🏦</option>
          </select>
        </div>

        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">المبلغ</label>
          <input id="ki_amount" type="number" min="0" placeholder="0.00"
            style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;" />
        </div>
      </div>
    `,
    onSubmit: async () => {
      const treasury_id = document.getElementById("ki_treasury")?.value;
      const source_type = document.getElementById("ki_source_type")?.value;
      const channel = document.getElementById("ki_channel")?.value;
      const amount = parseFloat(document.getElementById("ki_amount")?.value || "0");
      const note = document.getElementById("ki_note")?.value?.trim() || null;
      const customer_id = document.getElementById("ki_customer_dd_value")?.value || null;

      if (!treasury_id) throw new Error("اختر الخزنة");
      if (isNaN(amount) || amount <= 0) throw new Error("أدخل مبلغ صحيح");
      if (source_type === "customer" && !customer_id) throw new Error("اختر العميل");

      const t = treasuries.find(x => x.id === treasury_id);
      if (channel === "bank" && !isFinanceManager(t)) throw new Error("البنك للمدير فقط");

      await requirePIN();

      const payload = {
        treasury_id,
        type: "income",
        channel,
        amount,
        ...(customer_id ? { customer_id } : {}),
        ...(note ? { note } : {})
      };

      const res = await addTreasuryTransaction(payload);
      if (!res.success) throw new Error(res.error || "فشل العملية");

      invalidateCache();
      toast("تمت الإضافة ✅");
      document.getElementById("khazna_custom_modal")?.remove();
      openTreasuryDetails(treasury_id);
    }
  });

  // Build searchable customer dropdown after modal renders
  setTimeout(() => {
    buildSearchableDropdown({
      containerId: "ki_customer_dd",
      items: customers,
      placeholder: "ابحث عن عميل..."
    });
  }, 50);
};

window.khazna_income_source_toggle = function () {
  const type = document.getElementById("ki_source_type")?.value;
  const cWrap = document.getElementById("ki_customer_wrap");
  const oWrap = document.getElementById("ki_other_wrap");
  if (!cWrap || !oWrap) return;
  if (type === "customer") {
    cWrap.style.display = "";
    oWrap.style.display = "none";
  } else {
    cWrap.style.display = "none";
    oWrap.style.display = "";
  }
};

/* Income shortcut for details page (pre-selects treasury) */
window.khazna_income_for = function (treasuryId) {
  window.khazna_income(treasuryId);
};

/* ───────────────── EXPENSE MODAL (GLOBAL) ───────────────── */

window.khazna_expense = async function (prefillTreasuryId) {
  const user = await ensureUser();
  const treasuries = await getTreasuriesForUser(user.id);
  const suppliers = await loadSuppliers();

  const treasuryOptions = treasuries.map(t =>
    `<option value="${t.id}" ${prefillTreasuryId === t.id ? "selected" : ""}>${t.name || t.treasury_type}</option>`
  ).join("");

  openCustomModal({
    title: "➖ إضافة مصروف",
    submitLabel: "حفظ المصروف",
    submitClass: "btn btn-warning",
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:14px;direction:rtl;">

        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">الخزنة</label>
          <select id="ke_treasury" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
            ${treasuryOptions}
          </select>
        </div>

        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">نوع المصروف</label>
          <select id="ke_expense_type" onchange="khazna_expense_type_toggle()"
            style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
            <option value="supplier">مورد</option>
            <option value="general">مصروف عام</option>
            <option value="rent">إيجار</option>
            <option value="salary_employee">مرتب موظف</option>
            <option value="salary_partner">مرتب شريك</option>
            <option value="misc">متنوع</option>
          </select>
        </div>

        <div id="ke_supplier_wrap">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">المورد</label>
          <div id="ke_supplier_dd"></div>
        </div>

        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">ملاحظة</label>
          <input id="ke_note" type="text" placeholder="أدخل بيان..."
            style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;" />
        </div>

        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">القناة</label>
          <select id="ke_channel" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
            <option value="cash">نقدي 💵</option>
            <option value="vodafone_cash">فودافون 📱</option>
            <option value="bank">بنك 🏦</option>
          </select>
        </div>

        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">المبلغ</label>
          <input id="ke_amount" type="number" min="0" placeholder="0.00"
            style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;" />
        </div>
      </div>
    `,
    onSubmit: async () => {
      const treasury_id = document.getElementById("ke_treasury")?.value;
      const expense_type = document.getElementById("ke_expense_type")?.value;
      const channel = document.getElementById("ke_channel")?.value;
      const amount = parseFloat(document.getElementById("ke_amount")?.value || "0");
      const note = document.getElementById("ke_note")?.value?.trim() || null;
      const supplier_id = document.getElementById("ke_supplier_dd_value")?.value || null;

      if (!treasury_id) throw new Error("اختر الخزنة");
      if (isNaN(amount) || amount <= 0) throw new Error("أدخل مبلغ صحيح");
      if (expense_type === "supplier" && !supplier_id) throw new Error("اختر المورد");

      const t = treasuries.find(x => x.id === treasury_id);
      if (channel === "bank" && !isFinanceManager(t)) throw new Error("البنك للمدير فقط");

      const field = getChannelField(channel);
      if (field && Number(t?.[field] || 0) < amount) throw new Error("رصيد غير كافي");

      await requirePIN();

      const payload = {
        treasury_id,
        type: "expense",
        channel,
        amount,
        expense_type,
        ...(supplier_id ? { supplier_id } : {}),
        ...(note ? { note } : {})
      };

      const res = await addTreasuryTransaction(payload);
      if (!res.success) throw new Error(res.error || "فشل العملية");

      invalidateCache();
      toast("تم السحب ✅");
      document.getElementById("khazna_custom_modal")?.remove();
      openTreasuryDetails(treasury_id);
    }
  });

  // Build searchable supplier dropdown
  setTimeout(() => {
    buildSearchableDropdown({
      containerId: "ke_supplier_dd",
      items: suppliers,
      placeholder: "ابحث عن مورد..."
    });
  }, 50);
};

window.khazna_expense_type_toggle = function () {
  const type = document.getElementById("ke_expense_type")?.value;
  const sWrap = document.getElementById("ke_supplier_wrap");
  if (!sWrap) return;
  sWrap.style.display = (type === "supplier") ? "" : "none";
};

/* Expense shortcut for details page */
window.khazna_expense_for = function (treasuryId) {
  window.khazna_expense(treasuryId);
};

/* ───────────────── TRANSFER MODAL ───────────────── */

window.khazna_transfer = async function () {
  const user = await ensureUser();
  const treasuries = await getTreasuriesForUser(user.id);

  const treasuryOptions = (selected) => treasuries.map(t =>
    `<option value="${t.id}" ${selected === t.id ? "selected" : ""}>${t.name || t.treasury_type}</option>`
  ).join("");

  const channelOpts = `
    <option value="cash">نقدي 💵</option>
    <option value="vodafone_cash">فودافون 📱</option>
    <option value="bank">بنك 🏦</option>
  `;

  openCustomModal({
    title: "🔄 تحويل",
    submitLabel: "تأكيد التحويل",
    submitClass: "btn btn-ghost",
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:14px;direction:rtl;">

        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">نوع التحويل</label>
          <select id="kt_transfer_type" onchange="khazna_transfer_type_toggle()"
            style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
            <option value="treasury_to_treasury">خزنة ← خزنة</option>
            <option value="channel_same">قناة ← قناة (نفس الخزنة)</option>
            <option value="channel_diff">قناة ← قناة (خزنتان مختلفتان)</option>
          </select>
        </div>

        <!-- SECTION: treasury to treasury -->
        <div id="kt_sec_tt">
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">من خزنة</label>
            <select id="kt_from_treasury" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
              ${treasuryOptions("")}
            </select>
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">إلى خزنة</label>
            <select id="kt_to_treasury" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
              ${treasuryOptions("")}
            </select>
          </div>
          <div>
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">القناة</label>
            <select id="kt_tt_channel" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
              ${channelOpts}
            </select>
          </div>
        </div>

        <!-- SECTION: channel to channel (same treasury) -->
        <div id="kt_sec_cs" style="display:none;">
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">الخزنة</label>
            <select id="kt_same_treasury" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
              ${treasuryOptions("")}
            </select>
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">من قناة</label>
            <select id="kt_cs_from_channel" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
              ${channelOpts}
            </select>
          </div>
          <div>
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">إلى قناة</label>
            <select id="kt_cs_to_channel" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
              ${channelOpts}
            </select>
          </div>
        </div>

        <!-- SECTION: channel to channel (different treasuries) -->
        <div id="kt_sec_cd" style="display:none;">
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">من خزنة</label>
            <select id="kt_cd_from_treasury" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
              ${treasuryOptions("")}
            </select>
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">من قناة</label>
            <select id="kt_cd_from_channel" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
              ${channelOpts}
            </select>
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">إلى خزنة</label>
            <select id="kt_cd_to_treasury" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
              ${treasuryOptions("")}
            </select>
          </div>
          <div>
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">إلى قناة</label>
            <select id="kt_cd_to_channel" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;">
              ${channelOpts}
            </select>
          </div>
        </div>

        <!-- AMOUNT (shared) -->
        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">المبلغ</label>
          <input id="kt_amount" type="number" min="0" placeholder="0.00"
            style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;" />
        </div>

        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">ملاحظة</label>
          <input id="kt_note" type="text" placeholder="اختياري..."
            style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;" />
        </div>
      </div>
    `,
    onSubmit: async () => {
      const transfer_type = document.getElementById("kt_transfer_type")?.value;
      const amount = parseFloat(document.getElementById("kt_amount")?.value || "0");
      const note = document.getElementById("kt_note")?.value?.trim() || null;
      let targetTreasuryId = null;

      if (isNaN(amount) || amount <= 0) throw new Error("أدخل مبلغ صحيح");

      if (transfer_type === "treasury_to_treasury") {
        const from_id = document.getElementById("kt_from_treasury")?.value;
        const to_id = document.getElementById("kt_to_treasury")?.value;
        const channel = document.getElementById("kt_tt_channel")?.value;

        if (!from_id || !to_id) throw new Error("اختر الخزنتين");
        if (from_id === to_id) throw new Error("لا يمكن التحويل لنفس الخزنة");

        const from = treasuries.find(t => t.id === from_id);
        if (channel === "bank" && !isFinanceManager(from)) throw new Error("البنك للمدير فقط");

        const field = getChannelField(channel);
        if (field && Number(from?.[field] || 0) < amount) throw new Error("رصيد غير كافي");

        await requirePIN();

        const res = await transferBetweenTreasuries({ from_id, to_id, channel, amount, ...(note ? { note } : {}) });
        if (!res.success) throw new Error(res.error || "فشل التحويل");
        targetTreasuryId = from_id;

      } else if (transfer_type === "channel_same") {
        const treasury_id = document.getElementById("kt_same_treasury")?.value;
        const from_channel = document.getElementById("kt_cs_from_channel")?.value;
        const to_channel = document.getElementById("kt_cs_to_channel")?.value;

        if (!treasury_id) throw new Error("اختر الخزنة");
        if (from_channel === to_channel) throw new Error("القناتان متطابقتان");

        const t = treasuries.find(x => x.id === treasury_id);
        const field = getChannelField(from_channel);
        if (field && Number(t?.[field] || 0) < amount) throw new Error("رصيد غير كافي في القناة المصدر");

        await requirePIN();

        const outRes = await addTreasuryTransaction({
          treasury_id,
          type: "transfer_out",
          channel: from_channel,
          amount,
          ...(note ? { note } : {})
        });
        if (!outRes.success) throw new Error(outRes.error || "فشل التحويل (صادر)");

        const inRes = await addTreasuryTransaction({
          treasury_id,
          type: "transfer_in",
          channel: to_channel,
          amount,
          ...(note ? { note } : {})
        });
        if (!inRes.success) throw new Error(inRes.error || "فشل التحويل (وارد)");
        targetTreasuryId = treasury_id;

      } else if (transfer_type === "channel_diff") {
        const from_id = document.getElementById("kt_cd_from_treasury")?.value;
        const from_channel = document.getElementById("kt_cd_from_channel")?.value;
        const to_id = document.getElementById("kt_cd_to_treasury")?.value;
        const to_channel = document.getElementById("kt_cd_to_channel")?.value;

        if (!from_id || !to_id) throw new Error("اختر الخزنتين");

        const from = treasuries.find(t => t.id === from_id);
        const field = getChannelField(from_channel);
        if (field && Number(from?.[field] || 0) < amount) throw new Error("رصيد غير كافي");

        await requirePIN();

        const outRes = await addTreasuryTransaction({
          treasury_id: from_id,
          type: "transfer_out",
          channel: from_channel,
          amount,
          ...(note ? { note } : {})
        });
        if (!outRes.success) throw new Error(outRes.error || "فشل التحويل (صادر)");

        const inRes = await addTreasuryTransaction({
          treasury_id: to_id,
          type: "transfer_in",
          channel: to_channel,
          amount,
          ...(note ? { note } : {})
        });
        if (!inRes.success) throw new Error(inRes.error || "فشل التحويل (وارد)");
        targetTreasuryId = from_id;
      }

      toast("تم التحويل ✅");
      document.getElementById("khazna_custom_modal")?.remove();
      if (targetTreasuryId) {
        openTreasuryDetails(targetTreasuryId);
      } else {
        navigate("khazna");
      }
    }
  });
};

window.khazna_transfer_type_toggle = function () {
  const type = document.getElementById("kt_transfer_type")?.value;
  const tt = document.getElementById("kt_sec_tt");
  const cs = document.getElementById("kt_sec_cs");
  const cd = document.getElementById("kt_sec_cd");
  if (!tt || !cs || !cd) return;
  tt.style.display = type === "treasury_to_treasury" ? "" : "none";
  cs.style.display = type === "channel_same" ? "" : "none";
  cd.style.display = type === "channel_diff" ? "" : "none";
};