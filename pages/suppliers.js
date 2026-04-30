import { supabase, dbInsert, dbUpdate, dbDelete, ensureUser } from "../data.js";
import { toast, inputModal, confirmModal, formatCurrency, formatDate, emptyState } from "../ui.js";

/* ── صفحة الموردين ───────────────────────────────────────── */
export async function renderSuppliersPage(app){
  const user = await ensureUser();

  const {data:suppliers}=await supabase
    .from('suppliers')
    .select('*')
    .eq('user_id',user.id)
    .order('name');

  app.innerHTML=`
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">🚚 الموردين</div>
      <div class="page-subtitle">${(suppliers||[]).length} مورد</div>
    </div>
    <div class="page-actions">
      <button class="btn" onclick="openAddSupplier()">+ إضافة مورد</button>
    </div>
  </div>

  <div class="sort-bar">
    <input type="search" placeholder="🔍 بحث..." id="sup-search"
      oninput="filterSuppliers(this.value)"
      style="flex:1;padding:8px 14px;border:1px solid var(--c-border);border-radius:10px;background:var(--c-surface);font-family:Cairo;font-size:13px;">
    <select onchange="sortSuppliers(this.value)"
      style="padding:7px 28px 7px 10px;border:1px solid var(--c-border);border-radius:10px;font-family:Cairo;font-size:12px;background:var(--c-surface);">
      <option value="name-asc">الاسم أ–ي</option>
      <option value="name-desc">الاسم ي–أ</option>
    </select>
  </div>

  <div id="suppliers-list">
    ${renderSupplierCards(suppliers||[])}
  </div>`;

  window._allSuppliers=suppliers||[];
}

function renderSupplierCards(list){
  if(!list.length){
    return emptyState('🚚','لا يوجد موردين','أضف مورداً للبدء',
      `<button class="btn" onclick="openAddSupplier()">+ إضافة مورد</button>`);
  }

  return list.map(s=>`
  <div class="card" style="cursor:pointer;"
    onclick="openSupplier('${s.id}','${(s.name||'').replace(/'/g,"&#39;")}')">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-weight:700;font-size:15px;">🚚 ${s.name}</div>
        ${s.phone?`<div style="font-size:12px;color:var(--c-text-muted);">📞 ${s.phone}</div>`:''}
        ${s.opening_balance?`<div style="font-size:12px;color:var(--c-text-muted);">رصيد مبدئي: ${formatCurrency(s.opening_balance)}</div>`:''}
      </div>
      <span class="badge badge-blue">حساب ←</span>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;" onclick="event.stopPropagation();">
      <button class="btn btn-sm btn-ghost edit"
        onclick="editSupplier('${s.id}','${(s.name||'').replace(/'/g,"&#39;")}','${s.phone||''}','${s.opening_balance||0}')">✏️</button>
      <button class="btn btn-sm btn-icon"
        onclick="deleteSupplier('${s.id}','${(s.name||'').replace(/'/g,"&#39;")}')">🗑️</button>
    </div>
  </div>`).join('');
}

window.filterSuppliers=function(q){
  const list=window._allSuppliers||[];
  q=(q||'').toLowerCase();
  const filtered=q?list.filter(s=>(s.name||'').toLowerCase().includes(q)):list;
  document.getElementById('suppliers-list').innerHTML=renderSupplierCards(filtered);
};

window.sortSuppliers=function(by){
  const list=[...(window._allSuppliers||[])];
  if(by==='name-asc') list.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ar'));
  if(by==='name-desc') list.sort((a,b)=>(b.name||'').localeCompare(a.name||'','ar'));
  document.getElementById('suppliers-list').innerHTML=renderSupplierCards(list);
};

window.openAddSupplier=async function(){
  inputModal({
    title:'إضافة مورد',
    fields:[
      {id:'name',label:'اسم المورد',type:'text',required:true},
      {id:'phone',label:'الهاتف',type:'tel'},
      {id:'opening_balance',label:'رصيد مبدئي (ما يستحقه المورد)',type:'number',value:0,min:'0'}
    ],
    submitLabel:'حفظ',
    onSubmit:async(vals)=>{
      await dbInsert('suppliers',{
        name:vals.name,
        phone:vals.phone||null,
        opening_balance:Number(vals.opening_balance||0)
      });
      closeModal();
      toast('تم إضافة المورد ✅','success');
      navigate('suppliers');
    }
  });
};

window.editSupplier=async function(id,name,phone,openBal){
  inputModal({
    title:'تعديل بيانات المورد',
    fields:[
      {id:'name',label:'الاسم',required:true,value:name},
      {id:'phone',label:'هاتف',value:phone},
      {id:'opening_balance',label:'رصيد مبدئي',type:'number',value:parseFloat(openBal)||0}
    ],
    submitLabel:'حفظ التعديل',
    onSubmit:async(vals)=>{
      const ok=await dbUpdate('suppliers',id,{
        name:vals.name,
        phone:vals.phone||null,
        opening_balance:Number(vals.opening_balance||0)
      });
      if(!ok) throw new Error('فشل التعديل');
      closeModal();
      toast('تم التعديل ✅','success');
      navigate('suppliers');
    }
  });
};

window.deleteSupplier=function(id,name){
  confirmModal(`حذف المورد "${name}"؟`,async()=>{
    await dbDelete('suppliers',id);
    toast('تم الحذف','success');
    navigate('suppliers');
  });
};

window.openSupplier=async function(supplierId, supplierName){
  const app=document.getElementById('app');
  app.innerHTML=`<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>`;

  const user=await ensureUser();

  const [
    {data:supplierData},
    {data:invoices},
    {data:supplierPayments}
  ]=await Promise.all([
    supabase.from('suppliers').select('*').eq('id',supplierId).single(),
    supabase.from('invoices').select('*').eq('user_id',user.id).eq('supplier_id',supplierId).order('date',{ascending:false}),
    supabase.from('expenses').select('*').eq('user_id',user.id).eq('expense_type','supplier_payment').eq('supplier_id',supplierId).order('created_at',{ascending:false})
  ]);

  const openingBal=Number(supplierData?.opening_balance||0);
  const closed=(invoices||[]).filter(i=>i.status==='closed');

  const totalSettlements=closed.reduce((s,i)=>s+Number(i.net||0),0);
  const grandTotal=openingBal+totalSettlements;

  const paidToSupplier=(supplierPayments||[]).reduce((s,p)=>s+Number(p.amount||0),0);
  const remaining=Math.max(0,grandTotal-paidToSupplier);

  app.innerHTML=`
  <button class="btn btn-ghost btn-sm" onclick="navigate('suppliers')">← رجوع</button>

  <div class="page-header" style="margin-top:12px;">
    <div class="page-header-left">
      <div class="page-title">🚚 ${supplierName}</div>
      ${supplierData?.phone?`<div class="page-subtitle">📞 ${supplierData.phone}</div>`:''}
    </div>
    <div class="page-actions">
      <button class="btn btn-sm" onclick="openSupplierPayment('${supplierId}','${supplierName}',${remaining})">💵 دفعة للمورد</button>
    </div>
  </div>

  <div class="card" style="margin-bottom:16px;">
    <div class="card-header"><span class="card-title">📊 ملخص الحساب</span></div>
    <table style="width:100%;font-size:14px;border-collapse:collapse;">
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:8px 4px;color:var(--c-text-muted);">رصيد مبدئي</td>
        <td style="padding:8px 4px;text-align:left;font-weight:700;color:var(--c-positive);">${formatCurrency(openingBal)}</td>
      </tr>
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:8px 4px;color:var(--c-text-muted);">تسويات فواتير (صافي)</td>
        <td style="padding:8px 4px;text-align:left;font-weight:700;color:var(--c-positive);">${formatCurrency(totalSettlements)}</td>
      </tr>
      <tr style="border-bottom:2px solid var(--c-border-2);background:var(--c-surface-3);">
        <td style="padding:10px 4px;font-weight:800;">الإجمالي المستحق</td>
        <td style="padding:10px 4px;text-align:left;font-weight:800;font-size:16px;">${formatCurrency(grandTotal)}</td>
      </tr>
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:8px 4px;color:var(--c-text-muted);">مدفوعات للمورد</td>
        <td style="padding:8px 4px;text-align:left;font-weight:700;color:var(--c-negative);">(${formatCurrency(paidToSupplier)})</td>
      </tr>
      <tr style="background:${remaining>0?'var(--c-warning-bg)':'var(--c-success-bg)'};">
        <td style="padding:10px 4px;font-weight:800;font-size:15px;">المتبقي للمورد</td>
        <td style="padding:10px 4px;text-align:left;font-weight:800;font-size:18px;color:${remaining>0?'var(--c-warning)':'var(--c-success)'};">${formatCurrency(remaining)}</td>
      </tr>
    </table>
  </div>

  <div class="card" style="margin-bottom:16px;">
    <div class="card-header">
      <span class="card-title">📄 الفواتير</span>
      <span class="badge">${(invoices||[]).length}</span>
    </div>
    ${!(invoices||[]).length
      ? `<div style="text-align:center;color:var(--c-text-muted);padding:16px;">لا توجد فواتير</div>`
      : `<div class="table-wrapper">
          <table class="table table-clickable">
            <thead><tr>
              <th>التاريخ</th><th>الحالة</th>
              <th>الإجمالي</th><th>العمولة</th><th>الصافي</th>
            </tr></thead>
            <tbody>
            ${(invoices||[]).map(i=>{
              const statusMap={draft:'مسودة',confirmed:'مؤكدة',closed:'مغلقة'};
              const statusClass={draft:'badge',confirmed:'badge badge-yellow',closed:'badge badge-green'};
              return `
              <tr onclick="openInvoice('${i.id}')" style="cursor:pointer;">
                <td style="font-size:12px;color:var(--c-text-muted);">${formatDate(i.date)}</td>
                <td><span class="${statusClass[i.status]||'badge'}">${statusMap[i.status]||i.status}</span></td>
                <td class="amount-positive">${formatCurrency(i.gross)}</td>
                <td class="amount-negative">${formatCurrency(i.commission)}</td>
                <td style="font-weight:800;">${formatCurrency(i.net)}</td>
              </tr>`;
            }).join('')}
            </tbody>
          </table>
         </div>`}
  </div>

  <div class="card">
    <div class="card-header">
      <span class="card-title">💵 مدفوعات للمورد</span>
      <span class="badge badge-red">${formatCurrency(paidToSupplier)}</span>
    </div>
    ${!(supplierPayments||[]).length
      ? `<div style="text-align:center;color:var(--c-text-muted);padding:12px;">لا توجد مدفوعات</div>`
      : `<div class="table-wrapper">
          <table class="table">
            <thead><tr><th>التاريخ</th><th>البيان</th><th>المبلغ</th><th></th></tr></thead>
            <tbody>
            ${(supplierPayments||[]).map(p=>`
            <tr>
              <td style="font-size:12px;color:var(--c-text-muted);">${formatDate(p.date||p.created_at)}</td>
              <td>${p.description||'دفعة مورد'}</td>
              <td class="amount-negative">${formatCurrency(p.amount)}</td>
              <td>
                <button class="btn btn-icon btn-sm"
                  onclick="deleteSupplierPayment('${p.id}','${supplierId}','${supplierName}')">🗑️</button>
              </td>
            </tr>`).join('')}
            </tbody>
          </table>
         </div>`}
  </div>`;
};

window.deleteSupplierPayment=function(id,supplierId,supplierName){
  confirmModal('حذف هذه الدفعة؟',async()=>{
    await dbDelete('expenses',id);
    toast('تم الحذف','success');
    openSupplier(supplierId,supplierName);
  });
};

window.openSupplierPayment=async function(supplierId, supplierName, remainingBalance){
  inputModal({
    title:`💵 دفعة للمورد ${supplierName}`,
    fields:[
      {id:'amount',label:'المبلغ',type:'number',required:true,min:'0'},
      {id:'treasury_type',label:'الخزنة',type:'select',options:[
        {value:'financial_manager',label:'المدير المالي'},
        {value:'cashier_1',label:'المحاسب 1'},
        {value:'cashier_2',label:'المحاسب 2'},
        {value:'cashier_3',label:'المحاسب 3'}
      ]}
    ],
    submitLabel:'تأكيد الدفع',
    onSubmit:async(vals)=>{
      const amount=Number(vals.amount||0);
      if(amount>remainingBalance) throw new Error('المبلغ أكبر من المتبقي للمورد');

      await dbInsert('expenses',{
        description:`دفعة مورد ${supplierName}`,
        amount,
        expense_type:'supplier_payment',
        supplier_id:supplierId,
        treasury_type:vals.treasury_type,
        date:new Date().toISOString()
      });

      closeModal();
      toast('تم تسجيل دفعة المورد ✅','success');
      openSupplier(supplierId,supplierName);
    }
  });
};