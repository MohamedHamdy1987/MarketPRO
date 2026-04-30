/**
 * Market Pro – app.js  v5.1 Supernova
 * SPA Router + RBAC Authorization + Module Loader
 * 
 * ✅ NEW: Role-based access control (RBAC)
 * ✅ NEW: Reconciliation page route
 * ✅ FIXED: Hamburger menu now functional
 * ✅ FIXED: Mobile sidebar toggle
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ─── Supabase (mirrored from data.js for auth guard) ─────────────────────────
const supabaseUrl = 'https://seadlwxlffbgxtxwhuis.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlYWRsd3hsZmZiZ3h0eHdodWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MjEzNTYsImV4cCI6MjA5MzA5NzM1Nn0._CtO7o-ruSpAq-w7Lri3rdbG4Zin6rI8nzFDsinR6Co';

const _sb = createClient(supabaseUrl, supabaseKey, {
  auth: { storage: window.localStorage, persistSession: true, detectSessionInUrl: true, autoRefreshToken: true }
});

// ─── Auth Guard ───────────────────────────────────────────────────────────────
(async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  
  // Inject business name into sidebar
  const biz = user.user_metadata?.business_name;
  const bizEl = document.getElementById('business-name');
  if (bizEl && biz) {
    bizEl.textContent = biz;
    bizEl.style.display = 'block';
  }
  
  // ✅ NEW: Load employee role for RBAC
  await loadEmployeeRole(user.id);
  
  // Boot app
  initApp();
})();

// ─── Page registry ────────────────────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard:      'الرئيسية',
  invoices:       'الفواتير',
  sales:          'المبيعات',
  tarhil:         'الترحيلات',
  customers:      'العملاء',
  suppliers:      'الموردين',
  market_shops:   'محلات السوق',
  khazna:         'الخزنة',
  financial:      'المركز المالي',
  partners:       'الشركاء',
  employees:      'الموظفين',
  crates:         'العدايات والبرانيك',
  reconciliation: 'تسوية الحسابات',  // ✅ NEW
};

async function loadPage(route) {
  const app = document.getElementById('app');
  const titleEl = document.getElementById('page-title');
  if (!app) return;

  // Skeleton while loading
  app.innerHTML = `
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>`;
  app.className = 'content';

  if (titleEl) titleEl.textContent = PAGE_TITLES[route] || route;

  try {
    switch (route) {
      case 'dashboard': {
        const { renderDashboard } = await import('./pages/dashboard.js');
        await renderDashboard(app);
        break;
      }
      case 'invoices': {
        const { renderInvoicesPage } = await import('./pages/invoices.js');
        await renderInvoicesPage(app);
        break;
      }
      case 'sales': {
        const { renderSalesPage } = await import('./pages/sales.js');
        await renderSalesPage(app);
        break;
      }
      case 'tarhil': {
        const { renderTarhilPage } = await import('./pages/tarhil.js');
        await renderTarhilPage(app);
        break;
      }
      case 'customers': {
        const { renderCustomersPage } = await import('./pages/customers.js');
        await renderCustomersPage(app);
        break;
      }
      case 'suppliers': {
        const { renderSuppliersPage } = await import('./pages/suppliers.js');
        await renderSuppliersPage(app);
        break;
      }
      case 'market_shops': {
        const { renderShopsPage } = await import('./pages/shops.js');
        await renderShopsPage(app);
        break;
      }
      case 'khazna': {
        const { renderKhaznaPage } = await import('./pages/khazna.js');
        await renderKhaznaPage(app);
        break;
      }
      case 'financial': {
        const { renderFinancialPage } = await import('./pages/financial.js');
        await renderFinancialPage(app);
        break;
      }
      case 'partners': {
        const { renderPartnersPage } = await import('./pages/partners.js');
        await renderPartnersPage(app);
        break;
      }
      case 'employees': {
        const { renderEmployeesPage } = await import('./pages/employees.js');
        await renderEmployeesPage(app);
        break;
      }
      case 'crates': {
        const { renderCratesPage } = await import('./pages/crates.js');
        await renderCratesPage(app);
        break;
      }
      // ── NEW in v5.1 ──────────────────────────────────────────────────────
      case 'reconciliation': {
        const { renderReconciliationPage } = await import('./pages/reconciliation_page.js');
        await renderReconciliationPage(app);
        break;
      }
      default: {
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">الصفحة غير موجودة</div></div>`;
      }
    }
  } catch (err) {
    console.error('Page load error:', err);
    app.innerHTML = `<div class="card" style="color:var(--c-danger);">⚠️ خطأ في تحميل الصفحة: ${err.message}</div>`;
  }

  // Re-trigger fade-in
  app.classList.add('fade-in');

  // Update active nav button
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.nav === route);
  });

  // Store current route
  window._currentRoute = route;
}

// ─── Navigate (global) ────────────────────────────────────────────────────────
window.navigate = function(route) {
  history.pushState({ route }, '', '#' + route);
  loadPage(route);
};

// ─── Back/Forward ─────────────────────────────────────────────────────────────
window.addEventListener('popstate', (e) => {
  const route = e.state?.route || 'dashboard';
  loadPage(route);
});

// ─── ✅ NEW: RBAC System ──────────────────────────────────────────────────────
async function loadEmployeeRole(userId) {
  try {
    const { data, error } = await _sb
      .from('employees')
      .select('role, active')
      .eq('user_id', userId)
      .eq('active', true)
      .single();
    
    if (error || !data) {
      window._currentUserRole = 'admin'; // default for owner
      window._employeeActive = false;
    } else {
      window._currentUserRole = data.role || 'worker';
      window._employeeActive = true;
    }
  } catch {
    window._currentUserRole = 'admin';
    window._employeeActive = false;
  }
}

/**
 * Check if current user can access a feature
 * @param {string} feature - 'create', 'edit', 'delete', 'view_sensitive'
 * @returns {boolean}
 */
window.canAccess = function(feature) {
  const role = window._currentUserRole || 'admin';
  const permissions = {
    admin:   ['create', 'edit', 'delete', 'view_sensitive', 'manage_employees', 'manage_shops', 'manage_partners'],
    cashier: ['create', 'view_sensitive'],
    worker:  [],
  };
  return (permissions[role] || []).includes(feature);
};

function applyRBAC() {
  document.querySelectorAll('[data-permission]').forEach(el => {
    const perm = el.dataset.permission;
    if (perm && !window.canAccess(perm)) {
      el.style.display = 'none';
    }
  });
}

// ─── Nav button delegation ────────────────────────────────────────────────────
function initApp() {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = btn.dataset.nav;
      window.navigate(route);
      document.getElementById('sidebar')?.classList.remove('open');
    });
  });

  const gs = document.getElementById('global-search');
  if (gs) {
    gs.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (typeof window.filterCustomers === 'function' && window._currentRoute === 'customers') {
        window.filterCustomers(q);
      }
    });
  }

  // ✅ FIXED: hamburger button now works
  const hamburger = document.getElementById('hamburger');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('open');
    });
  }

  // Initial route from hash or default
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  const validRoutes = Object.keys(PAGE_TITLES);
  const startRoute = validRoutes.includes(hash) ? hash : 'dashboard';
  history.replaceState({ route: startRoute }, '', '#' + startRoute);
  loadPage(startRoute);

  function updateNetStatus() {
    const indicator = document.getElementById('net-status');
    if (!indicator) return;
    indicator.textContent = navigator.onLine ? '🟢' : '🔴';
    indicator.title = navigator.onLine ? 'متصل' : 'بدون إنترنت';
  }
  window.addEventListener('online', updateNetStatus);
  window.addEventListener('offline', updateNetStatus);
  updateNetStatus();
  
  const observer = new MutationObserver(() => {
    applyRBAC();
  });
  observer.observe(document.getElementById('app'), { childList: true, subtree: true });
}
