/**
 * Market Pro – data.js  v5.1 Supernova
 * Database abstraction layer with enhanced error handling, bulk operations,
 * and full support for the double-entry ledger and reconciliation engine.
 *
 * ✅ FIXED: Uses the real Supabase anon key (replace if needed for other projects)
 * ✅ NEW: dbUpsert function for idempotent inserts
 * ✅ NEW: getBulkCustomerCrates to fix N+1 queries
 * ✅ IMPROVED: Better error messages and logging
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

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  if (!data?.user) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user) return sessionData.session.user;
    return null;
  }
  return data.user;
}

export async function ensureUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('SESSION_EXPIRED');
  return user;
}

export async function dbInsert(table, data) {
  const user = await getCurrentUser();
  if (!user) return null;
  const payload = { ...data, user_id: user.id };
  const { data: inserted, error } = await supabase
    .from(table)
    .insert(payload)
    .select()
    .single();
  if (error) {
    console.error(`[dbInsert] ${table}:`, error.message);
    return null;
  }
  return inserted;
}

export async function dbUpdate(table, id, data) {
  const user = await getCurrentUser();
  if (!user) return false;
  let query = supabase.from(table).update(data).eq('id', id);
  // invoice_products does not have user_id column, skip that filter
  if (table !== 'invoice_products') {
    query = query.eq('user_id', user.id);
  }
  const { error } = await query;
  if (error) {
    console.error(`[dbUpdate] ${table}:`, error.message);
    return false;
  }
  return true;
}

export async function dbDelete(table, id) {
  const user = await getCurrentUser();
  if (!user) return false;
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) {
    console.error(`[dbDelete] ${table}:`, error.message);
    return false;
  }
  return true;
}

/**
 * ✅ NEW: Upsert operation for idempotent inserts.
 * Uses onConflict to update if exists.
 */
export async function dbUpsert(table, data, onConflict = 'id') {
  const user = await getCurrentUser();
  if (!user) return null;
  const payload = { ...data, user_id: user.id };
  const { data: result, error } = await supabase
    .from(table)
    .upsert(payload, { onConflict })
    .select()
    .single();
  if (error) {
    console.error(`[dbUpsert] ${table}:`, error.message);
    return null;
  }
  return result;
}

/* ── confirm invoice ─────────────────────────────────────── */
export async function confirmInvoice(invoiceId) {
  const { data, error } = await supabase.rpc('confirm_invoice_v2', { p_invoice_id: invoiceId });
  if (error) {
    console.error('[confirmInvoice]:', error.message);
    return { success: false, error: error.message };
  }
  return { success: data === true, data };
}

/* ── sell product atomic ─────────────────────────────────── */
export async function sellProductAtomic(params) {
  const { data, error } = await supabase.rpc('sell_product_atomic', params);
  if (error) {
    console.error('[sellProductAtomic]:', error.message);
    return { success: false, error: error.message };
  }
  return { success: data === true, data };
}

export async function getCustomerBalance(customerId) {
  const { data, error } = await supabase
    .from('customer_balances')
    .select('balance')
    .eq('customer_id', customerId)
    .single();
  if (error) return 0;
  return data?.balance || 0;
}

export async function getCustomerLedger(customerId) {
  const { data, error } = await supabase
    .from('customer_ledger')
    .select('*')
    .eq('customer_id', customerId)
    .order('trx_date', { ascending: true });
  if (error) return [];
  return data || [];
}

export async function addAuditLog(action, details = {}) {
  const user = await getCurrentUser();
  if (!user) return;
  const { error } = await supabase.from('audit_logs').insert({
    user_id: user.id,
    action,
    details,
    created_at: new Date().toISOString()
  });
  if (error) console.error('[addAuditLog]:', error.message);
}

/* ── v5.1 additions ──────────────────────────────────────── */
export async function getBusinessName() {
  const user = await getCurrentUser();
  return user?.user_metadata?.business_name || '';
}

export async function getCustomerCrates(customerId) {
  const user = await getCurrentUser();
  if (!user) return { adaya: 0, barnika: 0 };
  const { data, error } = await supabase
    .from('customer_crates')
    .select('crate_type,quantity,returned')
    .eq('customer_id', customerId)
    .eq('user_id', user.id);
  if (error || !data) return { adaya: 0, barnika: 0 };
  let adaya = 0, barnika = 0;
  for (const row of data) {
    const net = (row.quantity || 0) - (row.returned || 0);
    if (row.crate_type === 'عداية') adaya += net;
    if (row.crate_type === 'برنيكة') barnika += net;
  }
  return { adaya, barnika };
}

/**
 * ✅ NEW: Bulk fetch crate totals for multiple customers.
 * This replaces N+1 queries in customers list page.
 */
export async function getBulkCustomerCrates(customerIds = []) {
  const user = await getCurrentUser();
  if (!user || !customerIds.length) return {};
  const { data, error } = await supabase
    .from('customer_crates')
    .select('customer_id, crate_type, quantity, returned')
    .eq('user_id', user.id)
    .in('customer_id', customerIds);
  if (error || !data) return {};
  
  const result = {};
  for (const row of data) {
    if (!result[row.customer_id]) result[row.customer_id] = { adaya: 0, barnika: 0 };
    const net = (row.quantity || 0) - (row.returned || 0);
    if (row.crate_type === 'عداية') result[row.customer_id].adaya += net;
    if (row.crate_type === 'برنيكة') result[row.customer_id].barnika += net;
  }
  return result;
}

export async function getAllCustomerCrateSummaries() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('customer_crates')
    .select(`id, customer_id, customer_name, crate_type, quantity, returned, note, created_at`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data;
}

export async function getSupplierCrates(supplierId) {
  const user = await getCurrentUser();
  if (!user) return { adaya_out: 0, adaya_in: 0, barnika_out: 0, barnika_in: 0 };
  const { data, error } = await supabase
    .from('supplier_crates')
    .select('crate_type,outbound,returned')
    .eq('supplier_id', supplierId)
    .eq('user_id', user.id);
  if (error || !data) return { adaya_out: 0, adaya_in: 0, barnika_out: 0, barnika_in: 0 };
  let adaya_out = 0, adaya_in = 0, barnika_out = 0, barnika_in = 0;
  for (const row of data) {
    if (row.crate_type === 'عداية') {
      adaya_out += (row.outbound || 0);
      adaya_in += (row.returned || 0);
    }
    if (row.crate_type === 'برنيكة') {
      barnika_out += (row.outbound || 0);
      barnika_in += (row.returned || 0);
    }
  }
  return { adaya_out, adaya_in, barnika_out, barnika_in };
}

export async function getAllSupplierCrateSummaries() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('supplier_crates')
    .select(`id, supplier_id, supplier_name, crate_type, outbound, returned, note, created_at`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data;
}
