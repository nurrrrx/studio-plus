# studio+

An axonometric / 3D massing study of Al Zeina (Abu Dhabi), built with React + Vite,
Deck.gl and Three.js. Buildings and roads are hand-traced ground truth shipped as
GeoJSON; the app renders them in a 2D plan view and an orbital 3D view.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
```

The dev server exposes `/api/settings` (GET/POST) that reads and writes
`settings.json` at the project root — that's how view tweaks (zoom, rotation,
title, layer toggles) are persisted between sessions while developing.

## Build

```bash
npm run build    # outputs dist/
npm run preview  # serves dist/ locally
```

## Deployment

The site auto-deploys to GitHub Pages from `main` via
`.github/workflows/deploy.yml`. The workflow builds with
`VITE_BASE=/<repo-name>/` so asset URLs resolve under the project Pages path.
There is no `/api/settings` server in production — `src/main.jsx` intercepts
those calls and serves the static `public/settings.json` snapshot instead, so
the published site loads with the saved view but ignores further edits.
