import { supabase, dbInsert, dbUpdate, ensureUser } from "../data.js";
import { toast, inputModal, confirmModal, closeModal, formatCurrency, emptyState } from "../ui.js";

/**
 * Market Pro – employees.js  v5.1 Supernova
 * ✅ PRESERVED: All original employee management logic
 * ✅ NEW: Role-based UI enforcement via data-permission attributes
 */

export async function renderEmployeesPage(app) {
  const user = await ensureUser();
  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .eq("user_id", user.id)
    .order("name");

  const active = (employees || []).filter(x => x.active !== false);
  const inactive = (employees || []).filter(x => x.active === false);

  app.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">👷 الموظفين</div>
        <div class="page-subtitle">
          ${active.length} نشط
          ${inactive.length ? (" | " + inactive.length + " معطل") : ""}
        </div>
      </div>
      <div class="page-actions">
        <button class="btn" onclick="openAddEmployee()" data-permission="manage_employees">➕ إضافة موظف</button>
      </div>
    </div>
    <div id="employees-list">
      ${renderEmployeeCards(employees || [])}
    </div>`;
}

function permissionsLabel(role) {
  return {
    admin: "كل الصلاحيات",
    cashier: "مبيعات + خزنة + عملاء",
    worker: "عرض فقط"
  }[role] || "مخصص";
}

function esc(v = '') {
  return String(v).replace(/'/g, "&#39;");
}

function renderEmployeeCards(list) {
  if (!list.length) {
    return emptyState(
      "👷",
      "لا يوجد موظفون",
      "أضف أول موظف للبدء",
      `<button class="btn" onclick="openAddEmployee()">➕ إضافة موظف</button>`
    );
  }

  return list.map(e => {
    const active = e.active !== false;
    return `
    <div class="card" ${!active ? "style='opacity:.65'" : ""}>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <div style="font-weight:700;font-size:15px;">👤 ${e.name}</div>
          <div style="margin-top:6px;">
            <span class="badge ${active ? 'badge-green' : 'badge-red'}">${active ? 'نشط' : 'معطل'}</span>
            <span class="badge badge-blue" style="margin-right:6px;">${e.role}</span>
          </div>
          <div style="font-size:12px;color:var(--c-text-muted);margin-top:6px;">
            صلاحيات: ${permissionsLabel(e.role)}
          </div>
          ${e.salary ? `<div style="margin-top:4px;">راتب: ${formatCurrency(e.salary)}</div>` : ""}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="btn btn-sm" onclick="toggleEmployee('${e.id}',${active},'${esc(e.name)}','${e.role}')">
            ${active ? 'تعطيل' : 'تفعيل'}
          </button>
          <button class="btn btn-warning btn-sm" onclick="openChangeRole('${e.id}','${esc(e.name)}','${e.role}')">
            صلاحية
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

window.openAddEmployee = async function () {
  const user = await ensureUser();
  inputModal({
    title: "إضافة موظف",
    fields: [
      { id: "name", label: "اسم الموظف", type: "text", required: true },
      {
        id: "role", label: "الصلاحية", type: "select", required: true,
        options: [
          { value: "worker", label: "عامل" },
          { value: "cashier", label: "كاشير" },
          { value: "admin", label: "مدير" }
        ]
      },
      { id: "salary", label: "راتب", type: "number", value: 0 }
    ],
    submitLabel: "حفظ",
    onSubmit: async (vals) => {
      if (vals.role === "admin") {
        const { data: admins } = await supabase
          .from("employees")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .eq("active", true);
        if (admins?.length) throw new Error("مسموح Admin واحد فقط");
      }
      const inserted = await dbInsert("employees", {
        name: vals.name,
        role: vals.role,
        salary: vals.salary || 0,
        active: true
      });
      if (!inserted) throw new Error("فشل الإضافة");
      closeModal();
      toast("تمت الإضافة ✅", "success");
      navigate("employees");
    }
  });
};

window.toggleEmployee = async function (id, currentActive, name, role) {
  const user = await ensureUser();
  confirmModal(`تأكيد العملية على ${name}`, async () => {
    if (currentActive) {
      if (role === "admin") {
        const { data: admins } = await supabase
          .from("employees")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .eq("active", true);
        if ((admins || []).length <= 1) {
          toast("لا يمكن تعطيل آخر Admin", "error");
          return;
        }
      }
    }
    const ok = await dbUpdate("employees", id, { active: !currentActive });
    if (!ok) { toast("فشل التحديث", "error"); return; }
    toast("تم التحديث ✅", "success");
    navigate("employees");
  });
};

window.openChangeRole = async function (id, name, currentRole) {
  const user = await ensureUser();
  inputModal({
    title: `تعديل صلاحية ${name}`,
    fields: [{
      id: "role", label: "الدور", type: "select", value: currentRole,
      options: [
        { value: "worker", label: "عامل" },
        { value: "cashier", label: "كاشير" },
        { value: "admin", label: "مدير" }
      ]
    }],
    submitLabel: "حفظ",
    onSubmit: async (vals) => {
      if (currentRole === "admin" && vals.role !== "admin") {
        const { data: admins } = await supabase
          .from("employees")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .eq("active", true);
        if ((admins || []).length <= 1) throw new Error("لا يمكن تغيير آخر Admin");
      }
      if (vals.role === "admin" && currentRole !== "admin") {
        const { data: admins } = await supabase
          .from("employees")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .eq("active", true);
        if (admins?.length) throw new Error("يوجد Admin بالفعل");
      }
      const ok = await dbUpdate("employees", id, { role: vals.role });
      if (!ok) throw new Error("فشل التحديث");
      closeModal();
      toast("تم تعديل الصلاحية ✅", "success");
      navigate("employees");
    }
  });
};