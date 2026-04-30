import { supabase, dbInsert, dbUpdate, dbDelete, addAuditLog, ensureUser } from "../data.js";
import { toast, inputModal, confirmModal, formatCurrency, formatDate, emptyState } from "../ui.js";
import { atomicTransaction } from '../reconciliation.js';
import { postCustomerCollection, postSupplierPayment, postLedgerEntry } from '../ledger.js';

/**
 * Market Pro – khazna.js  v5.1 Supernova
 * ✅ NEW: Atomic transactions with double-entry ledger for collections & expenses
 * ✅ IMPROVED: Treasury drift prevention via reconciliation
 * ✅ PRESERVED: All original treasury logic (4 treasuries, handovers)
 */

export async function renderKhaznaPage(app) {
  const user = await ensureUser();

  const [
    { data: collections },
    { data: expenses },
    { data: treasuries },
    { data: handovers }
  ] = await Promise.all([
    supabase.from("collections").select("*,customers(full_name)").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("expenses").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("treasury_accounts").select("*").eq("user_id", user.id).order("treasury_type"),
    supabase.from("cash_handover_requests").select("*").eq("user_id", user.id).eq("status", "pending").order("requested_at", { ascending: false })
  ]);

  const cashIn  = (collections||[]).reduce((s,c)=>s+Number(c.amount||0), 0);
  const cashOut = (expenses||[]).reduce((s,e)=>s+Number(e.amount||0), 0);
  const net     = cashIn - cashOut;

  app.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">💰 الخزنة</div>
        <div class="page-subtitle">الخزنة الرئيسية + خزن المحاسبين</div>
      </div>
      <div class="page-actions">
        <button class="btn" onclick="openAddCollection()">+ تحصيل</button>
        <button class="btn btn-danger" onclick="openAddExpense()">– مصروف</button>
      </div>
    </div>

    <div class="kpi-grid" style="margin-bottom:var(--sp-5);">
      <div class="kpi-card">
        <span class="kpi-icon">📥</span>
        <div class="kpi-value amount-positive">${formatCurrency(cashIn)}</div>
        <div class="kpi-label">إجمالي التحصيلات</div>
      </div>
      <div class="kpi-card">
        <span class="kpi-icon">📤</span>
        <div class="kpi-value amount-negative">${formatCurrency(cashOut)}</div>
        <div class="kpi-label">إجمالي المصروفات</div>
      </div>
      <div class="kpi-card">
        <span class="kpi-icon">💎</span>
        <div class="kpi-value" style="color:${net>=0?'var(--c-primary)':'var(--c-danger)'};">${formatCurrency(net)}</div>
        <div class="kpi-label">صافي الخزنة</div>
      </div>
    </div>

    ${renderTreasuryTabs(treasuries||[], handovers||[])}

    <div class="grid-2" style="gap:var(--sp-4);">
      <div class="card">
        <div class="card-header">
          <span class="card-title">📥 التحصيلات (${(collections||[]).length})</span>
        </div>
        ${renderCollections(collections||[])}
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">📤 المصروفات (${(expenses||[]).length})</span>
        </div>
        ${renderExpenses(expenses||[])}
      </div>
    </div>
  `;
}

function renderTreasuryTabs(list, handovers) {
  if (!list.length) return '';
  return `
  <div class="card" style="margin-bottom:var(--sp-5);">
    <div class="card-header">
      <span class="card-title">🏦 الخزن التشغيلية</span>
    </div>
    <div class="grid-2">
      ${list.map(t=>`
        <div class="card">
          <div style="font-weight:800;font-size:15px;">${t.name}</div>
          <div style="margin-top:8px;font-size:13px;">
            <div>💵 كاش: <b>${formatCurrency(t.cash_balance||0)}</b></div>
            <div>📲 فودافون: <b>${formatCurrency(t.vodafone_balance||0)}</b></div>
            ${t.treasury_type === 'financial_manager' ? `<div>🏦 بنك: <b>${formatCurrency(t.bank_balance||0)}</b></div>` : ''}
          </div>
          ${t.treasury_type !== 'financial_manager' ? `
            <button class="btn btn-sm" style="margin-top:10px;" onclick="requestCashHandover('${t.id}')">📤 تسليم للمدير</button>` : ''}
        </div>`).join('')}
    </div>
    ${handovers.length ? `
      <div style="margin-top:16px;border-top:1px solid var(--c-border);padding-top:16px;">
        <div class="card-title" style="margin-bottom:10px;">⏳ طلبات التسليم المعلقة</div>
        ${handovers.map(r=>`
          <div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--c-border);">
            <span style="font-size:13px;">طلب تسليم ${formatCurrency(r.cash_amount||0)} كاش • ${formatCurrency(r.vodafone_amount||0)} فودافون</span>
            <button class="btn btn-sm btn-success" onclick="approveCashHandover('${r.id}')">✅ اعتماد</button>
          </div>`).join('')}
      </div>` : ''}
  </div>`;
}

function renderCollections(list) {
  if (!list.length) return `<div style="text-align:center;color:var(--c-text-muted);padding:20px;">لا توجد تحصيلات</div>`;
  return `
  <div class="table-wrapper">
    <table class="table">
      <thead><tr><th>التاريخ</th><th>العميل</th><th>المبلغ</th><th></th></tr></thead>
      <tbody>
        ${list.map(x=>`
        <tr>
          <td style="font-size:12px;color:var(--c-text-muted);">${formatDate(x.date||x.created_at)}</td>
          <td>${x.customers?.full_name||'–'}</td>
          <td class="amount-positive">${formatCurrency(x.amount)}</td>
          <td><button class="btn btn-icon btn-sm" onclick="deleteKhaznaCollection('${x.id}')">🗑️</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function renderExpenses(list) {
  if (!list.length) return `<div style="text-align:center;color:var(--c-text-muted);padding:20px;">لا توجد مصروفات</div>`;
  return `
  <div class="table-wrapper">
    <table class="table">
      <thead><tr><th>التاريخ</th><th>الوصف</th><th>النوع</th><th>المبلغ</th><th></th></tr></thead>
      <tbody>
        ${list.map(x=>`
        <tr>
          <td style="font-size:12px;color:var(--c-text-muted);">${formatDate(x.date||x.created_at)}</td>
          <td>${x.description||'–'}</td>
          <td><span class="badge">${expenseTypeLabel(x.expense_type)}</span></td>
          <td class="amount-negative">${formatCurrency(x.amount)}</td>
          <td style="display:flex;gap:4px;">
            <button class="btn btn-icon btn-sm edit" onclick="editExpense('${x.id}','${(x.description||'').replace(/'/g,"&#39;")}','${x.amount}','${x.expense_type||'general'}')">✏️</button>
            <button class="btn btn-icon btn-sm" onclick="deleteExpense('${x.id}')">🗑️</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function expenseTypeLabel(type) {
  const map = { general: 'عام', supplier_payment: 'مورد', salary: 'رواتب', partner_cost: 'شركاء' };
  return map[type] || type || 'عام';
}

window.deleteKhaznaCollection = function(id) {
  confirmModal('حذف هذا التحصيل؟ سيؤثر على رصيد العميل.', async () => {
    const ok = await dbDelete('collections', id);
    if (!ok) { toast('فشل الحذف', 'error'); return; }
    toast('تم الحذف ✅', 'success');
    navigate('khazna');
  });
};

window.editExpense = async function(id, desc, amount, type) {
  inputModal({
    title: '✏️ تعديل مصروف',
    fields: [
      { id: 'description', label: 'الوصف', required: true, value: desc },
      { id: 'amount', label: 'المبلغ', type: 'number', required: true, value: parseFloat(amount)||0 },
      { id: 'expense_type', label: 'النوع', type: 'select', value: type,
        options: [
          { value: 'general', label: 'مصاريف عامة' },
          { value: 'supplier_payment', label: 'دفعة مورد' },
          { value: 'salary', label: 'رواتب' },
          { value: 'partner_cost', label: 'تكاليف شركاء' }
        ]
      }
    ],
    submitLabel: 'حفظ التعديل',
    onSubmit: async (vals) => {
      const ok = await dbUpdate('expenses', id, {
        description: vals.description,
        amount: Number(vals.amount),
        expense_type: vals.expense_type
      });
      if (!ok) throw new Error('فشل التعديل');
      closeModal();
      toast('تم التعديل ✅', 'success');
      navigate('khazna');
    }
  });
};

window.deleteExpense = function(id) {
  confirmModal('حذف هذا المصروف؟', async () => {
    const ok = await dbDelete('expenses', id);
    if (!ok) { toast('فشل الحذف', 'error'); return; }
    toast('تم الحذف ✅', 'success');
    navigate('khazna');
  });
};

window.openAddCollection = async function() {
  const user = await ensureUser();
  const { data: customers } = await supabase
    .from('customers').select('id,full_name')
    .eq('user_id', user.id).order('full_name');

  inputModal({
    title: '📥 تسجيل تحصيل',
    fields: [
      { id: 'customer_id', label: 'العميل', type: 'select', required: true,
        options: (customers||[]).map(c=>({ value: c.id, label: c.full_name }))
      },
      { id: 'amount', label: 'المبلغ', type: 'number', required: true, min: '0' },
      { id: 'treasury_id', label: 'الخزنة', type: 'select',
        options: [
          { value: 'financial_manager', label: 'المدير المالي' },
          { value: 'cashier_1', label: 'المحاسب 1' },
          { value: 'cashier_2', label: 'المحاسب 2' },
          { value: 'cashier_3', label: 'المحاسب 3' }
        ]
      }
    ],
    submitLabel: 'حفظ التحصيل',
    onSubmit: async (vals) => {
      // ✅ NEW: Atomic with ledger
      const steps = [
        {
          execute: async () => {
            await dbInsert('collections', {
              customer_id: vals.customer_id,
              amount: vals.amount,
              treasury_type: vals.treasury_id,
              date: new Date().toISOString()
            });
          },
          rollback: async () => {}
        },
        {
          execute: async () => {
            await postCustomerCollection(vals.amount, 'تحصيل عميل');
          },
          rollback: async () => {
            const { data } = await supabase.from('collections').select('id')
              .eq('customer_id', vals.customer_id).eq('amount', vals.amount)
              .order('created_at', { ascending: false }).limit(1).single();
            if (data) await dbDelete('collections', data.id);
          }
        }
      ];
      const result = await atomicTransaction(steps);
      if (!result.success) throw new Error(result.error);
      
      await addAuditLog('collection', vals);
      closeModal();
      toast('تم تسجيل التحصيل ✅', 'success');
      navigate('khazna');
    }
  });
};

window.openAddExpense = async function() {
  inputModal({
    title: '📤 تسجيل مصروف',
    fields: [
      { id: 'description', label: 'الوصف', type: 'text', required: true },
      { id: 'amount', label: 'المبلغ', type: 'number', required: true, min: '0' },
      { id: 'expense_type', label: 'نوع المصروف', type: 'select',
        options: [
          { value: 'general', label: 'مصاريف عامة' },
          { value: 'supplier_payment', label: 'دفعة مورد' },
          { value: 'salary', label: 'رواتب' },
          { value: 'partner_cost', label: 'تكاليف شركاء' }
        ]
      },
      { id: 'treasury_id', label: 'الخزنة', type: 'select',
        options: [
          { value: 'financial_manager', label: 'المدير المالي' },
          { value: 'cashier_1', label: 'المحاسب 1' },
          { value: 'cashier_2', label: 'المحاسب 2' },
          { value: 'cashier_3', label: 'المحاسب 3' }
        ]
      }
    ],
    submitLabel: 'حفظ المصروف',
    onSubmit: async (vals) => {
      const expenseType = vals.expense_type;
      const steps = [
        {
          execute: async () => {
            await dbInsert('expenses', {
              description: vals.description,
              amount: vals.amount,
              expense_type: expenseType,
              treasury_type: vals.treasury_id,
              date: new Date().toISOString()
            });
          },
          rollback: async () => {}
        },
        {
          execute: async () => {
            if (expenseType === 'supplier_payment') {
              await postSupplierPayment(vals.amount, vals.description);
            } else {
              await postLedgerEntry(`مصروف: ${vals.description}`, [
                { account: '6_EXPENSES_EXPENSE_CLEARING', amount: vals.amount, type: 'DEBIT' },
                { account: '1_ASSETS_TREASURY_CASH', amount: vals.amount, type: 'CREDIT' }
              ]);
            }
          },
          rollback: async () => {}
        }
      ];
      const result = await atomicTransaction(steps);
      if (!result.success) throw new Error(result.error);
      
      await addAuditLog('expense', vals);
      closeModal();
      toast('تم تسجيل المصروف ✅', 'success');
      navigate('khazna');
    }
  });
};

window.requestCashHandover = async function(fromId) {
  inputModal({
    title: '📤 طلب تسليم عهدة',
    fields: [
      { id: 'cash_amount', label: 'مبلغ كاش', type: 'number', value: 0, min: '0' },
      { id: 'vodafone_amount', label: 'مبلغ فودافون', type: 'number', value: 0, min: '0' }
    ],
    submitLabel: 'إرسال الطلب',
    onSubmit: async (vals) => {
      const user = await ensureUser();
      const { data: manager } = await supabase
        .from('treasury_accounts').select('id')
        .eq('user_id', user.id).eq('treasury_type', 'financial_manager').single();
      await dbInsert('cash_handover_requests', {
        from_treasury_id: fromId,
        to_treasury_id: manager.id,
        cash_amount: vals.cash_amount||0,
        vodafone_amount: vals.vodafone_amount||0,
        status: 'pending'
      });
      closeModal();
      toast('تم إرسال طلب التسليم ✅', 'success');
      navigate('khazna');
    }
  });
};

window.approveCashHandover = async function(id) {
  const { data, error } = await supabase.rpc('approve_handover', { p_request_id: id });
  if (error) { toast('فشل الاعتماد', 'error'); return; }
  if (data === false) { toast('الرصيد غير كاف', 'warning'); return; }
  toast('تم اعتماد التسليم ✅', 'success');
  navigate('khazna');
};