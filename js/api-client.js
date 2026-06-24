'use strict';

// Auto-detect API base from current page location
const API = (() => {
  const p = location.pathname.replace(/\/[^/]+$/, ''); // strip filename
  const parts = p.split('/').filter(Boolean);
  parts.pop(); // strip current dir (admin, auth, corporate, dashboard)
  const base = parts.length ? '/' + parts.join('/') : '';
  return location.origin + base + '/backend';
})();

// Token / user storage
const S = {
  get token()    { return localStorage.getItem('pdf_at'); },
  set token(v)   { v ? localStorage.setItem('pdf_at', v) : localStorage.removeItem('pdf_at'); },
  get refresh()  { return localStorage.getItem('pdf_rt'); },
  set refresh(v) { v ? localStorage.setItem('pdf_rt', v) : localStorage.removeItem('pdf_rt'); },
  get user()     { try { return JSON.parse(localStorage.getItem('pdf_user') || 'null'); } catch { return null; } },
  set user(v)    { v ? localStorage.setItem('pdf_user', JSON.stringify(v)) : localStorage.removeItem('pdf_user'); },
  clear()        { ['pdf_at','pdf_rt','pdf_user'].forEach(k => localStorage.removeItem(k)); }
};

// Core fetch wrapper with auto token-refresh
async function apiFetch(method, path, body) {
  const doReq = () => fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(S.token ? { Authorization: `Bearer ${S.token}` } : {})
    },
    ...(body != null ? { body: JSON.stringify(body) } : {})
  });

  let res = await doReq();

  if (res.status === 401 && S.refresh) {
    const rr = await fetch(API + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: S.refresh })
    });
    if (rr.ok) {
      const rd = await rr.json();
      S.token   = rd.data?.access_token;
      S.refresh = rd.data?.refresh_token;
      res = await doReq();
    } else {
      S.clear();
      location.href = new URL('../auth/login.html', location.href).href;
      return null;
    }
  }

  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.message || 'Request failed');
    err.status = res.status;
    err.json   = json;
    throw err;
  }
  return json;
}

// Guard: redirect to login if not authenticated / wrong type
function requireAuth(allowed = []) {
  const u = S.user;
  if (!u || !S.token) {
    location.href = new URL('../auth/login.html', location.href).href;
    return null;
  }
  if (allowed.length && !allowed.includes(u.user_type)) {
    const base = new URL('..', location.href).href;
    if (['super_admin','admin_employee'].includes(u.user_type))  location.href = base + 'admin/';
    else if (u.user_type === 'corporate_admin')                  location.href = base + 'corporate/';
    else                                                          location.href = base + 'dashboard/';
    return null;
  }
  return u;
}

// Logout helper
async function logout() {
  const rt = S.refresh;
  S.clear();
  if (rt) fetch(API + '/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: rt })
  }).catch(() => {});
  location.href = new URL('../auth/login.html', location.href).href;
}

// Redirect after login based on user type
function redirectAfterLogin(user) {
  const base = new URL('..', location.href).href;
  if (['super_admin','admin_employee'].includes(user.user_type)) location.href = base + 'admin/';
  else if (user.user_type === 'corporate_admin')                 location.href = base + 'corporate/';
  else                                                            location.href = base + 'dashboard/';
}

// Toast notifications
function toast(msg, type = 'info') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = Object.assign(document.createElement('div'), { id: 'toast-root' });
    root.style.cssText = 'position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;gap:8px;z-index:9999;pointer-events:none;';
    document.body.appendChild(root);
  }
  const colors = { info:'#1e293b', success:'#059669', error:'#dc2626', warning:'#d97706' };
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `background:${colors[type]||colors.info};color:#fff;padding:11px 16px;border-radius:8px;font-size:13px;font-weight:500;max-width:360px;box-shadow:0 4px 16px rgba(0,0,0,.18);pointer-events:auto;`;
  root.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// Escape HTML to prevent XSS
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Format ISO date → readable
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
}

function fmtDt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

// Build query string
function qs(params) {
  const p = Object.entries(params).filter(([,v]) => v !== '' && v != null);
  return p.length ? '?' + new URLSearchParams(p).toString() : '';
}
