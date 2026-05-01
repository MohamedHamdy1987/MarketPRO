import { supabase } from "./data.js";

/* ═══════════════════════════════════════════════════════
   Subscription System – Production Ready
   ═══════════════════════════════════════════════════════ */

let _cachedStatus = null;
let _lastCheck = 0;
const CACHE_TTL = 60 * 1000; // 1 minute cache

/* ──────────────────────────────────────────────────────
   Main Check
   ────────────────────────────────────────────────────── */
export async function checkSubscription(force = false) {
  try {
    const now = Date.now();

    // ✅ Cache لتقليل الضغط على DB
    if (!force && _cachedStatus !== null && (now - _lastCheck < CACHE_TTL)) {
      return _cachedStatus;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      console.warn("No user session");
      return false;
    }

    const user = userData.user;

    // ✅ جلب الاشتراك الحالي
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (error) {
      console.error("Subscription fetch error:", error);
      return false;
    }

    // ❌ لا يوجد اشتراك → إنشاء Trial تلقائي
    if (!data) {
      console.warn("No subscription found → creating trial");
      await createTrial(user.id);
      _cachedStatus = true;
      _lastCheck = now;
      return true;
    }

    const today = new Date();
    const end = new Date(data.end_date);

    // ❌ منتهي
    if (end < today) {
      await expireSubscription(user.id);
      _cachedStatus = false;
      _lastCheck = now;
      return false;
    }

    // ✅ صالح
    _cachedStatus = true;
    _lastCheck = now;
    return true;

  } catch (e) {
    console.error("Subscription check failed:", e);

    // 🔥 fallback: ما توقفش البرنامج
    return true;
  }
}

/* ──────────────────────────────────────────────────────
   Expire Subscription
   ────────────────────────────────────────────────────── */
export async function expireSubscription(userId) {
  try {
    await supabase
      .from("subscriptions")
      .update({ active: false })
      .eq("user_id", userId);

    await supabase
      .from("profiles")
      .update({ subscription_status: "expired" })
      .eq("id", userId);

  } catch (e) {
    console.error("Expire subscription error:", e);
  }
}

/* ──────────────────────────────────────────────────────
   Create Trial
   ────────────────────────────────────────────────────── */
export async function createTrial(userId, days = 7) {
  try {
    const today = new Date();
    const end = new Date();
    end.setDate(today.getDate() + days);

    await supabase.from("subscriptions").insert({
      user_id: userId,
      plan: "trial",
      start_date: today.toISOString(),
      end_date: end.toISOString(),
      active: true
    });

    await supabase
      .from("profiles")
      .update({ subscription_status: "trial" })
      .eq("id", userId);

  } catch (e) {
    console.error("Create trial error:", e);
  }
}

/* ──────────────────────────────────────────────────────
   Get Subscription Info (for UI)
   ────────────────────────────────────────────────────── */
export async function getSubscriptionInfo() {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return null;

    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    return data || null;

  } catch (e) {
    console.error("Get subscription info error:", e);
    return null;
  }
}

/* ──────────────────────────────────────────────────────
   Force Refresh
   ────────────────────────────────────────────────────── */
export function resetSubscriptionCache() {
  _cachedStatus = null;
  _lastCheck = 0;
}