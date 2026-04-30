import { supabase, ensureUser, getCustomerCrates } from "../data.js";
import { formatCurrency, formatDate, emptyState } from "../ui.js";

/* ══════════════════════════════════════════════════════════
   دفتر الترحيلات – Req 5
   عرض مبسط: مجموعة حسب العميل → يومي → عند الضغط يفتح التفاصيل
   ══════════════════════════════════════════════════════════ */
export async function renderTarhilPage(app){
  const user=await ensureUser();

  app.innerHTML=`
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">📋 دفتر الترحيلات</div>
      <div class="page-subtitle">الطلبات اليومية لكل عميل</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨️ طباعة</button>
    </div>
  </div>

  <div class="sort-bar">
    <input type="search" id="tarhil-search" placeholder="🔍 بحث بالاسم..."
      oninput="filterTarhil(this.value)"
      style="flex:1;padding:8px 14px;border:1px solid var(--c-border);border-radius:10px;background:var(--c-surface);font-family:Cairo;font-size:13px;">
    <select onchange="sortTarhil(this.value)"
      style="padding:7px 28px 7px 10px;border:1px solid var(--c-border);border-radius:10px;font-family:Cairo;font-size:12px;background:var(--c-surface);">
      <option value="bal-desc">الرصيد ↓</option>
      <option value="bal-asc">الرصيد ↑</option>
      <option value="name-asc">الاسم أ–ي</option>
      <option value="name-desc">الاسم ي–أ</option>
    </select>
  </div>

  <div id="tarhil-content">
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
  </div>`;

  const {data,error}=await supabase
    .from('customer_ledger')
    .select('*')
    .eq('user_id',user.id)
    .order('customer_name',{ascending:true})
    .order('trx_date',{ascending:true});

  const container=document.getElementById('tarhil-content');
  if(error){ container.innerHTML=`<div class="card" style="color:var(--c-danger);">⚠️ ${error.message}</div>`; return; }
  if(!data?.length){ container.innerHTML=emptyState('📋','لا توجد ترحيلات','سيظهر هنا كشف حساب العملاء'); return; }

  const grouped=groupByCustomerDaily(data);
  window._tarhilGrouped=grouped;
  window._tarhilSort='bal-desc';

  renderTarhilContent(container, grouped, 'bal-desc');
}

function groupByCustomerDaily(rows=[]){
  const map={};

  rows.forEach(r=>{
    if(!r.customer_id) return;
    if(!map[r.customer_id]){
      map[r.customer_id]={
        id:r.customer_id,
        name:r.customer_name||'عميل',
        debit:0, credit:0, balance:0,
        days:{},
        items:[]
      };
    }
    const c=map[r.customer_id];
    c.debit+=Number(r.debit||0);
    c.credit+=Number(r.credit||0);
    c.items.push(r);

    const day=r.trx_date?.split('T')[0]||'–';
    if(!c.days[day]) c.days[day]={date:day,items:[],total:0};
    c.days[day].items.push(r);
    c.days[day].total+=Number(r.debit||0);
  });

  Object.values(map).forEach(c=>{
    c.balance=Number(c.debit||0)-Number(c.credit||0);
  });

  return map;
}

function renderTarhilContent(container, grouped, sortBy){
  let ids=Object.keys(grouped);

  if(sortBy==='bal-desc') ids.sort((a,b)=>grouped[b].balance-grouped[a].balance);
  if(sortBy==='bal-asc')  ids.sort((a,b)=>grouped[a].balance-grouped[b].balance);
  if(sortBy==='name-asc') ids.sort((a,b)=>(grouped[a].name||'').localeCompare(grouped[b].name||'','ar'));
  if(sortBy==='name-desc')ids.sort((a,b)=>(grouped[b].name||'').localeCompare(grouped[a].name||'','ar'));

  const grandDebit=ids.reduce((s,id)=>s+grouped[id].debit,0);
  const grandCredit=ids.reduce((s,id)=>s+grouped[id].credit,0);
  const grandBalance=ids.reduce((s,id)=>s+grouped[id].balance,0);
  const debtorsCount=ids.filter(id=>grouped[id].balance>0).length;

  container.innerHTML=`
  <div class="kpi-grid" style="margin-bottom:20px;">
    <div class="kpi-card">
      <span class="kpi-icon">📤</span>
      <div class="kpi-value amount-positive">${formatCurrency(grandDebit)}</div>
      <div class="kpi-label">إجمالي المدين</div>
    </div>
    <div class="kpi-card">
      <span class="kpi-icon">📥</span>
      <div class="kpi-value amount-negative">${formatCurrency(grandCredit)}</div>
      <div class="kpi-label">إجمالي الدائن</div>
    </div>
    <div class="kpi-card">
      <span class="kpi-icon">⚖️</span>
      <div class="kpi-value" style="color:${grandBalance>0?'var(--c-negative)':'var(--c-positive)'};">${formatCurrency(Math.abs(grandBalance))}</div>
      <div class="kpi-label">صافي الذمم</div>
    </div>
    <div class="kpi-card">
      <span class="kpi-icon">👥</span>
      <div class="kpi-value">${debtorsCount}</div>
      <div class="kpi-label">عملاء مدينون</div>
    </div>
  </div>

  <div id="tarhil-list">
    ${ids.map(id=>renderCustomerCard(grouped[id])).join('')}
  </div>`;
}

function renderCustomerCard(g){
  const highRisk=g.balance>5000;
  const balColor=g.balance>0?'var(--c-negative)':g.balance<0?'var(--c-positive)':'var(--c-text-muted)';
  const balLabel=g.balance>0?'مدين':g.balance<0?'دائن':'سوي';

  const dayKeys=Object.keys(g.days).sort((a,b)=>new Date(b)-new Date(a));
  const dayCount=dayKeys.length;

  return `
  <div class="card" style="${highRisk?'border:2px solid rgba(220,38,38,.3);':''}" id="tarhil-card-${g.id}">
    <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;"
      onclick="toggleTarhilCustomer('${g.id}')">
      <div>
        <div style="font-weight:800;font-size:15px;">👤 ${g.name}</div>
        <div style="font-size:12px;color:var(--c-text-muted);margin-top:2px;">
          ${dayCount} يوم • ${g.items.length} حركة
          ${highRisk?`<span class="badge badge-red" style="margin-right:6px;">⚠ ذمة عالية</span>`:''}
        </div>
        <div id="crate-tarhil-${g.id}" style="display:none;margin-top:4px;"></div>
      </div>
      <div style="text-align:left;flex-shrink:0;">
        <div style="font-size:20px;font-weight:800;color:${balColor};">${formatCurrency(Math.abs(g.balance))}</div>
        <div style="font-size:12px;color:${balColor};">${balLabel}</div>
        <div style="font-size:20px;margin-top:4px;" id="tarhil-toggle-${g.id}">▾</div>
      </div>
    </div>

    <div id="tarhil-days-${g.id}" style="display:none;margin-top:12px;border-top:1px solid var(--c-border);padding-top:12px;">
      ${dayKeys.map(day=>renderDaySection(g.days[day],g.id)).join('')}

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px;
        background:var(--c-surface-3);border-radius:10px;padding:10px;">
        <div><div style="font-size:11px;color:var(--c-text-muted);">مدين</div><div class="amount-positive" style="font-weight:800;">${formatCurrency(g.debit)}</div></div>
        <div><div style="font-size:11px;color:var(--c-text-muted);">دائن</div><div class="amount-negative" style="font-weight:800;">${formatCurrency(g.credit)}</div></div>
        <div><div style="font-size:11px;color:var(--c-text-muted);">رصيد</div><div style="font-weight:800;color:${balColor};">${formatCurrency(Math.abs(g.balance))}</div></div>
      </div>

      <div style="margin-top:10px;">
        <button class="btn btn-ghost btn-sm" onclick="navigate('customers')">كشف الحساب الكامل ←</button>
      </div>
    </div>
  </div>`;
}

function renderDaySection(day, customerId){
  const dateLabel=formatDate(day.date);
  const dayTotal=day.items.reduce((s,i)=>s+Number(i.debit||0),0);

  return `
  <div style="margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;align-items:center;
      background:var(--c-surface-3);border-radius:8px;padding:8px 12px;cursor:pointer;"
      onclick="toggleDayItems('day-${customerId}-${day.date.replace(/-/g,'')}')">
      <div style="font-weight:700;font-size:13px;">📅 ${dateLabel}</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="amount-positive" style="font-weight:800;">${formatCurrency(dayTotal)}</span>
        <span style="font-size:12px;color:var(--c-text-muted);">${day.items.length} بند ▾</span>
      </div>
    </div>
    <div id="day-${customerId}-${day.date.replace(/-/g,'')}" style="display:none;padding:8px 4px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        ${day.items.map(i=>`
        <tr style="border-bottom:1px solid var(--c-border);">
          <td style="padding:6px 4px;">${i.description||'–'}</td>
          <td style="padding:6px 4px;text-align:left;font-weight:700;">
            ${Number(i.debit||0)>0
              ?`<span class="amount-positive">${formatCurrency(i.debit)}</span>`
              :`<span class="amount-negative">(${formatCurrency(i.credit)})</span>`}
          </td>
        </tr>`).join('')}
      </table>
    </div>
  </div>`;
}

window.toggleTarhilCustomer=async function(id){
  const days=document.getElementById(`tarhil-days-${id}`);
  const toggle=document.getElementById(`tarhil-toggle-${id}`);
  const crateEl=document.getElementById(`crate-tarhil-${id}`);

  if(!days) return;
  const isOpen=days.style.display!=='none';
  days.style.display=isOpen?'none':'block';
  if(toggle) toggle.textContent=isOpen?'▾':'▴';

  if(!isOpen&&crateEl&&crateEl.style.display==='none'){
    const {adaya,barnika}=await getCustomerCrates(id);
    if(adaya>0||barnika>0){
      crateEl.innerHTML=`<button class="crate-badge" onclick="navigate('crates')">🧺 ${adaya} عداية | ${barnika} برنيكة</button>`;
      crateEl.style.display='block';
    }
  }
};

window.toggleDayItems=function(id){
  const el=document.getElementById(id);
  if(!el) return;
  el.style.display=el.style.display==='none'?'block':'none';
};

window.filterTarhil=function(q){
  const grouped=window._tarhilGrouped||{};
  q=(q||'').toLowerCase();
  const filtered=q
    ?Object.fromEntries(Object.entries(grouped).filter(([,g])=>(g.name||'').toLowerCase().includes(q)))
    :grouped;
  const c=document.getElementById('tarhil-list');
  if(c) c.innerHTML=Object.keys(filtered).map(id=>renderCustomerCard(filtered[id])).join('');
};

window.sortTarhil=function(by){
  window._tarhilSort=by;
  const container=document.getElementById('tarhil-content');
  if(container&&window._tarhilGrouped){
    renderTarhilContent(container,window._tarhilGrouped,by);
  }
};