# studio+

An axonometric / 3D massing study of **Al Zeina** (Abu Dhabi), built with
React + Vite, deck.gl, and Three.js. Buildings and roads are hand-traced
ground truth shipped as GeoJSON; the app renders them in a 2D plan view
and an orbital 3D view, with per-project persistence on a small Express +
Postgres backend.

## Layout

```
studio-plus/
├── studio-client/      React + Vite SPA (GitHub Pages)
└── studio-server/      Express + Postgres API (Railway)
```

Each folder has its own README with full details:

- [studio-client/](studio-client/README.md) — frontend, deploys to
  https://nurrrrx.github.io/studio-plus/
- [studio-server/](studio-server/README.md) — backend, deploys to
  https://studio-plus-server-production.up.railway.app (Railway project
  `studio+`, service `studio-plus-server`, sharing the existing Postgres
  under a `studio_plus` schema)

Both halves **auto-deploy on push to `main`** — GH Actions for the
client, Railway's GitHub integration (with a `studio-server/**` watch
filter) for the server.

## How the two halves connect

```
                    GitHub Actions (.github/workflows/deploy.yml)
                          builds studio-client → GH Pages
                                          │
                                          ▼
                          https://nurrrrx.github.io/studio-plus/
                                          │
                          fetch /api/auth, /api/projects/*
                                          ▼
              https://<studio-plus-server>.up.railway.app   (Express)
                                          │
                                          ▼
                Railway Postgres → schema studio_plus.projects (JSONB)
```

- **Reads are public** (anyone can view the published site and load any
  project's saved view).
- **Writes require auth**: the splash on every load offers username /
  password. Default creds (overridable via env): `kitty` / `stevens`.
  After a successful sign-in the splash auto-dismisses in 3s. A
  **Sign out** button in the top header is available afterwards.
- **Guest mode** is allowed — the app stays usable, just can't persist.
- **Postgres is the source of truth.** The projects grid lists exactly
  what the server returns; create / rename / delete all `PUT`/`POST`/
  `DELETE` against the API so every change lands in
  `studio_plus.projects` in Postgres before the UI commits. The delete
  flow goes through a confirmation modal, not `window.confirm`.

## Common tasks

```bash
# Ship anything → just push. GH Actions builds the client; Railway
# rebuilds the server iff the push touched studio-server/**.
git push origin main

# Confirm the server actually rolled forward (bump version first):
curl https://studio-plus-server-production.up.railway.app/version

# Force a manual server deploy (uncommitted local code or auto-deploy
# disabled):
cd studio-server && railway up

# Run both locally
cd studio-client && npm run dev          # http://localhost:5173
cd studio-server && npm run dev          # http://localhost:3000
# In studio-client/.env.local: VITE_API_URL=http://localhost:3000
```

## Constraints worth knowing

- **Don't regenerate the GeoJSON from OSM** — files in
  `studio-client/public/data/` are hand-corrected ground truth.
- **Per-feature metadata lives in GeoJSON properties**, not in side-config
  files.
- A previous experiment that rebuilt roads via medial-axis cleanup was
  rejected as worse than the originals; don't retry.

## Credits

Developed by APSR.
