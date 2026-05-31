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
  `kitty` / `stevens`, hardcoded server-side via env vars).
- Sign-in stores a 30-day JWT in `localStorage`. All writes attach
  `Authorization: Bearer <jwt>`.
- "Continue as guest" skips auth → site is read-only.
- Reads are always public; only writes need a token.

## Data model

- One blob per project, identified by a string ID like `alzeina`.
- The blob is the same shape as the legacy `settings.json` (`massing`,
  `orbit`, `app`, plus the prop layers / colours / polygons).
- The client tracks the currently opened project on
  `window.__studioPlusProject`; the fetch interceptor uses that to scope
  `/api/settings` calls to the right project document.

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
