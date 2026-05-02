/**
 * Market Pro – data.js FINAL v6.1 PRODUCTION (SECURED)
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://seadlwxlffbgxtxwhuis.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlYWRsd3hsZmZiZ3h0eHdodWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MjEzNTYsImV4cCI6MjA5MzA5NzM1Nn0._CtO7o-ruSpAq-w7Lri3rdbG4Zin6rI8nzFDsinR6Co';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: window.localStorage,
    persistSession: true,
    detectSessionInUrl: true,
    autoRefreshToken: true
  }
});

/* ── AUTH ───────────────────────────── */

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

export async function ensureUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("SESSION_EXPIRED");
  return user;
}

/* ── PIN ───────────────────────────── */

export async function verifyPIN(pin) {
  const saved = localStorage.getItem("app_pin") || "1234";
  return String(pin) === String(saved);
}

/* ── AUDIT ─────────────────────────── */

export async function addAuditLog(action, details = {}) {
  try {
    const user = await ensureUser();
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action,
      details,
      created_at: new Date().toISOString()
    });
  } catch {}
}

/* ════════════════════════════════════════ */
/* 🏦 TREASURY SYSTEM FINAL               */
/* ════════════════════════════════════════ */

function getField(channel) {
  if (channel === "cash") return "cash_balance";
  if (channel === "vodafone_cash") return "vodafone_balance";
  if (channel === "bank") return "bank_balance";
  return null;
}

/* ── GET TREASURIES ───────────────────── */

export async function getTreasuriesForUser(userId) {
  const { data } = await supabase
    .from("treasury_accounts")
    .select("*")
    .eq("user_id", userId);

  return data || [];
}

/* ── ADD / EXPENSE ───────────────────── */

export async function addTreasuryTransaction(params) {
  try {
    const user = await ensureUser();
    const field = getField(params.channel);

    if (!field) return { success: false, error: "قناة غير صحيحة" };

    const { data: t } = await supabase
      .from("treasury_accounts")
      .select("*")
      .eq("id", params.treasury_id)
      .eq("user_id", user.id)
      .single();

    if (!t) return { success: false, error: "الخزنة غير موجودة" };

    const current = Number(t[field] || 0);

    const newBalance =
      params.type === "income"
        ? current + Number(params.amount)
        : current - Number(params.amount);

    if (newBalance < 0) {
      return { success: false, error: "رصيد غير كافي" };
    }

    await supabase
      .from("treasury_accounts")
      .update({ [field]: newBalance })
      .eq("id", t.id)
      .eq("user_id", user.id);

    await supabase.from("treasury_transactions").insert({
      user_id: user.id,
      treasury_id: t.id,
      type: params.type,
      channel: params.channel,
      amount: Number(params.amount),
      created_at: new Date().toISOString()
    });

    return { success: true };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

/* ── TRANSFER ───────────────────────── */

export async function transferBetweenTreasuries(params) {
  try {
    const user = await ensureUser();
    const field = getField(params.channel);

    if (!field) return { success: false, error: "قناة غير صحيحة" };

    const { data: from } = await supabase
      .from("treasury_accounts")
      .select("*")
      .eq("id", params.from_id)
      .eq("user_id", user.id)
      .single();

    const { data: to } = await supabase
      .from("treasury_accounts")
      .select("*")
      .eq("id", params.to_id)
      .eq("user_id", user.id)
      .single();

    if (!from || !to) {
      return { success: false, error: "خزنة غير موجودة" };
    }

    if (Number(from[field]) < params.amount) {
      return { success: false, error: "رصيد غير كافي" };
    }

    await supabase
      .from("treasury_accounts")
      .update({ [field]: Number(from[field]) - params.amount })
      .eq("id", from.id)
      .eq("user_id", user.id);

    await supabase
      .from("treasury_accounts")
      .update({ [field]: Number(to[field]) + params.amount })
      .eq("id", to.id)
      .eq("user_id", user.id);

    await supabase.from("treasury_transactions").insert([
      {
        user_id: user.id,
        treasury_id: from.id,
        type: "transfer",
        channel: params.channel,
        amount: -params.amount
      },
      {
        user_id: user.id,
        treasury_id: to.id,
        type: "transfer",
        channel: params.channel,
        amount: params.amount
      }
    ]);

    return { success: true };

  } catch (err) {
    return { success: false, error: err.message };
  }
}
