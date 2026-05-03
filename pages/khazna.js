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
  formatCurrency
} from "../ui.js";

/* ───────────────── HELPERS ───────────────── */

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
  return new Promise((resolve) => {
    const pin = prompt("أدخل الرقم السري");
    verifyPIN(pin).then(ok => {
      if (!ok) {
        toast("❌ الرقم السري غير صحيح", "error");
        return;
      }
      resolve(true);
    });
  });
}

/* ───────────────── MAIN PAGE ───────────────── */

export async function renderKhaznaPage(app) {
  const user = await ensureUser();
  const treasuries = await getTreasuriesForUser(user.id);

  app.innerHTML = `
    <div class="page-header">
      <div class="page-title">💰 الخزنة</div>
    </div>

    <div class="grid-2">
      ${treasuries.map(t => `
        <div class="card" onclick="openTreasuryDetails('${t.id}')" style="cursor:pointer;">
          <div style="font-weight:700;margin-bottom:10px;">
            ${t.name || t.treasury_type}
          </div>
          <div>💵 ${formatCurrency(t.cash_balance)}</div>
          <div>📱 ${formatCurrency(t.vodafone_balance)}</div>
          ${isFinanceManager(t) ? `<div>🏦 ${formatCurrency(t.bank_balance || 0)}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

/* ───────────────── DETAILS PAGE ───────────────── */

window.openTreasuryDetails = async function (treasuryId) {
  const user = await ensureUser();

  const { data: treasury } = await supabase
    .from("treasury_accounts")
    .select("*")
    .eq("id", treasuryId)
    .eq("user_id", user.id)
    .single();

  const { data: transactions } = await supabase
    .from("treasury_transactions")
    .select("*")
    .eq("treasury_id", treasuryId)
    .order("created_at", { ascending: false });

  const income = (transactions || []).filter(t => t.type === "income");
  const expense = (transactions || []).filter(t => t.type === "expense");

  const totalIncome = income.reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalExpense = expense.reduce((s, t) => s + Number(t.amount || 0), 0);

  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="page-header">
      <div class="page-title">${treasury.name}</div>
      <button onclick="navigate('khazna')">⬅</button>
    </div>

    <div style="display:flex;gap:10px;margin:10px 0;">
      <div style="color:blue;">تحصيل: ${formatCurrency(totalIncome)}</div>
      <div style="color:red;">مصروف: ${formatCurrency(totalExpense)}</div>
      <div>صافي: ${formatCurrency(totalIncome - totalExpense)}</div>
    </div>

    <div style="display:flex;gap:10px;">
      
      <div style="flex:1;background:#e3f2fd;padding:10px;border-radius:8px;">
        <button onclick="khazna_income('${treasuryId}')">➕ تحصيل</button>
        ${income.map(t => `<div>${formatCurrency(t.amount)}</div>`).join("")}
      </div>

      <div style="flex:1;background:#ffebee;padding:10px;border-radius:8px;">
        <button onclick="khazna_expense('${treasuryId}')">➖ مصروف</button>
        ${expense.map(t => `<div>${formatCurrency(t.amount)}</div>`).join("")}
      </div>

    </div>
  `;
};

/* ───────────────── INCOME ───────────────── */

window.khazna_income = async function (treasuryId) {
  const amount = prompt("المبلغ");
  if (!amount || amount <= 0) return;

  await requirePIN();

  const res = await addTreasuryTransaction({
    treasury_id: treasuryId,
    type: "income",
    channel: "cash",
    amount: Number(amount)
  });

  if (!res.success) return toast(res.error, "error");

  toast("تم التحصيل ✅");
  openTreasuryDetails(treasuryId);
};

/* ───────────────── EXPENSE ───────────────── */

window.khazna_expense = async function (treasuryId) {
  const amount = prompt("المبلغ");
  if (!amount || amount <= 0) return;

  await requirePIN();

  const res = await addTreasuryTransaction({
    treasury_id: treasuryId,
    type: "expense",
    channel: "cash",
    amount: Number(amount)
  });

  if (!res.success) return toast(res.error, "error");

  toast("تم الصرف ✅");
  openTreasuryDetails(treasuryId);
};
