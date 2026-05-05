/**
 * sales.js — Sales Register Module
 * Wholesale Fruits & Vegetables SaaS System
 *
 * Architecture:
 *   State        → _state object (single source of truth)
 *   DB layer     → _db.*  (all Supabase calls isolated here)
 *   Logic layer  → _calc.* (pure functions, no side effects)
 *   UI layer     → _ui.*  (render functions only, no business logic)
 *   Actions      → action*() (orchestrate db + ui + state)
 *   Public API   → renderSalesPage() + window.* handlers
 */

import { supabase, ensureUser, logFailedFinancialTransaction } from "../data.js";
import { toast, formatCurrency, formatDate } from "../ui.js";

/* ═══════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════ */
const _state = {
  user: null,
  company_id: null,
  invoice: null,
  product: null,
  sales: [],
  editingId: null,
  selectedEntity: null,
  searchTimer: null,
  cache: {},
  hasFailedFinancial: false,
};

let _isSubmitting = false;

function _resetCashier() {
  _state.editingId      = null;
  _state.selectedEntity = null;
}

/* ═══════════════════════════════════════════════════════════════
   DB LAYER
═══════════════════════════════════════════════════════════════ */
const _db = {

  async fetchInvoices(userId) {
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "confirmed")
      .order("date", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async fetchInvoice(invoiceId) {
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async fetchProducts(invoiceId) {
    const { data, error } = await supabase
      .from("invoice_products")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("name");
    if (error) throw new Error(error.message);
    return data || [];
  },

  async fetchSales(productId) {
    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .eq("product_id", productId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async insertSale(payload) {
    const { data, error } = await supabase
      .from("sales")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async updateSale(saleId, payload) {
    const { data, error } = await supabase
      .from("sales")
      .update(payload)
      .eq("id", saleId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async deleteSale(saleId) {
    const { error } = await supabase
      .from("sales")
      .delete()
      .eq("id", saleId);
    if (error) throw new Error(error.message);
  },

  async searchEntities(table, query, companyId) {
    query = query.trim();
    if (!query) return [];
    const { data, error } = await supabase
      .from(table)
      .select("id, name")
      .eq("company_id", companyId)
      .ilike("name", `${query}%`)
      .limit(8);
    if (error) throw new Error(error.message);
    return data || [];
  },

  async updateProductSold(productId) {
    const { data } = await supabase
      .from("sales")
      .select("qty, weight")
      .eq("product_id", productId);

    const soldQty = (data || []).reduce((s, r) => s + (r.weight > 0 ? 0 : (r.qty || 0)), 0);

    await supabase
      .from("invoice_products")
      .update({ sold: soldQty })
      .eq("id", productId);
  },

  async recordFinancialTransaction(type, amount, entityId, userId, invoiceId, productId) {
    const { error } = await supabase.rpc('process_sale_transaction', {
      p_type: type,
      p_amount: amount,
      p_entity_id: entityId || null,
      p_user_id: userId,
      p_invoice_id: invoiceId,
      p_product_id: productId
    });
    if (error) throw new Error(error.message);
  },

  async syncInvoiceTotals() {
    return;
  },

  async fetchProductById(productId) {
    const { data, error } = await supabase
      .from("invoice_products")
      .select("*")
      .eq("id", productId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
};

/* ═══════════════════════════════════════════════════════════════
   CALCULATION LAYER
═══════════════════════════════════════════════════════════════ */
const _calc = {
  total(qty, weight, price) {
    const base = weight > 0 ? weight : qty;
    return base * price;
  },

  summaryFromSales(sales) {
    return sales.reduce(
      (acc, s) => {
        acc.qty += (s.weight > 0 ? 0 : Number(s.qty || 0));
        acc.weight += Number(s.weight || 0);
        acc.money += Number(s.total || 0);
        return acc;
      },
      { qty: 0, weight: 0, money: 0 }
    );
  },
};

/* ═══════════════════════════════════════════════════════════════
   ENTITY → TABLE MAP
═══════════════════════════════════════════════════════════════ */
const ENTITY_TABLE = {
  customer : "customers",
  shop     : "market_shops",
  employee : "employees",
  partner  : "partners",
};

const SALE_TYPE_LABELS = {
  cash     : "نقدي",
  customer : "عميل",
  shop     : "محل",
  employee : "موظف",
  partner  : "شريك",
};

/* ═══════════════════════════════════════════════════════════════
   UI LAYER
═══════════════════════════════════════════════════════════════ */
const _ui = {

  renderInvoiceList(invoices) {
    if (!invoices.length) {
      return `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-title">لا توجد فواتير مفتوحة</div>
          <button class="btn" onclick="navigate('invoices')">📄 الفواتير</button>
        </div>`;
    }

    return invoices.map(inv => `
      <div class="card sales-invoice-card" onclick="window._salesOpenInvoice('${inv.id}')">
        <div class="sales-invoice-row">
          <div>
            <div class="sales-invoice-supplier">🚚 ${inv.supplier_name}</div>
            <div class="sales-meta">${formatDate(inv.date)}</div>
          </div>
          <button class="btn btn-sm" onclick="event.stopPropagation();window._salesOpenInvoice('${inv.id}')">
            بيع ←
          </button>
        </div>
      </div>`).join("");
  },

  renderProductList(products, invoiceId) {
    if (!products.length) return `<div class="card">لا توجد أصناف</div>`;

    return products.map(p => {
      const rem = (p.qty || 0) - (p.sold || 0) - (p.returned || 0);
      return `
        <div class="card sales-product-card" onclick="window._salesOpenProduct('${p.id}','${invoiceId}')">
          <div class="sales-product-row">
            <div>
              <div class="sales-product-name">📦 ${p.name}</div>
              <div class="sales-meta">الكمية ${p.qty} &nbsp;|&nbsp; مباع ${p.sold || 0} &nbsp;|&nbsp; متبقي ${rem}</div>
            </div>
            <button class="btn btn-sm">بيع ←</button>
          </div>
        </div>`;
    }).join("");
  },

  renderCashierRow(isReadOnly) {
    if (isReadOnly) {
      return `
        <div class="cashier-row cashier-row--readonly">
          <span class="cashier-closed-badge">🔒 الفاتورة مغلقة — عرض فقط</span>
        </div>`;
    }

    return `
      <div class="cashier-row" id="cashier-row">
        <div class="cashier-fields">

          <div class="cashier-field">
            <label class="cashier-label">الكمية</label>
            <input id="c-qty" type="number" min="0" step="any" placeholder="0"
                   class="cashier-input" oninput="_salesCalcPreview()" />
          </div>

          <div class="cashier-field">
            <label class="cashier-label">الوزن <small>(اختياري)</small></label>
            <input id="c-weight" type="number" min="0" step="any" placeholder="0"
                   class="cashier-input" oninput="_salesCalcPreview()" />
          </div>

          <div class="cashier-field">
            <label class="cashier-label">السعر ✱</label>
            <input id="c-price" type="number" min="0" step="any" placeholder="0"
                   class="cashier-input cashier-input--price" oninput="_salesCalcPreview()" />
          </div>

          <div class="cashier-field">
            <label class="cashier-label">النوع</label>
            <select id="c-type" class="cashier-input" onchange="_salesTypeChanged()">
              <option value="cash">نقدي</option>
              <option value="customer">عميل</option>
              <option value="shop">محل</option>
              <option value="employee">موظف</option>
              <option value="partner">شريك</option>
            </select>
          </div>

        </div>

        <div id="c-entity-wrapper" class="cashier-entity-wrapper" style="display:none;">
          <label class="cashier-label">بحث</label>
          <div class="cashier-search-box">
            <input id="c-entity-input" type="text" placeholder="اكتب للبحث..."
                   class="cashier-input cashier-input--search"
                   oninput="_salesEntitySearch(this.value)"
                   autocomplete="off" />
            <div id="c-entity-results" class="entity-dropdown" style="display:none;"></div>
          </div>
          <div id="c-entity-badge" class="entity-badge" style="display:none;"></div>
        </div>

        <div class="cashier-action-row">
          <span id="c-preview" class="cashier-preview"></span>
          <button id="c-go-btn" class="btn cashier-go-btn" onclick="_salesSubmit()">
            ✅ تسجيل
          </button>
          <button class="btn btn-ghost btn-sm" onclick="_salesCancelEdit()">مسح</button>
        </div>
        ${_state.hasFailedFinancial ? `<div class="financial-alert-badge">⚠️ توجد قيود مالية غير مكتملة</div>` : ""}
      </div>`;
  },

  renderSalesRow(sale, isReadOnly) {
    return `
      <tr class="sales-row" data-id="${sale.id}">
        <td>${sale.qty || "—"}</td>
        <td>${SALE_TYPE_LABELS[sale.type] || sale.type}</td>
        <td>${sale.entity_name || "—"}</td>
        <td>${sale.weight ? sale.weight : "—"}</td>
        <td>${formatCurrency(sale.price)}</td>
        <td class="sales-total-cell">${formatCurrency(sale.total)}</td>
        <td>
          ${!isReadOnly ? `
            <button class="btn btn-xs btn-ghost" onclick="_salesEditRow('${sale.id}')">✏️</button>
            <button class="btn btn-xs btn-danger" onclick="_salesDeleteRow('${sale.id}')">🗑</button>
          ` : ""}
        </td>
      </tr>`;
  },

  renderSalesTable(sales, isReadOnly) {
    if (!sales.length) {
      return `<div class="sales-table-empty">لا توجد مبيعات بعد</div>`;
    }

    const rows = sales.map(s => _ui.renderSalesRow(s, isReadOnly)).join("");

    return `
      <div class="sales-table-wrapper">
        <table class="sales-table">
          <thead>
            <tr>
              <th>الكمية</th>
              <th>النوع</th>
              <th>الجهة</th>
              <th>الوزن</th>
              <th>السعر</th>
              <th>الإجمالي</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="sales-tbody">
            ${rows}
          </tbody>
        </table>
      </div>`;
  },

  renderSummary(sales) {
    const { qty, weight, money } = _calc.summaryFromSales(sales);
    return `
      <div class="sales-summary" id="sales-summary">
        <div class="summary-item">
          <span class="summary-label">إجمالي الكمية</span>
          <span class="summary-value">${qty}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">إجمالي الوزن</span>
          <span class="summary-value">${weight > 0 ? weight : "—"}</span>
        </div>
        <div class="summary-item summary-item--money">
          <span class="summary-label">إجمالي المبيعات</span>
          <span class="summary-value">${formatCurrency(money)}</span>
        </div>
      </div>`;
  },

  renderRegisterPage(invoice, product, sales) {
    const isReadOnly = invoice.status === "closed";
    const rem = (product.qty || 0) - (product.sold || 0) - (product.returned || 0);

    return `
      <div class="sales-register">

        <div class="register-header">
          <button class="btn btn-ghost btn-sm" onclick="window._salesBackToInvoice('${invoice.id}')">
            ← رجوع
          </button>
          <div>
            <div class="register-title">📦 ${product.name}</div>
            <div class="register-meta">
              🚚 ${invoice.supplier_name} &nbsp;•&nbsp;
              متبقي <span id="register-remaining">${rem}</span> &nbsp;•&nbsp;
              ${isReadOnly ? '<span class="badge badge-closed">مغلقة</span>' : '<span class="badge badge-open">مفتوحة</span>'}
            </div>
          </div>
        </div>

        ${_ui.renderCashierRow(isReadOnly)}
        ${_ui.renderSummary(sales)}
        ${_ui.renderSalesTable(sales, isReadOnly)}

      </div>`;
  },
};

/* ═══════════════════════════════════════════════════════════════
   DOM HELPERS
═══════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

function _cashierValues() {
  return {
    qty    : parseFloat($("c-qty")?.value)    || 0,
    weight : parseFloat($("c-weight")?.value) || 0,
    price  : parseFloat($("c-price")?.value)  || 0,
    type   : $("c-type")?.value || "cash",
  };
}

function _setCashierValues(sale) {
  if ($("c-qty"))    $("c-qty").value    = sale.qty    || "";
  if ($("c-weight")) $("c-weight").value = sale.weight || "";
  if ($("c-price"))  $("c-price").value  = sale.price  || "";
  if ($("c-type"))   $("c-type").value   = sale.type   || "cash";
  window._salesTypeChanged(sale.entity_name);
  _salesCalcPreview();
}

function _resetCashierDOM() {
  ["c-qty","c-weight","c-price"].forEach(id => { if ($(id)) $(id).value = ""; });
  if ($("c-type")) $("c-type").value = "cash";
  window._salesTypeChanged();
  _salesCalcPreview();
  const goBtn = $("c-go-btn");
  if (goBtn) goBtn.textContent = "✅ تسجيل";
}

function _refreshSaleRow(sale, isReadOnly) {
  const existingRow = document.querySelector(`tr.sales-row[data-id="${sale.id}"]`);
  const newRowHtml = _ui.renderSalesRow(sale, isReadOnly);
  const tmp = document.createElement("tbody");
  tmp.innerHTML = newRowHtml;

  if (existingRow) {
    existingRow.replaceWith(tmp.firstElementChild);
  } else {
    const tbody = $("sales-tbody");
    if (tbody) tbody.appendChild(tmp.firstElementChild);
  }
}

function _removeSaleRow(saleId) {
  const row = document.querySelector(`tr.sales-row[data-id="${saleId}"]`);
  if (row) row.remove();
}

function _refreshSummary() {
  const el = $("sales-summary");
  if (el) el.outerHTML = _ui.renderSummary(_state.sales);
}

function _updateRemainingDisplay() {
  const remEl = $("register-remaining");
  if (remEl && _state.product) {
    const rem = (_state.product.qty || 0) - (_state.product.sold || 0) - (_state.product.returned || 0);
    remEl.textContent = rem;
  }
}

/* ═══════════════════════════════════════════════════════════════
   GLOBAL WINDOW HANDLERS
═══════════════════════════════════════════════════════════════ */

window._salesOpenInvoice = async function(invoiceId) {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="loading-spinner">⏳</div>`;

  try {
    const [invoice, products] = await Promise.all([
      _db.fetchInvoice(invoiceId),
      _db.fetchProducts(invoiceId),
    ]);

    _state.invoice = invoice;
    _state.product = null;
    _state.sales   = [];

    const sold = products.reduce((s, p) => s + Number(p.sold || 0), 0);
    const rem  = products.reduce((s, p) => s + ((p.qty||0)-(p.sold||0)-(p.returned||0)), 0);

    app.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="navigate('sales')">← رجوع</button>
      <div class="page-header">
        <div class="page-title">🛒 ${invoice.supplier_name}</div>
        <div class="page-subtitle">مباع ${sold} &nbsp;•&nbsp; متبقي ${rem}</div>
      </div>
      ${_ui.renderProductList(products, invoiceId)}`;
  } catch (e) {
    toast(e.message, "error");
  }
};

window._salesBackToInvoice = function(invoiceId) {
  window._salesOpenInvoice(invoiceId);
};

window._salesOpenProduct = async function(productId, invoiceId) {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="loading-spinner">⏳</div>`;

  try {
    const [invoice, product, sales] = await Promise.all([
      _db.fetchInvoice(invoiceId),
      _db.fetchProductById(productId),
      _db.fetchSales(productId),
    ]);

    _state.invoice = invoice;
    _state.product = product;
    _state.sales   = sales;
    _resetCashier();

    app.innerHTML = _ui.renderRegisterPage(invoice, product, sales);
  } catch (e) {
    toast(e.message, "error");
  }
};

window._salesTypeChanged = function(prefillEntityName = null) {
  const type    = $("c-type")?.value || "cash";
  const wrapper = $("c-entity-wrapper");
  if (!wrapper) return;

  _state.cache = {};

  if (type === "cash") {
    wrapper.style.display = "none";
    _state.selectedEntity = null;
    const badge = $("c-entity-badge");
    const input = $("c-entity-input");
    if (badge) badge.style.display = "none";
    if (input) { input.value = ""; input.style.display = ""; }
  } else {
    wrapper.style.display = "block";
    if (!prefillEntityName) {
      _state.selectedEntity = null;
      const badge = $("c-entity-badge");
      const input = $("c-entity-input");
      if (badge) badge.style.display = "none";
      if (input) { input.value = ""; input.style.display = ""; }
    } else {
      const input = $("c-entity-input");
      if (input) input.value = prefillEntityName;
    }
  }

  _salesCalcPreview();
};

window._salesEntitySearch = async function(query) {
  clearTimeout(_state.searchTimer);
  const results = $("c-entity-results");
  if (!results) return;

  if (!query || query.length < 1) {
    results.style.display = "none";
    return;
  }

  const type  = $("c-type")?.value;
  const table = ENTITY_TABLE[type];
  if (!table) return;

  const key = table + "_" + query;

  if (_state.cache[key]) {
    const entities = _state.cache[key];
    if (!entities.length) {
      results.innerHTML = `<div class="entity-result-item entity-result-empty">لا نتائج</div>`;
      results.style.display = "block";
      return;
    }
    results.innerHTML = entities.map(e => `
      <div class="entity-result-item" onclick="_salesSelectEntity('${e.id}','${_escapeHtml(e.name)}')">
        ${e.name}
      </div>`).join("");
    results.style.display = "block";
    return;
  }

  _state.searchTimer = setTimeout(async () => {
    try {
      if (!_state.user) {
        const user = await ensureUser();
        _state.user = user;
        _state.company_id = user.company_id;
      }
      const entities = await _db.searchEntities(table, query, _state.company_id);
      _state.cache[key] = entities;

      if (!entities.length) {
        results.innerHTML = `<div class="entity-result-item entity-result-empty">لا نتائج</div>`;
        results.style.display = "block";
        return;
      }

      results.innerHTML = entities.map(e => `
        <div class="entity-result-item" onclick="_salesSelectEntity('${e.id}','${_escapeHtml(e.name)}')">
          ${e.name}
        </div>`).join("");
      results.style.display = "block";
    } catch (e) {
      toast(e.message, "error");
    }
  }, 250);
};

window._salesSelectEntity = function(id, name) {
  _state.selectedEntity = { id, name };

  const input  = $("c-entity-input");
  const results= $("c-entity-results");
  const badge  = $("c-entity-badge");

  if (results) results.style.display = "none";
  if (input)   input.style.display   = "none";
  if (badge) {
    badge.style.display = "flex";
    badge.innerHTML = `
      <span>${name}</span>
      <button class="entity-badge-clear" onclick="_salesClearEntity()">✕</button>`;
  }
};

window._salesClearEntity = function() {
  _state.selectedEntity = null;
  const input = $("c-entity-input");
  const badge = $("c-entity-badge");
  if (input) { input.value = ""; input.style.display = ""; }
  if (badge) badge.style.display = "none";
};

window._salesCalcPreview = function() {
  const { qty, weight, price, type } = _cashierValues();
  const total = _calc.total(qty, weight, price);
  const preview = $("c-preview");
  if (!preview) return;

  if (total > 0) {
    const base = weight > 0
      ? `${weight} وزن × ${formatCurrency(price)}`
      : `${qty} كمية × ${formatCurrency(price)}`;
    preview.textContent = `${base} = ${formatCurrency(total)}`;
  } else {
    if (type === "cash") {
      preview.textContent = "💰 سيتم التحصيل في الخزنة";
    } else {
      preview.textContent = "";
    }
  }
};

window._salesSubmit = async function() {
  if (!_state.user) {
    try {
      const user = await ensureUser();
      _state.user = user;
      _state.company_id = user.company_id;
    } catch (e) {
      toast("تعذر التحقق من المستخدم", "error");
      return;
    }
  }

  if (_isSubmitting) return;
  _isSubmitting = true;

  const goBtn = $("c-go-btn");
  if (goBtn) {
    goBtn.disabled = true;
    goBtn.textContent = "⏳ جاري...";
  }

  try {
    if (_state.invoice.status === "closed") {
      toast("الفاتورة مغلقة", "warning");
      return;
    }

    const { qty, weight, price, type } = _cashierValues();

    if (qty <= 0 && weight <= 0) {
      toast("أدخل الكمية أو الوزن", "error");
      return;
    }
    if (price <= 0) {
      toast("أدخل السعر", "error");
      return;
    }
    if (type !== "cash" && !_state.selectedEntity) {
      toast("اختر الجهة أولاً", "error");
      return;
    }

    // منع إدخال كمية ووزن معًا (منطق العمل)
    if (qty > 0 && weight > 0) {
      toast("لا يمكن استخدام كمية ووزن معًا، اختر أحدهما", "error");
      return;
    }

    if (weight <= 0) {
      const remaining = (_state.product.qty || 0) - (_state.product.sold || 0) - (_state.product.returned || 0);
      if (_state.editingId) {
        const oldSale = _state.sales.find(s => s.id === _state.editingId);
        const oldQty = oldSale ? (oldSale.qty || 0) : 0;
        if (qty > remaining + oldQty) {
          toast("الكمية أكبر من المتاح", "error");
          return;
        }
      } else {
        if (qty > remaining) {
          toast("الكمية أكبر من المتاح", "error");
          return;
        }
      }
    }

    const total = _calc.total(qty, weight, price);

    const payload = {
      invoice_id  : _state.invoice.id,
      product_id  : _state.product.id,
      user_id     : _state.user.id,
      company_id  : _state.company_id,
      qty         : qty || null,
      weight      : weight || null,
      price,
      total,
      type,
      entity_id   : _state.selectedEntity?.id   || null,
      entity_name : _state.selectedEntity?.name || null,
      date        : new Date().toISOString().split("T")[0],
    };

    if (_state.editingId) {
      const oldSale = _state.sales.find(s => s.id === _state.editingId);
      const updated = await _db.updateSale(_state.editingId, payload);

      const delta = updated.total - (oldSale?.total || 0);

      if (delta !== 0) {
        try {
          await _db.recordFinancialTransaction(
            updated.type,
            delta,
            updated.entity_id,
            _state.user.id,
            updated.invoice_id,
            updated.product_id
          );
          _state.hasFailedFinancial = false; // إعادة التعيين عند النجاح
        } catch (e) {
          console.error("FINANCIAL ERROR:", e);
          await logFailedFinancialTransaction({
            sale_id: updated.id,
            operation: "update",
            type: updated.type,
            amount: delta,
            old_amount: oldSale?.total || 0,
            entity_id: updated.entity_id,
            user_id: _state.user.id,
            company_id: _state.company_id,
            invoice_id: updated.invoice_id,
            product_id: updated.product_id,
            error_message: e.message,
          });
          _state.hasFailedFinancial = true;
          toast("تم التعديل، ولكن فشل تسجيل القيد المالي. تم الإبلاغ للمحاسب.", "warning");
        }
      }

      // تحديث المخزون محليًا بدلاً من جلبه من القاعدة
      await _db.updateProductSold(_state.product.id);
      // تحديث حالة المنتج محليًا
      _state.product.sold = _state.product.sold + (updated.qty - (oldSale?.qty || 0));

      _state.sales = _state.sales.map(s =>
        s.id === updated.id ? updated : s
      );

      _refreshSaleRow(updated, _state.invoice.status === "closed");
      toast("تم التعديل بنجاح ✅", "success");
    } else {
      const inserted = await _db.insertSale(payload);

      try {
        await _db.recordFinancialTransaction(
          inserted.type,
          inserted.total,
          inserted.entity_id,
          _state.user.id,
          inserted.invoice_id,
          inserted.product_id
        );
        _state.hasFailedFinancial = false; // إعادة التعيين عند النجاح
      } catch (e) {
        console.error("FINANCIAL ERROR:", e);
        await logFailedFinancialTransaction({
          sale_id: inserted.id,
          operation: "insert",
          type: inserted.type,
          amount: inserted.total,
          entity_id: inserted.entity_id,
          user_id: _state.user.id,
          company_id: _state.company_id,
          invoice_id: inserted.invoice_id,
          product_id: inserted.product_id,
          error_message: e.message,
        });
        _state.hasFailedFinancial = true;
        toast("تم البيع، ولكن فشل تسجيل القيد المالي. تم الإبلاغ للمحاسب.", "warning");
      }

      // تحديث المخزون محليًا
      await _db.updateProductSold(_state.product.id);
      _state.product.sold = (_state.product.sold || 0) + (inserted.qty || 0);

      _state.sales.push(inserted);

      const tbody = $("sales-tbody");
      if (tbody) {
        _refreshSaleRow(inserted, false);
      } else {
        const tableArea = document.querySelector(".sales-table-empty");
        if (tableArea) {
          tableArea.outerHTML = _ui.renderSalesTable(_state.sales, false);
        }
      }
      toast("تم البيع بنجاح ✅", "success");
    }

    _db.syncInvoiceTotals(_state.invoice.id).catch(() => {});
    _resetCashier();
    _resetCashierDOM();
    _refreshSummary();
    _updateRemainingDisplay();

    // إزالة التنبيه المالي إذا لم يعد هناك فشل
    const cashierAlert = document.querySelector(".financial-alert-badge");
    if (!_state.hasFailedFinancial && cashierAlert) {
      cashierAlert.remove();
    } else if (_state.hasFailedFinancial && !cashierAlert) {
      const cashierRow = $("cashier-row");
      if (cashierRow) {
        const alertDiv = document.createElement("div");
        alertDiv.className = "financial-alert-badge";
        alertDiv.textContent = "⚠️ توجد قيود مالية غير مكتملة";
        cashierRow.appendChild(alertDiv);
      }
    }

    $("c-qty")?.focus();

  } catch (e) {
    console.error(e);
    toast(e.message || "حدث خطأ غير متوقع", "error");
  } finally {
    _isSubmitting = false;
    if (goBtn) {
      goBtn.disabled = false;
      goBtn.textContent = _state.editingId ? "💾 حفظ التعديل" : "✅ تسجيل";
    }
  }
};

window._salesEditRow = function(saleId) {
  const sale = _state.sales.find(s => s.id === saleId);
  if (!sale) return;

  _state.editingId = saleId;

  document.querySelectorAll("tr.sales-row").forEach(r => r.classList.remove("row--editing"));
  const row = document.querySelector(`tr.sales-row[data-id="${saleId}"]`);
  if (row) row.classList.add("row--editing");

  _setCashierValues(sale);

  if (sale.entity_id) {
    _state.selectedEntity = { id: sale.entity_id, name: sale.entity_name };
    window._salesSelectEntity(sale.entity_id, sale.entity_name);
  }

  const goBtn = $("c-go-btn");
  if (goBtn) goBtn.textContent = "💾 حفظ التعديل";

  $("cashier-row")?.scrollIntoView({ behavior: "smooth", block: "center" });
};

window._salesDeleteRow = async function(saleId) {
  if (_isSubmitting) return;
  _isSubmitting = true;

  try {
    const saleToDelete = _state.sales.find(s => s.id === saleId);
    if (!saleToDelete) {
      _isSubmitting = false;
      return;
    }

    try {
      await _db.recordFinancialTransaction(
        saleToDelete.type,
        -saleToDelete.total,
        saleToDelete.entity_id,
        _state.user.id,
        saleToDelete.invoice_id,
        saleToDelete.product_id
      );
      _state.hasFailedFinancial = false; // إعادة التعيين عند نجاح القيد المالي
      await _db.deleteSale(saleId);
    } catch (e) {
      console.error("FINANCIAL ERROR:", e);
      await logFailedFinancialTransaction({
        sale_id: saleToDelete.id,
        operation: "delete",
        type: saleToDelete.type,
        amount: -saleToDelete.total,
        entity_id: saleToDelete.entity_id,
        user_id: _state.user.id,
        company_id: _state.company_id,
        invoice_id: saleToDelete.invoice_id,
        product_id: saleToDelete.product_id,
        error_message: e.message,
      });
      _state.hasFailedFinancial = true;
      const cashierAlert = document.querySelector(".financial-alert-badge");
      if (!cashierAlert && $("cashier-row")) {
        const alertDiv = document.createElement("div");
        alertDiv.className = "financial-alert-badge";
        alertDiv.textContent = "⚠️ توجد قيود مالية غير مكتملة";
        $("cashier-row").appendChild(alertDiv);
      }
      toast("فشل في الحذف، القيد المالي لم يسجل. تم الإبلاغ للمحاسب.", "error");
      return;
    }

    _state.sales = _state.sales.filter(s => s.id !== saleId);
    _removeSaleRow(saleId);

    // تحديث المخزون محليًا
    await _db.updateProductSold(_state.product.id);
    _state.product.sold = (_state.product.sold || 0) - (saleToDelete.qty || 0);

    _refreshSummary();
    _updateRemainingDisplay();
    _db.syncInvoiceTotals(_state.invoice.id).catch(() => {});

    if (_state.sales.length === 0) {
      const tableWrapper = document.querySelector(".sales-table-wrapper");
      if (tableWrapper) {
        tableWrapper.outerHTML = `<div class="sales-table-empty">لا توجد مبيعات بعد</div>`;
      }
    }

    // إزالة التنبيه إذا لم يعد هناك فشل
    if (!_state.hasFailedFinancial) {
      const alert = document.querySelector(".financial-alert-badge");
      if (alert) alert.remove();
    }

    toast("تم الحذف بنجاح ✅", "success");
  } catch (e) {
    toast(e.message, "error");
  } finally {
    _isSubmitting = false;
  }
};

window._salesCancelEdit = function() {
  _resetCashier();
  _resetCashierDOM();
  document.querySelectorAll("tr.sales-row").forEach(r => r.classList.remove("row--editing"));
};

/* ═══════════════════════════════════════════════════════════════
   UTIL
═══════════════════════════════════════════════════════════════ */
function _escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ═══════════════════════════════════════════════════════════════
   PUBLIC ENTRY POINT
═══════════════════════════════════════════════════════════════ */
export async function renderSalesPage(app) {
  try {
    const user = await ensureUser();
    _state.user = user;
    _state.company_id = user.company_id;
  } catch (e) {
    toast("تعذر التحقق من المستخدم", "error");
    return;
  }

  app.innerHTML = `<div class="loading-spinner">⏳</div>`;

  try {
    const invoices = await _db.fetchInvoices(_state.user.id);

    app.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <div class="page-title">🛒 المبيعات</div>
          <div class="page-subtitle">${invoices.length} فاتورة مفتوحة</div>
        </div>
      </div>
      ${_ui.renderInvoiceList(invoices)}`;
  } catch (e) {
    toast(e.message, "error");
  }
}

/* ═══════════════════════════════════════════════════════════════
   STYLES  (injected once)
═══════════════════════════════════════════════════════════════ */
(function _injectStyles() {
  if (document.getElementById("sales-styles")) return;
  const style = document.createElement("style");
  style.id = "sales-styles";
  style.textContent = `
    /* ── Invoice list ─────────────────────── */
    .sales-invoice-card { cursor: pointer; transition: box-shadow .15s; }
    .sales-invoice-card:hover { box-shadow: 0 0 0 2px var(--c-primary, #3b82f6); }
    .sales-invoice-row { display:flex; justify-content:space-between; align-items:center; }
    .sales-invoice-supplier { font-weight:700; font-size:16px; }

    /* ── Product list ─────────────────────── */
    .sales-product-card { cursor:pointer; transition: box-shadow .15s; }
    .sales-product-card:hover { box-shadow: 0 0 0 2px var(--c-primary, #3b82f6); }
    .sales-product-row { display:flex; justify-content:space-between; align-items:center; }
    .sales-product-name { font-weight:700; font-size:16px; }
    .sales-meta { font-size:12px; color:var(--c-text-muted, #888); margin-top:2px; }

    /* ── Register header ─────────────────── */
    .sales-register { display:flex; flex-direction:column; gap:16px; }
    .register-header { display:flex; align-items:flex-start; gap:12px; }
    .register-title { font-size:18px; font-weight:700; }
    .register-meta { font-size:13px; color:var(--c-text-muted,#888); margin-top:3px; }
    .badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600; }
    .badge-open   { background:#d1fae5; color:#065f46; }
    .badge-closed { background:#fee2e2; color:#991b1b; }

    /* ── Cashier row ─────────────────────── */
    .cashier-row {
      background: var(--c-surface, #fff);
      border: 2px solid var(--c-border, #e5e7eb);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .cashier-row--readonly {
      opacity: .7;
      background: var(--c-surface-muted, #f9fafb);
    }
    .cashier-closed-badge {
      font-size: 13px;
      color: var(--c-text-muted, #888);
    }
    .cashier-fields {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .cashier-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1 1 120px;
    }
    .cashier-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--c-text-muted, #666);
      text-transform: uppercase;
      letter-spacing: .5px;
    }
    .cashier-input {
      padding: 8px 10px;
      border: 1.5px solid var(--c-border, #d1d5db);
      border-radius: 8px;
      font-size: 15px;
      background: var(--c-bg, #fff);
      color: var(--c-text, #111);
      transition: border-color .15s;
      width: 100%;
      box-sizing: border-box;
    }
    .cashier-input:focus {
      outline: none;
      border-color: var(--c-primary, #3b82f6);
    }
    .cashier-input--price { font-weight:700; }

    /* ── Entity search ───────────────────── */
    .cashier-entity-wrapper {
      display: flex;
      flex-direction: column;
      gap: 4px;
      position: relative;
    }
    .cashier-search-box { position:relative; }
    .cashier-input--search { width:100%; box-sizing:border-box; }
    .entity-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      right: 0; left: 0;
      background: var(--c-surface, #fff);
      border: 1.5px solid var(--c-border, #d1d5db);
      border-radius: 8px;
      z-index: 100;
      max-height: 200px;
      overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0,0,0,.1);
    }
    .entity-result-item {
      padding: 10px 14px;
      cursor: pointer;
      font-size: 14px;
      transition: background .1s;
    }
    .entity-result-item:hover { background: var(--c-hover, #f3f4f6); }
    .entity-result-empty { color:var(--c-text-muted,#888); cursor:default; }
    .entity-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--c-primary-light, #eff6ff);
      border: 1.5px solid var(--c-primary, #3b82f6);
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 14px;
      font-weight: 600;
      color: var(--c-primary, #2563eb);
    }
    .entity-badge-clear {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 14px;
      color: var(--c-text-muted, #888);
      padding: 0;
      margin-right: auto;
    }

    /* ── Cashier action row ──────────────── */
    .cashier-action-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .cashier-preview {
      font-size: 13px;
      color: var(--c-text-muted, #888);
      flex: 1;
    }
    .cashier-go-btn {
      padding: 10px 28px;
      font-size: 15px;
      font-weight: 700;
      border-radius: 10px;
      background: var(--c-primary, #2563eb);
      color: #fff;
      border: none;
      cursor: pointer;
      transition: opacity .15s;
    }
    .cashier-go-btn:disabled { opacity: .5; cursor: not-allowed; }

    /* ── Financial alert badge ───────────── */
    .financial-alert-badge {
      background: #fff3cd;
      border: 1px solid #ffc107;
      color: #856404;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* ── Summary bar ─────────────────────── */
    .sales-summary {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .summary-item {
      flex: 1 1 120px;
      background: var(--c-surface, #fff);
      border: 1.5px solid var(--c-border, #e5e7eb);
      border-radius: 10px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .summary-item--money { border-color: var(--c-primary, #3b82f6); }
    .summary-label { font-size:11px; color:var(--c-text-muted,#888); font-weight:600; }
    .summary-value { font-size:18px; font-weight:700; }

    /* ── Sales table ─────────────────────── */
    .sales-table-wrapper { overflow-x:auto; }
    .sales-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .sales-table th {
      text-align: right;
      padding: 8px 10px;
      border-bottom: 2px solid var(--c-border, #e5e7eb);
      font-size: 11px;
      font-weight: 700;
      color: var(--c-text-muted, #888);
      text-transform: uppercase;
    }
    .sales-table td {
      padding: 10px 10px;
      border-bottom: 1px solid var(--c-border, #f0f0f0);
      vertical-align: middle;
    }
    .sales-total-cell { font-weight:700; }
    .sales-row:hover td { background: var(--c-hover, #f9fafb); }
    .sales-row.row--editing td { background: #fef9c3; }
    .sales-table-empty {
      text-align: center;
      padding: 32px;
      color: var(--c-text-muted, #888);
      font-size: 14px;
    }

    /* ── Misc ────────────────────────────── */
    .loading-spinner {
      text-align: center;
      padding: 48px;
      font-size: 24px;
    }
    .btn-xs { font-size:12px; padding:4px 8px; }
    .btn-danger {
      background: var(--c-danger-light, #fee2e2);
      color: var(--c-danger, #dc2626);
    }
  `;
  document.head.appendChild(style);
})();