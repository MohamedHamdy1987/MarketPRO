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

/* ───────── helpers ───────── */

function isFinanceManager(t) {
  return t?.treasury_type === "financial_manager";
}

function getChannelField(channel) {
  if (channel === "cash") return "cash_balance";
  if (channel === "vodafone_cash") return "vodafone_balance";
  if (channel === "bank") return "bank_balance";
  return null;
}

/* ───────── PIN ───────── */

async function requirePIN() {
  return new Promise((resolve) => {
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

/* ───────── MAIN PAGE ───────── */

export async function renderKhaznaPage(app) {
  const user = await ensureUser();
  const treasuries = await getTreasuriesForUser(user.id);

  app.innerHTML = `
    <div class="page-header">
      <div class="page-title">💰 الخزنة</div>
    </div>

    <div class="grid-2">
      ${treasuries.map(t => `
        <div class="card treasury-card" onclick="openTreasuryDetails('${t.id}')">
          <div style="font-weight:700;margin-bottom:10px;">
            ${t.name || t.treasury_type}
          </div>

          <div>💵 نقدي: ${formatCurrency(t.cash_balance)}</div>
          <div>📱 فودافون: ${formatCurrency(t.vodafone_balance)}</div>
          ${isFinanceManager(t) ? `<div>🏦 بنك: ${formatCurrency(t.bank_balance || 0)}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

/* ───────── DETAILS PAGE ───────── */

window.openTreasuryDetails = async function (treasuryId) {
  const { data: treasury } = await supabase
    .from("treasury_accounts")
    .select("*")
    .eq("id", treasuryId)
    .single();

  const { data: transactions } = await supabase
    .from("treasury_transactions")
    .select("*")
    .eq("treasury_id", treasuryId)
    .order("created_at", { ascending: false });

  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="page-header">
      <div class="page-title">🏦 ${treasury.name}</div>

      <div class="page-actions">
        <button class="btn" onclick="khazna_income('${treasury.id}')">➕ تحصيل</button>
        <button class="btn btn-warning" onclick="khazna_expense('${treasury.id}')">➖ مصروف</button>
        <button class="btn btn-ghost" onclick="khazna_transfer('${treasury.id}')">🔄 تحويل</button>
      </div>

      <button class="btn" onclick="navigate('khazna')">⬅ رجوع</button>
    </div>

    <div class="card" style="margin-top:16px;">
      <div>💵 نقدي: ${formatCurrency(treasury.cash_balance || 0)}</div>
      <div>📱 فودافون: ${formatCurrency(treasury.vodafone_balance || 0)}</div>
      <div>🏦 بنك: ${formatCurrency(treasury.bank_balance || 0)}</div>
    </div>

    <div class="card" style="margin-top:16px;">
      <div style="font-weight:700;margin-bottom:10px;">📋 العمليات</div>
      ${
        transactions?.length
          ? transactions.map(tx => `
            <div style="padding:8px;border-bottom:1px solid #eee;">
              ${tx.type} - ${tx.channel} - ${formatCurrency(tx.amount)}
            </div>
          `).join("")
          : `<div style="text-align:center;color:#888;">لا توجد عمليات</div>`
      }
    </div>
  `;
};

/* ───────── INCOME ───────── */

window.khazna_income = async function (treasuryId) {
    const { data: customers } = await supabase
  .from("customers")
  .select("id,name");
  inputModal({
    title: "➕ إضافة رصيد",
    fields: [
  {
    id: "customer_id",
    label: "العميل",
    type: "select",
    options: customers.map(c => ({
      value: c.id,
      label: c.name
    })),
    required: true
  },
  {
    id: "channel",
    label: "القناة",
    type: "select",
    options: [
      { value: "cash", label: "نقدي" },
      { value: "vodafone_cash", label: "فودافون" },
      { value: "bank", label: "بنك" }
    ],
    required: true
  },
  {
    id: "amount",
    label: "المبلغ",
    type: "number",
    required: true
  }
]
    onSubmit: async (vals) => {

      if (vals.amount <= 0) throw new Error("أدخل مبلغ صحيح");

      await requirePIN();

     const res = await addTreasuryTransaction({
  treasury_id: treasuryId,
  type: "income",
  channel: vals.channel,
  amount: vals.amount,
  customer_id: vals.customer_id
});
      if (!res.success) throw new Error(res.error || "فشل العملية");

      toast("تمت الإضافة ✅");
      closeModal();
      openTreasuryDetails(treasuryId);
    }
  });
};

/* ───────── EXPENSE ───────── */

window.khazna_expense = async function (treasuryId) {
  inputModal({
    title: "➖ سحب",
    fields: [
      { id: "channel", label: "القناة", type: "select", options: [
        { value: "cash", label: "نقدي" },
        { value: "vodafone_cash", label: "فودافون" },
        { value: "bank", label: "بنك" }
      ], required: true },
      { id: "amount", label: "المبلغ", type: "number", required: true }
    ],
    onSubmit: async (vals) => {

      await requirePIN();

      const res = await addTreasuryTransaction({
        treasury_id: treasuryId,
        type: "expense",
        channel: vals.channel,
        amount: vals.amount
      });

      if (!res.success) throw new Error(res.error || "فشل العملية");

      toast("تم السحب ✅");
      closeModal();
      openTreasuryDetails(treasuryId);
    }
  });
};

/* ───────── TRANSFER ───────── */

window.khazna_transfer = async function (fromId) {
  const user = await ensureUser();
  const treasuries = await getTreasuriesForUser(user.id);

  inputModal({
    title: "🔄 تحويل",
    fields: [
      { id: "to_id", label: "إلى", type: "select", options: treasuries.map(t => ({
        value: t.id,
        label: t.name || t.treasury_type
      })), required: true },
      { id: "channel", label: "القناة", type: "select", options: [
        { value: "cash", label: "نقدي" },
        { value: "vodafone_cash", label: "فودافون" },
        { value: "bank", label: "بنك" }
      ], required: true },
      { id: "amount", label: "المبلغ", type: "number", required: true }
    ],
    onSubmit: async (vals) => {

      if (fromId === vals.to_id) {
        throw new Error("لا يمكن التحويل لنفس الخزنة");
      }

      await requirePIN();

      const res = await transferBetweenTreasuries({
        from_id: fromId,
        to_id: vals.to_id,
        channel: vals.channel,
        amount: vals.amount
      });

      if (!res.success) throw new Error(res.error || "فشل التحويل");

      toast("تم التحويل ✅");
      closeModal();
      openTreasuryDetails(fromId);
    }
  });
};
