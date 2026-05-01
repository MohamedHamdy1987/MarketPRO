// 🔥 نفس الكود بالكامل مع التعديلات — لم يتم حذف أي منطق

import { supabase, dbUpdate, addAuditLog, sellProductAtomic, ensureUser } from "../data.js";
import { toast, modal, closeModal, formatCurrency, formatDate, inputModal } from "../ui.js";

/* ───────────────────────── RETURN PRODUCT ───────────────────────── */
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

/* ───────────────────────── SALES PAGE ───────────────────────── */
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
             <div class="empty-title">لا توجد فواتير</div>
             <button class="btn" onclick="navigate('invoices')">📄 الفواتير</button>
           </div>`
        : (invoices || []).map(inv => `
          <div class="card" onclick="openSalesInvoice('${inv.id}')">
            <div style="display:flex;justify-content:space-between;">
              <div>
                <div style="font-weight:700;">🚚 ${inv.supplier_name}</div>
                <div style="font-size:12px;color:var(--c-text-muted);">${formatDate(inv.date)}</div>
              </div>
              <button class="btn btn-sm" onclick="event.stopPropagation();openSalesInvoice('${inv.id}')">بيع ←</button>
            </div>
          </div>`).join('')
    }`;
}

/* ───────────────────────── OPEN INVOICE ───────────────────────── */
window.openSalesInvoice = async function(invoiceId) {
  const app = document.getElementById("app");

  const [{ data: invoice }, { data: products }] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", invoiceId).single(),
    supabase.from("invoice_products").select("*").eq("invoice_id", invoiceId).order("name")
  ]);

  const sold = (products || []).reduce((s, p) => s + Number(p.sold || 0), 0);
  const rem = (products || []).reduce((s, p) => s + ((p.qty || 0) - (p.sold || 0) - (p.returned || 0)), 0);

  app.innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="navigate('sales')">← رجوع</button>
    <div class="page-header">
      <div class="page-title">🛒 ${invoice.supplier_name}</div>
      <div class="page-subtitle">مباع ${sold} • متبقي ${rem}</div>
    </div>
    ${renderProducts(products, invoiceId)}`;
};

/* ───────────────────────── PRODUCTS ───────────────────────── */
function renderProducts(products, invoiceId) {
  if (!products?.length) return `<div class="card">لا توجد أصناف</div>`;

  return products.map(p => {
    const rem = (p.qty || 0) - (p.sold || 0) - (p.returned || 0);

    return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;">
        <div>
          <div style="font-weight:700;">📦 ${p.name}</div>
          <div style="font-size:12px;color:var(--c-text-muted);">
            الكمية ${p.qty} | مباع ${p.sold || 0}
          </div>
        </div>
        <div>${rem}</div>
      </div>

      <div style="margin-top:10px;">
        ${rem > 0 ? `<button class="btn btn-sm" onclick="sellProduct('${p.id}','${invoiceId}')">بيع</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ───────────────────────── SELL ───────────────────────── */
window.submitSellProduct = async function(productId, invoiceId) {

  const type = document.getElementById('sell-type').value;

  const weight = parseFloat(document.getElementById('sell-weight').value) || 0;
  const count  = parseFloat(document.getElementById('sell-count').value) || 0;
  const price  = parseFloat(document.getElementById('sell-price').value) || 0;

  // ✅ FIX
  const qtyToReduce = count > 0 ? count : (weight > 0 ? weight : 0);

  if (qtyToReduce <= 0) {
    toast("أدخل كمية صحيحة", "error");
    return;
  }

  if (price <= 0) {
    toast("أدخل السعر", "error");
    return;
  }

  const total = (weight > 0 ? weight : qtyToReduce) * price;

  try {

    const result = await sellProductAtomic({
      p_product_id: productId,
      p_invoice_id: invoiceId,
      p_qty: qtyToReduce,
      p_price: price,
      p_total: total,
      p_type: type,
      p_date: new Date().toISOString().split("T")[0]
    });

    if (!result.success) throw new Error(result.error);

    await addAuditLog("sell_product", { productId, qtyToReduce, total });

    closeModal();
    toast("تم البيع ✅", "success");

    openSalesInvoice(invoiceId);

  } catch (e) {
    toast(e.message, "error");
  }
};

/* ───────────────────────── CLOSE INVOICE ───────────────────────── */
async function checkInvoiceClose(invoiceId) {

  const { data: products } = await supabase
    .from("invoice_products")
    .select("*")
    .eq("invoice_id", invoiceId);

  const allDone = (products || []).every(p =>
    ((p.qty || 0) - (p.sold || 0) - (p.returned || 0)) <= 0
  );

  if (!allDone) return;

  const gross = (products || []).reduce((s, p) => s + Number(p.sales_total || 0), 0);

  await dbUpdate("invoices", invoiceId, {
    status: "closed",
    gross
  });

  toast("تم إغلاق الفاتورة", "info");
}