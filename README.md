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
- [studio-server/](studio-server/README.md) — backend, deploys to Railway
  project `studio+` (service `studio-plus-server`), sharing the existing
  Postgres under a `studio_plus` schema

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
- **Guest mode** is allowed — the app stays usable, just can't persist.

## Common tasks

```bash
# Push new client code → auto-deploys to GH Pages
git push origin main

# Re-deploy the server after editing studio-server/
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
