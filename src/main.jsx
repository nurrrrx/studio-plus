import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// On production (GitHub Pages, etc.) there is no /api/settings server.
// Redirect GET to the static settings.json bundled at the site root, and
// swallow POSTs so the read-only published site silently no-ops on save.
if (import.meta.env.PROD) {
  const origFetch = window.fetch.bind(window);
  const staticUrl = `${import.meta.env.BASE_URL}settings.json`;
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.startsWith('/api/settings')) {
      const method = (init?.method || (typeof input !== 'string' ? input.method : 'GET') || 'GET').toUpperCase();
      if (method === 'GET') return origFetch(staticUrl, { cache: 'no-cache' });
      return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return origFetch(input, init);
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
