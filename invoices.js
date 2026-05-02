import {
  supabase, dbInsert, dbUpdate,
  confirmInvoice, addAuditLog, ensureUser
} from "../data.js";

import {
  toast, inputModal, confirmModal,
  formatCurrency, formatDate, emptyState, closeModal
} from "../ui.js";

/* ── Req 18: 6 product units ─────────────────────────────── */
const UNITS=[
  {value:'عداية',label:'عداية'},
  {value:'برنيكة',label:'برنيكة'},
  {value:'شوال',label:'شوال'},
  {value:'سبت',label:'سبت'},
  {value:'كرتون',label:'كرتون'},
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
    .from('suppliers')
    .select('id,name')
    .eq('user_id',user.id)
    .order('name');

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
      {id:'noulon',label:'نولون',type:'number',value:0},
      {id:'mashal',label:'مشال',type:'number',value:0},
      {id:'advance_payment',label:'دفعة مقدمة',type:'number',value:0}
    ],
    submitLabel:'إنشاء',
    onSubmit:async(vals)=>{
      const supplier=suppliers.find(s=>s.id===vals.supplier_id);

      await dbInsert('invoices',{
        supplier_id:vals.supplier_id,
        supplier_name:supplier?.name,
        status:'draft',
        commission_rate:Number(vals.commission_rate||7)/100,
        noulon:Number(vals.noulon||0),
        mashal:Number(vals.mashal||0),
        advance_payment:Number(vals.advance_payment||0),
        date:new Date().toISOString()
      });

      closeModal();
      toast('تم الإنشاء ✅','success');
      navigate('invoices');
    }
  });
};

/* ── Invoice Detail ──────────────────────────────────────── */
window.openInvoice=async function(id){
  const app=document.getElementById('app');

  const [
    {data:invoice},
    {data:products}
  ]=await Promise.all([
    supabase.from('invoices').select('*').eq('id',id).single(),
    supabase.from('invoice_products').select('*').eq('invoice_id',id)
  ]);

  const isDraft=invoice.status==='draft';
  const isConfirmed=invoice.status==='confirmed';
  const isClosed=invoice.status==='closed';

  app.innerHTML=`
  <button class="btn btn-ghost btn-sm" onclick="navigate('invoices')">← رجوع</button>

  <div class="page-header">
    <div class="page-title">${invoice.supplier_name}</div>
    <div class="page-actions">
      ${isDraft?`<button class="btn" onclick="confirmInvoiceUI('${id}')">اعتماد</button>`:''}
      ${isConfirmed?`<button class="btn btn-warning" onclick="openSupplierReturn('${id}')">رفع بضاعة</button>`:''}
    </div>
  </div>

  <div class="card">
    ${renderProductsTable(products||[],isDraft)}
  </div>`;
};

/* ── Add Product (FIXED user_id) ───────────────────────── */
window.openAddProduct=async function(invoiceId){
  const user=await ensureUser();

  inputModal({
    title:'➕ صنف',
    fields:[
      {id:'name',label:'الصنف',type:'text',required:true},
      {id:'qty',label:'الكمية',type:'number',required:true},
      {id:'unit',label:'الوحدة',type:'select',options:UNITS}
    ],
    submitLabel:'حفظ',
    onSubmit:async(vals)=>{
      await dbInsert('invoice_products',{
        invoice_id:invoiceId,
        user_id:user.id, // ✅ FIX RLS
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

/* ── Confirm ───────────────────────── */
window.confirmInvoiceUI=async function(id){
  confirmModal('اعتماد الفاتورة؟',async()=>{
    const result=await confirmInvoice(id);
    if(!result.success){
      toast('فشل','error');
      return;
    }
    toast('تم الاعتماد ✅','success');
    openInvoice(id);
  });
};

/* ── Return ───────────────────────── */
window.openSupplierReturn=async function(invoiceId){
  const {data:products}=await supabase
    .from('invoice_products')
    .select('*')
    .eq('invoice_id',invoiceId);

  inputModal({
    title:'رفع بضاعة',
    fields:[
      {id:'product_id',type:'select',options:products.map(p=>({value:p.id,label:p.name}))},
      {id:'qty',type:'number'}
    ],
    submitLabel:'تأكيد',
    onSubmit:async(vals)=>{
      const p=products.find(x=>x.id===vals.product_id);

      await dbUpdate('invoice_products',p.id,{
        returned:Number(p.returned||0)+Number(vals.qty)
      });

      closeModal();
      toast('تم الرفع ✅','success');
      openInvoice(invoiceId);
    }
  });
};