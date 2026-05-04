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
  try {
    const app=document.getElementById('app');

    const invRes = await supabase
      .from('invoices')
      .select('*')
      .eq('id',id)
      .single();

    const prodRes = await supabase
      .from('invoice_products')
      .select('*')
      .eq('invoice_id',id);

    if(invRes.error){
      console.error(invRes.error);
      toast('خطأ في تحميل الفاتورة','error');
      return;
    }

    if(prodRes.error){
      console.error(prodRes.error);
      toast('خطأ في تحميل الأصناف','error');
      return;
    }

    const invoice = invRes.data;
    const products = prodRes.data;

    if(!invoice){
      toast('❌ الفاتورة غير موجودة','error');
      return;
    }

    const isDraft=invoice.status==='draft';
    const isConfirmed=invoice.status==='confirmed';
    const isClosed=invoice.status==='closed';

    if(isClosed){
      await renderClosedInvoice(app, invoice, products||[]);
      return;
    }

    app.innerHTML=`
      <button class="btn btn-ghost btn-sm" onclick="navigate('invoices')">← رجوع</button>

      <div class="page-header">
        <div class="page-title">${invoice.supplier_name}</div>
        <div class="page-actions">
          ${isDraft?`<button class="btn" onclick="confirmInvoiceUI('${id}')">اعتماد</button>`:''}
          ${isConfirmed?`<button class="btn btn-warning" onclick="openSupplierReturn('${id}')">رفع بضاعة</button>`:''}
          ${isConfirmed?`<button class="btn btn-success" onclick="closeInvoice('${id}')">إقفال الفاتورة</button>`:''}
        </div>
      </div>

      <div class="card">
        ${renderProductsTable(products||[], isDraft, id)}
      </div>`;
  } catch(e){
    console.error(e);
    toast('❌ حصل خطأ','error');
  }
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
      const { data, error } = await supabase
        .from('invoice_products')
        .insert([{
          invoice_id: invoiceId,
          user_id: user.id,
          name: vals.name,
          qty: Number(vals.qty),
          unit: vals.unit || null,
          sold: 0,
          returned: 0
        }])
        .select();

      if (error) {
        console.error("INSERT ERROR:", error);
        toast('❌ فشل إضافة الصنف','error');
        return;
      }

      console.log("INSERT SUCCESS:", data);

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

/* ── Close Invoice ─────────────────── */
window.closeInvoice = async function(invoiceId) {
  // Step 1: Fetch invoice + sales
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (invErr || !invoice) {
    toast('خطأ في تحميل الفاتورة', 'error');
    return;
  }

  if (invoice.status === 'closed') {
    toast('الفاتورة مقفلة بالفعل', 'warning');
    return;
  }

  const salesGroups = await fetchSalesByInvoice(invoiceId);
  const totalSales = salesGroups.reduce((sum, g) => sum + g.total, 0);

  if (totalSales === 0) {
    toast('لا توجد مبيعات', 'error');
    return;
  }

  // Step 2: Calculate financials
  const nawloun = Number(invoice.noulon || 0);
  const mashal = Number(invoice.mashal || 0);
  const rawCommission = Math.round(totalSales * Number(invoice.commission_rate || 0));
  const { commission, net } = smartRound(totalSales, rawCommission, nawloun, mashal);

  // Step 3: Confirm and save
  confirmModal('هل تريد إقفال الفاتورة؟', async () => {
    // Update invoice status and financial results
    await dbUpdate('invoices', invoice.id, {
      status: 'closed',
      net: net,
      commission_final: commission,
      is_settled: true
    });

    // Add supplier transaction if not exists
    const { data: existingTx } = await supabase
      .from('supplier_transactions')
      .select('id')
      .eq('supplier_id', invoice.supplier_id)
      .eq('invoice_id', invoice.id)
      .eq('type', 'invoice_settlement');

    if (!existingTx || existingTx.length === 0) {
      await dbInsert('supplier_transactions', {
        supplier_id: invoice.supplier_id,
        amount: net,
        type: 'invoice_settlement',
        invoice_id: invoice.id
      });
    }

    // Audit log
    await addAuditLog('invoice_closed', {
      invoice_id: invoice.id,
      net: net
    });

    toast('تم إقفال الفاتورة ✅', 'success');
    openInvoice(invoiceId);
  });
};

/* ════════════════════════════════════════════════════════════
   NEW ── SETTLEMENT VIEW (فاتورة مغلقة)
   ════════════════════════════════════════════════════════════ */

/**
 * Fetch all sales rows for this invoice in ONE query,
 * then group by product name in JS.
 */
async function fetchSalesByInvoice(invoiceId){
  const {data:sales, error}=await supabase
    .from('sales')
    .select('product_name, qty, weight, total')
    .eq('invoice_id', invoiceId);

  if(error || !sales?.length) return [];

  /* Group by product_name */
  const map={};
  for(const s of sales){
    const key=s.product_name||'غير محدد';
    if(!map[key]) map[key]={name:key, count:0, weight:0, total:0};
    // FIX: count correctly (qty = 0 is legitimate, fallback only for null/undefined)
    map[key].count  += (s.qty != null && s.qty !== 0) ? Number(s.qty) : 1;
    map[key].weight += Number(s.weight||0);
    map[key].total  += Number(s.total ||0);
  }

  return Object.values(map);
}

/**
 * Smart rounding: adjust commission (only) so that
 * net = totalSales - (commission + nawloun + mashal)
 * is rounded to the nearest multiple of 5 or 10 (whichever is closer),
 * without ever increasing the net (always round down).
 */
function smartRound(totalSales, rawCommission, nawloun, mashal){
  const rawNet = totalSales - (rawCommission + nawloun + mashal);

  if(rawNet % 5 === 0 || rawNet % 10 === 0){
    return { commission: rawCommission, net: rawNet };
  }

  const floor5  = Math.floor(rawNet / 5) * 5;
  const ceil5   = Math.ceil(rawNet / 5) * 5;

  const floor10 = Math.floor(rawNet / 10) * 10;
  const ceil10  = Math.ceil(rawNet / 10) * 10;

  const candidates = [floor5, ceil5, floor10, ceil10];

  // Choose the nearest value that does NOT exceed rawNet
  const validCandidates = candidates.filter(n => n <= rawNet);

const targetNet = validCandidates.length
  ? validCandidates.sort((a, b) => (rawNet - a) - (rawNet - b))[0]
  : Math.floor(rawNet / 5) * 5;

  const delta = rawNet - targetNet;

  const adjustedCommission = rawCommission + delta;
  const net = totalSales - (adjustedCommission + nawloun + mashal);

  return { commission: adjustedCommission, net };
}

/**
 * Detect cancelled invoice:
 * - has nawloun
 * - AND (total sales = 0 OR all products fully returned)
 */
function isCancelledInvoice(invoice, products, salesGroups){
  const nawloun=Number(invoice.noulon||0);
  if(!nawloun) return false;

  const totalSales = salesGroups.reduce((sum, g) => sum + g.total, 0);
  if(totalSales === 0) return true;

  const allReturned=products.every(p=>
    Number(p.returned||0) >= Number(p.qty||0)
  );
  return allReturned;
}

/**
 * Main renderer for a closed invoice — full settlement sheet.
 * (Only renders UI, no DB writes)
 */
async function renderClosedInvoice(app, invoice, products){
  /* Single fetch for all sales */
  const salesGroups = await fetchSalesByInvoice(invoice.id);

  /* ── Cancelled case ── */
  if(isCancelledInvoice(invoice, products, salesGroups)){
    app.innerHTML=`
    <button class="btn btn-ghost btn-sm" onclick="navigate('invoices')">← رجوع</button>
    ${renderCancelledSheet(invoice)}`;
    return;
  }

  /* ── Financials ── */
  const totalSales   = salesGroups.reduce((s,g)=>s+g.total, 0);
  const nawloun      = Number(invoice.noulon||0);
  const mashal       = Number(invoice.mashal||0);
  const rawCommission= Math.round(totalSales * Number(invoice.commission_rate||0));

  const {commission, net} = smartRound(totalSales, rawCommission, nawloun, mashal);
  const totalExpenses = commission + nawloun + mashal;

  app.innerHTML=`
  <button class="btn btn-ghost btn-sm" onclick="navigate('invoices')" style="margin-bottom:12px;">← رجوع</button>
  ${renderSettlementSheet(invoice, salesGroups, totalSales, nawloun, mashal, commission, totalExpenses, net)}
  <div style="margin-top:16px;display:flex;gap:8px;">
    <button class="btn" onclick="printSettlement()">🖨️ طباعة</button>
  </div>`;
}

/* ── Settlement HTML ─────────────────────────────────────── */
function renderSettlementSheet(invoice, salesGroups, totalSales, nawloun, mashal, commission, totalExpenses, net){
  const companyName = window._companyName || 'شركتنا للجملة';

  const productsRows = salesGroups.map(g=>`
    <tr>
      <td style="padding:8px 10px;font-weight:600;">${g.name}</td>
      <td style="padding:8px 10px;text-align:center;">${g.count}</td>
      <td style="padding:8px 10px;text-align:center;">${g.weight>0? g.weight.toLocaleString()+' كيلو' : '—'}</td>
      <td style="padding:8px 10px;text-align:left;font-weight:700;">${formatCurrency(g.total)}</td>
    </tr>`).join('');

  const expensesRows=`
    <tr>
      <td style="padding:6px 10px;">نولون</td>
      <td style="padding:6px 10px;text-align:left;font-weight:600;">${formatCurrency(nawloun)}</td>
    </tr>
    <tr>
      <td style="padding:6px 10px;">عمولة (${(Number(invoice.commission_rate || 0) * 100).toFixed(1)}%)</td>
      <td style="padding:6px 10px;text-align:left;font-weight:600;">${formatCurrency(commission)}</td>
    </tr>
    ${mashal>0?`
    <tr>
      <td style="padding:6px 10px;">مشال</td>
      <td style="padding:6px 10px;text-align:left;font-weight:600;">${formatCurrency(mashal)}</td>
    </tr>`:''}
    <tr style="border-top:2px solid #e0e0e0;">
      <td style="padding:8px 10px;font-weight:700;">إجمالي المصروفات</td>
      <td style="padding:8px 10px;text-align:left;font-weight:800;color:#c0392b;">${formatCurrency(totalExpenses)}</td>
    </tr>`;

  return `
  <div id="settlement-sheet" style="
    background:#fff;
    border-radius:12px;
    padding:24px 20px;
    max-width:680px;
    margin:0 auto;
    font-family:'Cairo',sans-serif;
    direction:rtl;
    border:1px solid #e0e0e0;
    box-shadow:0 2px 12px rgba(0,0,0,.08);
  ">

    <!-- HEADER -->
    <div style="text-align:center;border-bottom:3px double #1a6b3c;padding-bottom:14px;margin-bottom:16px;">
      <div style="font-size:22px;font-weight:900;color:#1a6b3c;">${companyName}</div>
      <div style="font-size:13px;color:#666;margin-top:4px;">📅 ${formatDate(invoice.date)}</div>
      <div style="margin-top:10px;font-size:16px;font-weight:700;color:#333;">
        المستحق للسيد / <span style="color:#1a6b3c;">${invoice.supplier_name}</span>
      </div>
    </div>

    <!-- PRODUCTS TABLE -->
    <div style="font-weight:800;font-size:14px;margin-bottom:8px;color:#333;">📦 المبيعات</div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:18px;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:8px 10px;text-align:right;font-weight:700;">الصنف</th>
          <th style="padding:8px 10px;text-align:center;font-weight:700;">العدد</th>
          <th style="padding:8px 10px;text-align:center;font-weight:700;">الوزن</th>
          <th style="padding:8px 10px;text-align:left;font-weight:700;">إجمالي البيع</th>
        </tr>
      </thead>
      <tbody>
        ${productsRows}
      </tbody>
      <tfoot>
        <tr style="border-top:2px solid #1a6b3c;background:#f9fffe;">
          <td colspan="3" style="padding:10px;font-weight:800;font-size:15px;">إجمالي المبيعات</td>
          <td style="padding:10px;text-align:left;font-weight:900;font-size:16px;color:#1a6b3c;">${formatCurrency(totalSales)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- EXPENSES TABLE -->
    <div style="font-weight:800;font-size:14px;margin-bottom:8px;color:#333;">💸 المصروفات</div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
      <tbody>${expensesRows}</tbody>
    </table>

    <!-- NET PAYABLE -->
    <div style="
      background:linear-gradient(135deg,#1a6b3c,#27ae60);
      border-radius:10px;
      padding:18px 20px;
      display:flex;
      justify-content:space-between;
      align-items:center;
      color:#fff;
      font-size:18px;
      font-weight:900;
      margin-bottom:16px;
    ">
      <span>💰 صافي المستحق للمورد</span>
      <span style="font-size:22px;">${formatCurrency(net)}</span>
    </div>

    <!-- CLOSING TEXT -->
    <div style="
      text-align:center;
      font-size:15px;
      font-weight:700;
      color:#888;
      padding-top:12px;
      border-top:1px dashed #ccc;
      letter-spacing:1px;
    ">
      ✅ الفاتورة خالصة مع الشكر
    </div>

  </div>`;
}

/* ── Cancelled Invoice Sheet ─────────────────────────────── */
function renderCancelledSheet(invoice){
  const nawloun=Number(invoice.noulon||0);
  return `
  <div style="
    background:#fff;
    border-radius:12px;
    padding:24px 20px;
    max-width:680px;
    margin:0 auto;
    font-family:'Cairo',sans-serif;
    direction:rtl;
    border:2px solid #e74c3c;
    text-align:center;
  ">
    <div style="font-size:40px;margin-bottom:8px;">❌</div>
    <div style="font-size:18px;font-weight:900;color:#e74c3c;margin-bottom:8px;">فاتورة ملغاة</div>
    <div style="font-size:14px;color:#555;margin-bottom:16px;">
      المورد: <strong>${invoice.supplier_name}</strong> &nbsp;|&nbsp; 📅 ${formatDate(invoice.date)}
    </div>
    ${nawloun>0?`
    <div style="
      background:#fff5f5;border:1px solid #e74c3c;
      border-radius:8px;padding:12px;font-size:14px;
    ">
      يُخصم من رصيد المورد: <strong style="color:#e74c3c;">${formatCurrency(nawloun)}</strong> (نولون)
    </div>`:''}
  </div>`;
}

/* ── Print helper ────────────────────────────────────────── */
window.printSettlement=function(){
  const sheet=document.getElementById('settlement-sheet');
  if(!sheet){ toast('لا يوجد شيء للطباعة','warning'); return; }

  const win=window.open('','_blank','width=750,height=900');
  win.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>فاتورة تسوية</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
      <style>
        *{box-sizing:border-box;margin:0;padding:0;}
        body{
          font-family:'Cairo',sans-serif;
          direction:rtl;
          background:#fff;
          padding:20px;
        }
        /* PRINT FIX: full width for settlement sheet */
        #settlement-sheet { width: 100%; }
        table{width:100%;border-collapse:collapse;}
        @media print{
          body{padding:0;}
        }
      </style>
    </head>
    <body>
      ${sheet.outerHTML}
      <script>window.onload=()=>{window.print();}<\/script>
    </body>
    </html>`);
  win.document.close();
};

function renderProductsTable(products, isDraft, invoiceId){
  if(!products.length){
    return `
      <div style="padding:20px;text-align:center;color:var(--c-text-muted);">
        لا توجد أصناف
      </div>
      ${isDraft ? `
        <div style="padding:10px;">
          <button class="btn" onclick="openAddProduct('${invoiceId}')">
            ➕ إضافة صنف
          </button>
        </div>
      ` : ''}
    `;
  }

  return `
    <div style="padding:10px;">
      ${products.map(p=>`
        <div style="
          display:flex;
          justify-content:space-between;
          padding:10px;
          border-bottom:1px solid var(--c-border);
        ">
          <div>
            <div style="font-weight:700;">${p.name}</div>
            <div style="font-size:12px;color:var(--c-text-muted);">
              ${p.qty} ${p.unit || ''}
            </div>
          </div>
          <div style="font-size:12px;">
            مباع: ${p.sold || 0} <br>
            مرتجع: ${p.returned || 0}
          </div>
        </div>
      `).join('')}

      ${isDraft ? `
        <div style="margin-top:10px;">
          <button class="btn" onclick="openAddProduct('${invoiceId}')">
            ➕ إضافة صنف
          </button>
        </div>
      ` : ''}
    </div>
  `;
                    }
