/**
 * Market Pro – reconciliation.js  v5.1 Supernova
 * 
 * PART 2.A: Reconciliation Engine
 * Detects mismatches between sales, collections, treasury, and customer balances.
 * 
 * PART 2.C: Dangerous Delete Protection
 * Provides safe delete with reversal entries for critical financial tables.
 * 
 * PART 2.E: Atomic Transaction Helper
 * Ensures partial failures are handled gracefully with rollback.
 */

import { supabase, dbInsert, getCurrentUser, ensureUser } from './data.js';
import { toast } from './ui.js';

/**
 * ============================================================
 * SECTION A: Reconciliation Engine (Part 2.A)
 * ============================================================
 */

/**
 * Runs a full reconciliation check for the given user.
 * @returns {Object} discrepancies found, if any.
 */
export async function runFullReconciliation() {
    const user = await ensureUser();
    const discrepancies = [];

    try {
        const [
            { data: sales },
            { data: collections },
            { data: expenses },
            { data: treasuries },
            { data: customerBalances }
        ] = await Promise.all([
            supabase.from('daily_sales').select('total').eq('user_id', user.id),
            supabase.from('collections').select('amount').eq('user_id', user.id),
            supabase.from('expenses').select('amount, expense_type, treasury_type').eq('user_id', user.id),
            supabase.from('treasury_accounts').select('cash_balance, vodafone_balance, treasury_type').eq('user_id', user.id),
            supabase.from('customer_balances').select('customer_id, balance').eq('user_id', user.id)
        ]);

        // 1. Treasury Drift Check
        const totalCollections = (collections || []).reduce((s, c) => s + Number(c.amount || 0), 0);
        const totalCashOut = (expenses || [])
            .filter(e => !['supplier_payment', 'partner_cost', 'partner_withdrawal'].includes(e.expense_type))
            .reduce((s, e) => s + Number(e.amount || 0), 0);
        const expectedTreasuryCash = totalCollections - totalCashOut;
        const actualTreasuryCash = (treasuries || []).reduce((s, t) => s + Number(t.cash_balance || 0), 0);

        if (Math.abs(expectedTreasuryCash - actualTreasuryCash) > 0.01) {
            discrepancies.push({
                type: 'TREASURY_DRIFT',
                severity: 'HIGH',
                message: 'انجراف في أرصدة الخزينة: النقدية الفعلية لا تطابق الحركات.',
                details: {
                    expectedCash: expectedTreasuryCash,
                    actualCash: actualTreasuryCash,
                    drift: actualTreasuryCash - expectedTreasuryCash
                }
            });
        }

        // 2. Customer Receivables vs Sales
        const totalCreditSales = (sales || []).reduce((s, sale) => s + Number(sale.total || 0), 0);
        const totalCustomerDebt = (customerBalances || []).reduce((s, b) => s + Math.max(0, Number(b.balance || 0)), 0);
        
        if (totalCreditSales > (totalCustomerDebt + totalCollections) + 0.01) {
            discrepancies.push({
                type: 'SALES_RECEIVABLE_MISMATCH',
                severity: 'MEDIUM',
                message: 'إجمالي المبيعات الآجلة أعلى من الذمم المسجلة والتحصيلات.',
                details: {
                    totalCreditSales,
                    totalCustomerDebt,
                    totalCollections
                }
            });
        }

        // Log reconciliation result
        await supabase.from('reconciliation_logs').insert({
            user_id: user.id,
            discrepancies: discrepancies,
            created_at: new Date().toISOString()
        });

        return {
            status: discrepancies.length === 0 ? 'CLEAN' : 'DISCREPANCIES_FOUND',
            discrepancies,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error('[Reconciliation] Fatal error:', error);
        return {
            status: 'ERROR',
            error: error.message,
            discrepancies
        };
    }
}


/**
 * ============================================================
 * SECTION B: Dangerous Delete Protection (Part 2.C)
 * ============================================================
 */

const PROTECTED_TABLES = ['collections', 'expenses', 'daily_sales', 'customer_ledger', 'invoices', 'invoice_products', 'customer_allowances'];

/**
 * Safe delete that creates a reversal entry instead of hard delete.
 */
export async function safeDelete(table, id) {
    if (!PROTECTED_TABLES.includes(table)) {
        console.warn(`[SafeDelete] Table "${table}" is not protected. Consider hard delete only.`);
        return false;
    }

    toast(`يتم إنشاء قيد عكسي بدلاً من الحذف...`, 'info');
    return await createReversalEntry(table, id);
}

async function createReversalEntry(table, id) {
    const user = await getCurrentUser();
    if (!user) return false;

    const { data: original, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .single();

    if (error || !original) {
        toast('السجل الأصلي غير موجود.', 'error');
        return false;
    }

    let reversalPayload = {
        ...original,
        id: undefined,
        created_at: new Date().toISOString(),
        user_id: user.id
    };

    switch (table) {
        case 'collections':
            reversalPayload.amount = -Math.abs(original.amount);
            reversalPayload.description = `[عكس قيد] إلغاء تحصيل سابق (ID: ${id})`;
            break;
        case 'expenses':
            reversalPayload.amount = -Math.abs(original.amount);
            reversalPayload.description = `[عكس قيد] إلغاء مصروف سابق (ID: ${id})`;
            break;
        default:
            toast(`لا يمكن حذف سجل من نوع ${table} مباشرة. الرجاء التواصل مع الدعم.`, 'warning');
            return false;
    }

    const inserted = await dbInsert(table, reversalPayload);
    if (inserted) {
        toast('✅ تم إنشاء قيد عكسي وإلغاء أثر الحركة الأصلية.', 'success');
        return true;
    } else {
        toast('فشل إنشاء قيد الإلغاء.', 'error');
        return false;
    }
}


/**
 * ============================================================
 * SECTION C: Failure Recovery & Atomic Helpers (Part 2.E)
 * ============================================================
 */

/**
 * Executes a list of asynchronous steps. If any step fails, rolls back completed steps.
 * @param {Array<{execute: Function, rollback: Function}>} steps 
 */
export async function atomicTransaction(steps) {
    const completedSteps = [];
    
    for (const step of steps) {
        try {
            await step.execute();
            completedSteps.push(step);
        } catch (error) {
            console.error('[AtomicTransaction] Step failed:', error);
            for (let i = completedSteps.length - 1; i >= 0; i--) {
                try {
                    await completedSteps[i].rollback();
                } catch (rbError) {
                    console.error('[AtomicTransaction] Rollback failed:', rbError);
                    await supabase.from('system_errors').insert({
                        user_id: (await getCurrentUser())?.id,
                        error: 'ROLLBACK_FAILED',
                        details: { originalError: error.message, rollbackError: rbError.message },
                        created_at: new Date().toISOString()
                    });
                }
            }
            return { success: false, error: error.message };
        }
    }
    return { success: true };
}