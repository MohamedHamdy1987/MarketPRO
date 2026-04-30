/**
 * Market Pro – smoke-test.js  v5.1 Supernova
 * 
 * PART 3: Smoke Test Matrix
 * Run these tests manually or via a simple test runner to verify core flows.
 */
import { supabase } from './data.js';

export async function runSmokeTests() {
    const results = [];
    const user = (await supabase.auth.getUser())?.data?.user;
    if (!user) return [{ test: 'AUTH', status: 'FAIL', error: 'No user logged in' }];

    const test = async (name, fn) => {
        try {
            await fn(user);
            results.push({ test: name, status: 'PASS' });
        } catch (e) {
            results.push({ test: name, status: 'FAIL', error: e.message });
        }
    };

    // 1. Supplier Flow
    let supplierId;
    await test('SUPPLIER_CREATE', async (u) => {
        const { data, error } = await supabase.from('suppliers').insert({ user_id: u.id, name: '__SMOKE_TEST__' }).select('id').single();
        if (error) throw new Error(error.message);
        supplierId = data.id;
    });

    // 2. Invoice Flow
    let invoiceId;
    await test('INVOICE_CREATE', async (u) => {
        const { data, error } = await supabase.from('invoices').insert({ user_id: u.id, supplier_id: supplierId, supplier_name: '__SMOKE_TEST__', status: 'draft', commission_rate: 0.07 }).select('id').single();
        if (error) throw error;
        invoiceId = data.id;
    });

    await test('INVOICE_PRODUCT_ADD', async (u) => {
        const { error } = await supabase.from('invoice_products').insert({ invoice_id: invoiceId, name: 'طماطم', qty: 10, unit: 'عداية' });
        if (error) throw error;
    });

    await test('INVOICE_CONFIRM', async (u) => {
        const { error } = await supabase.rpc('confirm_invoice_v2', { p_invoice_id: invoiceId });
        if (error) throw error;
    });

    // 3. Sale Flow (Cash)
    await test('SALE_CASH', async (u) => {
        const { data: product } = await supabase.from('invoice_products').select('id').eq('invoice_id', invoiceId).single();
        const { error } = await supabase.rpc('sell_product_atomic', {
            p_product_id: product.id,
            p_invoice_id: invoiceId,
            p_qty: 5,
            p_price: 20,
            p_total: 100,
            p_type: 'cash',
            p_customer_id: null,
            p_shop_id: null,
            p_customer_name: null,
            p_date: new Date().toISOString().split("T")[0]
        });
        if (error) throw error;
    });

    // 4. Treasury
    await test('TREASURY_BALANCE', async (u) => {
        const { data, error } = await supabase.from('treasury_accounts').select('cash_balance').eq('user_id', u.id);
        if (error) throw error;
        if (data.length === 0) throw new Error('No treasury account found');
    });

    // 5. Customer Balance
    await test('CUSTOMER_BALANCE', async (u) => {
        const { data, error } = await supabase.from('customer_balances').select('balance').eq('user_id', u.id);
        if (error) throw error;
    });

    // 6. Partner Costs
    await test('PARTNER_COST', async (u) => {
        const { data: partner } = await supabase.from('partners').select('id').eq('user_id', u.id).limit(1).single();
        if (partner) {
            const { error } = await supabase.from('expenses').insert({
                user_id: u.id,
                amount: 50,
                expense_type: 'partner_cost',
                partner_id: partner.id
            });
            if (error) throw error;
        }
    });

    // 7. Reconciliation
    await test('RECONCILIATION_RUN', async (u) => {
        const { runFullReconciliation } = await import('./reconciliation.js');
        const result = await runFullReconciliation();
        if (result.status === 'ERROR') throw new Error(result.error);
    });

    // Cleanup
    await test('CLEANUP', async (u) => {
        await supabase.from('expenses').delete().eq('user_id', u.id).like('description', '__SMOKE_TEST__%');
        await supabase.from('invoice_products').delete().eq('invoice_id', invoiceId);
        await supabase.from('invoices').delete().eq('id', invoiceId);
        await supabase.from('suppliers').delete().eq('id', supplierId);
    });

    return results;
}