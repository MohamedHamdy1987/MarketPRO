import { supabase, dbUpdate, addAuditLog, sellProductAtomic, ensureUser } from "../data.js";
import { toast, modal, closeModal, formatCurrency, formatDate, inputModal } from "../ui.js";

async function returnProductAtomic(productId, qty) {
  const user = await ensureUser();
  const { error } = await supabase.rpc("return_product_atomic", {
    p_product_id: productId,
    p_qty: qty,
    p_user_id: user.id
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function renderSalesPage(app) {
  const user = await ensureUser();
  const { data: invoices } = await supabase
    .from("invoices")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "confirmed")
    .order("date", { ascending: false });

  app.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">🛒 المبيعات</div>
        <div class="page-subtitle">${(invoices || []).length} فاتورة مفتوحة للبيع</div>
      </div>
    </div>
    ${
      !(invoices || []).length
        ? `<div class="empty-state">
             <div class="empty-icon">📭</div>
             <div class="empty-title">لا توجد فواتير مفتوحة</div>
             <button class="btn" onclick="navigate('invoices')">📄 الفواتير</button>
           </div>`
        : (invoices || []).map(inv => `
          <div class="card" onclick="openSalesInvoice('${inv.id}')" style="cursor:pointer;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-weight:700;font-size:15px;">🚚 ${inv.supplier_name}</div>
                <div style="font-size:12px;color:var(--c-text-muted);">${formatDate(inv.date)}</div>
              </div>
              <button class="btn btn-sm" onclick="event.stopPropagation();openSalesInvoice('${inv.id}')">بيع ←</button>
            </div>
          </div>`).join('')
    }`;
}

window.openSalesInvoice = async function(invoiceId) {
  const app = document.getElementById("app");
  const [ { data: invoice }, { data: products } ] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", invoiceId).single(),
    supabase.from("invoice_products").select("*").eq("invoice_id", invoiceId).order("name")
  ]);
  const sold = (products || []).reduce((s, p) => s + Number(p.sold || 0), 0);
  const rem = (products || []).reduce((s, p) => s + ((p.qty || 0) - (p.sold || 0) - (p.returned || 0)), 0);
  app.innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="navigate('sales')">← رجوع</button>
    <div class="page-header" style="margin-top:12px;">
      <div class="page-title">🛒 ${invoice.supplier_name}</div>
      <div class="page-subtitle">مباع ${sold} • متبقي ${rem}</div>
    </div>
    ${renderProducts(products, invoiceId)}`;
};

function renderProducts(products, invoiceId) {
  if (!products?.length) return `<div class="card" style="text-align:center;color:var(--c-text-muted);">لا توجد أصناف</div>`;
  return products.map(p => {
    const rem = (p.qty || 0) - (p.sold || 0) - (p.returned || 0);
    const unitLabel = p.unit ? `<span class="badge" style="margin-right:4px;">${p.unit}</span>` : '';
    return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-weight:700;font-size:15px;">📦 ${p.name} ${unitLabel}</div>
          <div style="font-size:12px;color:var(--c-text-muted);margin-top:4px;">
            الكمية ${p.qty} | مباع ${p.sold || 0} | مرتجع ${p.returned || 0}
          </div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:20px;font-weight:800;color:${rem > 0 ? 'var(--c-primary)' : 'var(--c-danger)'};">${rem}</div>
          <div style="font-size:10px;color:var(--c-text-muted);">متبقي</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
        ${rem > 0 ? `<button class="btn btn-sm" onclick="sellProduct('${p.id}','${invoiceId}')">💰 بيع</button>` : `<span class="badge badge-red">نفذ</span>`}
        ${rem > 0 ? `<button class="btn btn-warning btn-sm" onclick="returnProduct('${p.id}','${invoiceId}')">↩️ رفع مورد</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

window.sellProduct = async function(productId, invoiceId) {
  if (window._saleLock) { toast("عملية جارية...", "warning"); return; }
  const [{ data: customers }, { data: shops }, { data: partners }, { data: product }] = await Promise.all([
    supabase.from("customers").select("id,full_name").order("full_name"),
    supabase.from("market_shops").select("id,name").order("name"),
    supabase.from("partners").select("id,name").order("name"),
    supabase.from("invoice_products").select("*").eq("id", productId).single()
  ]);
  const custOptions = (customers || []).map(c => `<option value="${c.id}">${c.full_name}</option>`).join('');
  const shopOptions = (shops || []).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  const partnerOptions = (partners || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  modal(`
    <h3 style="margin-bottom:16px;">💰 تسجيل بيع – ${product?.name || ''}</h3>
    <div style="margin-bottom:14px;">
      <label>نوع البيع</label>
      <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
        <button type="button" id="type-cash" class="btn btn-sm active-type" onclick="setSaleType('cash')" style="flex:1;">💵 كاش</button>
        <button type="button" id="type-credit" class="btn btn-ghost btn-sm" onclick="setSaleType('credit')" style="flex:1;">📋 آجل</button>
        <button type="button" id="type-shop" class="btn btn-ghost btn-sm" onclick="setSaleType('shop')" style="flex:1;">🏬 محل</button>
        <button type="button" id="type-partner" class="btn btn-ghost btn-sm" onclick="setSaleType('partner')" style="flex:1;">🤝 شريك</button>
        <button type="button" id="type-employee" class="btn btn-ghost btn-sm" onclick="setSaleType('employee')" style="flex:1;">✍️ موظف</button>
      </div>
      <input type="hidden" id="sell-type" value="cash">
    </div>
    <div style="margin-bottom:12px;"><label>عدد (عداد)</label><input type="number" id="sell-count" min="0" step="1" placeholder="الكمية بالعدد" oninput="calcSellTotal()"></div>
    <div style="margin-bottom:12px;"><label>وزن (كيلو) – يُستخدم بدل العدد إذا أدخلته</label><input type="number" id="sell-weight" min="0" step="0.01" placeholder="اختياري" oninput="calcSellTotal()"></div>
    <div style="margin-bottom:12px;"><label>السعر للوحدة</label><input type="number" id="sell-price" min="0" step="0.01" placeholder="0.00" oninput="calcSellTotal()"></div>
    <div id="sell-total-display" style="background:var(--c-success-bg);border:1px solid var(--c-border-2);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:15px;font-weight:800;color:var(--c-primary);text-align:center;display:none;">الإجمالي: <span id="sell-total-val">0</span> ج</div>
    <div id="sell-customer-row" style="margin-bottom:12px;display:none;"><label>العميل <span style="color:var(--c-danger);">*</span></label><select id="sell-customer"><option value="">-- اختر العميل --</option>${custOptions}</select></div>
    <div id="sell-shop-row" style="margin-bottom:12px;display:none;"><label>المحل <span style="color:var(--c-danger);">*</span></label><select id="sell-shop"><option value="">-- اختر المحل --</option>${shopOptions}</select></div>
    <div id="sell-partner-row" style="margin-bottom:12px;display:none;"><label>الشريك / الموظف <span style="color:var(--c-danger);">*</span></label><select id="sell-partner"><option value="">-- اختر --</option>${partnerOptions}</select></div>
    <div id="sell-error" style="display:none;background:var(--c-danger-bg);color:var(--c-danger);padding:8px 12px;border-radius:8px;margin-bottom:10px;font-size:13px;border:1px solid #fca5a5;"></div>
    <div style="display:flex;gap:8px;flex-direction:row-reverse;">
      <button id="sell-submit" class="btn" style="flex:1;" onclick="submitSellProduct('${productId}','${invoiceId}')">✅ تأكيد البيع</button>
      <button class="btn btn-ghost" style="flex:1;" onclick="closeModal()">إلغاء</button>
    </div>
  `, { preventClose: true });
  window._sellCustomers = customers || [];
  window._sellShops = shops || [];
  window._sellPartners = partners || [];
};

window.setSaleType = function(type) {
  document.getElementById('sell-type').value = type;
  ['cash','credit','shop','partner','employee'].forEach(t => {
    const btn = document.getElementById(`type-${t}`);
    if (btn) btn.className = t === type ? 'btn btn-sm active-type' : 'btn btn-ghost btn-sm';
  });
  document.getElementById('sell-customer-row').style.display = type === 'credit' ? 'block' : 'none';
  document.getElementById('sell-shop-row').style.display = type === 'shop' ? 'block' : 'none';
  document.getElementById('sell-partner-row').style.display = (type === 'partner' || type === 'employee') ? 'block' : 'none';
};

window.calcSellTotal = function() {
  const weight = parseFloat(document.getElementById('sell-weight')?.value) || 0;
  const count = parseFloat(document.getElementById('sell-count')?.value) || 0;
  const price = parseFloat(document.getElementById('sell-price')?.value) || 0;
  const qty = weight > 0 ? weight : count;
  const total = qty * price;
  const disp = document.getElementById('sell-total-display');
  const val = document.getElementById('sell-total-val');
  if (disp && val) {
    if (price > 0 && qty > 0) { disp.style.display = 'block'; val.textContent = total.toLocaleString('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
    else { disp.style.display = 'none'; }
  }
};

window.submitSellProduct = async function(productId, invoiceId) {
  if (window._saleLock) { toast("عملية بيع جارية، انتظر...", "warning"); return; }
  const errEl = document.getElementById('sell-error');
  function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
  errEl.style.display = 'none';

  const type = document.getElementById('sell-type')?.value || 'cash';
  const weight = parseFloat(document.getElementById('sell-weight')?.value) || 0;
  const count = parseFloat(document.getElementById('sell-count')?.value) || 0;
  const price = parseFloat(document.getElementById('sell-price')?.value) || 0;

  // ## التعديل الجوهري ##
  // الكمية التي ستُخصم من المخزون هي "العدد" دائمًا
  const qtyToReduce = count > 0 ? count : 1; // إذا لم يُكتب عدد، نعتبره 1
  // الإجمالي = (الوزن إن وُجد، وإلا فالعدد) × السعر
  const total = (weight > 0 ? weight : qtyToReduce) * price;

  if (!price || price <= 0) { showErr('أدخل السعر'); return; }
  if (qtyToReduce <= 0) { showErr('أدخل العدد'); return; }

  // ... باقي الدالة كما هي ...

  const submitBtn = document.getElementById('sell-submit');
  if (submitBtn) submitBtn.disabled = true;
  window._saleLock = true;

  try {
    const customerName = customerId ? (window._sellCustomers || []).find(x => x.id === customerId)?.full_name || null : null;
    const result = await sellProductAtomic({
      p_product_id: productId, p_invoice_id: invoiceId,
      p_qty: qtyToReduce, // <-- نرسل العدد (وليس الوزن) ليُخصم من المخزون
      p_price: price,
      p_total: total,
      p_type: type, 
      p_customer_id: customerId || null,
      p_shop_id: shopId || null, 
      p_partner_id: partnerId || null,
      p_employee_id: employeeId || null,
      p_customer_name: customerName, 
      p_date: new Date().toISOString().split("T")[0]
    });
    if (!result.success) throw new Error(result.error || 'فشل البيع');
    
    await addAuditLog("sell_product", { productId, qty: qtyToReduce, price, total, type });
    await checkInvoiceClose(invoiceId);
    closeModal();
    toast(`تم البيع بنجاح ✅ (الإجمالي: ${total.toLocaleString('ar-EG')} ج)`, "success");
    openSalesInvoice(invoiceId);
  } catch (err) {
    showErr(err?.message || 'خطأ في البيع');
    if (submitBtn) submitBtn.disabled = false;
  } finally { setTimeout(() => { window._saleLock = false; }, 500); }
};

window.returnProduct = async function(productId, invoiceId) {
  inputModal({ title: "↩️ رفع بضاعة للمورد", fields: [{ id: "qty", label: "الكمية المرفوعة", type: "number", required: true, min: "1" }], submitLabel: "تأكيد الإرجاع", onSubmit: async (vals) => {
    const r = await returnProductAtomic(productId, vals.qty);
    if (!r.success) throw new Error(r.error);
    await addAuditLog("return_product", { productId, qty: vals.qty });
    await checkInvoiceClose(invoiceId); closeModal(); toast("تم رفع البضاعة ✅", "success"); openSalesInvoice(invoiceId);
  }});
};

async function checkInvoiceClose(invoiceId) {
  const { data: products } = await supabase.from("invoice_products").select("*").eq("invoice_id", invoiceId);
  const allDone = (products || []).every(p => ((p.qty || 0) - (p.sold || 0) - (p.returned || 0)) <= 0);
  if (!allDone) return;
  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
  if (!invoice || invoice.status !== "confirmed") return;
  const gross = (products || []).reduce((s, p) => s + Number(p.sales_total || 0), 0);
  const rate = invoice.commission_rate || 0.07;
  const commission = gross * rate;
  const expenses = Number(invoice.noulon || 0) + Number(invoice.mashal || 0);
  const net = gross - commission - expenses - Number(invoice.advance_payment || 0);
  await dbUpdate("invoices", invoiceId, { status: "closed", gross, commission, total_expenses: expenses, net });
  await addAuditLog("close_invoice", { invoiceId, gross, commission, net });
  toast("🔒 تم إغلاق الفاتورة تلقائياً", "info");
                        }
