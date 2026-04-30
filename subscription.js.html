/* ============================================================
   Market Pro – subscription.js (FINAL SIMPLE STABLE)
   ============================================================ */

import { supabase } from "../data.js";

/* ─────────────────────────────────────────
   التحقق من الاشتراك
───────────────────────────────────────── */
export async function checkSubscription(){

  try{

    const { data: { user } } = await supabase.auth.getUser();

    if(!user) return false;

    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if(error || !data){
      return false;
    }

    const today = new Date();
    const expiry = new Date(data.expiry_date);

    return expiry >= today;

  }catch{
    return false;
  }
}

/* ─────────────────────────────────────────
   شاشة الاشتراك المنتهي
───────────────────────────────────────── */
export function renderSubscriptionExpired(app){

  app.innerHTML = `
    <div style="text-align:center;padding:40px;">
      <h2>❌ الاشتراك منتهي</h2>
      <p style="margin-top:10px;">يرجى التواصل لتجديد الاشتراك</p>
    </div>
  `;
}

/* ─────────────────────────────────────────
   حماية الصفحات
───────────────────────────────────────── */
export async function guardSubscription(app, renderPage){

  const active = await checkSubscription();

  if(!active){
    renderSubscriptionExpired(app);
    return;
  }

  renderPage(app);
}