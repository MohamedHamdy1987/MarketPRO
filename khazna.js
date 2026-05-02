import {
  supabase,
  addAuditLog,
  ensureUser,
  verifyPIN
} from "../data.js";

import {
  toast,
  inputModal,
  confirmModal,
  formatCurrency
} from "../ui.js";

/* ───────────────────────────────────────────── */
/* CONFIG */
/* ───────────────────────────────────────────── */

const TREASURIES = [
  { value: "financial_manager", label: "المدير المالي" },
  { value: "cashier_1", label: "محاسب 1" },
  { value: "cashier_2", label: "محاسب 2" },
  { value: "cashier_3", label: "محاسب 3" }
];

const BALANCE_TYPES = [
  { value: "cash", label: "كاش" },
  { value: "vodafone", label: "فودافون" },
  { value: "bank", label: "بنك" }
];

/* ───────────────────────────────────────────── */
/* SECURITY */
/* ───────────────────────────────────────────── */

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

/* ───────────────────────────────────────────── */
/* FETCH TREASURIES */
/* ───────────────────────────────────────────── */

async function getTreasuries(userId) {
  const { data } = await supabase
    .from("treasury_accounts")
    .select("*")
    .eq("user_id", userId);

  return data || [];
}

/* ───────────────────────────────────────────── */
/* MAIN PAGE */
/* ───────────────────────────────────────────── */

export async function renderKhaznaPage(app) {
  const user = await ensureUser();
  const treasuries = await getTreasuries(user.id);

  app.innerHTML = `
    <div class="page-header">
      <div class="page-title">💰 الخزنة</div>
      <div class="page-actions">
        <button class="btn" onclick="openAddMoney()">➕ إضافة</button>
        <button class="btn btn-warning" onclick="openWithdraw()">➖ سحب</button>
        <button class="btn btn-ghost" onclick="openTransfer()">🔄 تحويل</button>
      </div>
    </div>

    <div class="treasury-grid">
      ${treasuries.map(t => `
        <div class="card">
          <div style="font-weight:700">${t.name}</div>
          <div style="margin-top:8px;">💵 ${formatCurrency(t.cash_balance)}</div>
          <div>📱 ${formatCurrency(t.vodafone_balance)}</div>
          <div>🏦 ${formatCurrency(t.bank_balance || 0)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

/* ───────────────────────────────────────────── */
/* ADD MONEY */
/* ───────────────────────────────────────────── */

window.openAddMoney = function () {
  inputModal({
    title: "➕ إضافة رصيد",
    fields: [
      { id: "amount", label: "المبلغ", type: "number", required: true },
      { id: "type", label: "نوع الرصيد", type: "select", options: BALANCE_TYPES },
      { id: "treasury", label: "الخزنة", type: "select", options: TREASURIES }
    ],
    submitLabel: "إضافة",
    onSubmit: async (vals) => {
      if (vals.amount <= 0) throw new Error("أدخل مبلغ صحيح");

      await requirePIN();
      const user = await ensureUser();

      const { data: t } = await supabase
        .from("treasury_accounts")
        .select("*")
        .eq("user_id", user.id)
        .eq("treasury_type", vals.treasury)
        .single();

      const field = vals.type + "_balance";

      await supabase.from("treasury_accounts").update({
        [field]: Number(t[field] || 0) + Number(vals.amount)
      }).eq("id", t.id);

      await addAuditLog("khazna_add", vals);

      toast("تمت الإضافة ✅", "success");
      closeModal();
      navigate("khazna");
    }
  });
};

/* ───────────────────────────────────────────── */
/* WITHDRAW */
/* ───────────────────────────────────────────── */

window.openWithdraw = function () {
  inputModal({
    title: "➖ سحب",
    fields: [
      { id: "amount", label: "المبلغ", type: "number", required: true },
      { id: "type", label: "نوع الرصيد", type: "select", options: BALANCE_TYPES },
      { id: "treasury", label: "الخزنة", type: "select", options: TREASURIES }
    ],
    submitLabel: "سحب",
    onSubmit: async (vals) => {
      if (vals.amount <= 0) throw new Error("أدخل مبلغ صحيح");

      await requirePIN();
      const user = await ensureUser();

      const { data: t } = await supabase
        .from("treasury_accounts")
        .select("*")
        .eq("user_id", user.id)
        .eq("treasury_type", vals.treasury)
        .single();

      const field = vals.type + "_balance";

      if (Number(t[field]) < vals.amount) {
        throw new Error("رصيد غير كافي");
      }

      await supabase.from("treasury_accounts").update({
        [field]: Number(t[field]) - Number(vals.amount)
      }).eq("id", t.id);

      await addAuditLog("khazna_withdraw", vals);

      toast("تم السحب ✅", "success");
      closeModal();
      navigate("khazna");
    }
  });
};

/* ───────────────────────────────────────────── */
/* TRANSFER (SAFE) */
/* ───────────────────────────────────────────── */

window.openTransfer = function () {
  inputModal({
    title: "🔄 تحويل",
    fields: [
      { id: "amount", label: "المبلغ", type: "number", required: true },
      { id: "type", label: "نوع الرصيد", type: "select", options: BALANCE_TYPES },
      { id: "from", label: "من خزنة", type: "select", options: TREASURIES },
      { id: "to", label: "إلى خزنة", type: "select", options: TREASURIES }
    ],
    submitLabel: "تحويل",
    onSubmit: async (vals) => {

      if (vals.from === vals.to) throw new Error("لا يمكن التحويل لنفس الخزنة");
      if (vals.amount <= 0) throw new Error("أدخل مبلغ صحيح");

      await requirePIN();
      const user = await ensureUser();

      const { data: from } = await supabase
        .from("treasury_accounts")
        .select("*")
        .eq("user_id", user.id)
        .eq("treasury_type", vals.from)
        .single();

      const { data: to } = await supabase
        .from("treasury_accounts")
        .select("*")
        .eq("user_id", user.id)
        .eq("treasury_type", vals.to)
        .single();

      const field = vals.type + "_balance";

      if (Number(from[field]) < vals.amount) {
        throw new Error("رصيد غير كافي");
      }

      /* SAFE UPDATE */
      await supabase.from("treasury_accounts")
        .update({ [field]: Number(from[field]) - Number(vals.amount) })
        .eq("id", from.id);

      await supabase.from("treasury_accounts")
        .update({ [field]: Number(to[field]) + Number(vals.amount) })
        .eq("id", to.id);

      await addAuditLog("khazna_transfer", vals);

      toast("تم التحويل ✅", "success");
      closeModal();
      navigate("khazna");
    }
  });
};