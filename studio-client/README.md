# studio-client

Static React + Vite single-page app for the **studio+** axonometric / 3D
massing study of Al Zeina (Abu Dhabi). Deployed to GitHub Pages.

- **Repo**: https://github.com/nurrrrx/studio-plus (this folder is `studio-client/`)
- **Live URL**: https://nurrrrx.github.io/studio-plus/
- **Deploy**: auto, via [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) on push to `main`
- **Backend**: the sibling [studio-server](../studio-server) hosted on Railway

## What's in here

- `src/App.jsx` — top-level shell: splash gate, header/footer, tab switching, current-project state
- `src/views/` — the 2D plan view, the 3D massing view (deck.gl orbit), the projects home page, and the splash/login `Loader.jsx`
- `src/geo.js` — loads the hand-traced GeoJSON for buildings and roads from `public/data/`
- `src/api.js` — thin fetch wrapper around the studio-server endpoints (auth, projects CRUD); JWT lives in `localStorage`
- `src/main.jsx` — installs a production-only fetch interceptor that rewrites legacy `/api/settings` calls to `studio-server`'s `/api/projects/:id` so the dev codebase keeps working unchanged
- `vite.config.js` — also exposes a dev-only `/api/settings` middleware that reads/writes `./settings.json` so local dev needs no backend running
- `public/data/` — the Al Zeina GeoJSON; this is **hand-traced ground truth**, never regenerate from OSM
- `public/settings.json` — fallback snapshot served when the static site can't reach the backend
- `settings.json` — local dev seed for the same shape; written to by the dev middleware

## Develop locally

```bash
cd studio-client
npm install
npm run dev          # http://localhost:5173
```

The dev server's `/api/settings` middleware (GET/POST) persists changes to
`./settings.json` so you can iterate without running the backend. To test
against the real backend instead, create `.env.local` with:

```
VITE_API_URL=http://localhost:3000          # or the Railway public URL
```

## Build

```bash
npm run build        # outputs dist/
npm run preview      # serves dist/ locally
```

The GitHub Actions workflow builds with `VITE_BASE=/studio-plus/` so asset
URLs resolve under the project Pages path, and `VITE_API_URL` from the repo
variable `VITE_API_URL` (set in Settings → Secrets and variables → Actions
→ Variables).

## Auth model

- Splash on every load shows a username/password gate (current creds:
  `kitty` / `stevens`, configurable server-side via env vars).
- Successful sign-in (or a still-valid token from a previous visit)
  auto-dismisses the splash after 3s — no extra "Enter" click. Reads
  are public; writes attach `Authorization: Bearer <jwt>` from
  `localStorage` (30-day expiry).
- "Continue as guest" skips auth → site is read-only. Anything the user
  tries to change is silently dropped (writes 401, nothing persists).
- A **Sign out** button lives in the top header when authenticated. It
  clears the token and re-shows the splash so the user can sign in
  again or stay as guest.

## Projects home

- The project grid is **server-authoritative**: it lists exactly what
  `GET /api/projects` returns from Postgres. Anything not in the
  database doesn't appear. Local dev (no `VITE_API_URL`) falls back to
  the legacy single-project default so you can iterate offline.
- **Create**: the "+ New project" cube prompts for a name, slugifies it
  into an ID, and `POST`s to the server (requires auth). 409 means the
  slug exists — the grid refreshes from the server.
- **Rename**: double-click a cube → prompt → `PUT /api/projects/:id`
  with the new `name`. Local UI updates optimistically and rolls back
  if the server rejects.
- **Delete**: hover any cube (except the currently open project) → ✕ →
  confirmation modal → `DELETE /api/projects/:id`. Optimistic remove
  with rollback on failure.

## Data model

- One row per project in Postgres (`studio_plus.projects`), identified
  by a string ID like `alzeina`.
- The full client view (camera, layers, prop placements, colours,
  polygons, title, header-pin state, etc.) is stored as a single JSONB
  `settings` blob — same shape as the legacy `settings.json`.
- The client tracks the currently opened project on
  `window.__studioPlusProject`; the fetch interceptor in
  [src/main.jsx](src/main.jsx) uses that to scope legacy `/api/settings`
  calls to the right project document so the rest of the codebase
  doesn't need to know the backend exists.

## Constraints worth knowing

- **Don't regenerate the GeoJSON from OSM** — the files in `public/data/`
  are hand-corrected ground truth. (See repo-level memory notes.)
- **Per-feature metadata (floors, etc.) lives in GeoJSON properties**, not
  in side-config files.
- A previous experiment that rebuilt roads via medial-axis cleanup was
  rejected as worse than the originals; don't retry.

## Related

- Backend: [../studio-server](../studio-server)
- Root layout / shared docs: [../README.md](../README.md)
