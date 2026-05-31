# studio-server

Express + Postgres backend for **studio+**. Stores per-project settings
(view state, prop layers, polygons, colours, title, etc.) so the sibling
[studio-client](../studio-client) can persist edits across browsers.

- **Repo**: https://github.com/nurrrrx/studio-plus (this folder is `studio-server/`)
- **Host**: Railway, project `studio+` (project ID
  `a115a5f1-e002-4a8b-a574-b66700d52f4c`), service `studio-plus-server`
- **Database**: the existing Railway Postgres in the same project, under a
  dedicated `studio_plus` schema (separate from `pitstop-crew`'s tables)
- **Public URL**: https://studio-plus-server-production.up.railway.app
- **Auto-deploy**: enabled — any push to `main` that touches
  `studio-server/**` triggers a new Railway build (Watch Paths filter).
  The same URL is wired into the GitHub Actions repo variable
  `VITE_API_URL` so the client knows where to call.

## Endpoints

| Method | Path                    | Auth        | Notes                                                                 |
|--------|-------------------------|-------------|-----------------------------------------------------------------------|
| GET    | `/healthz`              | public      | liveness probe                                                        |
| GET    | `/version`              | public      | `{ name, version }` from `package.json` — handy for confirming a deploy rolled forward |
| POST   | `/api/auth`             | public      | body `{ username, password }` → `{ token, expiresAt }` (JWT, 30 days) |
| GET    | `/api/projects`         | public      | list `{ id, name, location, updatedAt }`                              |
| GET    | `/api/projects/:id`     | public      | full project doc; `settings` is the legacy blob shape                 |
| POST   | `/api/projects`         | bearer JWT  | body `{ id, name, location?, settings? }`; 409 if id exists           |
| PUT    | `/api/projects/:id`     | bearer JWT  | upsert; body `{ settings?, name?, location? }` — used both for live setting saves and for renames from the home grid |
| DELETE | `/api/projects/:id`     | bearer JWT  | remove                                                                |

CORS allows `https://nurrrrx.github.io` plus the Vite dev/preview origins
by default (override via `CORS_ORIGINS`).

This API is the **sole source of truth** for the client's projects grid.
Anything the user does in the UI (create, rename, change view, place
props, delete) ends up here before the UI commits — there is no
client-only state of record.

## Required env vars

| Variable          | Purpose                                                            | How it's set on Railway              |
|-------------------|--------------------------------------------------------------------|--------------------------------------|
| `DATABASE_URL`    | Postgres connection string                                          | reference `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET`      | HMAC secret for tokens. Random per-deploy if unset (don't do that). | set to a long random hex string      |
| `AUTH_USERNAME`   | The single shared write account (default `kitty`)                   | set explicitly                       |
| `AUTH_PASSWORD`   | Password for that account (default `stevens`)                       | set explicitly                       |
| `PG_SCHEMA`       | Postgres schema name (default `studio_plus`)                         | optional                             |
| `CORS_ORIGINS`    | Comma-separated allowlist; `*` disables the check                    | optional                             |
| `PORT`            | Auto-injected by Railway                                             | leave unset                          |

A `.env.example` in this folder lists the same. **Don't commit `.env`** — it's
gitignored.

## Database schema

Created idempotently at boot (see `server.js`):

```sql
CREATE SCHEMA IF NOT EXISTS studio_plus;
CREATE TABLE IF NOT EXISTS studio_plus.projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  location   TEXT NOT NULL DEFAULT '',
  settings   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- plus a touch_updated_at trigger
```

The `settings` JSONB column holds the full legacy `settings.json` shape
(`massing`, `orbit`, `app`, prop layers, etc.) verbatim — the client
treats it as an opaque blob.

## Develop locally

```bash
cd studio-server
npm install
cp .env.example .env             # then fill in DATABASE_URL + JWT_SECRET
npm run dev                      # http://localhost:3000
```

For local Postgres, either run one with Docker or point `DATABASE_URL` at
Railway's public Postgres URL (with `sslmode=require` appended). The
schema is auto-created on boot.

## Deploy (Railway)

Deploys are **automatic**. The `studio-plus-server` service is wired to
this GitHub repo with:

- **Source repo**: `nurrrrx/studio-plus`
- **Branch**: `main`
- **Root Directory**: `studio-server`
- **Watch Paths**: `studio-server/**` (client-only pushes don't rebuild)

Push anything inside `studio-server/` and Railway picks it up, builds via
Nixpacks (`npm install && npm start`), and rolls forward. Confirm a
deploy actually shipped with:

```bash
curl https://studio-plus-server-production.up.railway.app/version
```

### Manual deploy (fallback)

If GitHub auto-deploy is disabled or you want to push uncommitted local
changes, use the CLI:

```bash
cd studio-server
railway link -p a115a5f1-e002-4a8b-a574-b66700d52f4c
railway service studio-plus-server
railway up
```

### Bumping the version

`/version` reads `package.json`. Bumping the `version` field there and
pushing is the easy way to prove an auto-deploy ran end-to-end.

## Related

- Client: [../studio-client](../studio-client)
- Root layout / shared docs: [../README.md](../README.md)
