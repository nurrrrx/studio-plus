// studio+ backend — Express + Postgres (pg). Stores per-project settings
// (massing, orbit, app, prop layers, etc.) so the GitHub Pages client can
// persist edits across browsers and devices. Reuses the existing shared
// Postgres on Railway under its own `studio_plus` schema, isolated from any
// other app's tables.
//
// Public endpoints (read-only):
//   GET  /healthz                       liveness probe
//   GET  /api/projects                  list { id, name, location, updatedAt }
//   GET  /api/projects/:id              full project document (404 if missing)
//
// Auth (single shared account via env):
//   POST /api/auth { username, password } -> { token, expiresAt }
//
// Writes (require Authorization: Bearer <token>):
//   POST   /api/projects { id, name, location, settings? }   create
//   PUT    /api/projects/:id { settings, name?, location? }  upsert
//   DELETE /api/projects/:id                                 remove

import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'kitty';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'stevens';
// Comma-separated allowlist; "*" disables the origin check.
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'https://nurrrrx.github.io,http://localhost:5173,http://localhost:4173').split(',').map((s) => s.trim());
const SCHEMA = process.env.PG_SCHEMA || 'studio_plus';

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Reference Postgres.DATABASE_URL in the Railway service variables.');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET not set — using a random value (tokens will be invalidated on every restart).');
}

// Railway internal connections don't need SSL; the public proxy URL does.
// Detect the public host so the same code works locally with the public URL.
const needsSsl = /proxy\.rlwy\.net|\.railway\.app/.test(DATABASE_URL) && !/sslmode=/.test(DATABASE_URL);
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

// Bootstrap schema + table on startup. Idempotent.
await pool.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS ${SCHEMA}.projects (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    location   TEXT NOT NULL DEFAULT '',
    settings   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);
await pool.query(`
  CREATE OR REPLACE FUNCTION ${SCHEMA}.touch_updated_at() RETURNS TRIGGER AS $$
  BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
  $$ LANGUAGE plpgsql
`);
await pool.query(`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = '${SCHEMA}_projects_touch_updated_at'
    ) THEN
      CREATE TRIGGER ${SCHEMA}_projects_touch_updated_at
      BEFORE UPDATE ON ${SCHEMA}.projects
      FOR EACH ROW EXECUTE FUNCTION ${SCHEMA}.touch_updated_at();
    END IF;
  END $$
`);
console.log(`Postgres ready (schema: ${SCHEMA})`);

const app = express();
app.use(express.json({ limit: '4mb' }));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error(`Origin ${origin} not allowed`));
  },
}));

// --- Auth ----------------------------------------------------------------
const safeEq = (a, b) => {
  const ab = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
};

app.post('/api/auth', (req, res) => {
  const { username, password } = req.body || {};
  if (!safeEq(username, AUTH_USERNAME) || !safeEq(password, AUTH_PASSWORD)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = jwt.sign({ sub: username }, JWT_SECRET, { expiresIn: '30d' });
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  res.json({ token, expiresAt });
});

const requireAuth = (req, res, next) => {
  const h = req.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
};

const rowToProject = (r) => r && ({
  id: r.id, name: r.name, location: r.location,
  settings: r.settings || {}, updatedAt: r.updated_at,
});

// --- Routes --------------------------------------------------------------
app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.get('/api/projects', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, location, updated_at FROM ${SCHEMA}.projects ORDER BY updated_at DESC`,
    );
    res.json(rows.map((r) => ({ id: r.id, name: r.name, location: r.location, updatedAt: r.updated_at })));
  } catch (e) { next(e); }
});

app.get('/api/projects/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, location, settings, updated_at FROM ${SCHEMA}.projects WHERE id = $1`,
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(rowToProject(rows[0]));
  } catch (e) { next(e); }
});

app.post('/api/projects', requireAuth, async (req, res, next) => {
  try {
    const { id, name, location, settings } = req.body || {};
    if (!id || !name) return res.status(400).json({ error: 'id and name are required' });
    const { rows } = await pool.query(
      `INSERT INTO ${SCHEMA}.projects (id, name, location, settings)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (id) DO NOTHING
       RETURNING id, name, location, settings, updated_at`,
      [id, name, location || '', JSON.stringify(settings || {})],
    );
    if (!rows[0]) return res.status(409).json({ error: 'project already exists' });
    res.status(201).json(rowToProject(rows[0]));
  } catch (e) { next(e); }
});

app.put('/api/projects/:id', requireAuth, async (req, res, next) => {
  try {
    const { settings, name, location } = req.body || {};
    // Upsert: insert with defaults if missing, otherwise update only provided fields.
    const { rows } = await pool.query(
      `INSERT INTO ${SCHEMA}.projects (id, name, location, settings)
       VALUES ($1, COALESCE($2, $1), COALESCE($3, ''), COALESCE($4::jsonb, '{}'::jsonb))
       ON CONFLICT (id) DO UPDATE SET
         settings = COALESCE(EXCLUDED.settings, ${SCHEMA}.projects.settings),
         name     = COALESCE($2, ${SCHEMA}.projects.name),
         location = COALESCE($3, ${SCHEMA}.projects.location)
       RETURNING id, name, location, settings, updated_at`,
      [
        req.params.id,
        name ?? null,
        location ?? null,
        settings !== undefined ? JSON.stringify(settings) : null,
      ],
    );
    res.json(rowToProject(rows[0]));
  } catch (e) { next(e); }
});

app.delete('/api/projects/:id', requireAuth, async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM ${SCHEMA}.projects WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'internal error' });
});

app.listen(PORT, () => console.log(`studio+ server on :${PORT}`));
