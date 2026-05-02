import { supabase, ensureUser } from "../data.js";
import { formatCurrency, formatDate, emptyState } from "../ui.js";

/* ─────────────────────────────────────────
   MAIN PAGE (Days List)
───────────────────────────────────────── */
export async function renderTarhilPage(app) {
  const user = await ensureUser();
  
  // 🔥 Direct open from customer page (Deep Link)
  if (window._tarhilCustomer && window._tarhilDate) {
    const customerId = window._tarhilCustomer;
    const date = window._tarhilDate;

    // لا تمسح القيم هنا – سيتم تنظيفها داخل openTarhilCustomer
    openTarhilCustomer(customerId, date);
    return;
  }

  app.innerHTML = `<div class="skeleton skeleton-card"></div>`;

  const { data: rows } = await supabase
    .from("customer_ledger")
    .select("customer_id, customer_name, debit, trx_date")
    .eq("user_id", user.id)
    .gt("debit", 0)
    .order("trx_date", { ascending: false });

  if (!rows?.length) {
    app.innerHTML = emptyState("📋", "لا توجد ترحيلات", "لا يوجد بيع آجل بعد");
    return;
  }

  /* Group by date */
  const map = {};
  rows.forEach(r => {
    const d = new Date(r.trx_date).toISOString().split("T")[0];
    if (!map[d]) map[d] = [];
    map[d].push(r);
  });

  const days = Object.keys(map).sort((a, b) => b.localeCompare(a));

  app.innerHTML = `
    <div class="page-header">
      <div class="page-title">📋 الترحيلات</div>
      <div class="page-subtitle">اليوميات الآجلة</div>
    </div>

    <div class="grid-2">
      ${days.map(date => {
        const total = map[date].reduce((s, r) => s + Number(r.debit || 0), 0);

        return `
        <div class="card" style="cursor:pointer;"
          onclick="openTarhilDay('${date}')">
          <div style="font-weight:800;">📅 ${formatDate(date)}</div>
          <div style="margin-top:6px;color:var(--c-text-muted);">
            ${map[date].length} عميل
          </div>
          <div style="margin-top:8px;font-size:18px;font-weight:800;color:var(--c-primary);">
            ${formatCurrency(total)}
          </div>
        </div>`;
      }).join("")}
    </div>
  `;
}

/* ─────────────────────────────────────────
   DAY VIEW (Customers in that day)
───────────────────────────────────────── */
window.openTarhilDay = async function (date) {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="skeleton skeleton-card"></div>`;

  const user = await ensureUser();

  const { data } = await supabase
    .from("customer_ledger")
    .select("*")
    .eq("user_id", user.id)
    .gte("trx_date", date)
    .lt("trx_date", date + "T23:59:59");

  if (!data?.length) {
    app.innerHTML = emptyState("📭", "لا يوجد بيانات", "");
    return;
  }

  /* Group by customer */
  const map = {};
  data.forEach(r => {
    if (!map[r.customer_id]) {
      map[r.customer_id] = {
        name: r.customer_name,
        total: 0,
        rows: []
      };
    }
    map[r.customer_id].total += Number(r.debit || 0);
    map[r.customer_id].rows.push(r);
  });

  const customers = Object.entries(map);

  app.innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="navigate('tarhil')">← رجوع</button>

    <div class="page-header">
      <div class="page-title">📅 ${formatDate(date)}</div>
      <div class="page-subtitle">${customers.length} عميل</div>
    </div>

    ${customers.map(([id, c]) => `
      <div class="card" style="cursor:pointer;"
        onclick="openTarhilCustomer('${id}','${date}')">
        <div style="font-weight:700;">👤 ${c.name}</div>
        <div style="margin-top:6px;color:var(--c-primary);font-weight:800;">
          ${formatCurrency(c.total)}
        </div>
      </div>
    `).join("")}
  `;
};

/* ─────────────────────────────────────────
   CUSTOMER DAY DETAILS
───────────────────────────────────────── */
window.openTarhilCustomer = async function (customerId, date) {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="skeleton skeleton-card"></div>`;

  const user = await ensureUser();

  // استخدام التاريخ المحدد من Deep Link إذا وجد
  const selectedDate = window._tarhilDate || null;
  const queryDate = selectedDate || date;

  let { data } = await supabase
    .from("customer_ledger")
    .select("*")
    .eq("user_id", user.id)
    .eq("customer_id", customerId)
    .gte("trx_date", queryDate)
    .lt("trx_date", queryDate + "T23:59:59");

  // فلترة العميل المحدد من Deep Link
  const selectedCustomer = window._tarhilCustomer || null;
  if (selectedCustomer) {
    data = (data || []).filter(r => r.customer_id === selectedCustomer);
  }

  // تنظيف المتغيرات بعد الاستخدام
  window._tarhilCustomer = null;
  window._tarhilDate = null;

  if (!data?.length) {
    app.innerHTML = emptyState("📭", "لا توجد تفاصيل", "");
    return;
  }

  const total = data.reduce((s, r) => s + Number(r.debit || 0), 0);
  const name = data[0].customer_name;

  app.innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="openTarhilDay('${queryDate}')">← رجوع</button>

    <div class="page-header">
      <div class="page-title">👤 ${name}</div>
      <div class="page-subtitle">${formatDate(queryDate)}</div>
    </div>

    <div class="card">
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>البيان</th>
              <th>المبلغ</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(r => `
              <tr>
                <td>${r.description || '–'}</td>
                <td class="amount-positive">${formatCurrency(r.debit)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div style="margin-top:12px;font-weight:800;font-size:16px;">
        الإجمالي: ${formatCurrency(total)}
      </div>
    </div>
  `;
};