/**
 * Market Pro – ledger.js  v5.1 Supernova
 * 
 * PART 2.B: Lightweight Double-Entry Ledger
 * Ensures every financial event creates balanced debits and credits.
 */

import { supabase, dbInsert, getCurrentUser, ensureUser } from './data.js';
import { toast } from './ui.js';

export const LEDGER_ACCOUNTS = {
    // Assets
    TREASURY_CASH: '1_ASSETS_TREASURY_CASH',
    CUSTOMER_RECEIVABLES: '2_ASSETS_CUSTOMER_RECEIVABLES',
    
    // Liabilities
    SUPPLIER_PAYABLES: '3_LIABILITIES_SUPPLIER_PAYABLES',
    
    // Equity & Clearing
    SALES_CLEARING: '5_REVENUES_SALES_CLEARING',
    EXPENSE_CLEARING: '6_EXPENSES_EXPENSE_CLEARING',
    PARTNER_EQUITY: '9_EQUITY_PARTNER',
};

/**
 * Posts a double-entry transaction atomically.
 * @param {string} description - Human-readable description.
 * @param {Array<{account: string, amount: number, type: 'DEBIT' | 'CREDIT'}>} entries 
 */
export async function postLedgerEntry(description, entries) {
    const user = await ensureUser();
    
    // Validate balance: sum of debits must equal sum of credits
    const totalDebits = entries
        .filter(e => e.type === 'DEBIT')
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const totalCredits = entries
        .filter(e => e.type === 'CREDIT')
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    if (Math.abs(totalDebits - totalCredits) > 0.001) {
        console.error('[Ledger] Unbalanced entry! Debits:', totalDebits, 'Credits:', totalCredits);
        toast('خطأ محاسبي: القيد غير متوازن.', 'error');
        return false;
    }

    const transactionId = crypto.randomUUID();
    const rows = entries.map(entry => ({
        transaction_id: transactionId,
        user_id: user.id,
        account: entry.account,
        amount: Number(entry.amount || 0),
        type: entry.type,
        description: description,
        created_at: new Date().toISOString()
    }));

    const { error } = await supabase.from('ledger_entries').insert(rows);
    if (error) {
        console.error('[Ledger] Insert failed:', error);
        toast('فشل تسجيل القيد المحاسبي.', 'error');
        return false;
    }

    return true;
}

/**
 * Convenience: Cash Sale
 * Debit Treasury (Asset up), Credit Sales Clearing (Revenue up)
 */
export async function postCashSale(amount, description) {
    return postLedgerEntry(description || 'بيع نقدي', [
        { account: LEDGER_ACCOUNTS.TREASURY_CASH, amount, type: 'DEBIT' },
        { account: LEDGER_ACCOUNTS.SALES_CLEARING, amount, type: 'CREDIT' }
    ]);
}

/**
 * Convenience: Supplier Payment
 * Debit Supplier Payable (Liability down), Credit Treasury (Asset down)
 */
export async function postSupplierPayment(amount, supplierName) {
    return postLedgerEntry(`دفع للمورد: ${supplierName}`, [
        { account: LEDGER_ACCOUNTS.SUPPLIER_PAYABLES, amount, type: 'DEBIT' },
        { account: LEDGER_ACCOUNTS.TREASURY_CASH, amount, type: 'CREDIT' }
    ]);
}

/**
 * Convenience: Customer Collection
 * Debit Treasury (Asset up), Credit Customer Receivables (Asset down)
 */
export async function postCustomerCollection(amount, customerName) {
    return postLedgerEntry(`تحصيل من العميل: ${customerName}`, [
        { account: LEDGER_ACCOUNTS.TREASURY_CASH, amount, type: 'DEBIT' },
        { account: LEDGER_ACCOUNTS.CUSTOMER_RECEIVABLES, amount, type: 'CREDIT' }
    ]);
}