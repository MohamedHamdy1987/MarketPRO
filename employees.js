/**
 * Market Pro – employees.js  v6.0 Production
 * ═══════════════════════════════════════════════════════════════
 * Team Lead: صفحة الموظف الكاملة مع الحساب والتسوية
 * Agent 1:   مراجعة توافق مع employees + employee_attendance + employee_sales
 * Agent 2:   لا حذف للكود الأصلي – RBAC محفوظ
 * ═══════════════════════════════════════════════════════════════
 *
 * ✅ PRESERVED: كل منطق الموظفين الأصلي (CRUD + RBAC)
 * ✅ NEW: بيانات الموظف = اسم + مرتب + رقم هاتف
 * ✅ NEW: الحضور = كل الأيام حضور → تسجيل الغياب فقط
 * ✅ NEW: الحساب من الخزنة (فلوس) + من المبيعات (بضاعة)
 * ✅ NEW: التسوية = خصم الغياب + حساب الواصل + تحديد له/عليه
 */

import { supabase, dbInsert, dbUpdate, dbDelete, ensureUser } from "../data.js";
import { toast, modal, inputModal, confirmModal, closeModal, formatCurrency, formatDate, emptyState } from "../ui.js";

/* ══════════════════════════════════════════════════════════════
   قائمة الموظفين
   ══════════════════════════════════════════════════════════════ */
export async function renderEmployeesPage(app) {
  const user = await ensureUser();
  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .eq("user_id", user.id)
    .order("name");

  const active   = (employees || []).filter(x => x.active !== false);
  const inactive = (employees || []).filter(x => x.active === false);

  app.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">👷 الموظفين</div>
        <div class="page-subtitle">
          ${active.length} نشط
          ${inactive.length ? ` | ${inactive.length} معطل` : ''}
        </div>
      </div>
      <div class="page-actions">
        <button class="btn" onclick="openAddEmployee()" data-permission="manage_employees">
          ➕ إضافة موظف
        </button>
      </div>
    </div>
    <div id="employees-list">
      ${renderEmployeeCards(employees || [])}
    </div>`;
}

function permissionsLabel(role) {
  return { admin: 'كل الصلاحيات', cashier: 'مبيعات + خزنة + عملاء', worker: 'عرض فقط' }[role] || 'مخصص';
}

function esc(v = '') { return String(v).replace(/'/g, "&#39;"); }

function renderEmployeeCards(list) {
  if (!list.length) {
    return emptyState('👷', 'لا يوجد موظفون', 'أضف أول موظف للبدء',
      `<button class="btn" onclick="openAddEmployee()">➕ إضافة موظف</button>`);
  }

  return list.map(e => {
    const active = e.active !== false;
    return `
    <div class="card" ${!active ? "style='opacity:.65'" : ""}>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:15px;">👤 ${e.name}</div>
          ${e.phone ? `<div style="font-size:12px;color:var(--c-text-muted);margin-top:3px;">📞 ${e.phone}</div>` : ''}
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
            <span class="badge ${active ? 'badge-green' : 'badge-red'}">${active ? 'نشط' : 'معطل'}</span>
            <span class="badge badge-blue">${e.role}</span>
          </div>
          <div style="font-size:12px;color:var(--c-text-muted);margin-top:6px;">
            صلاحيات: ${permissionsLabel(e.role)}
          </div>
          ${e.salary ? `
          <div style="margin-top:6px;font-size:13px;font-weight:700;color:var(--c-primary);">
            💰 الراتب: ${formatCurrency(e.salary)} / شهر
          </div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;min-width:90px;">
          <button class="btn btn-sm" onclick="openEmployeeAccount('${e.id}','${esc(e.name)}')">
            حساب →
          </button>
          <button class="btn btn-warning btn-sm" onclick="openMarkAbsence('${e.id}','${esc(e.name)}','${e.salary || 0}')">
            📅 غياب
          </button>
          <button class="btn btn-ghost btn-sm" onclick="toggleEmployee('${e.id}',${active},'${esc(e.name)}','${e.role}')">
            ${active ? 'تعطيل' : 'تفعيل'}
          </button>
          <button class="btn btn-ghost btn-sm" onclick="openChangeRole('${e.id}','${esc(e.name)}','${e.role}')">
            صلاحية
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   إضافة موظف (موسّع بالهاتف)
   ══════════════════════════════════════════════════════════════ */
window.openAddEmployee = async function() {
  const user = await ensureUser();
  inputModal({
    title: '➕ إضافة موظف',
    fields: [
      { id: 'name',   label: 'اسم الموظف', type: 'text',   required: true },
      { id: 'phone',  label: 'رقم الهاتف',  type: 'tel' },
      { id: 'salary', label: 'الراتب الشهري', type: 'number', value: 0 },
      { id: 'role', label: 'الصلاحية', type: 'select', required: true,
        options: [
          { value: 'worker',  label: 'عامل' },
          { value: 'cashier', label: 'كاشير' },
          { value: 'admin',   label: 'مدير' }
        ]
      }
    ],
    submitLabel: 'حفظ',
    onSubmit: async (vals) => {
      if (vals.role === 'admin') {
        const { data: admins } = await supabase
          .from('employees').select('id')
          .eq('user_id', user.id).eq('role', 'admin').eq('active', true);
        if (admins?.length) throw new Error('مسموح Admin واحد فقط');
      }
      const inserted = await dbInsert('employees', {
        name:   vals.name,
        phone:  vals.phone  || null,
        salary: vals.salary || 0,
        role:   vals.role,
        active: true
      });
      if (!inserted) throw new Error('فشل الإضافة');
      closeModal();
      toast('تمت الإضافة ✅', 'success');
      navigate('employees');
    }
  });
};

/* ══════════════════════════════════════════════════════════════
   ✅ NEW: حساب الموظف
   ══════════════════════════════════════════════════════════════ */
window.openEmployeeAccount = async function(empId, empName) {
  const app = document.getElementById('app');
  const user = await ensureUser();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const [
    { data: empData },
    { data: absences },
    { data: salaryPayments },
    { data: empSales }
  ] = await Promise.all([
    supabase.from('employees').select('*').eq('id', empId).single(),
    supabase.from('employee_attendance')
      .select('*').eq('employee_id', empId).eq('user_id', user.id)
      .gte('date', monthStart).lte('date', monthEnd)
      .eq('status', 'absent').order('date', { ascending: false }),
    supabase.from('employee_salary_payments')
      .select('*').eq('employee_id', empId).eq('user_id', user.id)
      .gte('created_at', monthStart).lte('created_at', monthEnd)
      .order('created_at', { ascending: false }),
    supabase.from('employee_sales')
      .select('*').eq('employee_id', empId).eq('user_id', user.id)
      .gte('created_at', monthStart).lte('created_at', monthEnd)
      .order('created_at', { ascending: false })
  ]);

  const salary           = Number(empData?.salary || 0);
  const daysInMonth      = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayValue         = salary > 0 ? salary / daysInMonth : 0;
  const absenceDays      = (absences || []).length;
  const absenceDeduction = absenceDays * dayValue;
  const netSalary        = salary - absenceDeduction;

  const paidFromKhazna   = (salaryPayments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const paidFromSales    = (empSales || []).reduce((s, p) => s + Number(p.total || 0), 0);
  const totalPaid        = paidFromKhazna + paidFromSales;
  const balance          = netSalary - totalPaid; /* موجب = له | سالب = عليه */

  const monthName = now.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });

  app.innerHTML = `
  <button class="btn btn-ghost btn-sm" onclick="navigate('employees')">← رجوع</button>

  <div class="page-header" style="margin-top:12px;">
    <div class="page-header-left">
      <div class="page-title">👤 ${empName}</div>
      <div class="page-subtitle">حساب ${monthName}</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-sm" onclick="openPayEmployee('${empId}','${esc(empName)}')">
        💰 صرف راتب
      </button>
      <button class="btn btn-warning btn-sm" onclick="openMarkAbsence('${empId}','${esc(empName)}','${salary}')">
        📅 تسجيل غياب
      </button>
    </div>
  </div>

  <!-- التسوية الشهرية -->
  <div class="card" style="margin-bottom:16px;">
    <div class="card-header"><span class="card-title">📊 تسوية ${monthName}</span></div>
    <table style="width:100%;font-size:14px;border-collapse:collapse;">
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:9px 4px;color:var(--c-text-muted);">الراتب الأساسي</td>
        <td style="padding:9px 4px;text-align:left;font-weight:700;">${formatCurrency(salary)}</td>
      </tr>
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:9px 4px;color:var(--c-text-muted);">
          أيام الغياب (${absenceDays} يوم × ${formatCurrency(dayValue)})
        </td>
        <td style="padding:9px 4px;text-align:left;font-weight:700;color:var(--c-danger);">
          – ${formatCurrency(absenceDeduction)}
        </td>
      </tr>
      <tr style="border-bottom:2px solid var(--c-border-2);background:var(--c-surface-3);">
        <td style="padding:10px 4px;font-weight:800;">صافي المستحق</td>
        <td style="padding:10px 4px;text-align:left;font-weight:800;font-size:16px;">
          ${formatCurrency(netSalary)}
        </td>
      </tr>
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:9px 4px;color:var(--c-text-muted);">من الخزنة (نقدي)</td>
        <td style="padding:9px 4px;text-align:left;font-weight:700;color:var(--c-primary);">
          – ${formatCurrency(paidFromKhazna)}
        </td>
      </tr>
      ${paidFromSales > 0 ? `
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:9px 4px;color:var(--c-text-muted);">من المبيعات (بضاعة)</td>
        <td style="padding:9px 4px;text-align:left;font-weight:700;color:var(--c-primary);">
          – ${formatCurrency(paidFromSales)}
        </td>
      </tr>` : ''}
      <tr style="background:${balance > 0 ? 'var(--c-success-bg)' : balance < 0 ? 'var(--c-danger-bg)' : 'var(--c-surface-3)'};">
        <td style="padding:10px 4px;font-weight:800;font-size:15px;">
          ${balance > 0 ? 'متبقي له' : balance < 0 ? 'عليه' : 'مسوّى'}
        </td>
        <td style="padding:10px 4px;text-align:left;font-weight:800;font-size:18px;
          color:${balance > 0 ? 'var(--c-primary)' : balance < 0 ? 'var(--c-danger)' : 'var(--c-text-muted)'};">
          ${formatCurrency(Math.abs(balance))}
        </td>
      </tr>
    </table>
  </div>

  <!-- الغياب هذا الشهر -->
  ${(absences || []).length ? `
  <div class="card" style="margin-bottom:16px;">
    <div class="card-header">
      <span class="card-title">📅 أيام الغياب (${absenceDays} يوم)</span>
    </div>
    ${(absences || []).map(a => `
      <div class="row" style="justify-content:space-between;border-bottom:1px solid var(--c-border);">
        <span>${formatDate(a.date)}</span>
        <span style="display:flex;gap:8px;align-items:center;">
          <span class="badge badge-red">غياب</span>
          <button class="btn btn-icon btn-sm"
            onclick="deleteAbsence('${a.id}','${empId}','${esc(empName)}')">🗑️</button>
        </span>
      </div>`).join('')}
  </div>` : `
  <div class="card" style="margin-bottom:16px;">
    <div style="text-align:center;padding:16px;color:var(--c-primary);font-weight:700;">
      ✅ لا يوجد غياب هذا الشهر
    </div>
  </div>`}

  <!-- مدفوعات الراتب -->
  ${(salaryPayments || []).length ? `
  <div class="card" style="margin-bottom:16px;">
    <div class="card-header"><span class="card-title">💰 صرفيات الراتب</span></div>
    ${(salaryPayments || []).map(p => `
      <div class="row" style="justify-content:space-between;border-bottom:1px solid var(--c-border);">
        <span style="font-size:13px;">${formatDate(p.created_at)} · ${p.payment_method === 'vodafone' ? '📲 فودافون' : '💵 كاش'}</span>
        <span class="amount-positive">${formatCurrency(p.amount)}</span>
      </div>`).join('')}
  </div>` : ''}

  <!-- مبيعات الموظف (بضاعة) -->
  ${(empSales || []).length ? `
  <div class="card">
    <div class="card-header"><span class="card-title">📦 بضاعة من المبيعات</span></div>
    ${(empSales || []).map(s => `
      <div class="row" style="justify-content:space-between;border-bottom:1px solid var(--c-border);">
        <span style="font-size:13px;">📦 ${s.product_name || '–'} · ${s.qty} عدد</span>
        <span class="amount-positive">${formatCurrency(s.total)}</span>
      </div>`).join('')}
  </div>` : ''}
  `;
};

/* ══════════════════════════════════════════════════════════════
   ✅ NEW: تسجيل غياب
   ══════════════════════════════════════════════════════════════ */
window.openMarkAbsence = function(empId, empName, salary) {
  const today = new Date().toISOString().split('T')[0];
  inputModal({
    title: `📅 تسجيل غياب – ${empName}`,
    fields: [
      { id: 'date', label: 'تاريخ الغياب', type: 'date', value: today }
    ],
    submitLabel: 'تسجيل الغياب',
    onSubmit: async (vals) => {
      const user = await ensureUser();
      /* منع التكرار */
      const { data: existing } = await supabase
        .from('employee_attendance')
        .select('id')
        .eq('employee_id', empId)
        .eq('user_id', user.id)
        .eq('date', vals.date)
        .eq('status', 'absent')
        .single();
      if (existing) throw new Error('تم تسجيل الغياب لهذا اليوم مسبقاً');

      const { error } = await supabase.from('employee_attendance').insert({
        user_id:     user.id,
        employee_id: empId,
        date:        vals.date,
        status:      'absent',
        created_at:  new Date().toISOString()
      });
      if (error) throw new Error(error.message);
      closeModal();
      toast('تم تسجيل الغياب ✅', 'success');
      navigate('employees');
    }
  });
};

/* ══════════════════════════════════════════════════════════════
   ✅ NEW: صرف راتب (من الخزنة)
   ══════════════════════════════════════════════════════════════ */
window.openPayEmployee = function(empId, empName) {
  inputModal({
    title: `💰 صرف راتب – ${empName}`,
    fields: [
      { id: 'amount', label: 'المبلغ', type: 'number', required: true, min: '0' },
      { id: 'payment_method', label: 'طريقة الصرف', type: 'select',
        options: [
          { value: 'cash',     label: '💵 كاش' },
          { value: 'vodafone', label: '📲 فودافون' }
        ]
      },
      { id: 'treasury_type', label: 'الخزنة', type: 'select', required: true,
        options: [
          { value: 'financial_manager', label: 'المدير المالي' },
          { value: 'cashier_1', label: 'المحاسب 1' },
          { value: 'cashier_2', label: 'المحاسب 2' },
          { value: 'cashier_3', label: 'المحاسب 3' }
        ]
      }
    ],
    submitLabel: 'تأكيد الصرف',
    onSubmit: async (vals) => {
      const user = await ensureUser();
      /* إضافة في جدول مدفوعات الراتب */
      const { error } = await supabase.from('employee_salary_payments').insert({
        user_id:        user.id,
        employee_id:    empId,
        employee_name:  empName,
        amount:         Number(vals.amount),
        payment_method: vals.payment_method || 'cash',
        treasury_type:  vals.treasury_type,
        created_at:     new Date().toISOString()
      });
      if (error) throw new Error(error.message);

      /* خصم من الخزنة */
      const balField = vals.payment_method === 'vodafone' ? 'vodafone_balance' : 'cash_balance';
      const { data: t } = await supabase.from('treasury_accounts')
        .select('id,' + balField)
        .eq('user_id', user.id)
        .eq('treasury_type', vals.treasury_type)
        .single();
      if (t) {
        const newBal = Number(t[balField] || 0) - Number(vals.amount);
        await supabase.from('treasury_accounts').update({ [balField]: newBal }).eq('id', t.id);
      }

      /* إضافة في المصروفات */
      await supabase.from('expenses').insert({
        user_id:        user.id,
        description:    `راتب ${empName}`,
        amount:         Number(vals.amount),
        expense_type:   'salary',
        payment_method: vals.payment_method,
        treasury_type:  vals.treasury_type,
        date:           new Date().toISOString()
      });

      closeModal();
      toast('تم صرف الراتب ✅', 'success');
      openEmployeeAccount(empId, empName);
    }
  });
};

/* حذف غياب */
window.deleteAbsence = function(id, empId, empName) {
  confirmModal('حذف هذا الغياب؟', async () => {
    const { error } = await supabase.from('employee_attendance').delete().eq('id', id);
    if (error) { toast('فشل الحذف', 'error'); return; }
    toast('تم الحذف ✅', 'success');
    openEmployeeAccount(empId, empName);
  });
};

/* ══════════════════════════════════════════════════════════════
   RBAC الأصلي (محفوظ كاملاً)
   ══════════════════════════════════════════════════════════════ */
window.toggleEmployee = async function(id, currentActive, name, role) {
  const user = await ensureUser();
  confirmModal(`تأكيد العملية على ${name}`, async () => {
    if (currentActive) {
      if (role === 'admin') {
        const { data: admins } = await supabase
          .from('employees').select('id')
          .eq('user_id', user.id).eq('role', 'admin').eq('active', true);
        if ((admins || []).length <= 1) {
          toast('لا يمكن تعطيل آخر Admin', 'error');
          return;
        }
      }
    }
    const ok = await dbUpdate('employees', id, { active: !currentActive });
    if (!ok) { toast('فشل التحديث', 'error'); return; }
    toast('تم التحديث ✅', 'success');
    navigate('employees');
  });
};

window.openChangeRole = async function(id, name, currentRole) {
  const user = await ensureUser();
  inputModal({
    title: `تعديل صلاحية ${name}`,
    fields: [{
      id: 'role', label: 'الدور', type: 'select', value: currentRole,
      options: [
        { value: 'worker',  label: 'عامل' },
        { value: 'cashier', label: 'كاشير' },
        { value: 'admin',   label: 'مدير' }
      ]
    }],
    submitLabel: 'حفظ',
    onSubmit: async (vals) => {
      if (currentRole === 'admin' && vals.role !== 'admin') {
        const { data: admins } = await supabase
          .from('employees').select('id')
          .eq('user_id', user.id).eq('role', 'admin').eq('active', true);
        if ((admins || []).length <= 1) throw new Error('لا يمكن تغيير آخر Admin');
      }
      if (vals.role === 'admin' && currentRole !== 'admin') {
        const { data: admins } = await supabase
          .from('employees').select('id')
          .eq('user_id', user.id).eq('role', 'admin').eq('active', true);
        if (admins?.length) throw new Error('يوجد Admin بالفعل');
      }
      const ok = await dbUpdate('employees', id, { role: vals.role });
      if (!ok) throw new Error('فشل التحديث');
      closeModal();
      toast('تم تعديل الصلاحية ✅', 'success');
      navigate('employees');
    }
  });
};
