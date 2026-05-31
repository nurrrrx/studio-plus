// Load the hand-traced Al Zeina GeoJSON (buildings + road surfaces + AOI) and
// project lon/lat to local metres (east, north) about the data centroid, so all
// views share one coordinate frame.

export const CENTER = [54.614098, 24.455954]; // Al Zeina centroid [lon, lat]

// fetch the first URL that exists (prefers a hand-corrected file)
async function fetchFirst(urls) {
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (r.ok) return await r.json();
    } catch { /* try next */ }
  }
  throw new Error('no geojson found: ' + urls.join(', '));
}

// pull every polygon ring out of a feature (handles Polygon + MultiPolygon)
function ringsOf(feature) {
  const g = feature.geometry;
  if (!g) return [];
  return g.type === 'MultiPolygon' ? g.coordinates.flat() : g.coordinates;
}

const ringCentroid = (ring) => {
  let x = 0, y = 0;
  for (const [px, py] of ring) { x += px; y += py; }
  return [x / ring.length, y / ring.length];
};

// ray-casting point-in-ring test
function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > pt[1]) !== (yj > pt[1])) &&
        (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// Split a feature collection into solids and `name:cutout` features, then merge
// each cutout into the solid it sits inside as an extra (hole) ring. With an
// even-odd fill rule the merged ring renders as a void. Generic — used for both
// buildings and road surfaces.
function applyCutouts(features) {
  const solids = features
    .filter((f) => (f.properties?.name || '') !== 'cutout')
    .map((f) => ({ props: f.properties || {}, rings: ringsOf(f).map((r) => r.slice()) }));
  const cutouts = features.filter((f) => (f.properties?.name || '') === 'cutout');

  for (const c of cutouts) {
    for (const cring of ringsOf(c)) {
      const cen = ringCentroid(cring);
      let host = solids.find((s) => s.rings.some((r) => inRing(cen, r)));
      if (!host && solids.length) { // fallback: nearest solid by outer-ring centroid
        let best = Infinity;
        for (const s of solids) {
          const sc = ringCentroid(s.rings[0]);
          const d = (sc[0] - cen[0]) ** 2 + (sc[1] - cen[1]) ** 2;
          if (d < best) { best = d; host = s; }
        }
      }
      if (host) host.rings.push(cring);
    }
  }
  return solids;
}

// floor -> height assumptions (metres). number_of_floors lives on each building
// feature in the GeoJSON (the single source of truth); the large ground floor is
// flagged separately because it is taller than a typical floor.
export const FLOOR_H = 3.2;   // typical residential floor-to-floor
export const GROUND_H = 5.0;  // 'large ground floor' podium
const DEFAULT_H = 9.6;        // fallback for buildings with no floor data yet

// height in metres from a building feature's properties (null if unspecified)
function heightFromProps(props) {
  const f = Math.max(props.number_of_floors || 0, props.number_of_floors_2 || 0);
  if (!f) return null;
  return f * FLOOR_H + (props.large_ground_floor ? GROUND_H : 0);
}

// Resolve a data path against Vite's BASE_URL so the same code works
// from any route (/studio-plus/, /studio-plus/v2/, /studio-plus/v2/alzeina/,
// etc.). Without this, the fetches resolve relative to the current URL
// and hit 404 from any sub-route, leaving the canvas stuck on 'Loading…'.
const D = (p) => `${import.meta.env.BASE_URL || '/'}${p}`;

export async function loadGeo() {
  const [b, r, a] = await Promise.all([
    fetchFirst([D('data/alzeina-buildings.geojson'), D('data/buildings_edited.geojson'), D('data/buildings.geojson')]),
    fetchFirst([D('data/alzeina-roads.geojson'), D('data/streets_edited.geojson'), D('data/streets.geojson')]),
    fetchFirst([D('data/al_zeina_aoi.geojson')]).catch(() => null),
  ]);

  // reference = mean of all building vertices
  let sx = 0, sy = 0, n = 0;
  for (const f of b.features)
    for (const ring of ringsOf(f))
      for (const [lon, lat] of ring) { sx += lon; sy += lat; n++; }
  const lon0 = sx / n, lat0 = sy / n;

  const mLat = 111320;
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const project = (lon, lat) => [(lon - lon0) * mLon, (lat - lat0) * mLat];
  const projRing = (ring) => ring.map(([lon, lat]) => project(lon, lat));

  const bSolids = applyCutouts(b.features);
  const buildings = bSolids.map((s, i) => {
    const rings = s.rings.map(projRing);
    const h = heightFromProps(s.props);
    return {
      i,
      kind: s.props.name || 'normal', // 'normal' | 'special'
      name: s.props.name || null,
      floors: s.props.number_of_floors ?? null,   // null = not specified yet
      floors2: s.props.number_of_floors_2 ?? null, // split-height secondary side
      largeGround: !!s.props.large_ground_floor,
      height: h ?? DEFAULT_H,
      knownHeight: h != null,
      ring: rings[0],
      rings,
      podiumRing: expandRingM(rings[0], PODIUM_M), // ground-floor footprint expanded by PODIUM_M
      podiumHeight: s.props.large_ground_floor ? GROUND_H : FLOOR_H, // full ground floor
    };
  });

  // road surfaces traced as filled polygons (with cutout holes merged in)
  const rSolids = applyCutouts(r.features);
  const roads = rSolids.map((s, i) => ({ i, rings: s.rings.map(projRing) }));

  // area of interest boundary (optional)
  const aoi = a ? a.features.flatMap((f) => ringsOf(f).map(projRing)) : [];

  // lon/lat GeoJSON for the Mapbox views (cutout holes merged; building number + floors + metric height)
  const buildingsLL = { type: 'FeatureCollection', features: bSolids.map((s, i) => ({
    type: 'Feature',
    properties: {
      num: i,
      floors: s.props.number_of_floors ?? null,
      height: heightFromProps(s.props) ?? DEFAULT_H,
      podiumHeight: s.props.large_ground_floor ? GROUND_H : FLOOR_H,
    },
    geometry: { type: 'Polygon', coordinates: s.rings },
  })) };
  const roadsLL = { type: 'FeatureCollection', features: rSolids.map((s) => ({
    type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: s.rings },
  })) };
  const aoiLL = a || { type: 'FeatureCollection', features: [] };

  // Podiums: lon/lat outer ring expanded outward by PODIUM_M metres (for Mapbox views).
  // Each podium is as tall as that building's full ground floor.
  const podiumsLL = { type: 'FeatureCollection', features: bSolids.map((s, i) => ({
    type: 'Feature',
    properties: { num: i, podiumHeight: s.props.large_ground_floor ? GROUND_H : FLOOR_H },
    geometry: { type: 'Polygon', coordinates: [expandRingLL(s.rings[0], PODIUM_M, mLon, mLat)] },
  })) };

  return { buildings, roads, aoi, buildingsLL, roadsLL, aoiLL, podiumsLL,
           lon0, lat0, mLon, mLat, center: [lon0, lat0] };
}

// ---- podium helpers (centroid expansion: simple but good for compact footprints) ----
const PODIUM_M = 2;
function expandRingM(ring, dist) {
  let cx = 0, cy = 0;
  for (const [x, y] of ring) { cx += x; cy += y; }
  cx /= ring.length; cy /= ring.length;
  return ring.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * dist, y + (dy / len) * dist];
  });
}
function expandRingLL(ring, metres, mLon, mLat) {
  let cx = 0, cy = 0;
  for (const [lo, la] of ring) { cx += lo; cy += la; }
  cx /= ring.length; cy /= ring.length;
  return ring.map(([lo, la]) => {
    const dx = (lo - cx) * mLon, dy = (la - cy) * mLat;
    const len = Math.hypot(dx, dy) || 1;
    return [lo + (dx / len) * metres / mLon, la + (dy / len) * metres / mLat];
  });
}

// A basemap clip shape (ring in lon/lat) around `center`, sized in metres.
export function shapeRing(center, shape, p, mLon, mLat) {
  const [lon, lat] = center;
  const X = (m) => lon + m / mLon, Y = (m) => lat + m / mLat;
  const ring = [];
  if (shape === 'circle' || shape === 'hexagon') {
    const r = p.radius, n = shape === 'circle' ? 72 : 6, off = shape === 'hexagon' ? Math.PI / 6 : 0;
    for (let i = 0; i <= n; i++) { const a = off + (i / n) * 2 * Math.PI; ring.push([X(r * Math.cos(a)), Y(r * Math.sin(a))]); }
  } else { // square / rectangle
    const hx = shape === 'square' ? p.half : p.halfX, hy = shape === 'square' ? p.half : p.halfY;
    ring.push([X(-hx), Y(-hy)], [X(hx), Y(-hy)], [X(hx), Y(hy)], [X(-hx), Y(hy)], [X(-hx), Y(-hy)]);
  }
  return ring;
}

// Build a Mapbox static-image basemap for an arbitrary metres bbox. `style` is
// one of Mapbox's standard styles (e.g. streets-v12, satellite-v9, light-v11).
export function basemapImage(geo, minX, minY, maxX, maxY, style = 'streets-v12') {
  const lonMin = geo.lon0 + minX / geo.mLon, lonMax = geo.lon0 + maxX / geo.mLon;
  const latMin = geo.lat0 + minY / geo.mLat, latMax = geo.lat0 + maxY / geo.mLat;
  const mercY = (lat) => (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const dx = lonMax - lonMin, dy = mercY(latMax) - mercY(latMin);
  let w = 1280, h = Math.round((1280 * dy) / dx);
  if (h > 1280) { h = 1280; w = Math.round((1280 * dx) / dy); }
  const url = `https://api.mapbox.com/styles/v1/mapbox/${style}/static/[${lonMin},${latMin},${lonMax},${latMax}]/${w}x${h}@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
  return { url, minX, minY, maxX, maxY };
}

// Clip-shape ring around origin in metres (for the orbit view's Cartesian frame).
export function shapeRingMeters(shape, p) {
  const ring = [];
  if (shape === 'circle' || shape === 'hexagon') {
    const r = p.radius, n = shape === 'circle' ? 72 : 6, off = shape === 'hexagon' ? Math.PI / 6 : 0;
    for (let i = 0; i <= n; i++) { const a = off + (i / n) * 2 * Math.PI; ring.push([r * Math.cos(a), r * Math.sin(a)]); }
  } else if (shape === 'square') {
    const h = p.half; ring.push([-h, -h], [h, -h], [h, h], [-h, h], [-h, -h]);
  } else if (shape === 'rectangle') {
    const hx = p.halfX, hy = p.halfY; ring.push([-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy], [-hx, -hy]);
  }
  return ring;
}

// Mask polygon: huge outer ring with the shape punched out (to clip the basemap).
export function maskFeature(center, shape, p, mLon, mLat) {
  const [lon, lat] = center, big = 0.25;
  const outer = [[lon - big, lat - big], [lon + big, lat - big], [lon + big, lat + big], [lon - big, lat + big], [lon - big, lat - big]];
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [outer, shapeRing(center, shape, p, mLon, mLat)] } };
}

// Mapbox public token. Read from VITE_MAPBOX_TOKEN at build time so the
// secret-scanner doesn't trip on every commit that touches this file.
// Set the value in GitHub Actions repo Variables (or in studio-client/
// .env.local for dev). When empty, basemap features just no-op.
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

// Build a Mapbox Static-Images basemap that exactly spans the site, and return
// its placement in the shared local-metre frame (so views can drop it behind
// the geometry). x/y are metres (east, north); the image top edge is north.
export function siteBasemap(geo, style = 'streets-v12') {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const acc = (pts) => { for (const [x, y] of pts) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } };
  for (const b of geo.buildings) for (const r of b.rings) acc(r);
  for (const rd of geo.roads) for (const r of rd.rings) acc(r);
  for (const r of geo.aoi) acc(r);
  const padX = (maxX - minX) * 0.04, padY = (maxY - minY) * 0.04;
  minX -= padX; maxX += padX; minY -= padY; maxY += padY;
  return basemapImage(geo, minX, minY, maxX, maxY, style);
}

// Building-height categories keyed by number_of_floors (the values the user gave).
// Ordered low -> high; colour ramps pale -> deep. Buildings with no floor data
// fall back to UNKNOWN_COLOR (grey) for review.
export const HEIGHT_CATEGORIES = [
  { floors: 1,  label: '1 floor (non-res)', color: '#f3ecd6' },
  { floors: 2,  label: '2 floors',        color: '#ffe3a3' },
  { floors: 4,  label: '4 fl + ground',   color: '#ffc46b' },
  { floors: 5,  label: '5 fl + ground',   color: '#ff9e4a' },
  { floors: 7,  label: '7 fl + ground',   color: '#f4683c' },
  { floors: 10, label: '10 fl + ground',  color: '#cf3b3b' },
  { floors: 12, label: '12 fl + ground',  color: '#8e2b50' },
];
export const UNKNOWN_COLOR = '#b9b3a4';
export const colorForFloors = (floors) =>
  HEIGHT_CATEGORIES.find((c) => c.floors === floors)?.color ?? UNKNOWN_COLOR;
