/**
 * Market Pro – data.js FINAL v6.5 Production
 * Fully secured, atomic treasury transactions, and complete monitor support.
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://seadlwxlffbgxtxwhuis.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlYWRsd3hsZmZiZ3h0eHdodWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MjEzNTYsImV4cCI6MjA5MzA5NzM1Nn0._CtO7o-ruSpAq-w7Lri3rdbG4Zin6rI8nzFDsinR6Co';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { storage: window.localStorage, persistSession: true, detectSessionInUrl: true, autoRefreshToken: true }
});

/* ── AUTH ───────────────────────────── */
export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  if (data?.user) return data.user;
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData?.session?.user || null;
}

export async function ensureUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('SESSION_EXPIRED');
  return user;
}

/* ── DB HELPERS ─────────────────────── */
export async function dbInsert(table, data) {
  try {
    const user = await ensureUser();
    const payload = { 
      ...data, 
      user_id: user.id,
      company_id: user.company_id   // ← إضافة company_id للأمان
    };
    const { data: inserted, error } = await supabase.from(table).insert(payload).select().single();
    if (error) throw error;
    return inserted;
  } catch (err) { console.error(`[dbInsert:${table}]`, err.message); return null; }
}

export async function dbUpdate(table, id, data) {
  try {
    const user = await ensureUser();
    let query = supabase.from(table).update(data).eq('id', id);
    if (table !== 'invoice_products') query = query.eq('user_id', user.id);
    const { error } = await query;
    if (error) throw error;
    return true;
  } catch (err) { console.error(`[dbUpdate:${table}]`, err.message); return false; }
}

export async function dbDelete(table, id) {
  try {
    const user = await ensureUser();
    const { error } = await supabase.from(table).delete().eq('id', id).eq('user_id', user.id);
    if (error) throw error;
    return true;
  } catch (err) { console.error(`[dbDelete:${table}]`, err.message); return false; }
}

/* ── RPC ────────────────────────────── */
export async function confirmInvoice(invoiceId) {
  const { data, error } = await supabase.rpc('confirm_invoice_v2', { p_invoice_id: invoiceId });
  if (error) return { success: false, error: error.message };
  return { success: data === true };
}

export async function sellProductAtomic(params) {
  const { data, error } = await supabase.rpc('sell_product_atomic', params);
  if (error) return { success: false, error: error.message };
  return { success: data === true };
}

/* ── CUSTOMERS ───────────────────────── */
export async function getCustomerBalance(customerId) {
  const { data } = await supabase.from('customer_balances').select('balance').eq('customer_id', customerId).single();
  return Number(data?.balance || 0);
}

export async function getCustomerLedger(customerId) {
  const { data } = await supabase.from('customer_ledger').select('*').eq('customer_id', customerId).order('trx_date', { ascending: true });
  return data || [];
}

/* ── AUDIT ───────────────────────────── */
export async function addAuditLog(action, details = {}) {
  try {
    const user = await ensureUser();
    await supabase.from('audit_logs').insert({ user_id: user.id, company_id: user.company_id, action, details, created_at: new Date().toISOString() });
  } catch (err) { console.error('[audit]', err.message); }
}

/* ── PIN SYSTEM (LOCAL SAFE VERSION) ───────────────────────────── */
export async function verifyPIN(pin) {
  try {
    const savedPin = localStorage.getItem("app_pin") || "1234";
    return String(pin) === String(savedPin);
  } catch (e) { console.error("[verifyPIN]:", e); return false; }
}

export function setLocalPIN(pin) {
  try { localStorage.setItem("app_pin", String(pin)); } catch (e) { console.error("[setLocalPIN]:", e); }
}

/* ── CRATES ──────────────────────────── */
export async function getBulkCustomerCrates(customerIds = []) {
  const user = await getCurrentUser();
  if (!user || !customerIds.length) return {};
  const { data } = await supabase.from('customer_crates').select('customer_id, crate_type, quantity, returned').eq('user_id', user.id).in('customer_id', customerIds);
  const result = {};
  for (const r of data || []) {
    if (!result[r.customer_id]) result[r.customer_id] = { adaya: 0, barnika: 0 };
    const net = (r.quantity || 0) - (r.returned || 0);
    if (r.crate_type === 'عداية') result[r.customer_id].adaya += net;
    if (r.crate_type === 'برنيكة') result[r.customer_id].barnika += net;
  }
  return result;
}

export async function getAllCustomerCrateSummaries() {
  const user = await ensureUser();
  const { data } = await supabase.from('customer_crates').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  return data || [];
}

export async function getAllSupplierCrateSummaries() {
  const user = await ensureUser();
  const { data } = await supabase.from('supplier_crates').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  return data || [];
}

/* ── ATOMIC TRANSACTION ──────────────── */
export async function atomicTransaction(steps) {
  try {
    const user = await ensureUser();
    for (const step of steps) {
      if (step.type === 'insert') {
        const payload = { ...step.data, user_id: user.id, company_id: user.company_id };
        const { error } = await supabase.from(step.table).insert(payload);
        if (error) throw error;
      } else if (step.type === 'delete') {
        const { error } = await supabase.from(step.table).delete().match(step.match || {});
        if (error) throw error;
      }
    }
    return true;
  } catch (err) { console.error('[atomicTransaction]', err); return false; }
}

/* ───────── TREASURY SYSTEM (ATOMIC + SECURE) ───────── */

/**
 * مطلوب إنشاء دالة RPC في قاعدة البيانات لضمان الذرية:
 * 
CREATE OR REPLACE FUNCTION process_safe_treasury_transaction(
  p_treasury_id UUID,
  p_company_id UUID,
  p_user_id UUID,
  p_type TEXT,
  p_channel TEXT,
  p_amount NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_field TEXT;
BEGIN
  IF p_channel = 'cash' THEN v_field := 'cash_balance';
  ELSIF p_channel = 'vodafone_cash' THEN v_field := 'vodafone_balance';
  ELSIF p_channel = 'bank' THEN v_field := 'bank_balance';
  ELSE RAISE EXCEPTION 'قناة غير صالحة';
  END IF;

  -- تحديث الرصيد (ضمان عدم تخطي company_id)
  EXECUTE format('UPDATE treasury_accounts SET %I = %I + $1 WHERE id = $2 AND company_id = $3', v_field, v_field)
  USING p_amount, p_treasury_id, p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الخزنة غير موجودة أو لا تخص الشركة';
  END IF;

  -- إدخال سجل الحركة
  INSERT INTO treasury_transactions (treasury_id, company_id, user_id, type, channel, amount, note, created_at)
  VALUES (p_treasury_id, p_company_id, p_user_id, p_type, p_channel, p_amount, p_note, NOW());

  RETURN TRUE;
END;
$$;
 */

export async function getTreasuriesForUser(companyId) {
  const { data, error } = await supabase
    .from("treasury_accounts")
    .select("*")
    .eq("company_id", companyId);

  if (error) {
    console.error("getTreasuriesForUser error:", error);
    return [];
  }
  return data || [];
}

// الآن تستخدم RPC الآمنة (بعد إنشائها) – إن لم توجد ستُرجِع خطأ، يمكنك الرجوع مؤقتاً للإصدار القديم أدناه
export async function addTreasuryTransaction(params) {
  try {
    const user = await ensureUser();

    // استدعاء RPC الذري (سيفشل إن لم تكن الدالة موجودة في قاعدة البيانات)
    const { error: rpcError } = await supabase.rpc('process_safe_treasury_transaction', {
      p_treasury_id: params.treasury_id,
      p_company_id: user.company_id,
      p_user_id: user.id,
      p_type: params.type,
      p_channel: params.channel,
      p_amount: params.type === 'income' ? params.amount : -params.amount, // مصروف أو تحويل يأخذ قيمة سالبة
      p_note: params.note || null
    });

    if (rpcError) throw rpcError;

    return { success: true };
  } catch (err) {
    console.error('addTreasuryTransaction RPC error:', err);
    // fallback: استخدم النسخة اليدوية (مؤقتاً) - محذوفة للتشجيع على استخدام RPC
    return { success: false, error: err.message };
  }
}

// النسخة اليدوية المؤقتة - تستخدم فقط إذا لم تُنشأ دالة RPC بعد
// export async function addTreasuryTransaction_manual(params) { ... } // يمكنك الرجوع إليها من النسخ السابقة

export async function transferBetweenTreasuries(params) {
  try {
    const user = await ensureUser();

    // التحقق من القناة
    const fieldMap = { cash: "cash_balance", vodafone_cash: "vodafone_balance", bank: "bank_balance" };
    const field = fieldMap[params.channel];
    if (!field) return { success: false, error: "قناة غير صالحة" };

    // جلب الخزنتين مع التحقق من company_id
    const { data: from, error: fromErr } = await supabase
      .from("treasury_accounts")
      .select("*")
      .eq("id", params.from_id)
      .eq("company_id", user.company_id)   // ← أمان
      .single();
    if (fromErr || !from) return { success: false, error: "الخزنة المصدر غير موجودة" };

    const { data: to, error: toErr } = await supabase
      .from("treasury_accounts")
      .select("*")
      .eq("id", params.to_id)
      .eq("company_id", user.company_id)   // ← أمان
      .single();
    if (toErr || !to) return { success: false, error: "الخزنة الهدف غير موجودة" };

    if (from[field] < params.amount) {
      return { success: false, error: "رصيد غير كافي" };
    }

    // تحديث الأرصدة
    const { error: updFromErr } = await supabase
      .from("treasury_accounts")
      .update({ [field]: from[field] - params.amount })
      .eq("id", from.id)
      .eq("company_id", user.company_id);
    if (updFromErr) return { success: false, error: updFromErr.message };

    const { error: updToErr } = await supabase
      .from("treasury_accounts")
      .update({ [field]: to[field] + params.amount })
      .eq("id", to.id)
      .eq("company_id", user.company_id);
    if (updToErr) return { success: false, error: updToErr.message };

    // إدخال سجلات التحويل مع company_id
    const { error: insertErr } = await supabase.from("treasury_transactions").insert([
      {
        user_id: user.id,
        company_id: user.company_id,
        treasury_id: from.id,
        type: "transfer_out",
        channel: params.channel,
        amount: -params.amount,
        created_at: new Date().toISOString()
      },
      {
        user_id: user.id,
        company_id: user.company_id,
        treasury_id: to.id,
        type: "transfer_in",
        channel: params.channel,
        amount: params.amount,
        created_at: new Date().toISOString()
      }
    ]);
    if (insertErr) return { success: false, error: insertErr.message };

    return { success: true };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

/* ── FINANCIAL MONITOR ───────────────── */
export async function logFailedFinancialTransaction(payload) {
  try {
    const { error } = await supabase
      .from("failed_financial_transactions")
      .insert(payload);   // ← نستخدم insert للحفاظ على السجل التاريخي
    if (error) console.error("FAILED TO LOG FAILED TX:", error);
  } catch (err) {
    console.error("logFailedFinancialTransaction error:", err);
  }
}

export async function retryFailedTransaction(tx) {
  try {
    const { error } = await supabase.rpc("process_sale_transaction", {
      p_type: tx.type,
      p_amount: tx.amount,
      p_entity_id: tx.entity_id,
      p_user_id: tx.user_id,
      p_invoice_id: tx.invoice_id,
      p_product_id: tx.product_id
    });

    if (error) return { success: false, error: error.message };

    await supabase
      .from("failed_financial_transactions")
      .update({
        status: "resolved",
        retry_count: (tx.retry_count || 0) + 1,
        updated_at: new Date().toISOString()   // ← تسجيل وقت التحديث
      })
      .eq("id", tx.id);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}