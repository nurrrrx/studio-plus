import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// Persists view settings (zoom, rotation) to settings.json in the project root.
// GET /api/settings -> current file (or {}); POST /api/settings -> overwrite it.
function settingsApi() {
  const file = path.resolve(import.meta.dirname, 'settings.json');
  const handler = (req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/settings')) return next();
    if (req.method === 'GET') {
      let data = '{}';
      try { data = fs.readFileSync(file, 'utf8'); } catch { /* no file yet */ }
      res.setHeader('Content-Type', 'application/json');
      return res.end(data);
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          fs.writeFileSync(file, JSON.stringify(parsed, null, 2) + '\n');
          res.setHeader('Content-Type', 'application/json');
          res.end('{"ok":true}');
        } catch {
          res.statusCode = 400;
          res.end('{"ok":false}');
        }
      });
      return;
    }
    return next();
  };
  return {
    name: 'settings-api',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

// On GitHub Pages the site is served from /<repo>/, so set base via env at build time.
// Locally `vite dev` and `vite preview` use the default '/'.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), settingsApi()],
});
