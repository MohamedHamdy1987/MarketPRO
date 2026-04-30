import {
  supabase, dbInsert, dbUpdate,
  confirmInvoice, addAuditLog, ensureUser
} from "../data.js";

import {
  toast, inputModal, confirmModal,
  formatCurrency, formatDate, emptyState
} from "../ui.js";

/* ── Req 18: 6 product units ─────────────────────────────── */
const UNITS=[
  {value:'عداية',   label:'عداية'},
  {value:'برنيكة',  label:'برنيكة'},
  {value:'شوال',    label:'شوال'},
  {value:'سبت',     label:'سبت'},
  {value:'كرتون',   label:'كرتون'},
  {value:'صندوق خشب',label:'صندوق خشب'},
];

const STATUS_MAP={draft:'مسودة',confirmed:'مؤكدة',closed:'مغلقة'};
const STATUS_CLASS={draft:'badge',confirmed:'badge badge-yellow',closed:'badge badge-green'};

/* ── صفحة الفواتير ───────────────────────────────────────── */
export async function renderInvoicesPage(app){
  const user=await ensureUser();

  const {data:invoices}=await supabase
    .from('invoices')
    .select('*')
    .eq('user_id',user.id)
    .order('created_at',{ascending:false});

  app.innerHTML=`
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">📄 الفواتير</div>
      <div class="page-subtitle">${(invoices||[]).length} فاتورة</div>
    </div>
    <div class="page-actions">
      <button class="btn" onclick="openCreateInvoice()">+ فاتورة جديدة</button>
    </div>
  </div>

  <div id="invoices-list">
    ${renderInvoiceCards(invoices||[])}
  </div>`;

  window._allInvoices=invoices||[];
}

function renderInvoiceCards(list){
  if(!list.length){
    return emptyState('📄','لا توجد فواتير','أنشئ فاتورة لبدء العمل',
      `<button class="btn" onclick="openCreateInvoice()">+ فاتورة جديدة</button>`);
  }

  return list.map(inv=>`
  <div class="card" onclick="openInvoice('${inv.id}')" style="cursor:pointer;">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-weight:700;font-size:15px;">🚚 ${inv.supplier_name}</div>
        <div style="font-size:12px;color:var(--c-text-muted);">📅 ${formatDate(inv.date)}</div>
      </div>
      <div style="text-align:left;">
        <span class="${STATUS_CLASS[inv.status]||'badge'}">${STATUS_MAP[inv.status]||inv.status}</span>
        ${inv.status==='closed'?`<div style="font-weight:800;font-size:13px;color:var(--c-primary);margin-top:4px;">${formatCurrency(inv.net)}</div>`:''}
      </div>
    </div>
  </div>`).join('');
}

/* ── Create Invoice ──────────────────────────────────────── */
window.openCreateInvoice=async function(){
  const user=await ensureUser();
  const {data:suppliers}=await supabase
    .from('suppliers').select('id,name').eq('user_id',user.id).order('name');

  if(!suppliers?.length){
    toast('أضف مورداً أولاً','warning');
    return;
  }

  inputModal({
    title:'📄 فاتورة جديدة',
    fields:[
      {id:'supplier_id',label:'المورد',type:'select',required:true,
        options:suppliers.map(s=>({value:s.id,label:s.name}))},
      {id:'commission_rate',label:'نسبة العمولة %',type:'number',value:7,min:'0'},
      {id:'noulon',label:'نولون (مصاريف شحن)',type:'number',value:0,min:'0'},
      {id:'mashal',label:'مشال (عمال)',type:'number',value:0,min:'0'},
      {id:'advance_payment',label:'دفعة مقدمة',type:'number',value:0,min:'0'}
    ],
    submitLabel:'إنشاء الفاتورة',
    onSubmit:async(vals)=>{
      const supplier=suppliers.find(s=>s.id===vals.supplier_id);
      await dbInsert('invoices',{
        supplier_id:vals.supplier_id,
        supplier_name:supplier?.name,
        status:'draft',
        commission_rate:Number(vals.commission_rate||7)/100,
        noulon:vals.noulon||0,
        mashal:vals.mashal||0,
        advance_payment:vals.advance_payment||0,
        date:new Date().toISOString()
      });
      closeModal();
      toast('تم إنشاء الفاتورة ✅','success');
      navigate('invoices');
    }
  });
};

/* ── Invoice Detail ──────────────────────────────────────── */
window.openInvoice=async function(id){
  const app=document.getElementById('app');
  app.innerHTML=`<div class="skeleton skeleton-card"></div>`;

  const [
    {data:invoice},
    {data:products}
  ]=await Promise.all([
    supabase.from('invoices').select('*').eq('id',id).single(),
    supabase.from('invoice_products').select('*').eq('invoice_id',id).order('name')
  ]);

  const isDraft     = invoice.status==='draft';
  const isConfirmed = invoice.status==='confirmed';
  const isClosed    = invoice.status==='closed';

  app.innerHTML=`
  <button class="btn btn-ghost btn-sm" onclick="navigate('invoices')">← رجوع</button>

  <div class="page-header" style="margin-top:12px;">
    <div class="page-header-left">
      <div class="page-title">🚚 ${invoice.supplier_name}</div>
      <div class="page-subtitle">
        📅 ${formatDate(invoice.date)} •
        <span class="${STATUS_CLASS[invoice.status]||'badge'}">${STATUS_MAP[invoice.status]||invoice.status}</span>
      </div>
    </div>
    <div class="page-actions">
      ${isDraft?`<button class="btn" onclick="confirmInvoiceUI('${id}')">✅ اعتماد</button>`:''}
      ${isConfirmed?`<button class="btn btn-warning" onclick="openSupplierReturn('${id}')">↩️ رفع بضاعة</button>`:''}
      ${isClosed?`<button class="btn btn-ghost btn-sm" onclick="openEditCommission('${id}')">✏️ تعديل العمولة</button>`:''}
    </div>
  </div>

  <!-- Invoice info -->
  <div class="card" style="margin-bottom:12px;">
    <div class="card-header"><span class="card-title">📋 تفاصيل الفاتورة</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;font-size:13px;">
      <div><span style="color:var(--c-text-muted);">العمولة</span><br><b>${(Number(invoice.commission_rate||0)*100).toFixed(1)}%</b></div>
      <div><span style="color:var(--c-text-muted);">نولون</span><br><b>${formatCurrency(invoice.noulon)}</b></div>
      <div><span style="color:var(--c-text-muted);">مشال</span><br><b>${formatCurrency(invoice.mashal)}</b></div>
      <div><span style="color:var(--c-text-muted);">دفعة مقدمة</span><br><b>${formatCurrency(invoice.advance_payment)}</b></div>
      ${isClosed?`
      <div><span style="color:var(--c-text-muted);">إجمالي المبيعات</span><br><b style="color:var(--c-positive);">${formatCurrency(invoice.gross)}</b></div>
      <div><span style="color:var(--c-text-muted);">العمولة المحتسبة</span><br><b style="color:var(--c-negative);">${formatCurrency(invoice.commission)}</b></div>
      <div><span style="color:var(--c-text-muted);">الصافي للمورد</span><br><b style="font-size:16px;color:var(--c-primary);">${formatCurrency(invoice.net)}</b></div>
      `:''}
    </div>
  </div>

  <!-- Products -->
  <div class="card">
    <div class="card-header">
      <span class="card-title">📦 الأصناف</span>
      ${isDraft?`<button class="btn btn-sm" onclick="openAddProduct('${id}')">+ صنف</button>`:''}
    </div>
    ${renderProductsTable(products||[], isDraft)}
  </div>`;
};

function renderProductsTable(products, isDraft){
  if(!products.length){
    return `<div style="text-align:center;color:var(--c-text-muted);padding:20px;">لا توجد أصناف – أضف صنفاً</div>`;
  }

  return `
  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>الصنف</th>
          <th>الوحدة</th>
          <th>الكمية</th>
          <th>مباع</th>
          <th>مرتجع</th>
          <th>متبقي</th>
          <th>إجمالي المبيعات</th>
        </tr>
      </thead>
      <tbody>
      ${products.map(p=>{
        const rem=Number(p.qty)-Number(p.sold||0)-Number(p.returned||0);
        return `
        <tr>
          <td style="font-weight:600;">${p.name}</td>
          <td>${p.unit?`<span class="badge">${p.unit}</span>`:'–'}</td>
          <td>${p.qty}</td>
          <td>${p.sold||0}</td>
          <td>${p.returned||0}</td>
          <td style="font-weight:700;color:${rem>0?'var(--c-primary)':'var(--c-danger)'};">${rem}</td>
          <td class="amount-positive">${p.sales_total?formatCurrency(p.sales_total):'–'}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
  </div>`;
}

/* ── Confirm Invoice ─────────────────────────────────────── */
window.confirmInvoiceUI=async function(id){
  confirmModal('اعتماد الفاتورة؟ لن تتمكن من تعديل الأصناف بعدها.',async()=>{
    const result=await confirmInvoice(id);
    if(!result.success){
      toast('فشل الاعتماد','error');
      return;
    }
    await addAuditLog('confirm_invoice',{invoiceId:id});
    toast('تم الاعتماد ✅','success');
    openInvoice(id);
  });
};

/* ── Add Product – Req 18 (unit field) ─────────────────────*/
window.openAddProduct=async function(invoiceId){
  inputModal({
    title:'➕ إضافة صنف',
    fields:[
      {id:'name',label:'اسم الصنف',type:'text',required:true},
      {id:'qty',label:'الكمية',type:'number',required:true,min:'1'},
      {id:'unit',label:'الوحدة',type:'select',options:UNITS}
    ],
    submitLabel:'إضافة الصنف',
    onSubmit:async(vals)=>{
      await supabase.from('invoice_products').insert({
        invoice_id:invoiceId,
        name:vals.name,
        qty:Number(vals.qty),
        unit:vals.unit||null,
        sold:0,
        returned:0
      });
      closeModal();
      toast('تمت الإضافة ✅','success');
      openInvoice(invoiceId);
    }
  });
};

/* ── Supplier Return (رفع بضاعة) ── Req 12: confirmed only ─ */
window.openSupplierReturn=async function(invoiceId){
  const {data:products}=await supabase
    .from('invoice_products').select('*').eq('invoice_id',invoiceId);

  const available=products.filter(p=>
    (Number(p.qty)-Number(p.sold||0)-Number(p.returned||0))>0
  );

  if(!available.length){
    toast('لا يوجد كمية متبقية للرفع','warning');
    return;
  }

  inputModal({
    title:'↩️ رفع بضاعة للمورد',
    fields:[
      {id:'product_id',label:'الصنف',type:'select',required:true,
        options:available.map(p=>({value:p.id,label:`${p.name} (متبقي: ${Number(p.qty)-Number(p.sold||0)-Number(p.returned||0)})`}))},
      {id:'qty',label:'كمية الرفع',type:'number',required:true,min:'1'}
    ],
    submitLabel:'تأكيد الرفع',
    onSubmit:async(vals)=>{
      const p=products.find(x=>x.id===vals.product_id);
      const avail=Number(p.qty)-Number(p.sold||0)-Number(p.returned||0);
      if(Number(vals.qty)>avail) throw new Error(`أكبر من المتبقي (${avail})`);

      await dbUpdate('invoice_products',p.id,{
        returned:Number(p.returned||0)+Number(vals.qty)
      });

      await addAuditLog('supplier_return',{invoiceId,...vals});
      closeModal();
      toast('تم رفع البضاعة ✅','success');
      openInvoice(invoiceId);
    }
  });
};

/* ── Edit Commission – Req 12: closed invoice only ──────── */
window.openEditCommission=async function(invoiceId){
  const {data:inv}=await supabase
    .from('invoices').select('*').eq('id',invoiceId).single();

  inputModal({
    title:'✏️ تعديل العمولة (فاتورة مغلقة)',
    fields:[
      {id:'rate',label:'نسبة العمولة الجديدة %',type:'number',
        value:Number(inv.commission_rate)*100,min:'0',step:'0.1'}
    ],
    submitLabel:'تحديث',
    onSubmit:async(vals)=>{
      const rate=Number(vals.rate)/100;
      const gross=Number(inv.gross||0);
      const commission=gross*rate;
      const net=gross-commission
        -Number(inv.noulon||0)
        -Number(inv.mashal||0)
        -Number(inv.advance_payment||0);

      await dbUpdate('invoices',invoiceId,{commission_rate:rate,commission,net});
      await addAuditLog('edit_commission',{invoiceId,rate});
      closeModal();
      toast('تم تعديل العمولة ✅','success');
      openInvoice(invoiceId);
    }
  });
};