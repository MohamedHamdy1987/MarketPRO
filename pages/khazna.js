import {
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

/* ───────────────── PAGE ───────────────── */

export async function renderKhaznaPage(app) {
  const user = await ensureUser();
  const treasuries = await getTreasuriesForUser(user.id);

  app.innerHTML = `
    <div class="page-header">
      <div class="page-title">💰 الخزنة</div>
      <div class="page-actions">
        <button class="btn" onclick="khazna_income()">➕ تحصيل</button>
        <button class="btn btn-warning" onclick="khazna_expense()">➖ مصروف</button>
        <button class="btn btn-ghost" onclick="khazna_transfer()">🔄 تحويل</button>
      </div>
    </div>

    <div class="grid-2">
      ${treasuries.map(t => {
        const isFM = isFinanceManager(t);
        return `
          <div class="card">
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

/* ───────────────── INCOME ───────────────── */

window.khazna_income = async function () {
  const user = await ensureUser();
  const treasuries = await getTreasuriesForUser(user.id);

  inputModal({
    title: "➕ إضافة رصيد",
    fields: [
      { id: "treasury_id", label: "الخزنة", type: "select", options: treasuries.map(t => ({ value: t.id, label: t.name || t.treasury_type })), required: true },
      { id: "channel", label: "القناة", type: "select", options: [
        { value: "cash", label: "نقدي" },
        { value: "vodafone_cash", label: "فودافون" },
        { value: "bank", label: "بنك" }
      ], required: true },
      { id: "amount", label: "المبلغ", type: "number", required: true }
    ],
    onSubmit: async (vals) => {

      if (vals.amount <= 0) throw new Error("أدخل مبلغ صحيح");

      const t = treasuries.find(x => x.id === vals.treasury_id);
      if (!t) throw new Error("الخزنة غير موجودة");

      if (vals.channel === "bank" && !isFinanceManager(t)) {
        throw new Error("البنك للمدير فقط");
      }

      await requirePIN();

      const res = await addTreasuryTransaction({
        treasury_id: vals.treasury_id,
        type: "income",
        channel: vals.channel,
        amount: vals.amount
      });

      if (!res.success) throw new Error(res.error || "فشل العملية");

      toast("تمت الإضافة ✅");
      closeModal();
      navigate("khazna");
    }
  });
};

/* ───────────────── EXPENSE ───────────────── */

window.khazna_expense = async function () {
  const user = await ensureUser();
  const treasuries = await getTreasuriesForUser(user.id);

  inputModal({
    title: "➖ سحب",
    fields: [
      { id: "treasury_id", label: "الخزنة", type: "select", options: treasuries.map(t => ({ value: t.id, label: t.name || t.treasury_type })), required: true },
      { id: "channel", label: "القناة", type: "select", options: [
        { value: "cash", label: "نقدي" },
        { value: "vodafone_cash", label: "فودافون" },
        { value: "bank", label: "بنك" }
      ], required: true },
      { id: "amount", label: "المبلغ", type: "number", required: true }
    ],
    onSubmit: async (vals) => {

      const t = treasuries.find(x => x.id === vals.treasury_id);
      if (!t) throw new Error("الخزنة غير موجودة");

      const field = getChannelField(vals.channel);
      if (Number(t[field] || 0) < vals.amount) {
        throw new Error("رصيد غير كافي");
      }

      if (vals.channel === "bank" && !isFinanceManager(t)) {
        throw new Error("البنك للمدير فقط");
      }

      await requirePIN();

      const res = await addTreasuryTransaction({
        treasury_id: vals.treasury_id,
        type: "expense",
        channel: vals.channel,
        amount: vals.amount
      });

      if (!res.success) throw new Error(res.error || "فشل العملية");

      toast("تم السحب ✅");
      closeModal();
      navigate("khazna");
    }
  });
};

/* ───────────────── TRANSFER ───────────────── */

window.khazna_transfer = async function () {
  const user = await ensureUser();
  const treasuries = await getTreasuriesForUser(user.id);

  inputModal({
    title: "🔄 تحويل",
    fields: [
      { id: "from_id", label: "من", type: "select", options: treasuries.map(t => ({ value: t.id, label: t.name || t.treasury_type })), required: true },
      { id: "to_id", label: "إلى", type: "select", options: treasuries.map(t => ({ value: t.id, label: t.name || t.treasury_type })), required: true },
      { id: "channel", label: "القناة", type: "select", options: [
        { value: "cash", label: "نقدي" },
        { value: "vodafone_cash", label: "فودافون" },
        { value: "bank", label: "بنك" }
      ], required: true },
      { id: "amount", label: "المبلغ", type: "number", required: true }
    ],
    onSubmit: async (vals) => {

      if (vals.from_id === vals.to_id) {
        throw new Error("لا يمكن التحويل لنفس الخزنة");
      }

      const from = treasuries.find(t => t.id === vals.from_id);
      const to = treasuries.find(t => t.id === vals.to_id);

      if (!from || !to) throw new Error("خزنة غير موجودة");

      if (vals.channel === "bank" && !isFinanceManager(from)) {
        throw new Error("البنك للمدير فقط");
      }

      const field = getChannelField(vals.channel);
      if (Number(from[field] || 0) < vals.amount) {
        throw new Error("رصيد غير كافي");
      }

      await requirePIN();

      const res = await transferBetweenTreasuries({
        from_id: vals.from_id,
        to_id: vals.to_id,
        channel: vals.channel,
        amount: vals.amount
      });

      if (!res.success) throw new Error(res.error || "فشل التحويل");

      toast("تم التحويل ✅");
      closeModal();
      navigate("khazna");
    }
  });
};
