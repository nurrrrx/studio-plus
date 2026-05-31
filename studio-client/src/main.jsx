import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AppV2 from './AppV2.jsx';
import './styles.css';
import { getToken } from './api.js';

// Decide which top-level layout to render based on the URL.
//  - /studio-plus/                  -> classic 3D canvas app
//  - /studio-plus/v2/               -> v2 projects list (no sidebars)
//  - /studio-plus/v2/<projectId>/   -> v2 project view (both sidebars)
// The 404.html bounce + the small inline unpacker in each index.html
// restore the real path before this script runs, so window.location.
// pathname is the URL the user actually typed / shared.
const PATH = typeof window !== 'undefined' ? window.location.pathname : '';
const IS_V2 = /\/v2(\/|$)/.test(PATH);
const V2_PROJECT_MATCH = PATH.match(/\/v2\/([^/]+)\/?$/);
const V2_PROJECT_ID = V2_PROJECT_MATCH ? V2_PROJECT_MATCH[1] : null;

// In production the dev /api/settings middleware doesn't exist. Route those
// calls to the studio+ backend (per current project), or fall back to the
// static settings.json snapshot bundled at the site root if no backend URL
// was provided at build time.
//
// The current project ID lives on window.__studioPlusProject (set by App.jsx).
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

if (import.meta.env.PROD) {
  const origFetch = window.fetch.bind(window);
  const staticFallback = `${import.meta.env.BASE_URL}settings.json`;

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.startsWith('/api/settings')) return origFetch(input, init);

    const method = (init?.method || (typeof input !== 'string' ? input.method : 'GET') || 'GET').toUpperCase();
    const projectId = window.__studioPlusProject || 'alzeina';

    if (!API_BASE) {
      // No backend -> read from the static snapshot, swallow writes.
      if (method === 'GET') return origFetch(staticFallback, { cache: 'no-cache' });
      return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const headers = { 'Content-Type': 'application/json', ...(init?.headers || {}) };
    const token = getToken();
    if (token && method !== 'GET') headers.Authorization = `Bearer ${token}`;
    const target = `${API_BASE}/api/projects/${encodeURIComponent(projectId)}`;

    if (method === 'GET') {
      // The client expects the legacy shape: a single blob with .massing /
      // .orbit / .app keys. Unwrap from the project envelope ({settings:{}}).
      const r = await origFetch(target, { headers: {} });
      if (r.status === 404) return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (!r.ok) return r;
      const body = await r.json();
      return new Response(JSON.stringify(body.settings || {}), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    // POST: legacy client sends the full settings blob -> wrap as { settings }
    // and PUT to the project.
    const body = init?.body ? JSON.parse(init.body) : {};
    return origFetch(target, {
      method: 'PUT', headers, body: JSON.stringify({ settings: body }),
    });
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {IS_V2 ? <AppV2 projectId={V2_PROJECT_ID} /> : <App />}
  </React.StrictMode>
);
