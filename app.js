// اختبار تحميل التطبيق
(async function() {
  try {
    // استيراد Supabase من data.js
    const { supabase } = await import('./data.js');
    
    // فحص الجلسة
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = 'index.html';
    } else {
      // عرض نجاح التحميل
      document.getElementById('app').innerHTML = `
        <div style="text-align:center;padding:50px;font-family:Cairo;color:#16a34a;">
          <h1>✅ تم تحميل التطبيق بنجاح</h1>
          <p>المستخدم: ${user.email}</p>
          <p>الصلاحيات: مدير</p>
          <button onclick="alert('الزرّ يعمل!')" style="padding:10px 20px;background:#16a34a;color:white;border:none;border-radius:8px;font-family:Cairo;font-size:16px;cursor:pointer;">اضغط للتجربة</button>
        </div>
      `;
    }
  } catch (error) {
    // عرض أي خطأ
    document.getElementById('app').innerHTML = `
      <div style="text-align:center;padding:50px;font-family:Cairo;color:red;">
        <h1>❌ فشل التحميل</h1>
        <p>${error.message}</p>
        <hr>
        <pre style="text-align:right;direction:rtl;">${error.stack}</pre>
      </div>
    `;
  }
})();
