import { supabase, dbInsert, addAuditLog, ensureUser } from "../data.js";
import { toast, inputModal, closeModal, formatCurrency, formatDate } from "../ui.js";

/**
 * Market Pro – market_shops.js  v5.1 Supernova
 * ✅ PRESERVED: All original market shop management logic
 * ✅ NEW: Opening balance support for initial inventory
 */

export async function renderShopsPage(app){
  const user = await ensureUser();
  const {data:shops}=await supabase
    .from("market_shops")
    .select("*")
    .eq("user_id",user.id)
    .order("name");

  app.innerHTML=`
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">🏬 محلات السوق</div>
      <div class="page-subtitle">${(shops||[]).length} محل مسجل</div>
    </div>
    <div class="page-actions">
      <button class="btn" onclick="openAddShop()">➕ إضافة محل</button>
    </div>
  </div>
  <div id="shops-list">
    ${renderShopCards(shops||[])}
  </div>`;
}

function esc(v=''){ return String(v).replace(/'/g,"&#39;"); }

function renderShopCards(list){
  if(!list.length){
    return `<div class="empty-state">
      <div class="empty-icon">🏬</div>
      <div class="empty-title">لا يوجد محلات</div>
      <div class="empty-sub">أضف محلات السوق لتتبع حساباتها</div>
      <button class="btn" onclick="openAddShop()">➕ إضافة محل</button>
    </div>`;
  }
  return list.map(s=>`
    <div class="card" style="cursor:pointer;" onclick="openShop('${s.id}','${esc(s.name)}')">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-weight:700;font-size:15px;">🏬 ${s.name}</div>
        <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();openShop('${s.id}','${esc(s.name)}')">حساب →</button>
      </div>
    </div>`).join('');
}

window.openAddShop=async function(){
  inputModal({
    title:'🏬 إضافة محل',
    fields:[
      {id:'name',label:'اسم المحل',type:'text',required:true},
      {id:'opening_balance_lana',label:'رصيد مبدئي (لنا)',type:'number',value:0},
      {id:'opening_balance_lahom',label:'رصيد مبدئي (لهم)',type:'number',value:0}
    ],
    submitLabel:'حفظ',
    onSubmit:async(vals)=>{
      const inserted=await dbInsert("market_shops",{
        name:vals.name,
        opening_balance_lana:Number(vals.opening_balance_lana||0),
        opening_balance_lahom:Number(vals.opening_balance_lahom||0)
      });
      if(!inserted) throw new Error('فشل إضافة المحل');
      closeModal();
      toast('تمت الإضافة ✅','success');
      navigate('market_shops');
    }
  });
};

window.openShop=async function(id,name){
  const app=document.getElementById("app");
  const user=await ensureUser();

  const[
    {data:shop},
    {data:credits},
    {data:debits}
  ]=await Promise.all([
    supabase.from("market_shops").select("*").eq("id",id).single(),
    supabase.from("shop_credits").select("*").eq("shop_id",id).eq("user_id",user.id).order("date",{ascending:false}),
    supabase.from("shop_debits").select("*").eq("shop_id",id).eq("user_id",user.id).order("created_at",{ascending:false})
  ]);

  const openingLana = Number(shop?.opening_balance_lana||0);
  const openingLahom = Number(shop?.opening_balance_lahom||0);

  const totalCredit=(credits||[]).reduce((s,x)=>s+Number(x.amount||0),0) + openingLahom;
  const totalDebit=(debits||[]).reduce((s,x)=>s+Number(x.total||0),0) + openingLana;
  const balance=totalCredit-totalDebit;

  app.innerHTML=`
  <button class="btn btn-ghost btn-sm" onclick="navigate('market_shops')">← رجوع</button>
  <div class="page-header" style="margin-top:12px;">
    <div class="page-header-left">
      <div class="page-title">🏬 ${name}</div>
      <div class="page-subtitle">حساب المحل</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-sm" onclick="openAddDebit('${id}','${esc(name)}')">➕ بضاعة عليهم</button>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <span class="kpi-icon">🟢</span>
      <div class="kpi-value" style="color:var(--c-success);">${formatCurrency(totalCredit)}</div>
      <div class="kpi-label">لنا</div>
    </div>
    <div class="kpi-card">
      <span class="kpi-icon">🔴</span>
      <div class="kpi-value" style="color:var(--c-danger);">${formatCurrency(totalDebit)}</div>
      <div class="kpi-label">عليهم</div>
    </div>
    <div class="kpi-card">
      <span class="kpi-icon">⚖️</span>
      <div class="kpi-value" style="color:${balance>=0?'var(--c-success)':'var(--c-danger)'};">${formatCurrency(Math.abs(balance))}</div>
      <div class="kpi-label">${balance>=0?'الرصيد لصالحنا':'الرصيد علينا'}</div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-header"><span class="card-title">🟢 لنا</span></div>
      ${!(credits||[]).length && !openingLahom
        ? `<div style="text-align:center;padding:20px;color:var(--c-text-muted);">لا يوجد</div>`
        : (credits||[]).map(x=>`
          <div class="row" style="justify-content:space-between;border-bottom:1px solid var(--c-border);">
            <div>${formatDate(x.date||x.created_at)}</div>
            <div class="amount-positive">${formatCurrency(x.amount)}</div>
          </div>`).join('')}
      ${openingLahom > 0 ? `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--c-border);background:var(--c-surface-3);"><div>رصيد مبدئي (لهم)</div><div class="amount-positive">${formatCurrency(openingLahom)}</div></div>` : ''}
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">🔴 عليهم</span></div>
      ${!(debits||[]).length && !openingLana
        ? `<div style="text-align:center;padding:20px;color:var(--c-text-muted);">لا يوجد</div>`
        : (debits||[]).map(x=>`
          <div class="row" style="justify-content:space-between;border-bottom:1px solid var(--c-border);">
            <div>📦 ${x.product_name}<br><small>${x.qty} × ${formatCurrency(x.price)}</small></div>
            <div class="amount-negative">${formatCurrency(x.total)}</div>
          </div>`).join('')}
      ${openingLana > 0 ? `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--c-border);background:var(--c-surface-3);"><div>رصيد مبدئي (لنا)</div><div class="amount-negative">${formatCurrency(openingLana)}</div></div>` : ''}
    </div>
  </div>`;
};

window.openAddDebit=async function(shopId, shopName){
  const user=await ensureUser();
  const {data:customers}=await supabase
    .from("customers")
    .select("id,full_name")
    .eq("user_id",user.id)
    .order("full_name");

  inputModal({
    title:`🔴 بضاعة عليهم - ${shopName}`,
    fields:[
      {id:'product_name',label:'الصنف',type:'text',required:true},
      {id:'unit',label:'الوحدة',type:'select',options:[
        {value:'عداية',label:'عداية'},{value:'برنيكة',label:'برنيكة'},
        {value:'شوال',label:'شوال'},{value:'سبت',label:'سبت'},
        {value:'كرتون',label:'كرتون'},{value:'صندوق خشب',label:'صندوق خشب'}
      ]},
      {id:'qty',label:'الكمية',type:'number',required:true},
      {id:'price',label:'السعر',type:'number',required:true},
      {id:'type',label:'نوع البيع',type:'select',required:true,options:[
        {value:'cash',label:'💵 كاش'},{value:'credit',label:'📋 آجل'}
      ]},
      {id:'customer_id',label:'العميل',type:'select',options:(customers||[]).map(c=>({value:c.id,label:c.full_name}))}
    ],
    submitLabel:'تسجيل',
    onSubmit:async(vals)=>{
      if(vals.type==='credit' && !vals.customer_id) throw new Error('اختر العميل');
      if(vals.qty<=0 || vals.price<=0) throw new Error('بيانات غير صحيحة');
      const total=vals.qty*vals.price;
      const custObj=(customers||[]).find(c=>c.id===vals.customer_id);
      const inserted=await dbInsert("shop_debits",{
        shop_id:shopId,
        product_name:vals.product_name,
        unit:vals.unit||null,
        qty:vals.qty,
        price:vals.price,
        total,
        type:vals.type,
        customer_id:vals.customer_id||null,
        customer_name:custObj?.full_name||null
      });
      if(!inserted) throw new Error('فشل الحفظ');

      if(vals.type==='credit'){
        const {error}=await supabase.from("daily_sales").insert({
          user_id:user.id,
          shop_id:shopId,
          customer_id:vals.customer_id,
          customer_name:custObj?.full_name,
          sale_type:'shop_credit',
          total,
          date:new Date().toISOString().split("T")[0]
        });
        if(error) throw new Error(error.message);
      }

      await addAuditLog("shop_debit",{shopId,shopName,...vals,total});
      closeModal();
      toast('تم التسجيل ✅','success');
      openShop(shopId,shopName);
    }
  });
};