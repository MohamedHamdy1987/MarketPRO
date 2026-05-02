/**
 * Market Pro – data.js FINAL v6.0 Production
 * Stable, secure, and includes all required helper functions.
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
    const payload = { ...data, user_id: user.id };
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
    await supabase.from('audit_logs').insert({ user_id: user.id, action, details, created_at: new Date().toISOString() });
  } catch (err) { console.error('[audit]', err.message); }
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
        const payload = { ...step.data, user_id: user.id };
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
