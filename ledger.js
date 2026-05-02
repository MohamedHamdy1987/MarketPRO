import { supabase, ensureUser } from './data.js';

/* ─────────────────────────────────────────────
   🧾 Helper: إضافة قيد محاسبي مزدوج
───────────────────────────────────────────── */
async function insertDoubleEntry({ entries, transaction_id, description }) {
  const user = await ensureUser();

  const rows = entries.map(e => ({
    user_id: user.id,
    date: new Date().toISOString(),
    account: e.account,
    debit: e.debit || 0,
    credit: e.credit || 0,
    description,
    transaction_id
  }));

  const { error } = await supabase
    .from('ledger_entries')
    .insert(rows);

  if (error) {
    console.error('Ledger insert error:', error);
    throw error;
  }
}

/* ════════════════════════════════════════════
   💵 تحصيل من عميل
   Debit: الخزنة
   Credit: العميل
════════════════════════════════════════════ */
export async function postCustomerCollection(amount, customerName, transaction_id) {
  return insertDoubleEntry({
    transaction_id,
    description: `تحصيل من العميل: ${customerName}`,
    entries: [
      {
        account: 'treasury',
        debit: amount
      },
      {
        account: `customer:${customerName}`,
        credit: amount
      }
    ]
  });
}

/* ════════════════════════════════════════════
   💵 دفع لمورد
   Debit: المورد
   Credit: الخزنة
════════════════════════════════════════════ */
export async function postSupplierPayment(amount, supplierName, transaction_id) {
  return insertDoubleEntry({
    transaction_id,
    description: `دفع للمورد: ${supplierName}`,
    entries: [
      {
        account: `supplier:${supplierName}`,
        debit: amount
      },
      {
        account: 'treasury',
        credit: amount
      }
    ]
  });
}
