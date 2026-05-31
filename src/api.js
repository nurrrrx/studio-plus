// Thin wrapper around the studio+ backend.
//
// Base URL comes from VITE_API_URL at build time. If unset (dev with no
// backend), the wrapper falls back to '/api' so the Vite dev middleware
// (settings-api in vite.config.js) still serves a local settings.json.
// In that fallback mode `/api/projects/:id` doesn't exist, so callers should
// gracefully handle 404s — that's already how the UI behaves.
//
// Auth: writes attach a JWT from localStorage (set by login()). If absent,
// writes return 401 and the UI shows a read-only state.

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'studio-plus-token';
const TOKEN_EXP_KEY = 'studio-plus-token-exp';

const url = (p) => `${BASE}${p}`;

export const getToken = () => {
  const t = localStorage.getItem(TOKEN_KEY);
  const exp = Number(localStorage.getItem(TOKEN_EXP_KEY) || 0);
  if (!t || (exp && Date.now() > exp)) return null;
  return t;
};

export const isAuthed = () => Boolean(getToken());

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXP_KEY);
};

const authHeaders = () => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export async function login(username, password) {
  const r = await fetch(url('/api/auth'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `auth failed (${r.status})`);
  }
  const { token, expiresAt } = await r.json();
  localStorage.setItem(TOKEN_KEY, token);
  if (expiresAt) localStorage.setItem(TOKEN_EXP_KEY, String(expiresAt));
  return true;
}

export async function listProjects() {
  const r = await fetch(url('/api/projects'));
  if (!r.ok) throw new Error(`list failed (${r.status})`);
  return r.json();
}

export async function getProject(id) {
  const r = await fetch(url(`/api/projects/${encodeURIComponent(id)}`));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`get failed (${r.status})`);
  return r.json();
}

export async function saveProject(id, patch) {
  const r = await fetch(url(`/api/projects/${encodeURIComponent(id)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `save failed (${r.status})`);
  }
  return r.json();
}

export async function createProject(id, name, location = '') {
  const r = await fetch(url('/api/projects'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ id, name, location }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `create failed (${r.status})`);
  }
  return r.json();
}

export async function deleteProject(id) {
  const r = await fetch(url(`/api/projects/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `delete failed (${r.status})`);
  }
  return r.json();
}

// Existence check that doesn't throw — useful for telling dev (no backend) vs
// 404 vs network.
export const backendConfigured = () => Boolean(BASE);
