import { supabase, ensureUser } from '../data.js';
import { formatCurrency, formatDate } from '../ui.js';

export async function renderDashboard(app){
const user=await ensureUser();

app.innerHTML=`
<div class='page-header'>
  <div class='page-header-left'>
    <div class='page-title'>📊 لوحة التحكم</div>
    <div class='page-subtitle'>نظرة شاملة على أداء السوق</div>
  </div>
  <div class='page-actions'>
    <button class='btn' onclick="navigate('invoices')">📄 فاتورة جديدة</button>
    <button class='btn btn-ghost' onclick="navigate('financial')">المركز المالي</button>
  </div>
</div>

<div class='kpi-grid' id='kpi-grid'>
  ${[0,1,2,3].map(()=>`<div class='skeleton skeleton-card'></div>`).join('')}
</div>

<div class='grid-2'>
  <div class='card'>
    <div class='card-header'>
      <span class='card-title'>📈 المبيعات – آخر 14 يوم</span>
      <span id='chart-total' style='font-weight:800;color:var(--c-primary);'></span>
    </div>
    <canvas id='salesChart' height='120'></canvas>
  </div>

  <div class='card'>
    <div class='card-header'>
      <span class='card-title'>🏆 كبار المدينين</span>
      <button class='btn btn-ghost btn-sm' onclick="navigate('customers')">عرض الكل</button>
    </div>
    <div id='aging-widget'></div>
  </div>
</div>

<div class='grid-2'>
  <div class='card'>
    <div class='card-header'>
      <span class='card-title'>📄 فواتير مؤكدة مفتوحة</span>
      <button class='btn btn-ghost btn-sm' onclick="navigate('invoices')">عرض الكل</button>
    </div>
    <div id='open-invoices'></div>
  </div>
  <div class='card'>
    <div class='card-header'>
      <span class='card-title'>🕐 آخر النشاطات</span>
    </div>
    <div id='activity-feed'></div>
  </div>
</div>`;

/* resilience – all widgets load independently */
await Promise.allSettled([
  loadKPIs(user),
  loadChart(user),
  loadAging(user),
  loadOpenInvoices(user),
  loadActivity(user)
]);
}

/* ── KPIs ────────────────────────────────────────────────── */
async function loadKPIs(user){
try{
const[
  {data:invoices},
  {data:customers},
  {data:balances},
  {data:expenses},
  {data:collections}
]=await Promise.all([
  supabase.from('invoices').select('commission').eq('user_id',user.id).eq('status','closed'),
  supabase.from('customers').select('id').eq('user_id',user.id),
  supabase.from('customer_balances').select('balance').eq('user_id',user.id),
  supabase.from('expenses').select('amount').eq('user_id',user.id),
  supabase.from('collections').select('amount').eq('user_id',user.id)
]);

const totalCommission=(invoices||[]).reduce((s,i)=>s+Number(i.commission||0),0);
const totalReceivables=(balances||[]).filter(b=>Number(b.balance)>0).reduce((s,b)=>s+Number(b.balance),0);
const totalExpenses=(expenses||[]).reduce((s,e)=>s+Number(e.amount||0),0);
const totalCash=(collections||[]).reduce((s,c)=>s+Number(c.amount||0),0);
const cashOnHand=totalCash-totalExpenses;

const kpis=[
  {icon:'💰',value:formatCurrency(totalCommission),label:'إجمالي العمولات',color:'var(--c-primary)'},
  {icon:'👥',value:formatCurrency(totalReceivables),label:'إجمالي الذمم',color:'var(--c-warning)'},
  {icon:'🏦',value:formatCurrency(cashOnHand),label:'صافي الخزنة',color:'var(--c-info)'},
  {icon:'🧑‍🤝‍🧑',value:(customers||[]).length+' عميل',label:'إجمالي العملاء',color:'var(--c-accent)'},
];

document.getElementById('kpi-grid').innerHTML=kpis.map(k=>`
<div class='kpi-card'>
  <span class='kpi-icon'>${k.icon}</span>
  <div class='kpi-value' style='color:${k.color};'>${k.value}</div>
  <div class='kpi-label'>${k.label}</div>
</div>`).join('');

}catch(e){
console.error(e);
document.getElementById('kpi-grid').innerHTML=`<div class='card' style='color:var(--c-danger);'>⚠️ خطأ في تحميل المؤشرات</div>`;
}
}

/* ── Sales Chart ─────────────────────────────────────────── */
async function loadChart(user){
try{
const since=new Date();
since.setDate(since.getDate()-13);

const {data:sales,error}=await supabase
  .from('daily_sales')
  .select('date,total')
  .eq('user_id',user.id)
  .gte('date',since.toISOString().split('T')[0])
  .order('date');

if(error){ console.warn('daily_sales missing'); return; }

const map={};
for(let i=13;i>=0;i--){
  const d=new Date();
  d.setDate(d.getDate()-i);
  map[d.toISOString().split('T')[0]]=0;
}

(sales||[]).forEach(s=>{
  if(map[s.date]!==undefined) map[s.date]+=Number(s.total||0);
});

const total=Object.values(map).reduce((a,b)=>a+b,0);
const badge=document.getElementById('chart-total');
if(badge) badge.textContent=formatCurrency(total);

const ctx=document.getElementById('salesChart');
if(!ctx) return;

if(window._salesChart) window._salesChart.destroy();

window._salesChart=new Chart(ctx,{
  type:'line',
  data:{
    labels:Object.keys(map).map(d=>new Date(d).toLocaleDateString('ar-EG',{day:'numeric',month:'short'})),
    datasets:[{
      data:Object.values(map),
      borderColor:'#16a34a',
      backgroundColor:'rgba(22,163,74,.08)',
      borderWidth:2.5,
      pointBackgroundColor:'#16a34a',
      pointRadius:3,
      fill:true,
      tension:0.4
    }]
  },
  options:{
    responsive:true,
    plugins:{legend:{display:false}},
    scales:{
      x:{grid:{display:false},ticks:{font:{family:'Cairo',size:10},color:'#94a3b8'}},
      y:{grid:{color:'rgba(0,0,0,.04)'},ticks:{font:{family:'Cairo',size:10},color:'#94a3b8',
        callback:v=>v>=1000?(v/1000).toFixed(1)+'k':v}}
    }
  }
});

}catch(e){ console.error(e); }
}

/* ── Top Debtors Widget – Req 17 ─────────────────────────── */
async function loadAging(user){
try{
const container=document.getElementById('aging-widget');
if(!container) return;

const {data:balances}=await supabase
  .from('customer_balances')
  .select(`customer_id,balance,customers(full_name)`)
  .eq('user_id',user.id)
  .gt('balance',0)
  .order('balance',{ascending:false})
  .limit(6);

if(!balances?.length){
  container.innerHTML=`
  <div class='empty-state' style='padding:24px;'>
    <div class='empty-icon'>✅</div>
    <div class='empty-title'>لا توجد ديون مستحقة</div>
  </div>`;
  return;
}

const max=Number(balances[0].balance||1);

container.innerHTML=balances.map((b,i)=>{
const pct=Math.round((Number(b.balance)/max)*100);
const medals=['🥇','🥈','🥉'];
return `
<div style='margin-bottom:12px;'>
  <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;'>
    <span style='font-weight:700;font-size:13px;'>
      ${medals[i]||`${i+1}.`} ${b.customers?.full_name||'عميل'}
    </span>
    <span class='badge badge-red'>${formatCurrency(b.balance)}</span>
  </div>
  <div style='height:6px;background:var(--c-surface-3);border-radius:3px;overflow:hidden;'>
    <div style='height:100%;width:${pct}%;background:linear-gradient(90deg,var(--c-danger),#f87171);border-radius:3px;transition:width .6s ease;'></div>
  </div>
</div>`;
}).join('');

}catch(e){ console.error(e); }
}

/* ── Open Invoices ───────────────────────────────────────── */
async function loadOpenInvoices(user){
try{
const c=document.getElementById('open-invoices');
if(!c) return;

const {data:invoices}=await supabase
  .from('invoices')
  .select('id,supplier_name,date,gross')
  .eq('user_id',user.id)
  .eq('status','confirmed')
  .order('date',{ascending:false})
  .limit(5);

if(!invoices?.length){
  c.innerHTML=`<div style='color:var(--c-text-muted);font-size:13px;text-align:center;padding:16px;'>لا توجد فواتير مفتوحة</div>`;
  return;
}

c.innerHTML=invoices.map(i=>`
<div style='display:flex;justify-content:space-between;align-items:center;
  padding:8px 0;border-bottom:1px solid var(--c-border);cursor:pointer;'
  onclick="navigate('invoices')"
  onmouseover="this.style.background='var(--c-surface-3)'"
  onmouseout="this.style.background=''">
  <div>
    <div style='font-weight:700;font-size:13px;'>${i.supplier_name||'–'}</div>
    <div style='font-size:11px;color:var(--c-text-muted);'>${formatDate(i.date)}</div>
  </div>
  <span class='badge badge-yellow'>${formatCurrency(i.gross)}</span>
</div>`).join('');

}catch(e){ console.error(e); }
}

/* ── Activity Feed ───────────────────────────────────────── */
async function loadActivity(user){
try{
const c=document.getElementById('activity-feed');
if(!c) return;

const {data:logs}=await supabase
  .from('audit_logs')
  .select('action,created_at')
  .eq('user_id',user.id)
  .order('created_at',{ascending:false})
  .limit(8);

if(!logs?.length){
  c.innerHTML=`<div style='color:var(--c-text-muted);font-size:13px;text-align:center;padding:16px;'>لا توجد نشاطات</div>`;
  return;
}

c.innerHTML=logs.map(l=>`
<div style='display:flex;justify-content:space-between;align-items:center;
  padding:7px 0;border-bottom:1px solid var(--c-border);'>
  <span style='font-size:13px;color:var(--c-text);'>${l.action}</span>
  <span style='font-size:11px;color:var(--c-text-muted);white-space:nowrap;'>${formatDate(l.created_at)}</span>
</div>`).join('');

}catch(e){ console.error(e); }
}