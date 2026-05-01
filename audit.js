import { supabase, ensureUser } from "../data.js";
import { formatDate } from "../ui.js";

export async function renderAuditPage(app) {
  const user = await ensureUser();

  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  app.innerHTML = `
    <div class="page-header">
      <div class="page-title">📜 سجل العمليات</div>
    </div>

    <div class="card">
      ${(logs || []).map(l => `
        <div class="row" style="justify-content:space-between;border-bottom:1px solid var(--c-border);">
          <div>
            <div style="font-weight:700;">${formatAction(l.action)}</div>
            <div style="font-size:12px;color:var(--c-text-muted);">
              ${JSON.stringify(l.details || {})}
            </div>
          </div>
          <div style="font-size:12px;color:var(--c-text-muted);">
            ${formatDate(l.created_at)}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function formatAction(a) {
  return {
    sell_product: "💰 بيع",
    expense: "💸 مصروف",
    transfer_money: "🔄 تحويل",
    add_money: "➕ إضافة فلوس",
    confirm_invoice: "📄 اعتماد فاتورة",
    close_invoice: "🔒 إغلاق فاتورة"
  }[a] || a;
}