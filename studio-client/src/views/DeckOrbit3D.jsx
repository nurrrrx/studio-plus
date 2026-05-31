// Free-orbit 3D view using deck.gl's OrbitView. Buildings are extruded from
// the projected metre coords; rotation is around the model's centre. Camera is
// clamped above ground (no underground view). A static Mapbox basemap can be
// pinned to the ground, hidden while you're rotating and re-shown when idle.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { COORDINATE_SYSTEM, OrbitView, OrthographicView, LightingEffect, AmbientLight, DirectionalLight } from '@deck.gl/core';
import { PolygonLayer, PathLayer, BitmapLayer, TextLayer, IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import { colorForFloors, UNKNOWN_COLOR, siteBasemap, basemapImage, shapeRingMeters } from '../geo.js';

// Architectural-style prop silhouettes used by the IconLayer. Side-view so they
// read at any camera angle (billboard:true keeps them facing the viewer).
const PROP_SVGS = {
  tree: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 96"><g fill="rgba(255,255,255,0.85)" stroke="#1c1813" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="32" y1="55" x2="32" y2="90" /><path d="M32 8 C 12 8, 6 30, 14 44 C 6 50, 14 60, 28 58 C 30 64, 40 64, 42 58 C 56 60, 60 50, 50 44 C 58 30, 52 8, 32 8 Z" /></g></svg>`,
  canopy: '', // populated below by CANOPY_URLS[0]
  person: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 96"><g fill="white" stroke="#1c1813" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="14" r="8" /><line x1="16" y1="22" x2="16" y2="58" /><line x1="16" y1="34" x2="6" y2="48" /><line x1="16" y1="34" x2="26" y2="48" /><line x1="16" y1="58" x2="9" y2="92" /><line x1="16" y1="58" x2="23" y2="92" /></g></svg>`,
  lamp: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 96"><g fill="white" stroke="#1c1813" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="16" y1="22" x2="16" y2="94" /><circle cx="16" cy="14" r="9" fill="#ffe9a3" /><line x1="16" y1="5" x2="16" y2="2" /></g></svg>`,
  car: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 48"><g fill="white" stroke="#1c1813" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 36 Q8 18 26 18 L34 8 L62 8 L72 18 Q88 18 88 36 L88 40 L8 40 Z" /><circle cx="26" cy="40" r="6" fill="#1c1813" /><circle cx="70" cy="40" r="6" fill="#1c1813" /></g></svg>`,
  table: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 96"><g fill="white" stroke="#1c1813" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="40,4 4,40 76,40" fill="rgba(214,128,128,0.92)" /><line x1="40" y1="40" x2="40" y2="78" /><rect x="20" y="76" width="40" height="6" /><line x1="22" y1="82" x2="22" y2="94" /><line x1="58" y1="82" x2="58" y2="94" /></g></svg>`,
  burjeel: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 200"><g fill="white" stroke="#1c1813" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="188" width="72" height="9" stroke-width="1.2"/><rect x="18" y="80" width="44" height="108" stroke-width="1.6"/><line x1="18" y1="105" x2="62" y2="105" stroke-width="0.7"/><line x1="18" y1="130" x2="62" y2="130" stroke-width="0.7"/><line x1="18" y1="155" x2="62" y2="155" stroke-width="0.7"/><rect x="24" y="160" width="14" height="22" fill="rgba(0,0,0,0.04)" stroke-width="0.9"/><path d="M44 160 Q50 168 44 178 Q50 188 44 198" fill="none" stroke-width="0.8" stroke-dasharray="2 2"/><rect x="20" y="40" width="40" height="40" stroke-width="1.2" fill="rgba(0,0,0,0.03)"/><line x1="32" y1="40" x2="32" y2="80" stroke-width="0.6"/><line x1="48" y1="40" x2="48" y2="80" stroke-width="0.6"/><polygon points="40,8 18,40 62,40" stroke-width="1.6"/><line x1="18" y1="40" x2="40" y2="24" stroke-width="0.6" stroke-dasharray="2 2"/><line x1="62" y1="40" x2="40" y2="24" stroke-width="0.6" stroke-dasharray="2 2"/></g></svg>`,
  sail: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 96"><path d="M 12 92 Q 55 86 80 88 Q 100 90 108 92 L 12 92 Z" fill="rgba(0,0,0,0.07)"/><line x1="10" y1="20" x2="10" y2="92" stroke="#1c1813" stroke-width="2.4" stroke-linecap="round"/><line x1="82" y1="14" x2="82" y2="92" stroke="#1c1813" stroke-width="2.4" stroke-linecap="round"/><line x1="108" y1="54" x2="108" y2="92" stroke="#1c1813" stroke-width="2.4" stroke-linecap="round"/><path d="M 10 20 Q 46 26 82 14 Q 100 34 108 54 Q 58 48 10 20 Z" fill="rgba(245,245,242,0.92)" stroke="#1c1813" stroke-width="1.6" stroke-linejoin="round"/><path d="M 10 20 Q 55 40 108 54" fill="none" stroke="#1c1813" stroke-width="0.5" stroke-dasharray="2 2" opacity="0.55"/><path d="M 82 14 Q 60 30 26 25" fill="none" stroke="#1c1813" stroke-width="0.4" stroke-dasharray="2 2" opacity="0.45"/><line x1="2" y1="92" x2="118" y2="92" stroke="#1c1813" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  pergola: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 160"><g stroke="#1c1813" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="18" y1="60" x2="18" y2="152" stroke-width="3"/><line x1="98" y1="60" x2="98" y2="152" stroke-width="3"/><line x1="38" y1="40" x2="38" y2="132" stroke-width="3"/><line x1="118" y1="40" x2="118" y2="132" stroke-width="3"/><line x1="14" y1="60" x2="102" y2="60" stroke-width="3"/><line x1="34" y1="40" x2="122" y2="40" stroke-width="3"/><line x1="22" y1="58" x2="42" y2="38" stroke-width="2.2"/><line x1="34" y1="58" x2="54" y2="38" stroke-width="2.2"/><line x1="46" y1="58" x2="66" y2="38" stroke-width="2.2"/><line x1="58" y1="58" x2="78" y2="38" stroke-width="2.2"/><line x1="70" y1="58" x2="90" y2="38" stroke-width="2.2"/><line x1="82" y1="58" x2="102" y2="38" stroke-width="2.2"/><line x1="94" y1="58" x2="114" y2="38" stroke-width="2.2"/><path d="M 18 60 Q 26 70 38 65"/><path d="M 98 60 Q 106 70 118 65"/><path d="M 38 65 L 38 40" stroke-width="0.6" stroke-dasharray="2 2" opacity="0.55"/><path d="M 118 65 L 118 40" stroke-width="0.6" stroke-dasharray="2 2" opacity="0.55"/><line x1="6" y1="155" x2="128" y2="138" stroke-width="1.2"/></g></svg>`,
  tile: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="1.5" y="1.5" width="97" height="97" fill="rgba(245,240,230,0.92)" stroke="#1c1813" stroke-width="1.6" stroke-linejoin="round"/><g fill="none" stroke="#1c1813" stroke-width="1.1" stroke-linejoin="round"><polygon points="22,16 28,13 32,18 27,24 18,21"/><polygon points="44,20 50,17 53,23 47,26 42,24"/><polygon points="68,16 74,14 77,21 71,25 65,22"/><polygon points="18,40 25,37 29,42 25,48 16,45"/><polygon points="45,42 52,40 55,45 50,50 43,47"/><polygon points="72,46 79,43 82,49 76,53 70,50"/><polygon points="14,62 21,60 24,66 19,70 12,67"/><polygon points="40,64 46,62 50,68 44,72 38,68"/><polygon points="68,68 75,66 79,72 73,76 66,72"/><polygon points="26,82 33,80 36,86 30,88 24,85"/><polygon points="55,84 62,82 65,88 59,90 52,87"/></g></svg>`,
  bikelane: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 24"><rect x="4" y="8" width="40" height="8" fill="rgba(217,38,38,0.25)" stroke="#d92626" stroke-width="1.2"/><g stroke="rgba(255,255,255,0.95)" stroke-width="2" stroke-linecap="round"><line x1="8" y1="12" x2="14" y2="12"/><line x1="20" y1="12" x2="26" y2="12"/><line x1="32" y1="12" x2="38" y2="12"/></g></svg>`,
  beach: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 24"><path d="M2 16 Q12 8 22 14 Q34 20 46 12 L46 22 L2 22 Z" fill="rgba(240,216,160,0.85)" stroke="#b08c50" stroke-width="1.2"/><g fill="#b08c50" opacity="0.7"><circle cx="10" cy="18" r="0.8"/><circle cx="18" cy="20" r="0.8"/><circle cx="26" cy="17" r="0.8"/><circle cx="34" cy="19" r="0.8"/><circle cx="40" cy="18" r="0.8"/></g></svg>`,
  sea: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 24"><rect x="2" y="6" width="44" height="14" fill="rgba(76,156,200,0.7)" stroke="#2f6a8a" stroke-width="1.2"/><g fill="none" stroke="#fff" stroke-width="0.9" opacity="0.85" stroke-linecap="round"><path d="M6 11 Q10 9 14 11 Q18 13 22 11 Q26 9 30 11"/><path d="M16 16 Q20 14 24 16 Q28 18 32 16 Q36 14 40 16"/></g></svg>`,
  label: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 24"><text x="24" y="18" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="18" font-weight="700" fill="#1c1813">Aa</text></svg>`,
};
// Canopy tree shape variants. Each entry is a polygon-points string drawn on a
// wide 110×96 viewBox (the bush spreads further than the default canopy). When
// the user places a canopy, one of these is picked at random and stored on the
// prop so it keeps its shape across re-renders.
const CANOPY_POLYGONS = [
  // round/full
  '6,42 2,32 6,22 16,14 28,8 42,4 54,4 66,4 78,6 88,12 96,20 104,30 106,40 102,48 94,54 84,58 74,60 64,58 56,62 48,60 40,62 32,58 24,60 16,54 10,48',
  // lobed cloud
  '4,40 2,32 8,22 14,18 22,12 30,8 38,12 48,4 58,8 68,4 76,10 84,8 94,16 102,22 106,32 104,42 96,50 88,54 78,58 70,54 60,62 52,60 44,62 34,58 26,60 18,56 10,52 6,46',
  // wide asymmetric
  '8,42 4,32 10,22 18,12 30,6 42,3 54,4 66,2 78,5 88,8 98,14 106,24 104,36 100,46 92,52 82,56 72,60 62,58 52,60 42,62 32,58 22,54 14,50',
  // bumpier with sharper concavities
  '6,40 2,30 6,20 14,14 22,10 28,16 36,6 44,10 52,4 60,10 68,6 76,12 84,8 92,16 100,22 106,32 102,42 96,50 86,54 76,56 68,52 60,58 52,60 44,56 36,58 28,54 20,56 12,50 6,46',
];
const CANOPY_VIEWBOX = '0 0 110 96';
const canopyDetailsSvg =
  '<path d="M 30 30 Q 34 40 30 48" fill="none" stroke="#1c1813" stroke-width="1.2"/>' +
  '<path d="M 55 22 Q 57 38 55 50" fill="none" stroke="#1c1813" stroke-width="1.2"/>' +
  '<path d="M 80 28 Q 76 42 80 50" fill="none" stroke="#1c1813" stroke-width="1.2"/>' +
  '<g stroke="#1c1813" stroke-width="0.7" opacity="0.55">' +
    '<line x1="22" y1="40" x2="30" y2="50"/><line x1="24" y1="36" x2="32" y2="46"/><line x1="26" y1="32" x2="34" y2="42"/>' +
    '<line x1="68" y1="40" x2="76" y2="50"/><line x1="70" y1="36" x2="78" y2="46"/><line x1="72" y1="32" x2="80" y2="42"/>' +
  '</g>' +
  '<g stroke="#1c1813" stroke-width="2" stroke-linecap="round">' +
    '<line x1="52" y1="58" x2="52" y2="90"/><line x1="58" y1="58" x2="58" y2="90"/>' +
    '<line x1="52" y1="74" x2="48" y2="68"/><line x1="58" y1="74" x2="62" y2="68"/>' +
  '</g>' +
  '<line x1="28" y1="92" x2="82" y2="92" stroke="#1c1813" stroke-width="1.3"/>' +
  '<g stroke="#1c1813" stroke-width="0.9" stroke-linecap="round" fill="none">' +
    '<path d="M34 91 L34 86"/><path d="M38 91 L38 84"/><path d="M42 91 L42 87"/>' +
    '<path d="M70 91 L70 84"/><path d="M74 91 L74 87"/><path d="M78 91 L78 85"/>' +
  '</g>';
const makeCanopySvg = (poly) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CANOPY_VIEWBOX}">` +
    `<polygon points="${poly}" fill="rgba(255,255,255,0.92)" stroke="#1c1813" stroke-width="1.8" stroke-linejoin="round"/>` +
    canopyDetailsSvg +
  '</svg>';
const CANOPY_SVGS = CANOPY_POLYGONS.map(makeCanopySvg);
// Some browsers (latest Chrome / Safari) refuse to decode SVG <img> sources
// that lack explicit pixel dimensions, even if they have a viewBox. The
// failure shows up as `createImageBitmap` rejecting with 'image element
// contains an SVG image without natural dimensions' the first time deck.gl
// tries to atlas the IconLayer, after which deck.gl retries every frame
// and floods the console with NaN-attribute warnings. Inject width/height
// from the viewBox before we encode the data URL.
const withNaturalDims = (svg) => {
  if (typeof svg !== 'string') return svg;
  if (/<svg[^>]*\swidth=/.test(svg) && /<svg[^>]*\sheight=/.test(svg)) return svg;
  const m = svg.match(/viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/);
  if (!m) return svg;
  return svg.replace(/<svg(\b[^>]*)>/, `<svg$1 width="${m[1]}" height="${m[2]}">`);
};
const CANOPY_URLS = CANOPY_SVGS.map((s) => `data:image/svg+xml;base64,${typeof btoa === 'function' ? btoa(withNaturalDims(s)) : ''}`);
PROP_SVGS.canopy = CANOPY_SVGS[0]; // for any downstream uses
const PROP_URLS = Object.fromEntries(
  Object.entries(PROP_SVGS).map(([k, v]) => [k, `data:image/svg+xml;base64,${typeof btoa === 'function' ? btoa(withNaturalDims(v)) : ''}`])
);
PROP_URLS.canopy = CANOPY_URLS[0]; // default canopy = variant 0 (palette button)

// Bake a tint colour into an SVG string by replacing any white / translucent-
// white fill with the picked colour. Used when the user picks a per-type tint
// for a prop — IconLayer.getColor only applies to mask-mode icons, so for our
// detailed line-drawing icons we regenerate the SVG instead.
const tintSvg = (svg, color) =>
  svg
    .replace(/fill="rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*[0-9.]+\s*\)"/g, `fill="${color}"`)
    .replace(/fill="white"/gi, `fill="${color}"`)
    .replace(/fill="#ffffff"/gi, `fill="${color}"`)
    .replace(/fill="#fff"/gi, `fill="${color}"`);
const svgToUrl = (svg) => `data:image/svg+xml;base64,${typeof btoa === 'function' ? btoa(withNaturalDims(svg)) : ''}`;
const PROP_META = {
  tree:   { label: 'Tree',         icon: PROP_URLS.tree,   w: 64, h: 96, anchorY: 96, size: 8, defaultColor: '#38571a' },
  // Wider canopy variants drawn on a 110×96 viewBox. Anchor at the trunk's
  // grass line so the canopy plants on the surface where the cursor clicked.
  canopy: { label: 'Canopy tree',  icon: PROP_URLS.canopy, w: 110, h: 96, anchorY: 92, size: 13, defaultColor: '#38571a' },
  person: { label: 'Person',       icon: PROP_URLS.person, w: 32, h: 96, anchorY: 96, size: 2.6 },
  lamp:   { label: 'Lamp post',    icon: PROP_URLS.lamp,   w: 32, h: 96, anchorY: 96, size: 6 },
  car:    { label: 'Car',          icon: PROP_URLS.car,    w: 96, h: 48, anchorY: 48, size: 5 },
  table:  { label: 'Table + umbrella', icon: PROP_URLS.table, w: 80, h: 96, anchorY: 96, size: 4.5 },
  burjeel:{ label: 'Burjeel tower',    icon: PROP_URLS.burjeel, w: 80, h: 200, anchorY: 196, size: 45 },
  sail:   { label: 'Shade sail',       icon: PROP_URLS.sail, w: 120, h: 96, anchorY: 92, size: 10 },
  pergola:{ label: 'Pergola',          icon: PROP_URLS.pergola, w: 140, h: 160, anchorY: 154, size: 16 },
  // flat: true → render lying on the ground, not billboarded toward the camera.
  // anchor placed at the icon centre so the tile centres on the cursor.
  tile:   { label: 'Floor tile',       icon: PROP_URLS.tile, w: 100, h: 100, anchorY: 50, size: 10, flat: true },
  // Path-type prop. The user clicks to drop waypoints; the lane is a polyline
  // between them. size = line width (m). defaultColor = red.
  bikelane:{ label: 'Bicycle lane',     icon: PROP_URLS.bikelane, w: 48, h: 24, anchorY: 12, size: 4, path: true, defaultColor: '#d92626' },
  // Polygon-type props. The user draws a polygon (click to add vertices,
  // Enter to close). On render the polygon is corner-smoothed with Chaikin
  // so it reads as a natural sandy / sea coastline.
  beach:   { label: 'Beach (sand)',     icon: PROP_URLS.beach, w: 48, h: 24, anchorY: 12, polygon: true, defaultColor: '#f0d8a0' },
  sea:     { label: 'Sea (water)',      icon: PROP_URLS.sea,   w: 48, h: 24, anchorY: 12, polygon: true, defaultColor: '#4c9cc8' },
  // Text-type prop. Renders as 3D TextLayer (always faces camera). Click to
  // place, prompt for text. Per-instance text + fontSize + colour editable
  // via the Selected-prop panel.
  label:   { label: 'Label (3D word)',  icon: PROP_URLS.label, w: 48, h: 24, anchorY: 12, text: true, defaultColor: '#1a1a1a', size: 4 },
};

// Top-down mini-bike pictogram used as a marker along the bike lane. Drawn in
// white so it pops on top of the red lane fill.
const BIKE_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 16">
  <g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="9" cy="8" r="4" stroke-width="1.4"/>
    <circle cx="31" cy="8" r="4" stroke-width="1.4"/>
    <line x1="9" y1="8" x2="31" y2="8" stroke-width="1.4"/>
    <line x1="20" y1="4" x2="20" y2="12" stroke-width="1.3"/>
    <line x1="31" y1="2" x2="31" y2="14" stroke-width="1.6"/>
    <line x1="5" y1="8" x2="13" y2="8" stroke-width="0.7"/>
    <line x1="9" y1="4" x2="9" y2="12" stroke-width="0.7"/>
    <line x1="27" y1="8" x2="35" y2="8" stroke-width="0.7"/>
  </g>
</svg>`;
const BIKE_MARKER_URL = `data:image/svg+xml;base64,${typeof btoa === 'function' ? btoa(BIKE_MARKER_SVG) : ''}`;
const TREE_URL = PROP_URLS.tree; // kept for the random-scatter trees layer
import { Legend, ZoomBar, TiltBar, CtrlLabel, Compass, SaveButton, ControlStack, LayersPanel, useViewSettings } from '../controls.jsx';

const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const NEUTRAL_RGB = hexRgb(UNKNOWN_COLOR);
// Chaikin's corner-cutting algorithm. Smooths a (closed) polygon by replacing
// each edge with two new vertices at the 1/4 and 3/4 marks. After N iterations
// the polygon converges toward a B-spline-like rounded shape. Used for the
// Beach prop so user-drawn polygons read as natural sandy coastlines.
const chaikinSmooth = (points, iterations = 3) => {
  let pts = points.slice();
  for (let it = 0; it < iterations; it++) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % n];
      out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
      out.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    pts = out;
  }
  return pts;
};

// Convex hull (monotone chain). Returns the CCW hull of an arbitrary point set.
// Used to draw a tight polygon around each custom prop layer when exploded.
const convexHull = (pts) => {
  if (pts.length < 3) return pts.slice();
  const sorted = pts.slice().sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const cross = (O, A, B) => (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.concat(upper.slice(1, -1));
};

// Minimum-area rotated bounding rectangle. Uses the standard
// rotating-calipers idea: for every edge of the convex hull, rotate the
// hull so that edge is axis-aligned, take the axis-aligned bounding box,
// and keep whichever rotation produces the smallest area. Returns the 4
// corners of the rectangle in world coordinates.
const minAreaRect = (pts) => {
  if (!pts || pts.length === 0) return null;
  const hull = convexHull(pts);
  if (hull.length < 2) {
    const [x, y] = hull[0] || [0, 0];
    return [[x, y], [x, y], [x, y], [x, y]];
  }
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const [x1, y1] = hull[i];
    const [x2, y2] = hull[(i + 1) % hull.length];
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const c = Math.cos(-angle), s = Math.sin(-angle);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of hull) {
      const rx = x * c - y * s, ry = x * s + y * c;
      if (rx < minX) minX = rx; if (ry < minY) minY = ry;
      if (rx > maxX) maxX = rx; if (ry > maxY) maxY = ry;
    }
    const area = (maxX - minX) * (maxY - minY);
    if (!best || area < best.area) best = { area, angle, minX, minY, maxX, maxY };
  }
  // Build the rectangle corners back in world space (rotate by +angle).
  const { angle, minX, minY, maxX, maxY } = best;
  const c = Math.cos(angle), s = Math.sin(angle);
  return [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]]
    .map(([rx, ry]) => [rx * c - ry * s, rx * s + ry * c]);
};

// Standard ray-cast point-in-polygon. Used by tree scatter + prop intersect.
const pip = (p, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > p[1]) !== (yj > p[1])) && (p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
};
const view = new OrbitView({ orbitAxis: 'Z', fov: 50 });
// Used only while the user is mid-drawing a polygon / path. Pure 2D
// top-down with no perspective foreshortening, so click pixel <-> world
// XY is bijective — every vertex lands exactly under the cursor.
// Wide minZoom..maxZoom so users can zoom right down to a single building
// while drawing — deck.gl's OrthographicView default range is fairly tight.
const orthoView = new OrthographicView({ flipY: false, minZoom: -10, maxZoom: 30 });
// High-ambient lighting so picked colours (especially white) render at full
// brightness, not greyed-out by directional shading. A faint directional light
// keeps a hint of 3D form on the building sides.
const flatLighting = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.4 }),
  dir1: new DirectionalLight({ color: [255, 255, 255], intensity: 0.35, direction: [-2, -6, -3], _shadow: false }),
});

export default function DeckOrbit3D({ geo, chrome = {}, freeOrbit, onFreeOrbitChange }) {
  const show = (k) => chrome[k] !== false;
  const [showBuildings, setShowBuildings] = useState(true);
  const [showRoads, setShowRoads] = useState(true);
  const [showBorders, setShowBorders] = useState(true);
  const [heightColors, setHeightColors] = useState(true);
  const [showIds, setShowIds] = useState(true);
  const [showPodium, setShowPodium] = useState(true);
  const [hidePodium1Floor, setHidePodium1Floor] = useState(false); // skip podium on 1-floor (non-residential) buildings
  const [showFloors, setShowFloors] = useState(false);
  const [showAoiPlatform, setShowAoiPlatform] = useState(false);
  const [platformHeight, setPlatformHeight] = useState(1.5); // metres
  // Z of the ground/platform surface — must be hoisted above the polygon-
  // drawing useEffect (~line 394) which references it in its deps array.
  // Moving it later puts it in the temporal dead zone during render and
  // crashes the component in production builds.
  const surfaceZ = showAoiPlatform ? platformHeight : 0;
  const [showGrid, setShowGrid] = useState(false);
  const [gridExtent, setGridExtent] = useState('full'); // 'full' | 'shape' | 'aoi'
  const [gridColor, setGridColor] = useState('#3c4655'); // grid line colour
  const [gridWidth, setGridWidth] = useState(0.25);      // px (very thin by default)
  const [bgColor, setBgColor] = useState('#f5f1e7');
  const [numbersThrough, setNumbersThrough] = useState(true); // labels visible through buildings
  const [bldgFill, setBldgFill] = useState('#f8f6ef');         // building neutral fill (B&W)
  const [bldgLine, setBldgLine] = useState('#1c1813');         // building outline
  const [showTrees, setShowTrees] = useState(false);
  const [showGroundPlane, setShowGroundPlane] = useState(true); // surface plane in bgColor
  const [fillCutouts, setFillCutouts] = useState(true);  // hide cutout holes by painting surface colour
  const [propsItems, setPropsItems] = useState([]); // {id, type, position:[x,y,z]}
  // Animation tick (ms timestamp) for prop-level animations — currently
  // drives the burjeel wind effect. Throttled to ~30 fps for smoothness
  // without hammering React; the rendering itself is GPU-bound so the
  // bottleneck is React's reconciliation of the layer props.
  const [animTick, setAnimTick] = useState(0);
  useEffect(() => {
    let raf, last = 0;
    const loop = (t) => {
      if (t - last >= 33) { setAnimTick(t); last = t; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Fly-through (camera tour) state — see the Play sequence below.
  const [flyOpen, setFlyOpen] = useState(false);
  const [flyPlaying, setFlyPlaying] = useState(false);
  const [flyConfig, setFlyConfig] = useState({
    minTilt: 25, optTilt: 55, maxTilt: 85,
    tiltSpeed: 18,      // deg / sec
    rotSpeed: 36,       // deg / sec (one full 360 in 10s by default)
    expandedZoom: 0.4,
    collapsedZoom: 1.6,
    collapseAtMaxTilt: false,
    waitSec: 2,
  });
  const flyAbortRef = useRef(null);   // call to cancel an active tour
  // Named camera bookmarks — Save view button stores {id, name, target,
  // rotationOrbit, rotationX, zoom}. Clicking a row in the Views panel
  // smoothly applies it; ✏ renames; × deletes. Round-trips through the
  // standard view-settings save.
  const [savedViews, setSavedViews] = useState([]);
  // Ref that mirrors viewState so the fly-through animation can read the
  // latest camera without going through React's commit cycle. Starts as
  // null and is filled on the first effect after viewState is created
  // (viewState itself is declared further down — using useRef(viewState)
  // here would TDZ on opening a project).
  const viewStateRef = useRef(null);
  const [placeMode, setPlaceMode] = useState(null); // null or 'tree'|'person'|'lamp'|'car'|'table'
  const [deleteMode, setDeleteMode] = useState(false); // toggle: click any prop to remove
  const [moveMode, setMoveMode] = useState(false);     // toggle: click prop to pick up, click anywhere to drop
  const [movingPropId, setMovingPropId] = useState(null); // id of the prop currently picked up in move mode
  // Per-type smart-place toggle. Trees / canopy → enforce a min distance
  // between same-type props. Floor tiles → snap to a grid sized by the tile
  // so they tessellate side-by-side without overlap.
  const [smartPlace, setSmartPlace] = useState({});
  // Polygon-fill flow: 'idle' → 'drawing' (clicking adds vertices) → 'config'
  // (panel shows prop / count selectors + Fill button) → 'idle'.
  const [fillMode, setFillMode] = useState('idle');
  const [fillPolygon, setFillPolygon] = useState([]); // [[x, y], ...]
  const [fillType, setFillType] = useState('tree');
  const [fillCount, setFillCount] = useState(0); // 0 = auto-fill until full
  const [fillCursor, setFillCursor] = useState(null); // live world pos under pointer for the preview line
  // Bicycle-lane (path-type prop) drawing buffer. When placeMode === 'bikelane'
  // each click pushes a waypoint here; Enter commits it as a propsItems entry
  // with { type: 'bikelane', path: [...waypoints] }.
  const [bikeLanePath, setBikeLanePath] = useState([]);
  // Per-type prop size override: { [type]: { h: metres, w: metres } }. h drives
  // the rendered height; w stretches the icon's natural aspect horizontally.
  const [propSizes, setPropSizes] = useState({});
  // Per-type tint colour applied via IconLayer.getColor. With mask:false the
  // colour multiplies the icon's pixels — white fills become the picked
  // colour, black outlines stay black, so the line-drawing aesthetic is kept.
  const [propColors, setPropColors] = useState({});
  // Custom prop layers: like Photoshop layers for props. Newly placed props
  // get tagged with the activeLayerId. When layersExploded is on, each layer
  // is lifted vertically by (index + 1) * layerExplodeGap metres — analogous
  // to exploding the floors of a building, but for prop groups.
  const [propLayers, setPropLayers] = useState([]); // [{ id, name }]
  const [activeLayerId, setActiveLayerId] = useState(null);
  const [layersExploded, setLayersExploded] = useState(false);
  const [layerExplodeGap, setLayerExplodeGap] = useState(8); // metres between layers
  const [showLayerPolygons, setShowLayerPolygons] = useState(false); // translucent slab per layer
  const [showLayerNames, setShowLayerNames] = useState(true);        // floating name label per layer
  // When on, the slabs + labels are pushed at the END of the deck.gl
  // layers array so they paint OVER buildings from any camera angle.
  // When off (default) they're drawn in their natural depth order, which
  // means tall buildings between camera and slab can occlude the slab.
  const [layersInFront, setLayersInFront] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');
  const [rejectionMsg, setRejectionMsg] = useState(null); // brief on-canvas toast
  const rejectionTimerRef = useRef(null);
  // When the user drags one of the in-progress polygon / lane vertices, we
  // suppress the next deck.gl click so it doesn't also drop a new vertex.
  const suppressClickRef = useRef(false);
  // Selection: click a placed prop in select mode → store its id, show an
  // inline editor with position / size / layer / colour. Esc deselects.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPropId, setSelectedPropId] = useState(null);
  // Multi-selection set. Includes selectedPropId when it's set; can also hold
  // additional ids picked via Cmd/Ctrl/Shift+click or via box-select drag.
  // Used purely for highlight + bulk delete; the single-item editor still
  // keys off selectedPropId.
  const [selectedPropIds, setSelectedPropIds] = useState([]);
  // Box-select sub-mode: when on, dragging in empty space paints a screen
  // rectangle and on release every prop whose projected position falls inside
  // gets added to the selection. Disables deck.gl drag-pan/drag-rotate while
  // active so the drag goes to us instead.
  const [boxSelect, setBoxSelect] = useState(false);
  const [boxRect, setBoxRect] = useState(null); // {x0,y0,x1,y1} in canvas px, or null
  const flashRejection = (msg) => {
    setRejectionMsg(msg);
    if (rejectionTimerRef.current) clearTimeout(rejectionTimerRef.current);
    rejectionTimerRef.current = setTimeout(() => setRejectionMsg(null), 2500);
  };
  // When ON, props can't be placed where they would intersect a building or
  // a road. Default ON — user has to tick it off to plant things on top of
  // structures.
  const [propAvoidIntersect, setPropAvoidIntersect] = useState(true);
  const [podiumFill, setPodiumFill] = useState(null); // null = derive from building fill; else hex
  const [roadFill, setRoadFill] = useState('#cfc8bb');
  const [roofWidth, setRoofWidth] = useState(3.2); // pixel width of the roof-outline PathLayer
  const [edgeWidth, setEdgeWidth] = useState(1.8); // pixel width of the rest of the building wireframe
  const [showBasemap, setShowBasemap] = useState(false);
  const [shape, setShape] = useState('circle');
  const [size, setSize] = useState({ radius: 750, half: 450, halfX: 600, halfY: 450 });
  const [basemapStyle, setBasemapStyle] = useState('streets-v12');
  const [archBuildings, setArchBuildings] = useState(false);
  const [archRoads, setArchRoads] = useState(false);
  const [archBasemap, setArchBasemap] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [selectedBldg, setSelectedBldg] = useState(null); // building num, or null
  const [panMode, setPanMode] = useState(false); // hand tool: left-drag pans instead of rotates
  const [explodeGap, setExplodeGap] = useState(1.2); // metres between exploded floors
  const [infoCollapsed, setInfoCollapsed] = useState(false); // building-info popup collapsed
  const [photoIncludeUi, setPhotoIncludeUi] = useState(false); // include panels in saved photo

  const wrapRef = useRef(null);
  const viewRef = useRef(null);
  const deckRef = useRef(null);

  // Pinch-to-zoom-to-cursor: a trackpad pinch lands as a wheel event with
  // ctrlKey:true in Chrome/Edge/Firefox. A plain two-finger scroll has ctrlKey
  // false — we leave that to deck.gl's default rotate/pan behaviour.
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey) return; // ignore plain scroll — pinch only
      e.preventDefault(); e.stopPropagation();
      const deck = deckRef.current?.deck;
      const vp = deck?.getViewports?.()[0]; if (!vp) return;
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      let worldBefore;
      try { worldBefore = vp.unproject([cx, cy]); } catch { return; }
      const dz = -e.deltaY * 0.01; // pinch delta — halved (was 0.02) so each tick moves ~0.10 zoom instead of ~0.20
      setViewState((v) => {
        const newZoom = Math.max(-3, Math.min(6, v.zoom + dz));
        // After zoom changes, the cursor must stay over the same world point.
        const r = Math.pow(2, newZoom - v.zoom);
        const tx = worldBefore[0] + (v.target[0] - worldBefore[0]) / r;
        const ty = worldBefore[1] + (v.target[1] - worldBefore[1]) / r;
        return { ...v, zoom: newZoom, target: [tx, ty, v.target[2]] };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  // Drag-to-move-vertex while drawing a polygon / lane. Press near any
  // in-progress vertex with mouse OR touch and drag it to a new position; the
  // path / polygon updates live. Works for fillMode=='drawing' (polygon-fill),
  // placeMode=='bikelane', and the beach / sea polygon-type props. We hit-test
  // in screen space (≤ 22 px from a vertex), unproject the cursor to the
  // surface plane on each move, and rewrite that vertex. Click is suppressed
  // for the duration so the deck.gl click handler doesn't drop a new vertex.
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const isDrawing = fillMode === 'drawing'
                      || placeMode === 'bikelane'
                      || (placeMode && PROP_META[placeMode]?.polygon);
    if (!isDrawing) return;
    let dragging = null;
    const getPath = () => fillMode === 'drawing' ? fillPolygon : bikeLanePath;
    const setPath = (mapper) => {
      if (fillMode === 'drawing') setFillPolygon((v) => v.map(mapper));
      else setBikeLanePath((v) => v.map(mapper));
    };
    const pointFrom = (e) => {
      const ev = e.touches ? e.touches[0] : e;
      const rect = el.getBoundingClientRect();
      return { cx: ev.clientX - rect.left, cy: ev.clientY - rect.top };
    };
    const onDown = (e) => {
      if (e.touches && e.touches.length > 1) return; // ignore 2-finger gestures
      const { cx, cy } = pointFrom(e);
      const deck = deckRef.current?.deck;
      const vp = deck?.getViewports?.()[0]; if (!vp) return;
      const path = getPath();
      let bestIdx = -1, bestD = 22; // px hit radius
      for (let i = 0; i < path.length; i++) {
        const [vx, vy] = path[i];
        let sx, sy;
        try { [sx, sy] = vp.project([vx, vy, surfaceZ]); } catch { continue; }
        const d = Math.hypot(sx - cx, sy - cy);
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
      if (bestIdx < 0) return;
      e.preventDefault(); e.stopPropagation();
      dragging = { idx: bestIdx };
      suppressClickRef.current = true;
    };
    const onMove = (e) => {
      if (!dragging) return;
      const { cx, cy } = pointFrom(e);
      const deck = deckRef.current?.deck;
      const vp = deck?.getViewports?.()[0]; if (!vp) return;
      let world;
      try { world = vp.unproject([cx, cy], { targetZ: surfaceZ }); } catch { return; }
      e.preventDefault();
      setPath((v, i) => i === dragging.idx ? [world[0], world[1]] : v);
    };
    const onUp = () => {
      dragging = null;
      // Keep the click suppressed for one event loop so the just-finished drag
      // doesn't also produce a "click → add vertex" right where we let go.
      setTimeout(() => { suppressClickRef.current = false; }, 50);
    };
    el.addEventListener('mousedown',  onDown, true);
    el.addEventListener('mousemove',  onMove);
    window.addEventListener('mouseup', onUp);
    el.addEventListener('touchstart', onDown, { passive: false, capture: true });
    el.addEventListener('touchmove',  onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      el.removeEventListener('mousedown',  onDown, true);
      el.removeEventListener('mousemove',  onMove);
      window.removeEventListener('mouseup', onUp);
      el.removeEventListener('touchstart', onDown, { capture: true });
      el.removeEventListener('touchmove',  onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [fillMode, placeMode, fillPolygon, bikeLanePath, surfaceZ]);

  // iPad / touch — two-finger PARALLEL drag (both fingers moving the same
  // direction, distance & angle between them roughly stable) tilts the camera.
  // deck.gl's OrbitController handles pinch-zoom and twist-rotate via touch
  // events; this listener fills the missing "two-finger drag = pitch" gesture
  // by detecting parallel motion and updating rotationX directly.
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    let start = null; // { t1, t2, dist, angle, cy, pitch }
    const PITCH_SENS = 0.35; // degrees per pixel of vertical centre delta
    const PINCH_TOL = 22;    // px change in finger distance that aborts as "pinch"
    const TWIST_TOL = 0.18;  // rad change in finger angle that aborts as "twist"
    const onStart = (e) => {
      if (e.touches.length !== 2) { start = null; return; }
      const t1 = e.touches[0], t2 = e.touches[1];
      const dx = t2.clientX - t1.clientX, dy = t2.clientY - t1.clientY;
      start = {
        t1: { x: t1.clientX, y: t1.clientY },
        t2: { x: t2.clientX, y: t2.clientY },
        dist: Math.hypot(dx, dy),
        angle: Math.atan2(dy, dx),
        cy: (t1.clientY + t2.clientY) / 2,
        pitch: viewRef.current?.rotationX ?? 55,
      };
    };
    const onMove = (e) => {
      if (!start || e.touches.length !== 2) return;
      const t1 = e.touches[0], t2 = e.touches[1];
      const dx = t2.clientX - t1.clientX, dy = t2.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const cy = (t1.clientY + t2.clientY) / 2;
      const distDelta = Math.abs(dist - start.dist);
      const angleDelta = Math.abs(angle - start.angle);
      const cyDelta = cy - start.cy;
      // Reject as pinch / twist gestures — those are handled by deck.gl.
      if (distDelta > PINCH_TOL || angleDelta > TWIST_TOL) return;
      if (Math.abs(cyDelta) < 4) return;
      e.preventDefault();
      // Dragging fingers DOWN tilts the camera toward horizon (higher pitch).
      const next = Math.max(0, Math.min(89, start.pitch + cyDelta * PITCH_SENS));
      setViewState((v) => ({ ...v, rotationX: next }));
    };
    const onEnd = (e) => { if (e.touches.length < 2) start = null; };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove',  onMove,  { passive: false });
    el.addEventListener('touchend',   onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove',  onMove);
      el.removeEventListener('touchend',   onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  // Polygon / path drawing only feels "pixel-perfect" in a true 2D
  // (orthographic) projection — any perspective view has parallax
  // between the click ray and the rendered ground point. So while the
  // user is drawing we swap the active view to an OrthographicView
  // (declared at module scope below). Click ↔ world ↔ click is exact
  // identity in ortho mode regardless of zoom/pan.
  const isDrawing = fillMode === 'drawing'
                    || placeMode === 'bikelane'
                    || (placeMode && PROP_META[placeMode]?.polygon);
  const activeView = isDrawing ? orthoView : view;
  // OrbitView and OrthographicView use different zoom unit systems — the
  // same viewState.zoom value yields wildly different visible scales in
  // each view. On every transition between the two we (a) measure how
  // wide the world currently appears at the cursor center, (b) compute
  // the zoom in the new view's units that reproduces that same world
  // width, and (c) apply it so the map stays visible at the same scale
  // through the swap.
  const wasDrawingRef = useRef(false);
  const savedOrbitRef = useRef(null);
  // Pull a 3-tuple target out of a viewState whose target may be 2D
  // (OrthographicView) or 3D (OrbitView). Falls back to zeros so we
  // never deref undefined when the views swap. CRITICAL: use isFinite
  // not `??` — NaN passes through `??` and then poisons every downstream
  // numeric (zoom, projection, SVG cx/cy) producing the "value 'NaN'
  // cannot be parsed" flood.
  const finite = (v, fb) => (typeof v === 'number' && isFinite(v) ? v : fb);
  const targetXYZ = (vs, fallbackZ = 0) => {
    const t = vs?.target;
    if (Array.isArray(t)) return [finite(t[0], 0), finite(t[1], 0), finite(t[2], fallbackZ)];
    return [0, 0, fallbackZ];
  };
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    try {
      if (isDrawing && !wasDrawingRef.current) {
        // Entering drawing: measure orbit's visible world width, compute
        // the matching ortho zoom, save the prior orbit zoom for restore.
        const orbitVp = view.makeViewport({ width: w, height: h, viewState });
        const [, , tz] = targetXYZ(viewState);
        const left  = orbitVp.unproject([0, h / 2], { targetZ: tz });
        const right = orbitVp.unproject([w, h / 2], { targetZ: tz });
        const visibleWorldWidth = Math.hypot(right[0] - left[0], right[1] - left[1]);
        if (isFinite(visibleWorldWidth) && visibleWorldWidth > 0) {
          const orthoZoom = Math.log2(w / visibleWorldWidth);
          if (isFinite(orthoZoom)) {
            savedOrbitRef.current = { zoom: viewState.zoom, target: targetXYZ(viewState) };
            setViewState((vs) => {
              const [tx, ty] = targetXYZ(vs);
              return { ...vs, zoom: orthoZoom, target: [tx, ty, 0] };
            });
          }
        }
      } else if (!isDrawing && wasDrawingRef.current) {
        // Exiting drawing: restore the orbit zoom + target z. Keep the
        // panned-to XY so the camera returns where the user moved to.
        const saved = savedOrbitRef.current;
        savedOrbitRef.current = null;
        setViewState((vs) => {
          const [tx, ty] = targetXYZ(vs);
          const tz = saved?.target?.[2] ?? 0;
          const z = saved?.zoom ?? vs.zoom;
          return { ...vs, zoom: z, target: [tx, ty, tz] };
        });
      }
    } catch (e) {
      console.warn('view-swap zoom conversion failed', e);
    }
    wasDrawingRef.current = isDrawing;
  }, [isDrawing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Box-select drag: while boxSelect is on, mousedown anywhere in the canvas
  // (other than on the box-select UI itself) starts a screen-space rectangle.
  // On mouseup the rectangle is converted to a list of props whose projected
  // world position falls inside it. Holding Shift at drag-start ADDS to the
  // current multi-selection instead of replacing it.
  useEffect(() => {
    if (!boxSelect) return;
    const el = wrapRef.current; if (!el) return;
    let start = null;            // { x, y, additive }
    const rectFrom = (a, b) => ({
      x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y),
      x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y),
    });
    const onDown = (e) => {
      if (e.button !== 0) return;          // primary button only
      const rect = el.getBoundingClientRect();
      start = { x: e.clientX - rect.left, y: e.clientY - rect.top, additive: !!e.shiftKey };
      setBoxRect({ x0: start.x, y0: start.y, x1: start.x, y1: start.y });
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!start) return;
      const rect = el.getBoundingClientRect();
      const cur = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setBoxRect(rectFrom(start, cur));
    };
    const onUp = (e) => {
      if (!start) return;
      const rect = el.getBoundingClientRect();
      const cur = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const r = rectFrom(start, cur);
      const additive = start.additive;
      start = null; setBoxRect(null);
      // Tiny drag → treat as a click-on-empty: clear selection.
      if (r.x1 - r.x0 < 4 && r.y1 - r.y0 < 4) {
        if (!additive) { setSelectedPropIds([]); setSelectedPropId(null); }
        return;
      }
      const deck = deckRef.current?.deck;
      const vp = deck?.getViewports?.()[0]; if (!vp) return;
      const hit = [];
      for (const p of propsItems) {
        if (!isLayerVisible(p.layerId)) continue;
        // Pick the prop's effective world position. Bikelanes/polygons have
        // no single position[]; use the first vertex as a hit proxy.
        let world;
        if (Array.isArray(p.position)) world = p.position;
        else if (Array.isArray(p.polygon) && p.polygon[0]) world = [p.polygon[0][0], p.polygon[0][1], surfaceZ];
        else if (Array.isArray(p.path) && p.path[0]) world = [p.path[0][0], p.path[0][1], surfaceZ];
        else continue;
        let s;
        try { s = vp.project(world); } catch { continue; }
        if (s[0] >= r.x0 && s[0] <= r.x1 && s[1] >= r.y0 && s[1] <= r.y1) hit.push(p.id);
      }
      setSelectedPropIds((cur) => {
        if (!additive) return hit;
        const merged = new Set(cur); for (const id of hit) merged.add(id);
        return [...merged];
      });
      if (hit.length === 1) setSelectedPropId(hit[0]);
    };
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [boxSelect, propsItems, surfaceZ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Safari pinch (gesture events): zoom toward cursor + rotate around vertical
  // axis on twist. Chrome doesn't fire these — pinches arrive as ctrlKey wheels
  // (handled above). One-finger drag still rotates freely via deck.gl.
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    let startBearing = 0, startZoom = 0;
    let startTarget = [0, 0, 0];
    let worldBefore = null;
    const onStart = (e) => {
      e.preventDefault();
      const v = viewRef.current || {};
      startBearing = v.rotationOrbit ?? 0; startZoom = v.zoom ?? 0; startTarget = v.target ?? [0, 0, 0];
      const deck = deckRef.current?.deck;
      const vp = deck?.getViewports?.()[0];
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      worldBefore = null;
      if (vp) { try { worldBefore = vp.unproject([cx, cy]); } catch {} }
    };
    const onChange = (e) => {
      e.preventDefault();
      setViewState((v) => {
        const newZoom = Math.max(-3, Math.min(6, startZoom + Math.log2(e.scale || 1)));
        if (worldBefore) {
          // Keep the gesture's anchor world point under the cursor.
          const r = Math.pow(2, newZoom - startZoom);
          const tx = worldBefore[0] + (startTarget[0] - worldBefore[0]) / r;
          const ty = worldBefore[1] + (startTarget[1] - worldBefore[1]) / r;
          return { ...v, rotationOrbit: startBearing + e.rotation, zoom: newZoom, target: [tx, ty, v.target[2]] };
        }
        return { ...v, rotationOrbit: startBearing + e.rotation, zoom: newZoom };
      });
    };
    el.addEventListener('gesturestart', onStart);
    el.addEventListener('gesturechange', onChange);
    el.addEventListener('gestureend', (e) => e.preventDefault());
    return () => {
      el.removeEventListener('gesturestart', onStart);
      el.removeEventListener('gesturechange', onChange);
    };
  }, []);

  // Hand tool: when panMode is on, left-drag pans the view target by the
  // world-space delta of the cursor. deck.gl's OrbitController doesn't expose
  // a "drag = pan" mode, so we drive it manually here. dragRotate is already
  // disabled at the controller level so this doesn't conflict with rotation.
  useEffect(() => {
    if (!panMode) return;
    const el = wrapRef.current; if (!el) return;
    let drag = null;
    const onDown = (e) => {
      if (e.button !== 0) return;
      const deck = deckRef.current?.deck;
      const vp = deck?.getViewports?.()[0]; if (!vp) return;
      const rect = el.getBoundingClientRect();
      const tz = viewRef.current.target?.[2] ?? 0;
      let startW;
      try { startW = vp.unproject([e.clientX - rect.left, e.clientY - rect.top], { targetZ: tz }); }
      catch { return; }
      e.preventDefault(); e.stopPropagation();
      drag = { vp, rect, tz, startW, target: [...viewRef.current.target] };
    };
    const onMove = (e) => {
      if (!drag) return;
      let currW;
      try { currW = drag.vp.unproject([e.clientX - drag.rect.left, e.clientY - drag.rect.top], { targetZ: drag.tz }); }
      catch { return; }
      const dx = drag.startW[0] - currW[0];
      const dy = drag.startW[1] - currW[1];
      setViewState((v) => ({
        ...v,
        target: [drag.target[0] + dx, drag.target[1] + dy, drag.target[2]],
      }));
    };
    const onUp = () => { drag = null; };
    el.addEventListener('mousedown', onDown, true);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [panMode]);

  // Escape cancels placement / delete / move / polygon-fill mode.
  // Enter closes a polygon being drawn (≥3 verts) and advances to config.
  useEffect(() => {
    if (!placeMode && !deleteMode && !moveMode && !selectMode && !selectedPropId && selectedPropIds.length === 0 && !boxSelect && !boxRect && fillMode === 'idle') return;
    const onKey = (e) => {
      if (e.target && e.target.tagName === 'INPUT') return; // don't hijack typing
      if (e.key === 'Escape') {
        if (placeMode) setPlaceMode(null);
        if (deleteMode) setDeleteMode(false);
        if (moveMode) { setMoveMode(false); setMovingPropId(null); }
        if (selectMode) setSelectMode(false);
        if (boxSelect) setBoxSelect(false);
        if (selectedPropId) setSelectedPropId(null);
        if (selectedPropIds.length) setSelectedPropIds([]);
        if (boxRect) setBoxRect(null);
        if (fillMode !== 'idle') { setFillMode('idle'); setFillPolygon([]); }
        if (bikeLanePath.length > 0) setBikeLanePath([]);
      } else if (e.key === 'Enter' && fillMode === 'drawing' && fillPolygon.length >= 3) {
        setFillMode('config'); setFillCursor(null);
      } else if (e.key === 'Enter' && placeMode === 'bikelane' && bikeLanePath.length >= 2) {
        // Commit the bike lane.
        setPropsItems((p) => [...p, {
          id: Math.random().toString(36).slice(2, 10),
          type: 'bikelane',
          path: bikeLanePath,
          layerId: activeLayerId || null,
        }]);
        setBikeLanePath([]);
        setPlaceMode(null);
      } else if (e.key === 'Enter' && placeMode && PROP_META[placeMode]?.polygon && bikeLanePath.length >= 3) {
        // Commit a beach / sea polygon. The raw vertices are stored — we
        // smooth at render time so the user could later "rebuild" the shape
        // by editing vertices in a future version.
        setPropsItems((p) => [...p, {
          id: Math.random().toString(36).slice(2, 10),
          type: placeMode,
          polygon: bikeLanePath,
          layerId: activeLayerId || null,
        }]);
        setBikeLanePath([]);
        setPlaceMode(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placeMode, deleteMode, moveMode, fillMode, fillPolygon, bikeLanePath, activeLayerId, selectMode, selectedPropId, selectedPropIds, boxSelect, boxRect]);

  // Per-prop z-offset when custom layers are exploded. Props with no layer
  // assignment stay grounded; layer i is lifted by (i+1) * gap.
  const layerExplodeOffset = (layerId) => {
    if (!layersExploded || !layerId) return 0;
    const idx = propLayers.findIndex((l) => l.id === layerId);
    if (idx < 0) return 0;
    return (idx + 1) * layerExplodeGap;
  };

  // Layer transform: per-layer visibility flag + (x, y, z) offsets applied to
  // every prop in that layer. Used by both IconLayers, the bike-lane PathLayer
  // and the slab polygons so a layer can be shifted left / right / up + down
  // independently. Unassigned props have no transform.
  const layerTransform = (layerId) => {
    if (!layerId) return { dx: 0, dy: 0, dz: 0, visible: true };
    const l = propLayers.find((x) => x.id === layerId);
    if (!l) return { dx: 0, dy: 0, dz: 0, visible: true };
    return {
      dx: l.offsetX || 0,
      dy: l.offsetY || 0,
      dz: l.offsetZ || 0,
      visible: l.visible !== false,
    };
  };
  const isLayerVisible = (layerId) => {
    if (!layerId) return true;
    const l = propLayers.find((x) => x.id === layerId);
    return !l || l.visible !== false;
  };

  // Single site-wide rectangle reused as the slab outline for EVERY
  // layer (and the ground plane below). Tightest oriented rectangle
  // wrapping the AOI polygon — falls back to the union of building
  // footprints if no AOI is loaded. Computed once; every layer's slab is
  // the same shape stacked at its own altitude (see the diagram the user
  // sketched).
  const siteRect = useMemo(() => {
    const pts = [];
    if (geo.aoi && geo.aoi[0]) {
      for (const v of geo.aoi[0]) if (Array.isArray(v)) pts.push([v[0], v[1]]);
    } else if (geo.buildings && geo.buildings.length) {
      for (const b of geo.buildings) {
        const rings = b.rings || (b.ring ? [b.ring] : []);
        for (const ring of rings) for (const v of ring) if (Array.isArray(v)) pts.push([v[0], v[1]]);
      }
    }
    if (pts.length === 0) return null;
    return minAreaRect(pts);
  }, [geo]);

  // Per-layer slab geometry. Each layer reuses the site-wide rectangle so
  // all slabs stack as identical footprints (one shape, copied per
  // layer). Label centroid is still computed per-layer from the props in
  // it, so each layer name stays in its own spot.
  const layerHulls = useMemo(() => {
    if (!siteRect) return [];
    return propLayers.map((layer) => {
      if (layer.visible === false) return null;
      const items = propsItems.filter((p) => p.layerId === layer.id);
      const hasSavedPolygon = Array.isArray(layer.polygon) && layer.polygon.length >= 3;
      if (items.length === 0 && !hasSavedPolygon) return null;
      // Label centroid: average of all prop positions in this layer so
      // each layer's name still labels its own content. Falls back to
      // the site-rectangle centroid if the layer has only a saved
      // polygon and no placed props yet.
      let cx = 0, cy = 0, n = 0;
      for (const p of items) {
        if (Array.isArray(p.position)) { cx += p.position[0]; cy += p.position[1]; n++; }
        else if (Array.isArray(p.path) && p.path[0]) { cx += p.path[0][0]; cy += p.path[0][1]; n++; }
        else if (Array.isArray(p.polygon) && p.polygon[0]) { cx += p.polygon[0][0]; cy += p.polygon[0][1]; n++; }
      }
      if (n === 0) {
        for (const [x, y] of siteRect) { cx += x; cy += y; }
        n = siteRect.length;
      }
      cx /= n; cy /= n;
      return {
        id: layer.id, name: layer.name,
        // Same shape (the site rectangle) for every layer — see siteRect.
        polygon: siteRect.map(([x, y]) => [x, y]),
        centroid: [cx, cy], count: items.length,
      };
    }).filter(Boolean);
  }, [propLayers, propsItems, siteRect]);

  // Tinted icon URLs derived from propColors. We bake the picked colour into
  // the SVG fill instead of relying on IconLayer.getColor (which only applies
  // when mask:true and would otherwise be ignored for our detailed icons).
  const tintedPropUrls = useMemo(() => {
    const out = {};
    for (const [k, m] of Object.entries(PROP_META)) {
      // Explicit user pick wins; otherwise fall back to the type's defaultColor
      // (used for trees / canopy so they start green by default).
      const col = propColors[k] || m.defaultColor;
      const svg = PROP_SVGS[k];
      out[k] = col && svg ? svgToUrl(tintSvg(svg, col)) : m.icon;
    }
    return out;
  }, [propColors]);
  const tintedCanopyUrls = useMemo(() => {
    const col = propColors.canopy || PROP_META.canopy.defaultColor;
    return col ? CANOPY_SVGS.map((s) => svgToUrl(tintSvg(s, col))) : CANOPY_URLS;
  }, [propColors]);

  // model centre (rotate around the vertical middle of the buildings, like the
  // old Three.js Bounds-fit view did)
  const targetZ = useMemo(() => {
    let m = 0; for (const b of geo.buildings) if (b.height > m) m = b.height;
    return m / 2;
  }, [geo]);

  // Save a PNG of the current view at the canvas's native pixel resolution
  // (devicePixelRatio-aware). We always paint the wrapper's CSS background
  // colour underneath first, so transparent regions of the deck.gl canvas (the
  // ones the browser fills with the .svgwrap CSS bg) end up the same colour in
  // the PNG — no "sky" or chequerboard from the image viewer's transparency.
  const savePhoto = async () => {
    const deck = deckRef.current?.deck;
    const canvas = deck?.canvas || wrapRef.current?.querySelector('canvas');
    if (!canvas) return;
    try { deck?.redraw?.('save-photo'); } catch {}
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));

    const download = (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `studio-${Date.now()}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    // Build an opaque output canvas matching the deck canvas pixel size, with
    // the wrapper's CSS background colour painted under the deck render.
    const wrap = wrapRef.current;
    const bgColor = wrap ? getComputedStyle(wrap).backgroundColor : '#ffffff';
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    ctx.fillStyle = bgColor && bgColor !== 'rgba(0, 0, 0, 0)' ? bgColor : '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);

    if (!photoIncludeUi) {
      out.toBlob(download, 'image/png', 1.0);
      return;
    }

    // Composite the .svgwrap UI on top via SVG <foreignObject> serialisation.
    if (!wrap) return out.toBlob(download, 'image/png', 1.0);
    const rect = wrap.getBoundingClientRect();
    const wrapClone = wrap.cloneNode(true);
    const canvasIn = wrapClone.querySelector('canvas');
    if (canvasIn) canvasIn.remove();
    wrapClone.style.background = 'transparent';
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('xmlns', svgNs);
    svg.setAttribute('width', rect.width);
    svg.setAttribute('height', rect.height);
    const fo = document.createElementNS(svgNs, 'foreignObject');
    fo.setAttribute('x', 0); fo.setAttribute('y', 0);
    fo.setAttribute('width', '100%'); fo.setAttribute('height', '100%');
    fo.appendChild(wrapClone);
    svg.appendChild(fo);
    const xml = new XMLSerializer().serializeToString(svg);
    const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, out.width, out.height);
      out.toBlob(download, 'image/png', 1.0);
    };
    img.onerror = () => out.toBlob(download, 'image/png', 1.0);
    img.src = svgUrl;
  };

  // "Convenient" framing of the model: slight 3/4 view, mild tilt, moderately
  // zoomed-in. Used as the initial camera and by the Reset-camera button.
  const homeView = useMemo(() => ({
    target: [0, 0, targetZ], rotationOrbit: 30, rotationX: 55, zoom: -1.2,
  }), [targetZ]);
  const [viewState, setViewState] = useState(homeView);
  // Keep the ref declared higher up (used by the fly-through tour) in
  // sync with the latest viewState. Declared up there so the runner
  // closure can read it without TDZ on first mount.
  useEffect(() => { viewStateRef.current = viewState; }, [viewState]);
  const resetCamera = () => setViewState({ ...homeView });

  // Unproject the click pixel to the current surface plane (z = surfaceZ).
  const computeSurfacePos = (info) => {
    // Cast the click ray against the GROUND PLANE (z = surfaceZ) regardless
    // of what the picking pass hit. info.coordinate uses the picked layer's
    // own z — if the click ray hits a building roof or the AOI platform top
    // first, info.coordinate is the XY at THAT z. Forcing it to surfaceZ
    // creates a visible offset because horizontally the roof-XY and ground-
    // XY are different along an angled ray. vp.unproject with targetZ does
    // the ray/plane intersection correctly.
    //
    // Build the viewport from the current React viewState rather than
    // reading deckRef's cached one — that way every unproject here is
    // guaranteed to use the same matrix as projectToScreen below, so the
    // round-trip is exact identity.
    if (info?.x != null && info?.y != null) {
      const wrap = wrapRef.current;
      const width = wrap?.clientWidth ?? 0;
      const height = wrap?.clientHeight ?? 0;
      if (width && height) {
        try {
          const vp = activeView.makeViewport({ width, height, viewState });
          const w = vp.unproject([info.x, info.y], { targetZ: surfaceZ });
          return [w[0], w[1], surfaceZ];
        } catch {}
      }
    }
    // Last-resort fallback for clicks where x/y are missing (rare).
    if (info?.coordinate) return [info.coordinate[0], info.coordinate[1], surfaceZ];
    return null;
  };
  // Project a world (X, Y) on the ground plane back to canvas pixels. The
  // SVG overlay below uses this so the in-progress polygon vertices stay
  // glued to the cursor — vp.unproject ↔ vp.project is a round-trip
  // identity, so a vertex always renders exactly at the pixel the user
  // clicked, and updates as they orbit / zoom.
  //
  // We DON'T read deckRef.current.deck.getViewports()[0] here: deck.gl
  // updates that viewport on its own rAF after React commits, so during
  // a frame triggered by setViewState the cached viewport is still on
  // the previous camera matrix. The result is a small error per frame
  // that scales with the angular distance from the orbit centre — i.e.
  // the more the user pans / zooms, the further off the SVG dots drift.
  // Building a viewport from the current viewState every render keeps
  // the projection in lock-step with React state.
  const projectToScreen = (x, y) => {
    const wrap = wrapRef.current;
    const width = wrap?.clientWidth ?? 0;
    const height = wrap?.clientHeight ?? 0;
    if (!width || !height) return null;
    try {
      const vp = activeView.makeViewport({ width, height, viewState });
      const s = vp.project([x, y, surfaceZ]);
      // Drop NaN/Infinity rather than passing it to SVG cx/cy attributes
      // — the DOM rejects them and spams the console.
      if (!isFinite(s[0]) || !isFinite(s[1])) return null;
      return [s[0], s[1]];
    } catch { return null; }
  };


  // Validate that pos doesn't intersect a building or road, if the toggle is
  // on. Flat props (floor tiles) skip the road check because they sit BELOW
  // the road layer in the draw order — the road's opaque fill covers any
  // tile portion that extends onto the road. So tiles fill seamlessly even
  // across a road, with the road still reading on top.
  const isPlacementValid = (pos, type = null) => {
    if (!propAvoidIntersect) return true;
    const pt = [pos[0], pos[1]];
    for (const b of geo.buildings) {
      const rings = b.rings || (b.ring ? [b.ring] : []);
      if (!rings.length) continue;
      if (pip(pt, rings[0])) {
        let inCutout = false;
        for (let i = 1; i < rings.length; i++) if (pip(pt, rings[i])) { inCutout = true; break; }
        if (!inCutout) return false;
      }
    }
    const skipRoad = type && PROP_META[type]?.flat;
    if (!skipRoad) {
      for (const r of geo.roads) {
        const rings = r.rings || (r.ring ? [r.ring] : []);
        for (const ring of rings) if (pip(pt, ring)) return false;
      }
    }
    return true;
  };

  // Fill the polygon currently stored in fillPolygon with N props of `type`.
  // For flat props (tiles) → step through a grid sized by W × H. For
  // billboarded props → Poisson-style random sampling with a min-distance
  // equal to the effective width. Both honour the avoid-intersect rule.
  // If count = 0, fill until no more fit (auto).
  const runPolygonFill = (type, count) => {
    if (fillPolygon.length < 3) return;
    const m = PROP_META[type]; if (!m) return;
    // Polygon-type props (beach / sea) ARE the polygon — there's no scatter
    // to run. Promote the drawn shape into a single prop and return.
    if (m.polygon) {
      const poly = fillPolygon.map(([x, y]) => [x, y]);
      setPropsItems((p) => [...p, {
        id: Math.random().toString(36).slice(2, 10),
        type, polygon: poly,
        layerId: activeLayerId || null,
      }]);
      if (activeLayerId) {
        setPropLayers((layers) => layers.map((l) => l.id === activeLayerId ? { ...l, polygon: poly } : l));
      }
      setFillMode('idle'); setFillPolygon([]);
      return;
    }
    const o = propSizes[type] || {};
    const heightM = o.h ?? m.size;
    const widthM  = o.w ?? heightM * (m.w / m.h);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of fillPolygon) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const want = count > 0 ? count : Infinity;
    const newProps = [];
    const pushItem = (x, y) => {
      const item = {
        id: Math.random().toString(36).slice(2, 10),
        type, position: [x, y, surfaceZ],
        layerId: activeLayerId || null,
      };
      if (type === 'canopy') item.variant = Math.floor(Math.random() * CANOPY_URLS.length);
      newProps.push(item);
    };
    if (m.flat) {
      const gx = Math.max(0.1, widthM);
      const gy = Math.max(0.1, heightM);
      // Step one cell beyond the bbox in each direction so edge tiles still
      // get sampled.
      const x0 = Math.floor(minX / gx) * gx;
      const y0 = Math.floor(minY / gy) * gy;
      const w2 = widthM / 2, h2 = heightM / 2;
      const samplePts = (x, y) => [
        [x, y],
        [x - w2 * 0.8, y - h2 * 0.8], [x + w2 * 0.8, y - h2 * 0.8],
        [x + w2 * 0.8, y + h2 * 0.8], [x - w2 * 0.8, y + h2 * 0.8],
      ];
      // Cars must stay fully off roads/buildings; all other props (including
      // tiles) can sit half-on / half-off — placement is accepted as long as
      // the centre lies in a valid spot.
      const strict = type === 'car';
      outer: for (let y = y0; y <= maxY + gy; y += gy) {
        for (let x = x0; x <= maxX + gx; x += gx) {
          if (newProps.length >= want) break outer;
          const cps = samplePts(x, y);
          // Polygon containment: drop only if no sample point is inside.
          if (!cps.some((p) => pip(p, fillPolygon))) continue;
          if (strict) {
            let blocked = false;
            for (const p of cps) {
              if (!isPlacementValid([p[0], p[1], surfaceZ])) { blocked = true; break; }
            }
            if (blocked) continue;
          } else {
            if (!isPlacementValid([x, y, surfaceZ], type)) continue;
          }
          pushItem(x, y);
        }
      }
    } else {
      // Min-distance enforcement is gated on smartPlace: without it on, the
      // fill is allowed to pack same-type props densely (coexistence).
      // Different-type props never block each other — they coexist by design.
      const enforce = !!smartPlace[type];
      const minD2 = enforce ? widthM * widthM : 0;
      const maxAttempts = Math.min(200000, Math.max(2000, (count > 0 ? count : 200) * 50));
      for (let i = 0; i < maxAttempts && newProps.length < want; i++) {
        const x = minX + Math.random() * (maxX - minX);
        const y = minY + Math.random() * (maxY - minY);
        if (!pip([x, y], fillPolygon)) continue;
        if (!isPlacementValid([x, y, surfaceZ], type)) continue;
        if (enforce) {
          let tooClose = false;
          for (const p of newProps) {
            const dx = p.position[0] - x, dy = p.position[1] - y;
            if (dx * dx + dy * dy < minD2) { tooClose = true; break; }
          }
          if (tooClose) continue;
          // Also avoid overlap with already-placed same-type props.
          for (const p of propsItems) {
            if (p.type !== type) continue;
            const dx = p.position[0] - x, dy = p.position[1] - y;
            if (dx * dx + dy * dy < minD2) { tooClose = true; break; }
          }
          if (tooClose) continue;
        }
        pushItem(x, y);
      }
    }
    if (newProps.length) setPropsItems((p) => [...p, ...newProps]);
    // If the user was filling INTO a custom layer, remember the polygon they
    // drew. The Show-layer-polygons toggle then renders THAT exact shape
    // instead of a convex hull around the placed props.
    if (activeLayerId) {
      const poly = fillPolygon.map(([x, y]) => [x, y]);
      setPropLayers((layers) => layers.map((l) => l.id === activeLayerId ? { ...l, polygon: poly } : l));
    }
    setFillMode('idle'); setFillPolygon([]);
  };

  // Apply smart-placement rules per prop type. Returns the (possibly snapped)
  // position, or null if the placement is rejected.
  //   - flat props (tiles): snap to a grid sized by the tile's W/H so they
  //     tessellate side-by-side without overlap.
  //   - billboard props (trees/canopy/etc): require a minimum centre-to-centre
  //     distance to the nearest already-placed prop of the same type.
  const applySmartPlacement = (pos, type, ignoreId) => {
    if (!smartPlace[type]) return pos;
    const m = PROP_META[type]; if (!m) return pos;
    const o = propSizes[type] || {};
    const heightM = o.h ?? m.size;
    const widthM  = o.w ?? heightM * (m.w / m.h);
    if (m.flat) {
      const gx = Math.max(0.1, widthM);
      const gy = Math.max(0.1, heightM);
      return [Math.round(pos[0] / gx) * gx, Math.round(pos[1] / gy) * gy, pos[2]];
    }
    // Min centre-to-centre distance ≈ widthM (so trees of a given canopy
    // width don't overlap). Reject if any same-type prop is closer.
    const minDist2 = widthM * widthM;
    for (const p of propsItems) {
      if (p.id === ignoreId) continue;
      if (p.type !== type) continue;
      const dx = p.position[0] - pos[0];
      const dy = p.position[1] - pos[1];
      if (dx * dx + dy * dy < minDist2) return null;
    }
    return pos;
  };
  viewRef.current = viewState; // expose latest viewState to gesture handlers
  // keep target in sync if geo changes
  useEffect(() => { setViewState((v) => ({ ...v, target: [v.target[0], v.target[1], targetZ] })); }, [targetZ]);

  // Undo / redo stack of full state snapshots. We snapshot the same object
  // that useViewSettings serialises, so every persisted user change can be
  // rolled back / forward. The window-event listeners are mounted once and
  // read the latest stacks via refs.
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const skipSnapshotRef = useRef(false);
  const lastSnapJsonRef = useRef('');

  const { dirty, save } = useViewSettings('orbit',
    {
      rotationOrbit: viewState.rotationOrbit, rotationX: viewState.rotationX,
      zoom: viewState.zoom, target: viewState.target,
      showBuildings, showRoads, showBorders, heightColors, showIds, showBasemap,
      showPodium, hidePodium1Floor, showFloors, showAoiPlatform, platformHeight,
      showGrid, gridExtent, gridColor, gridWidth, bgColor, showGroundPlane,
      numbersThrough, bldgFill, bldgLine, podiumFill, roadFill, roofWidth, edgeWidth, explodeGap,
      showTrees, fillCutouts, propsItems, propSizes, propColors, propAvoidIntersect, smartPlace,
      propLayers, activeLayerId, layersExploded, layerExplodeGap, showLayerPolygons, showLayerNames, layersInFront,
      photoIncludeUi, flyConfig, savedViews,
      shape, size, basemapStyle,
      archBuildings, archRoads, archBasemap,
    },
    (s) => applySnapshot(s));

  // Shared applier — used by useViewSettings on load AND by undo/redo.
  const applySnapshot = (s) => {
    setViewState((v) => ({
      ...v,
      rotationOrbit: s.rotationOrbit ?? v.rotationOrbit,
      rotationX: s.rotationX ?? v.rotationX,
      zoom: s.zoom ?? v.zoom,
      target: Array.isArray(s.target) ? s.target : v.target,
    }));
    const setIf = (val, setter) => { if (val !== undefined) setter(val); };
    setIf(s.showBuildings, setShowBuildings); setIf(s.showRoads, setShowRoads);
    setIf(s.showBorders, setShowBorders); setIf(s.heightColors, setHeightColors);
    setIf(s.showIds, setShowIds); setIf(s.showBasemap, setShowBasemap);
    setIf(s.showPodium, setShowPodium); setIf(s.showFloors, setShowFloors);
    setIf(s.showAoiPlatform, setShowAoiPlatform);
    setIf(s.platformHeight, setPlatformHeight);
    setIf(s.hidePodium1Floor, setHidePodium1Floor);
    setIf(s.showGrid, setShowGrid);
    setIf(s.gridExtent, setGridExtent); setIf(s.bgColor, setBgColor);
    setIf(s.gridColor, setGridColor); setIf(s.gridWidth, setGridWidth);
    setIf(s.showGroundPlane, setShowGroundPlane);
    setIf(s.numbersThrough, setNumbersThrough);
    setIf(s.bldgFill, setBldgFill); setIf(s.bldgLine, setBldgLine);
    if ('podiumFill' in s) setPodiumFill(s.podiumFill);
    setIf(s.roadFill, setRoadFill);
    setIf(s.roofWidth, setRoofWidth);
    setIf(s.edgeWidth, setEdgeWidth);
    setIf(s.explodeGap, setExplodeGap);
    setIf(s.showTrees, setShowTrees); setIf(s.fillCutouts, setFillCutouts);
    if (Array.isArray(s.propsItems)) setPropsItems(s.propsItems);
    if (s.propSizes && typeof s.propSizes === 'object') setPropSizes(s.propSizes);
    if (s.propColors && typeof s.propColors === 'object') setPropColors(s.propColors);
    if (Array.isArray(s.propLayers)) setPropLayers(s.propLayers);
    if (s.activeLayerId !== undefined) setActiveLayerId(s.activeLayerId);
    if (typeof s.layersExploded === 'boolean') setLayersExploded(s.layersExploded);
    if (typeof s.layerExplodeGap === 'number') setLayerExplodeGap(s.layerExplodeGap);
    if (typeof s.showLayerPolygons === 'boolean') setShowLayerPolygons(s.showLayerPolygons);
    if (typeof s.showLayerNames === 'boolean') setShowLayerNames(s.showLayerNames);
    if (typeof s.layersInFront === 'boolean') setLayersInFront(s.layersInFront);
    if (s.flyConfig && typeof s.flyConfig === 'object') setFlyConfig((f) => ({ ...f, ...s.flyConfig }));
    if (Array.isArray(s.savedViews)) setSavedViews(s.savedViews);
    if (typeof s.photoIncludeUi === 'boolean') setPhotoIncludeUi(s.photoIncludeUi);
    if (typeof s.propAvoidIntersect === 'boolean') setPropAvoidIntersect(s.propAvoidIntersect);
    if (s.smartPlace && typeof s.smartPlace === 'object') setSmartPlace(s.smartPlace);
    setIf(s.shape, setShape); setIf(s.size, setSize);
    setIf(s.basemapStyle, setBasemapStyle);
    setIf(s.archBuildings, setArchBuildings); setIf(s.archRoads, setArchRoads);
    setIf(s.archBasemap, setArchBasemap);
  };

  // Build the snapshot whose changes feed the undo stack.
  const fullSnapshot = {
    rotationOrbit: viewState.rotationOrbit, rotationX: viewState.rotationX,
    zoom: viewState.zoom, target: viewState.target,
    showBuildings, showRoads, showBorders, heightColors, showIds, showBasemap,
    showPodium, hidePodium1Floor, showFloors, showAoiPlatform, platformHeight,
    showGrid, gridExtent, gridColor, gridWidth, bgColor, showGroundPlane,
    numbersThrough, bldgFill, bldgLine, podiumFill, roadFill, roofWidth, edgeWidth, explodeGap,
    showTrees, fillCutouts, propsItems, propSizes, propAvoidIntersect, smartPlace,
    shape, size, basemapStyle,
    archBuildings, archRoads, archBasemap,
  };
  const snapshotJson = JSON.stringify(fullSnapshot);

  // Snapshot pusher — debounced; ignores changes that come from undo/redo.
  useEffect(() => {
    if (skipSnapshotRef.current) { skipSnapshotRef.current = false; return; }
    if (lastSnapJsonRef.current === snapshotJson) return;
    const t = setTimeout(() => {
      lastSnapJsonRef.current = snapshotJson;
      undoStackRef.current.push(JSON.parse(snapshotJson));
      if (undoStackRef.current.length > 200) undoStackRef.current.shift();
      redoStackRef.current = [];
    }, 220);
    return () => clearTimeout(t);
  }, [snapshotJson]);

  // Mount window-event listeners that drive Undo / Redo from the header.
  useEffect(() => {
    const onUndo = () => {
      const stack = undoStackRef.current;
      if (stack.length < 2) return;
      const current = stack.pop();
      redoStackRef.current.push(current);
      const prev = stack[stack.length - 1];
      skipSnapshotRef.current = true;
      lastSnapJsonRef.current = JSON.stringify(prev);
      applySnapshot(prev);
    };
    const onRedo = () => {
      const next = redoStackRef.current.pop();
      if (!next) return;
      undoStackRef.current.push(next);
      skipSnapshotRef.current = true;
      lastSnapJsonRef.current = JSON.stringify(next);
      applySnapshot(next);
    };
    window.addEventListener('app-undo', onUndo);
    window.addEventListener('app-redo', onRedo);
    return () => {
      window.removeEventListener('app-undo', onUndo);
      window.removeEventListener('app-redo', onRedo);
    };
  }, []);

  // basemap bbox in metres: site default for 'none', else derived from shape+size
  const bm = useMemo(() => {
    if (!showBasemap) return null;
    if (shape === 'none') return siteBasemap(geo, basemapStyle);
    const r = shape === 'circle' || shape === 'hexagon' ? size.radius
            : shape === 'square' ? size.half
            : 0;
    const minX = shape === 'rectangle' ? -size.halfX : -r;
    const minY = shape === 'rectangle' ? -size.halfY : -r;
    const maxX = shape === 'rectangle' ?  size.halfX :  r;
    const maxY = shape === 'rectangle' ?  size.halfY :  r;
    return basemapImage(geo, minX, minY, maxX, maxY, basemapStyle);
  }, [showBasemap, shape, size, geo, basemapStyle]);

  // mask polygon: huge outer ring with the shape as a hole; covers basemap
  // outside the shape with the page background colour.
  const maskData = useMemo(() => {
    if (!showBasemap || shape === 'none') return null;
    const big = 5000;
    const outer = [[-big, -big], [big, -big], [big, big], [-big, big], [-big, -big]];
    const inner = shapeRingMeters(shape, size);
    return [{ polygon: [outer, inner] }];
  }, [showBasemap, shape, size]);

  // shared building data (used by extrusion + labels)
  const buildingsData = useMemo(() => geo.buildings.map((b) => {
    const c = b.ring.reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
    return { polygon: b.rings, ring: b.ring, height: b.height, floors: b.floors,
             largeGround: b.largeGround, kind: b.kind, num: b.i,
             podiumHeight: b.podiumHeight,
             centroid: [c[0] / b.ring.length, c[1] / b.ring.length] };
  }), [geo]);
  // hide the selected building from the main extrusion (exploded view replaces it)
  const visibleBuildings = useMemo(() =>
    selectedBldg == null ? buildingsData : buildingsData.filter((b) => b.num !== selectedBldg),
    [buildingsData, selectedBldg]);
  // selected building - exploded floors (ground + N upper floors stacked with gaps)
  const exploded = useMemo(() => {
    if (selectedBldg == null) return [];
    const b = buildingsData.find((bb) => bb.num === selectedBldg);
    if (!b || !b.floors) return [];
    const FLOOR_H = 3.2, GROUND_H = 5.0;
    const GAP = explodeGap;
    const floors = [];
    let z = 0;
    if (b.largeGround) { floors.push({ ring: b.ring, baseZ: z, height: GROUND_H, label: 'Ground floor' }); z += GROUND_H + GAP; }
    for (let i = 1; i <= b.floors; i++) {
      floors.push({ ring: b.ring, baseZ: z, height: FLOOR_H, label: `Floor ${i}` }); z += FLOOR_H + GAP;
    }
    return floors;
  }, [selectedBldg, buildingsData, explodeGap]);
  const selected = selectedBldg == null ? null : buildingsData.find((b) => b.num === selectedBldg);
  const roadsData = useMemo(() => geo.roads.map((rd) => ({ polygon: rd.rings })), [geo]);

  // tree positions: scatter inside AOI but outside building podiums (deterministic seed)
  const treePositions = useMemo(() => {
    if (!showTrees) return [];
    const aoi = geo.aoi[0]; if (!aoi) return [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of aoi) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const trees = [];
    const TARGET = 110, MIN_SEP2 = 16 * 16, MAX_TRY = 6000;
    for (let t = 0; t < MAX_TRY && trees.length < TARGET; t++) {
      const x = minX + rnd() * (maxX - minX);
      const y = minY + rnd() * (maxY - minY);
      if (!pip([x, y], aoi)) continue;
      let bad = false;
      for (const b of geo.buildings) if (pip([x, y], b.podiumRing || b.ring)) { bad = true; break; }
      if (bad) continue;
      for (const r of geo.roads) for (const ring of r.rings) if (pip([x, y], ring)) { bad = true; break; }
      if (bad) continue;
      for (const tr of trees) if ((x - tr.position[0]) ** 2 + (y - tr.position[1]) ** 2 < MIN_SEP2) { bad = true; break; }
      if (bad) continue;
      trees.push({ position: [x, y, (showAoiPlatform ? platformHeight : 0) + 0.05] });
    }
    return trees;
  }, [showTrees, geo, showAoiPlatform, platformHeight]);

  // layer order: basemap -> mask -> roads -> buildings -> aoi -> labels
  const layers = [];
  // Layer-name label data is computed below alongside the slabs, but the
  // TextLayer that draws the labels is appended at the very END of the
  // layers array (see the push right before the layer-building closes).
  // depthTest:false alone isn't enough to keep labels on top of everything
  // — any deck.gl layer drawn LATER in the array can still rasterise over
  // them. Drawing last (with depthTest off too) guarantees the label sits
  // in front of buildings, props, and overlays from the camera.
  let layerLabelData = null;
  // Same trick for the slab itself when `layersInFront` is on — push the
  // PolygonLayer at the end so buildings don't occlude it.
  let layerSlabData = null;
  const bmVisible = bm && !interacting; // hide basemap while rotating
  if (bmVisible) {
    layers.push(new BitmapLayer({
      id: 'bm', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      opacity: archBasemap ? 0.7 : 0.95,
      image: bm.url, bounds: [bm.minX, bm.minY, bm.maxX, bm.maxY],
      desaturate: archBasemap ? 1 : 0,
      tintColor: archBasemap ? [182, 175, 162] : [255, 255, 255],
    }));
  }
  if (bmVisible && maskData) {
    layers.push(new PolygonLayer({
      id: 'mask', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN, data: maskData,
      getPolygon: (d) => d.polygon, extruded: false, filled: true, stroked: false,
      getFillColor: [244, 241, 234, 255], getElevation: 0.05,
    }));
  }
  // surface = whichever z the grid + AOI platform top sit at (declared earlier).
  const bgRgb = hexRgb(bgColor);
  const platformFill = [
    Math.max(0, bgRgb[0] - 18),
    Math.max(0, bgRgb[1] - 18),
    Math.max(0, bgRgb[2] - 18),
    250,
  ];
  // Ground plane: flat polygon painted in bgColor that sits under the buildings.
  // Replaces the old behaviour of tinting the whole canvas — only the site
  // surface picks up the colour now. AOI shape if present, else a padded bbox.
  if (showGroundPlane) {
    let ring = geo.aoi[0];
    if (!ring) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const b of geo.buildings) for (const [x, y] of b.ring) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      const pad = 80;
      ring = [[minX - pad, minY - pad], [maxX + pad, minY - pad], [maxX + pad, maxY + pad], [minX - pad, maxY + pad], [minX - pad, minY - pad]];
    }
    layers.push(new PolygonLayer({
      id: 'ground-plane', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: [{ polygon: ring }],
      getPolygon: (d) => d.polygon.map(([x, y]) => [x, y, -0.02]),
      extruded: false, filled: true, stroked: false,
      getFillColor: [bgRgb[0], bgRgb[1], bgRgb[2], 255],
      updateTriggers: { getFillColor: [bgColor] },
    }));
  }
  // AOI platform: the study area is elevated as a 3D plinth standing above the
  // canvas. We only draw its edges — no fill — so the surface colour underneath
  // (canvas / ground plane) shows through and only the plinth's wireframe
  // silhouette is visible.
  if (showAoiPlatform && geo.aoi.length > 0) {
    layers.push(new PolygonLayer({
      id: 'aoi-platform', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: geo.aoi.map((ring) => ({ polygon: ring })),
      getPolygon: (d) => d.polygon, extruded: true, getElevation: platformHeight,
      filled: false,
      stroked: true, getLineColor: [60, 52, 40, 255], getLineWidth: 1.4, lineWidthUnits: 'pixels',
      wireframe: true, material: false,
      updateTriggers: { getElevation: [platformHeight] },
    }));
  }
  if (showGrid) {
    const SPACING = 25, RANGE = 800;
    const z = surfaceZ + 0.02;
    const lines = [];
    for (let i = -RANGE * 2; i <= RANGE * 2; i += SPACING) {
      lines.push({ path: [[i - RANGE, -RANGE, z], [i + RANGE, RANGE, z]] });
      lines.push({ path: [[i - RANGE, RANGE, z], [i + RANGE, -RANGE, z]] });
    }
    const gc = hexRgb(gridColor);
    layers.push(new PathLayer({
      id: 'grid', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: lines, getPath: (d) => d.path,
      getColor: [gc[0], gc[1], gc[2], 150], widthUnits: 'pixels', getWidth: gridWidth,
      updateTriggers: { getColor: [gridColor], getWidth: [gridWidth] },
    }));
    // mask: hide the grid outside the chosen shape / AOI by painting bgColor over it
    let clipRing = null;
    if (gridExtent === 'shape' && shape !== 'none') clipRing = shapeRingMeters(shape, size);
    else if (gridExtent === 'aoi' && geo.aoi.length > 0) clipRing = geo.aoi[0];
    if (clipRing) {
      const BIG = 5000, zm = surfaceZ + 0.03;
      const outer = [[-BIG, -BIG, zm], [BIG, -BIG, zm], [BIG, BIG, zm], [-BIG, BIG, zm], [-BIG, -BIG, zm]];
      const hole = clipRing.map(([x, y]) => [x, y, zm]);
      layers.push(new PolygonLayer({
        id: 'grid-mask', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        data: [{ polygon: [outer, hole] }],
        getPolygon: (d) => d.polygon, extruded: false, filled: true, stroked: false,
        getFillColor: [bgRgb[0], bgRgb[1], bgRgb[2], 255],
        updateTriggers: { getFillColor: [bgColor] },
      }));
    }
  }
  // Per-building podium predicate: respects both showPodium and the
  // "skip podium on 1-floor / non-residential" toggle. b.floors == null means
  // "1-floor non-residential" in the project's geo model. Hoisted here so the
  // cutout-fill and podium/building layers below all see the same predicate.
  const isOneFloor = (b) => b.floors === 1 || b.floors == null;
  const podiumOn = (b) => showPodium && !(hidePodium1Floor && isOneFloor(b));
  // Cutout fills: pull each building's hole rings out and paint them in the
  // surface colour so the cutouts disappear into the surface (no courtyard hole).
  if (fillCutouts) {
    const cuts = [];
    for (const b of geo.buildings) {
      for (let i = 1; i < b.rings.length; i++) {
        cuts.push({ ring: b.rings[i], podiumHeight: b.podiumHeight, podOn: podiumOn(b) });
      }
    }
    if (cuts.length) {
      layers.push(new PolygonLayer({
        id: 'cutouts', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN, data: cuts,
        getPolygon: (d) => d.ring.map(([x, y]) => [x, y, surfaceZ + (d.podOn ? d.podiumHeight + 0.06 : 0.06)]),
        extruded: false, filled: true, stroked: false,
        getFillColor: [bgRgb[0], bgRgb[1], bgRgb[2], 255],
        updateTriggers: { getPolygon: [showPodium, hidePodium1Floor, surfaceZ], getFillColor: [bgColor] },
      }));
    }
  }
  if (showPodium) {
    // Default podium colour = a slightly darker tint of the building fill, so
    // it visually reads as the ground floor of the same building. If the user
    // picks a custom podium colour via the panel, that overrides.
    const tint = (rgb, dropAmt) => [
      Math.max(0, rgb[0] - dropAmt),
      Math.max(0, rgb[1] - dropAmt),
      Math.max(0, rgb[2] - dropAmt),
    ];
    const buildingBase = archBuildings ? [250, 248, 240] : hexRgb(bldgFill);
    const podiumColor = podiumFill ? hexRgb(podiumFill) : tint(buildingBase, 30);
    layers.push(new PolygonLayer({
      id: 'podium', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: geo.buildings.filter(podiumOn),
      getPolygon: (b) => b.podiumRing.map(([x, y]) => [x, y, surfaceZ]),
      extruded: true, getElevation: (b) => b.podiumHeight,
      filled: true,
      // getFillColor as a function so updateTriggers re-evaluates it whenever
      // podiumFill / bldgFill / archBuildings changes (constant-array form was
      // being diffed too aggressively and the new colour wasn't picked up).
      getFillColor: () => [...podiumColor, 255],
      stroked: true, getLineColor: () => [...hexRgb(archBuildings ? '#0d0907' : bldgLine), 255],
      getLineWidth: archBuildings ? 1.6 : 1.0, lineWidthUnits: 'pixels',
      wireframe: true, material: false,
      updateTriggers: {
        getPolygon: [surfaceZ],
        getFillColor: [archBuildings, bldgFill, podiumFill],
        getLineColor: [archBuildings, bldgLine], getLineWidth: [archBuildings],
      },
    }));
  }
  // Custom-layer slabs: when exploded, draw a translucent polygon at each
  // layer's altitude that wraps the props on that layer, plus a name label
  // at the centroid. Gives an immediate "this is layer N" visual cue.
  if (layersExploded && showLayerPolygons && layerHulls.length > 0) {
    const PALETTE = [
      [76, 196, 220], [120, 196, 96], [220, 168, 76], [220, 96, 140],
      [180, 120, 220], [76, 220, 196], [220, 220, 96], [76, 140, 220],
    ];
    const slabs = layerHulls.map((h) => {
      const idx = propLayers.findIndex((l) => l.id === h.id);
      const layer = propLayers[idx];
      const t = layerTransform(h.id);
      const z = surfaceZ + (idx + 1) * layerExplodeGap - 0.04 + t.dz;
      const polygon = h.polygon.map(([x, y]) => [x + t.dx, y + t.dy]);
      const centroid = [h.centroid[0] + t.dx, h.centroid[1] + t.dy];
      // Layer's own picked colour wins; otherwise rotate through the palette.
      const color = layer?.color ? hexRgb(layer.color) : PALETTE[idx % PALETTE.length];
      // Per-layer alpha (0..1) controls slab fill transparency. Default
      // 0.5 keeps the existing translucent look; setting it to 0 makes
      // that layer's slab effectively invisible (outline only).
      const alpha01 = typeof layer?.alpha === 'number' ? Math.max(0, Math.min(1, layer.alpha)) : 0.5;
      return { ...h, idx, z, color, polygon, centroid, alpha01 };
    });
    const slabLayer = new PolygonLayer({
      id: 'layer-slabs', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: slabs,
      getPolygon: (d) => d.polygon.map(([x, y]) => [x, y, d.z]),
      extruded: false, filled: true, stroked: true,
      getFillColor: (d) => [d.color[0], d.color[1], d.color[2], Math.round(d.alpha01 * 255)],
      // Outline stays mostly opaque so the slab boundary remains readable
      // even when the user dials the fill alpha to near-zero. Scaled
      // gently with alpha so a 0% layer disappears entirely.
      getLineColor: (d) => [d.color[0], d.color[1], d.color[2], Math.max(60, Math.round(d.alpha01 * 240))],
      lineWidthUnits: 'pixels', getLineWidth: 2.4,
      parameters: { depthTest: false, depthMask: false },
      updateTriggers: {
        getPolygon: [surfaceZ, layerExplodeGap, layersExploded],
        getFillColor: [propLayers], getLineColor: [propLayers],
      },
    });
    if (layersInFront) {
      // Defer to end of layers[] so buildings can't paint over.
      layerSlabData = slabLayer;
    } else {
      layers.push(slabLayer);
    }
    if (showLayerNames) layerLabelData = slabs;
  }

  // Polygon-type props (beach / sea). Rendered as PolygonLayer with
  // Chaikin-smoothed vertices so the user-drawn polygon reads as a soft,
  // natural-feeling area instead of straight segments. Pickable for delete /
  // select. Drawn BEFORE the road / buildings so they sit underneath
  // structures, like real terrain.
  const polyPropItems = propsItems.filter((p) => PROP_META[p.type]?.polygon && Array.isArray(p.polygon) && p.polygon.length >= 3 && isLayerVisible(p.layerId));
  if (polyPropItems.length > 0) {
    const smoothCache = new Map();
    const smoothFor = (item) => {
      if (smoothCache.has(item.id)) return smoothCache.get(item.id);
      const out = chaikinSmooth(item.polygon, 3);
      smoothCache.set(item.id, out);
      return out;
    };
    layers.push(new PolygonLayer({
      id: 'poly-props', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: polyPropItems, pickable: true,
      autoHighlight: deleteMode || (selectMode && !selectedPropId),
      highlightColor: moveMode ? [60, 200, 110, 180]
                      : (selectMode || selectedPropId) ? [76, 184, 220, 200]
                      : [220, 60, 60, 140],
      getPolygon: (d) => {
        const t = layerTransform(d.layerId);
        const z = surfaceZ + 0.015 + layerExplodeOffset(d.layerId) + t.dz;
        return smoothFor(d).map(([x, y]) => [x + t.dx, y + t.dy, z]);
      },
      extruded: false, filled: true, stroked: true,
      getFillColor: (d) => {
        const col = d.color || propColors[d.type] || PROP_META[d.type].defaultColor;
        return [...hexRgb(col), 210];
      },
      getLineColor: (d) => {
        const col = d.color || propColors[d.type] || PROP_META[d.type].defaultColor;
        const rgb = hexRgb(col);
        return [Math.max(0, rgb[0] - 50), Math.max(0, rgb[1] - 50), Math.max(0, rgb[2] - 50), 230];
      },
      lineWidthUnits: 'pixels', getLineWidth: 1.2,
      updateTriggers: {
        getPolygon: [surfaceZ, propLayers, layersExploded, layerExplodeGap],
        getFillColor: [propColors], getLineColor: [propColors],
      },
    }));
  }

  // Label (3D word) props. Always-facing-camera TextLayer in Helvetica Neue.
  const labelItems = propsItems.filter((p) => p.type === 'label' && isLayerVisible(p.layerId));
  if (labelItems.length > 0) {
    layers.push(new TextLayer({
      id: 'labels', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: labelItems, pickable: true,
      autoHighlight: deleteMode || (selectMode && !selectedPropId),
      highlightColor: moveMode ? [60, 200, 110, 180]
                      : (selectMode || selectedPropId) ? [76, 184, 220, 200]
                      : [220, 60, 60, 140],
      getPosition: (d) => {
        const t = layerTransform(d.layerId);
        const baseZ = (d.position[2] != null ? d.position[2] : surfaceZ);
        return [d.position[0] + t.dx, d.position[1] + t.dy, baseZ + 0.5 + layerExplodeOffset(d.layerId) + t.dz];
      },
      getText: (d) => d.text || '',
      getSize: (d) => d.fontSize || 16,
      getColor: (d) => {
        const c = d.color || propColors.label || PROP_META.label.defaultColor;
        return [...hexRgb(c), 255];
      },
      fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
      fontWeight: 'bold',
      fontSettings: { sdf: true },
      billboard: true,
      outlineColor: [255, 255, 255, 230], outlineWidth: 4,
      sizeUnits: 'pixels',
      parameters: { depthTest: false },
      updateTriggers: {
        getPosition: [surfaceZ, propLayers, layersExploded, layerExplodeGap],
        getText: [propsItems], getColor: [propColors], getSize: [propsItems],
      },
    }));
  }

  // Placed bicycle lanes — PathLayer. Each entry is a propsItems item with
  // type 'bikelane' and a path array. Line width = propSizes.bikelane.h (m).
  // Colour = propColors.bikelane || defaultColor. Pickable so delete-mode and
  // ⌘-click can remove a lane.
  const bikeLaneItems = propsItems.filter((p) => p.type === 'bikelane' && Array.isArray(p.path) && p.path.length >= 2 && isLayerVisible(p.layerId));
  if (bikeLaneItems.length > 0) {
    const widthM = (propSizes.bikelane?.h ?? PROP_META.bikelane.size);
    const col = propColors.bikelane || PROP_META.bikelane.defaultColor;
    layers.push(new PathLayer({
      id: 'bikelanes', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: bikeLaneItems, pickable: true,
      autoHighlight: deleteMode, highlightColor: [220, 60, 60, 140],
      getPath: (d) => {
        const t = layerTransform(d.layerId);
        return d.path.map(([x, y]) => [x + t.dx, y + t.dy, surfaceZ + 0.03 + layerExplodeOffset(d.layerId) + t.dz]);
      },
      getColor: [...hexRgb(col), 220],
      widthUnits: 'meters', getWidth: widthM,
      capRounded: true, jointRounded: true,
      updateTriggers: {
        getPath: [surfaceZ, propLayers, layersExploded, layerExplodeGap],
        getColor: [propColors], getWidth: [propSizes],
      },
    }));
    // Mini bike pictograms walked along every lane at fixed metre spacing,
    // each rotated to match its segment's direction. Lays flat on the lane.
    const markers = [];
    const SPACING = Math.max(6, widthM * 2.2);
    for (const lane of bikeLaneItems) {
      const lt = layerTransform(lane.layerId);
      const z = surfaceZ + 0.06 + layerExplodeOffset(lane.layerId) + lt.dz;
      let acc = SPACING / 2; // first marker half a step in so it's centred
      for (let i = 1; i < lane.path.length; i++) {
        const [x0, y0] = lane.path[i - 1];
        const [x1, y1] = lane.path[i];
        const segLen = Math.hypot(x1 - x0, y1 - y0);
        if (segLen < 1e-6) continue;
        const ang = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
        while (acc < segLen) {
          const t = acc / segLen;
          markers.push({
            position: [x0 + t * (x1 - x0) + lt.dx, y0 + t * (y1 - y0) + lt.dy, z],
            angle: ang,
            laneId: lane.id,
          });
          acc += SPACING;
        }
        acc -= segLen;
      }
    }
    if (markers.length > 0) {
      layers.push(new IconLayer({
        id: 'bikelane-markers', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        data: markers,
        getPosition: (d) => d.position,
        getIcon: () => ({ url: BIKE_MARKER_URL, width: 40, height: 16, anchorX: 20, anchorY: 8, mask: false }),
        getSize: widthM * 0.7,
        sizeUnits: 'meters', billboard: false,
        getAngle: (d) => d.angle,
        alphaCutoff: 0.02,
        parameters: { depthTest: false },
        updateTriggers: { getPosition: [surfaceZ, propLayers, layersExploded, layerExplodeGap], getSize: [propSizes] },
      }));
    }
  }
  // In-progress bike lane preview — rubber-band from last vertex to cursor.
  if (placeMode === 'bikelane' && bikeLanePath.length > 0) {
    const col = propColors.bikelane || PROP_META.bikelane.defaultColor;
    const widthM = (propSizes.bikelane?.h ?? PROP_META.bikelane.size);
    const previewPath = fillCursor ? [...bikeLanePath, [fillCursor[0], fillCursor[1]]] : bikeLanePath;
    layers.push(new PathLayer({
      id: 'bikelane-preview', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: [{ path: previewPath.map(([x, y]) => [x, y, surfaceZ + 0.08]) }],
      getPath: (d) => d.path,
      getColor: [...hexRgb(col), 200],
      widthUnits: 'meters', getWidth: widthM * 0.85,
      capRounded: true, jointRounded: true,
      parameters: { depthTest: false },
      updateTriggers: { getPath: [fillCursor, bikeLanePath.length] },
    }));
    layers.push(new ScatterplotLayer({
      id: 'bikelane-verts', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: bikeLanePath.map((p, i) => ({ position: [p[0], p[1], surfaceZ + 0.09], i })),
      getPosition: (d) => d.position,
      getRadius: 0.6, radiusUnits: 'meters',
      filled: true, getFillColor: (d) => d.i === 0 ? [255, 220, 60, 240] : [...hexRgb(col), 240],
      stroked: true, getLineColor: [0, 0, 0, 220], getLineWidth: 1, lineWidthUnits: 'pixels',
      parameters: { depthTest: false },
    }));
  }

  // Burjeel wind animation. Each tower emits irregular, organic wave-
  // fronts at ground level that expand outward to a large radius — not
  // perfect circles. The radius is modulated by a sum of two sine
  // harmonics whose phase advances with time, so each wave breathes and
  // morphs as it grows (multi-dimensional harmonic perturbation per
  // sample angle). A second flat fading layer (thicker low-alpha stroke)
  // softens the edges so the waves read as gusts rather than rings.
  // Inflow particles still descend into the tower cap.
  const burjeelItems = propsItems.filter((p) =>
    p.type === 'burjeel' && Array.isArray(p.position) && isLayerVisible(p.layerId));
  if (burjeelItems.length > 0) {
    // Six staggered wave-fronts so a new gust starts every ~0.8 s.
    const WAVE_PHASES = [0, 0.166, 0.333, 0.5, 0.666, 0.833];
    const WAVE_PERIOD_S = 5.2;   // slower for a smoother, gusty feel
    const WAVE_MAX_R    = 110;   // metres — much bigger than before
    const VERTS         = 48;    // smooth polyline around each wave
    const INFLOW_COUNT  = 6;
    const INFLOW_RISE   = 30;
    const INFLOW_PERIOD_S = 1.8;
    const t = animTick / 1000;
    // Small per-burjeel hash so neighbouring towers don't pulse in sync.
    const hash = (s) => {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return ((h >>> 0) / 0xffffffff);
    };
    const waves = [];
    const particles = [];
    for (const b of burjeelItems) {
      const lt = layerTransform(b.layerId);
      const baseZ = (b.position[2] != null ? b.position[2] : surfaceZ) + layerExplodeOffset(b.layerId) + lt.dz;
      const meta = PROP_META.burjeel || {};
      const o = propSizes.burjeel || {};
      const inst = b.instanceSize || {};
      const towerH = inst.h ?? o.h ?? meta.size ?? 45;
      const cx = b.position[0] + lt.dx, cy = b.position[1] + lt.dy;
      const seed = hash(b.id || `${cx},${cy}`);
      // Per-tower noise signature (different harmonics so two burjeels
      // don't ripple identically).
      const f1 = 3 + Math.floor(seed * 4);      // 3..6 lobes
      const f2 = 5 + Math.floor(seed * 5);      // 5..9 lobes
      for (let wi = 0; wi < WAVE_PHASES.length; wi++) {
        const ph = WAVE_PHASES[wi];
        const phase = ((t / WAVE_PERIOD_S) + ph + seed * 0.3) % 1;
        // Ease-out: wave grows fast at first then slows, more wind-like.
        const eased = Math.pow(phase, 0.62);
        const baseR = eased * WAVE_MAX_R;
        const alpha = Math.max(0, Math.pow(1 - phase, 1.4));
        // Angular noise that evolves over time -> waves breathe / morph.
        const ampOuter = 0.18 + (wi % 3) * 0.04;
        const phShift = wi * 0.9 + seed * 6.28;
        const path = [];
        for (let i = 0; i <= VERTS; i++) {
          const angle = ((i % VERTS) / VERTS) * Math.PI * 2;
          const n = Math.sin(angle * f1 + phShift + t * 0.9)
                  + 0.55 * Math.sin(angle * f2 - phShift * 1.3 + t * 1.4)
                  + 0.30 * Math.cos(angle * (f1 + f2) + t * 0.5);
          const r = Math.max(0.5, baseR * (1 + ampOuter * n));
          path.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, baseZ + 0.08]);
        }
        // Two passes: a fat soft halo (low alpha, thick) and a sharper
        // stroke on top so the wave reads from far away too.
        waves.push({ path, alpha: alpha * 0.30, width: 6.5, sharp: false });
        waves.push({ path, alpha: alpha * 0.85, width: 2.2, sharp: true });
      }
      // Inflow particles unchanged in concept, just slightly bigger.
      for (let i = 0; i < INFLOW_COUNT; i++) {
        const phase = ((t / INFLOW_PERIOD_S) + i / INFLOW_COUNT) % 1;
        const angle = (i / INFLOW_COUNT) * Math.PI * 2 + t * 0.6;
        const r = 1.6 + (1 - phase) * 1.6;
        const z = baseZ + towerH + INFLOW_RISE * (1 - phase);
        const alpha = Math.round(Math.max(0, 1 - Math.abs(phase - 0.5) * 2) * 235);
        particles.push({
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
          z, alpha,
        });
      }
    }
    if (waves.length) {
      layers.push(new PathLayer({
        id: 'burjeel-wind-waves', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        data: waves,
        getPath: (d) => d.path,
        getColor: (d) => [120, 180, 220, Math.round(d.alpha * 255)],
        widthUnits: 'pixels', getWidth: (d) => d.width,
        capRounded: true, jointRounded: true,
        parameters: { depthTest: false, depthMask: false },
        updateTriggers: { getPath: [animTick], getColor: [animTick], getWidth: [animTick] },
      }));
    }
    if (particles.length) {
      layers.push(new ScatterplotLayer({
        id: 'burjeel-wind-inflow', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        data: particles,
        getPosition: (d) => [d.x, d.y, d.z],
        getRadius: 0.7,
        radiusUnits: 'meters',
        filled: true, stroked: false,
        getFillColor: (d) => [170, 200, 235, d.alpha],
        parameters: { depthTest: false, depthMask: false },
        updateTriggers: { getPosition: [animTick], getFillColor: [animTick] },
      }));
    }
  }

  // Flat props (floor tiles) are inserted here — BEFORE roads and buildings —
  // so the road and building draw calls come later and visually cover any
  // tile portion that extends onto them, even in top-down camera angles where
  // GL depth sorting doesn't disambiguate co-planar layers.
  const flatPropItemsEarly = propsItems.filter((p) => PROP_META[p.type]?.flat && isLayerVisible(p.layerId));
  if (flatPropItemsEarly.length > 0) {
    const movingIdxFlat = movingPropId
      ? flatPropItemsEarly.findIndex((p) => p.id === movingPropId)
      : -1;
    const selectedIdxFlat = (selectMode || selectedPropId)
      ? flatPropItemsEarly.findIndex((p) => p.id === selectedPropId)
      : -1;
    const highlightFlatIdx = movingIdxFlat >= 0 ? movingIdxFlat : selectedIdxFlat;
    const flatHighlightColor = moveMode ? [60, 200, 110, 180]
      : (selectMode || selectedPropId) ? [76, 184, 220, 200]
      : [220, 60, 60, 140];
    layers.push(new IconLayer({
      id: 'props-flat', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN, data: flatPropItemsEarly,
      pickable: true,
      autoHighlight: deleteMode || (moveMode && !movingPropId) || (selectMode && !selectedPropId),
      highlightColor: flatHighlightColor,
      highlightedObjectIndex: highlightFlatIdx,
      getPosition: (d) => {
        const t = layerTransform(d.layerId);
        const z = (d.position[2] != null ? d.position[2] : surfaceZ) + 0.02 + layerExplodeOffset(d.layerId) + t.dz;
        return [d.position[0] + t.dx, d.position[1] + t.dy, z];
      },
      getIcon: (d) => {
        const m = PROP_META[d.type] || PROP_META.tree;
        const o = propSizes[d.type] || {};
        const inst = d.instanceSize || {};
        const naturalAspect = m.w / m.h;
        const heightM = (inst.h ?? o.h ?? m.size);
        const widthM  = (inst.w ?? o.w ?? (heightM * naturalAspect));
        const stretchedAtlasW = Math.max(1, Math.round(m.h * (widthM / heightM)));
        const url = tintedPropUrls[d.type] || m.icon;
        return { url, width: stretchedAtlasW, height: m.h, anchorY: m.anchorY, mask: false };
      },
      getSize: (d) => {
        const m = PROP_META[d.type] || PROP_META.tree;
        const o = propSizes[d.type] || {};
        return d.instanceSize?.h ?? o.h ?? m.size;
      },
      sizeUnits: 'meters', billboard: false,
      alphaCutoff: 0.02,
      updateTriggers: {
        getPosition: [surfaceZ, propLayers, layersExploded, layerExplodeGap],
        getSize: [propSizes], getIcon: [propSizes, propColors],
      },
    }));
  }
  if (showRoads) {
    layers.push(new PolygonLayer({
      id: 'roads', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN, data: roadsData,
      getPolygon: (d) => d.polygon.map((ring) => ring.map(([x, y]) => [x, y, surfaceZ + 0.05])),
      extruded: false, filled: true,
      stroked: archRoads, getLineColor: [80, 70, 55, 255], getLineWidth: archRoads ? 0.7 : 0,
      lineWidthUnits: 'pixels',
      getFillColor: [...hexRgb(roadFill), 255],
      updateTriggers: {
        getPolygon: [surfaceZ],
        getFillColor: [archRoads, roadFill], getLineWidth: [archRoads],
      },
    }));
  }
  if (showBuildings) {
    layers.push(new PolygonLayer({
      id: 'bldg', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN, data: visibleBuildings,
      pickable: true, autoHighlight: true, highlightColor: [76, 212, 224, 90],
      // Base z = AOI platform top + podium (if shown for this building). The
      // upper volume extrudes from there to the building's total height.
      getPolygon: (d) => {
        const baseZ = surfaceZ + (podiumOn(d) ? d.podiumHeight : 0);
        return d.polygon.map((ring) => ring.map(([x, y]) => [x, y, baseZ]));
      },
      extruded: true,
      getElevation: (d) => podiumOn(d) ? d.height - d.podiumHeight : d.height,
      getFillColor: (d) => {
        const c = archBuildings ? [250, 248, 240]
                : heightColors ? hexRgb(colorForFloors(d.floors))
                : hexRgb(bldgFill);
        return [c[0], c[1], c[2], 255];
      },
      getLineColor: [...hexRgb(archBuildings ? '#0d0907' : bldgLine), 255],
      stroked: true, getLineWidth: archBuildings ? edgeWidth + 0.6 : edgeWidth, lineWidthUnits: 'pixels',
      wireframe: true, // always show every edge so the picked outline colour is visible
      material: { ambient: 1.0, diffuse: 0.2, shininess: 0, specularColor: [0, 0, 0] },
      updateTriggers: {
        getPolygon: [showPodium, hidePodium1Floor, surfaceZ],
        getElevation: [showPodium, hidePodium1Floor],
        getFillColor: [heightColors, archBuildings, bldgFill],
        getLineColor: [archBuildings, bldgLine], getLineWidth: [archBuildings, edgeWidth],
      },
    }));
  }
  if (showBuildings) {
    // Building silhouette outline. We collect three sets of paths:
    //   roofPaths   - top perimeter of every ring (outer + cutouts) at roof z
    //   cutoutBots  - bottom perimeter of every cutout ring at the cutout floor
    //   cutoutVerts - vertical line at every cutout corner from roof to floor
    // Together these give cutouts the same crisp silhouette as the outer rim.
    const roofPaths = [];
    const cutoutBots = [];
    const cutoutVerts = [];
    for (const b of visibleBuildings) {
      const rings = b.polygon || (b.ring ? [b.ring] : []);
      const topZ = surfaceZ + b.height + 0.02;
      // Bottom is slightly ABOVE the cutout fill (0.06) so the bottom outline
      // reads in front of the fill instead of being hidden under it.
      const botZ = surfaceZ + (podiumOn(b) ? b.podiumHeight : 0) + 0.10;
      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        roofPaths.push({ ring, z: topZ });
        if (i > 0) {
          cutoutBots.push({ ring, z: botZ });
          // Compute ring centroid; pull each corner slightly inward toward it
          // so the vertical line floats just inside the cutout wall — depth
          // testing then naturally hides it when the camera can't see into
          // the cutout (e.g. from outside the building's far wall).
          let cx = 0, cy = 0;
          for (const [x, y] of ring) { cx += x; cy += y; }
          cx /= ring.length; cy /= ring.length;
          const EPS = 0.20; // 20 cm inward — enough to escape z-fight
          for (const [x, y] of ring) {
            const dx = cx - x, dy = cy - y;
            const len = Math.hypot(dx, dy) || 1;
            const ox = x + (dx / len) * EPS;
            const oy = y + (dy / len) * EPS;
            cutoutVerts.push({ path: [[ox, oy, topZ], [ox, oy, botZ]] });
          }
        }
      }
    }
    const outlineColor = [...hexRgb(archBuildings ? '#0d0907' : bldgLine), 255];
    const roofPx = archBuildings ? roofWidth + 0.8 : roofWidth;
    layers.push(new PathLayer({
      id: 'bldg-roof-outline', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: roofPaths,
      getPath: (d) => [...d.ring, d.ring[0]].map(([x, y]) => [x, y, d.z]),
      getColor: outlineColor,
      widthUnits: 'pixels', getWidth: roofPx,
      capRounded: true, jointRounded: true,
      updateTriggers: {
        getPath: [surfaceZ], getColor: [bldgLine, archBuildings],
        getWidth: [archBuildings, roofWidth],
      },
    }));
    if (cutoutVerts.length) {
      layers.push(new PathLayer({
        id: 'cutout-verts', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        data: cutoutVerts,
        getPath: (d) => d.path,
        getColor: outlineColor,
        widthUnits: 'pixels', getWidth: roofPx,
        capRounded: true, jointRounded: true,
        // depth-tested: the vertical edges only appear when the camera can
        // actually see into the cutout. Inward-offset positions keep them
        // from z-fighting with the wall surface.
        updateTriggers: {
          getPath: [surfaceZ, showPodium, hidePodium1Floor],
          getColor: [bldgLine, archBuildings],
          getWidth: [archBuildings, roofWidth],
        },
      }));
    }
    if (cutoutBots.length) {
      layers.push(new PathLayer({
        id: 'cutout-bottoms', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        data: cutoutBots,
        getPath: (d) => [...d.ring, d.ring[0]].map(([x, y]) => [x, y, d.z]),
        getColor: outlineColor,
        widthUnits: 'pixels', getWidth: roofPx,
        capRounded: true, jointRounded: true,
        updateTriggers: {
          getPath: [surfaceZ, showPodium, hidePodium1Floor],
          getColor: [bldgLine, archBuildings],
          getWidth: [archBuildings, roofWidth],
        },
      }));
    }
  }
  if (selectedBldg != null && exploded.length > 0) {
    layers.push(new PolygonLayer({
      id: 'exploded', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN, data: exploded,
      pickable: false,
      getPolygon: (d) => d.ring.map(([x, y]) => [x, y, surfaceZ + d.baseZ]),
      extruded: true, getElevation: (d) => d.height,
      getFillColor: [76, 212, 224, 110],
      getLineColor: [22, 96, 112, 200], stroked: true, getLineWidth: 1, lineWidthUnits: 'pixels',
      material: false,
      // Translucent layer + no depth-write + no depth-test so the exploded
      // floors never occlude the surrounding buildings' edges; they read as a
      // ghosted "x-ray" overlay above the site.
      parameters: { depthMask: false, depthTest: false },
      updateTriggers: { getPolygon: [surfaceZ] },
    }));
    // dashed guide lines from each floor up through the stack centroid
    layers.push(new PathLayer({
      id: 'exploded-guides', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: [{ path: [
        [selected.centroid[0], selected.centroid[1], surfaceZ],
        [selected.centroid[0], selected.centroid[1], surfaceZ + exploded.at(-1).baseZ + exploded.at(-1).height + 1],
      ] }],
      getPath: (d) => d.path, getColor: [22, 96, 112, 120],
      widthUnits: 'pixels', getWidth: 1,
    }));
  }
  if (showBorders) {
    layers.push(new PathLayer({
      id: 'aoi', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: geo.aoi.map((ring) => ({ path: ring.map(([x, y]) => [x, y, surfaceZ + 0.15]) })),
      getPath: (d) => d.path, getColor: [196, 57, 47], widthUnits: 'pixels', getWidth: 2,
      updateTriggers: { getPath: [surfaceZ] },
    }));
  }
  if (showFloors) {
    // Horizontal floor lines around each building's outer ring. We iterate
    // visibleBuildings, which already excludes the selected (exploded)
    // building — so the floor lines keep rendering on every OTHER building
    // even while one is opened up. (Previously gated on selectedBldg == null,
    // which made all the floor lines vanish the moment you clicked anything.)
    const FLOOR_H = 3.2, GROUND_H = 5.0;
    const floorPaths = [];
    for (const b of visibleBuildings) {
      if (!b.floors) continue;
      const closed = [...b.ring, b.ring[0]];
      let z = b.largeGround ? GROUND_H : FLOOR_H;
      while (z < b.height - 0.5) {
        floorPaths.push({ path: closed.map(([x, y]) => [x, y, surfaceZ + z]) });
        z += FLOOR_H;
      }
    }
    layers.push(new PathLayer({
      id: 'floor-lines', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: floorPaths, getPath: (d) => d.path,
      getColor: [60, 50, 40, 200], widthUnits: 'pixels', getWidth: 0.7,
    }));
  }
  if (showBuildings && showIds) {
    layers.push(new TextLayer({
      id: 'nums', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN, data: buildingsData,
      getPosition: (d) => [d.centroid[0], d.centroid[1], surfaceZ + d.height + 3],
      updateTriggers: { getPosition: [surfaceZ] },
      getText: (d) => String(d.num), getSize: 11, getColor: [28, 24, 19],
      fontSettings: { sdf: true }, outlineColor: [255, 255, 255, 235], outlineWidth: 4,
      billboard: true,
      // numbersThrough=true -> labels always on top; false -> buildings can occlude them
      parameters: { depthTest: !numbersThrough },
    }));
  }
  if (showTrees && geo.aoi.length > 0) {
    layers.push(new IconLayer({
      id: 'trees', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN, data: treePositions,
      getPosition: (d) => d.position,
      getIcon: () => ({ url: TREE_URL, width: 64, height: 96, anchorY: 96, mask: false }),
      getSize: 8, sizeUnits: 'meters', billboard: true,
    }));
  }
  // In-progress polygon is rendered as a screen-space SVG overlay (see the
  // JSX below). Drawing it inside deck.gl as world-space layers introduced
  // a tiny but visible parallax offset on tilted views (verts sat at
  // surfaceZ + 0.06m, projecting to a slightly different pixel than the
  // click). The SVG overlay reprojects each world vertex via vp.project on
  // every frame, so the dots land exactly under the cursor.
  if (propsItems.length > 0) {
    // Split props by orientation: most face the camera (billboard:true) but
    // floor tiles lay flat on the ground (billboard:false), so they need
    // their own IconLayer. The flat tiles layer was inserted earlier in the
    // layers array (before roads / buildings) so that road and building fills
    // visually cover any tile portion that extends onto them — see "flat
    // props" insertion above the roads layer.
    const billboardItems = propsItems.filter((p) => !PROP_META[p.type]?.flat && p.type !== 'bikelane' && isLayerVisible(p.layerId));
    const flatItems      = propsItems.filter((p) =>  PROP_META[p.type]?.flat && isLayerVisible(p.layerId));
    const propsIconConfig = (id, items, billboard) => {
      // When a prop is picked up in move mode, force-highlight it via
      // highlightedObjectIndex (forces deck.gl to tint that specific feature).
      const movingIdx = movingPropId
        ? items.findIndex((p) => p.id === movingPropId)
        : -1;
      const selectedIdx = (selectMode || selectedPropId)
        ? items.findIndex((p) => p.id === selectedPropId)
        : -1;
      const hlIdx = movingIdx >= 0 ? movingIdx : selectedIdx;
      const hlColor = moveMode ? [60, 200, 110, 180]
        : (selectMode || selectedPropId) ? [76, 184, 220, 200]
        : [220, 60, 60, 140];
      return new IconLayer({
      id, coordinateSystem: COORDINATE_SYSTEM.CARTESIAN, data: items,
      pickable: true,
      autoHighlight: deleteMode || (moveMode && !movingPropId) || (selectMode && !selectedPropId),
      highlightColor: hlColor,
      highlightedObjectIndex: hlIdx,
      getPosition: (d) => {
        const t = layerTransform(d.layerId);
        const z = (d.position[2] != null ? d.position[2] : surfaceZ) + 0.02 + layerExplodeOffset(d.layerId) + t.dz;
        return [d.position[0] + t.dx, d.position[1] + t.dy, z];
      },
      getIcon: (d) => {
        const m = PROP_META[d.type] || PROP_META.tree;
        const o = propSizes[d.type] || {};
        const inst = d.instanceSize || {};
        const naturalAspect = m.w / m.h;
        const heightM = (inst.h ?? o.h ?? m.size);
        const widthM  = (inst.w ?? o.w ?? (heightM * naturalAspect));
        const stretchedAtlasW = Math.max(1, Math.round(m.h * (widthM / heightM)));
        const url = (d.type === 'canopy' && d.variant != null && tintedCanopyUrls[d.variant])
          ? tintedCanopyUrls[d.variant]
          : (tintedPropUrls[d.type] || m.icon);
        return { url, width: stretchedAtlasW, height: m.h, anchorY: m.anchorY, mask: false };
      },
      getSize: (d) => {
        const m = PROP_META[d.type] || PROP_META.tree;
        const o = propSizes[d.type] || {};
        return d.instanceSize?.h ?? o.h ?? m.size;
      },
      sizeUnits: 'meters', billboard,
      alphaCutoff: 0.02,
      updateTriggers: {
        getPosition: [surfaceZ, propLayers, layersExploded, layerExplodeGap],
        getSize: [propSizes], getIcon: [propSizes, propColors],
      },
      });
    };
    // flatItems already pushed earlier (before the roads layer); only push
    // the billboard items here so we don't double-render the tiles.
    if (billboardItems.length) layers.push(propsIconConfig('props-billboard', billboardItems, true));
    // Picked-up indicator: a green ring on the ground centred on the moving
    // prop so it's clearly marked even when the icon partly faces away.
    if (moveMode && movingPropId) {
      const moving = propsItems.find((p) => p.id === movingPropId);
      if (moving) {
        const m = PROP_META[moving.type] || PROP_META.tree;
        const o = propSizes[moving.type] || {};
        const heightM = o.h ?? m.size;
        const widthM  = o.w ?? heightM * (m.w / m.h);
        const ringR = Math.max(widthM, m.flat ? heightM : 1) * 0.7;
        layers.push(new ScatterplotLayer({
          id: 'move-mark', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          data: [moving],
          getPosition: (d) => [d.position[0], d.position[1], (d.position[2] ?? surfaceZ) + 0.04],
          getRadius: ringR,
          radiusUnits: 'meters',
          filled: false, stroked: true,
          getLineColor: [60, 200, 110, 230],
          lineWidthUnits: 'pixels', getLineWidth: 2.2,
          parameters: { depthTest: false },
          updateTriggers: { getPosition: [surfaceZ], getRadius: [propSizes] },
        }));
      }
    }

    // Multi-selection rings — one hollow blue circle around each prop in
    // selectedPropIds. Single highlight (selectedPropId) is already drawn by
    // the IconLayers via highlightedObjectIndex, so we only add rings here
    // for the EXTRA selected items beyond the primary.
    const ringIds = selectedPropIds.filter((id) => id !== selectedPropId);
    if (ringIds.length) {
      const ringItems = ringIds
        .map((id) => propsItems.find((p) => p.id === id))
        .filter(Boolean);
      layers.push(new ScatterplotLayer({
        id: 'multi-sel-rings', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        data: ringItems,
        getPosition: (d) => {
          // For point props use the placed coordinate; for polygon / path
          // props use the first vertex as a hit proxy.
          const z = surfaceZ + 0.05;
          if (Array.isArray(d.position)) return [d.position[0], d.position[1], (d.position[2] ?? surfaceZ) + 0.05];
          if (Array.isArray(d.polygon) && d.polygon[0]) return [d.polygon[0][0], d.polygon[0][1], z];
          if (Array.isArray(d.path) && d.path[0]) return [d.path[0][0], d.path[0][1], z];
          return [0, 0, z];
        },
        getRadius: 1.4,
        radiusUnits: 'meters',
        filled: false, stroked: true,
        getLineColor: [76, 184, 220, 230],
        lineWidthUnits: 'pixels', getLineWidth: 2.4,
        parameters: { depthTest: false },
        updateTriggers: { getPosition: [surfaceZ, propsItems] },
      }));
    }
  }

  // When the "layers in front of buildings" toggle is on, push the slab
  // here at the end so buildings (rendered earlier in the array) can't
  // paint over it from oblique angles.
  if (layerSlabData) layers.push(layerSlabData);

  // Layer-name labels — pushed LAST so they paint over buildings, props,
  // and every earlier layer regardless of camera angle. depthTest:false
  // makes them ignore the z-buffer so even when the centroid is below a
  // tall building the text still reads.
  if (layerLabelData && layerLabelData.length) {
    layers.push(new TextLayer({
      id: 'layer-labels', coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: layerLabelData,
      getPosition: (d) => [d.centroid[0], d.centroid[1], d.z + Math.max(3, layerExplodeGap * 0.4)],
      getText: (d) => d.name,
      getSize: 14, getColor: (d) => [...d.color, 255],
      billboard: true,
      fontSettings: { sdf: true },
      outlineColor: [255, 255, 255, 240], outlineWidth: 4,
      parameters: { depthTest: false, depthMask: false },
    }));
  }

  const clampX = (x) => Math.max(0, Math.min(89, x));        // never go underground
  // Run the camera tour described in the FlyThroughPanel. Each phase
  // either applies an instant state change (showLayerPolygons toggle,
  // layersExploded toggle, …) or smoothly interpolates viewState fields
  // over `durationMs`. The runner uses rAF directly so the camera moves
  // independently of React's commit cycle. Returns a cancel function.
  const runFlyThrough = (cfg) => {
    let cancelled = false;
    const wait = cfg.waitSec * 1000;
    const easeIn  = (t) => t * t;
    const easeOut = (t) => 1 - (1 - t) * (1 - t);
    const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const tiltDuration = (a, b) => Math.max(200, Math.abs(b - a) / Math.max(1, cfg.tiltSpeed) * 1000);
    const phases = [
      { name: 'init', instant: true, onEnter: () => {
        setLayersExploded(false);
        setShowLayerPolygons(false);
        setShowLayerNames(false);
        setViewState((v) => ({ ...v, rotationX: clampX(cfg.optTilt), zoom: cfg.collapsedZoom }));
      }},
      { name: 'wait1', durationMs: wait },
      { name: 'expand', durationMs: 1800, onEnter: () => {
        setLayersExploded(true);
        setShowLayerPolygons(true);
        setShowLayerNames(true);
      }, target: () => ({ rotationX: clampX(cfg.minTilt), zoom: cfg.expandedZoom }), ease: easeInOut },
      { name: 'min->opt', durationMs: tiltDuration(cfg.minTilt, cfg.optTilt),
        target: () => ({ rotationX: clampX(cfg.optTilt) }), ease: easeInOut },
      { name: 'hold_opt', durationMs: wait },
      { name: 'opt->max', durationMs: tiltDuration(cfg.optTilt, cfg.maxTilt),
        target: () => ({ rotationX: clampX(cfg.maxTilt) }), ease: easeInOut },
      { name: 'hold_max', durationMs: wait },
      { name: 'hide_colors', durationMs: wait, onEnter: () => {
        setShowLayerPolygons(false);
        setShowLayerNames(false);
        if (cfg.collapseAtMaxTilt) setLayersExploded(false);
      }},
      { name: 'max->opt', durationMs: tiltDuration(cfg.maxTilt, cfg.optTilt), onEnter: () => {
        setShowLayerPolygons(true);
        setShowLayerNames(true);
        if (cfg.collapseAtMaxTilt) setLayersExploded(true);
      }, target: () => ({ rotationX: clampX(cfg.optTilt) }), ease: easeInOut },
      { name: 'rotate_360', durationMs: Math.max(300, 360 / Math.max(1, cfg.rotSpeed) * 1000),
        relTarget: (s) => ({ rotationOrbit: (Number.isFinite(s.rotationOrbit) ? s.rotationOrbit : 0) + 360 }),
        ease: easeOut },
      { name: 'done', instant: true, onEnter: () => { setFlyPlaying(false); } },
    ];
    let i = 0, startMs = 0, fromVS = null, targetVS = null;
    const step = (now) => {
      if (cancelled) return;
      if (i >= phases.length) { setFlyPlaying(false); return; }
      const p = phases[i];
      if (startMs === 0) {
        startMs = now;
        if (p.onEnter) p.onEnter();
        if (p.instant) { i++; startMs = 0; requestAnimationFrame(step); return; }
        // Snapshot the start state and compute the absolute target for
        // this phase (target() may run after onEnter has changed state).
        fromVS = { ...viewStateRef.current };
        const t = p.target ? p.target() : (p.relTarget ? p.relTarget(fromVS) : null);
        targetVS = t;
      }
      const dur = p.durationMs || 0;
      const tNorm = dur > 0 ? Math.min(1, (now - startMs) / dur) : 1;
      const e = p.ease ? p.ease(tNorm) : tNorm;
      if (targetVS) {
        const next = { ...fromVS };
        for (const k of Object.keys(targetVS)) {
          const a = Number.isFinite(fromVS[k]) ? fromVS[k] : 0;
          const b = Number.isFinite(targetVS[k]) ? targetVS[k] : a;
          next[k] = a + (b - a) * e;
        }
        if ('rotationX' in next) next.rotationX = clampX(next.rotationX);
        setViewState((v) => ({ ...v, ...next }));
      }
      if (tNorm >= 1) { i++; startMs = 0; }
      requestAnimationFrame(step);
    };
    setFlyPlaying(true);
    requestAnimationFrame(step);
    return () => { cancelled = true; setFlyPlaying(false); };
  };

  // Snapshot only the camera fields from the live viewState.
  const cameraOnly = (vs) => ({
    rotationOrbit: vs.rotationOrbit,
    rotationX: vs.rotationX,
    zoom: vs.zoom,
    target: Array.isArray(vs.target) ? [vs.target[0], vs.target[1], vs.target[2] ?? 0] : [0, 0, 0],
  });
  const saveCurrentView = () => {
    const name = (typeof window !== 'undefined' && window.prompt('Name this view', `View ${savedViews.length + 1}`)) || '';
    const trimmed = name.trim();
    if (!trimmed) return;
    setSavedViews((cur) => [...cur, {
      id: Math.random().toString(36).slice(2, 10),
      name: trimmed,
      ...cameraOnly(viewStateRef.current || viewState),
    }]);
  };
  const applyView = (view) => setViewState((v) => ({
    ...v,
    rotationOrbit: Number.isFinite(view.rotationOrbit) ? view.rotationOrbit : v.rotationOrbit,
    rotationX: clampX(Number.isFinite(view.rotationX) ? view.rotationX : v.rotationX),
    zoom: Number.isFinite(view.zoom) ? view.zoom : v.zoom,
    target: Array.isArray(view.target)
      ? [view.target[0] ?? v.target[0], view.target[1] ?? v.target[1], view.target[2] ?? v.target[2] ?? 0]
      : v.target,
  }));
  const renameView = (id) => {
    const cur = savedViews.find((v) => v.id === id);
    if (!cur) return;
    const next = window.prompt('Rename view', cur.name);
    const trimmed = next?.trim();
    if (!trimmed || trimmed === cur.name) return;
    setSavedViews((vs) => vs.map((v) => v.id === id ? { ...v, name: trimmed } : v));
  };
  const deleteView = (id) => {
    setSavedViews((vs) => vs.filter((v) => v.id !== id));
  };

  const setBearing = (b) => setViewState((v) => ({ ...v, rotationOrbit: b }));
  const setPitch = (p) => setViewState((v) => ({ ...v, rotationX: clampX(p) }));
  const zoom = (f) => setViewState((v) => ({ ...v, zoom: Math.min(6, Math.max(-3, v.zoom + (f > 1 ? 0.3 : -0.3))) }));

  const btn = { width: 22, height: 22, lineHeight: '20px', fontSize: 15, padding: 0, cursor: 'pointer',
                border: '1px solid var(--line)', borderRadius: 4, background: 'rgba(255,255,255,0.92)', color: '#3a342c' };

  return (
    <div className="svgwrap" ref={wrapRef}
         style={{ cursor: placeMode ? 'crosshair'
                  : deleteMode ? 'not-allowed'
                  : moveMode ? (movingPropId ? 'crosshair' : 'pointer')
                  : boxSelect ? 'crosshair'
                  : selectMode ? 'pointer'
                  : fillMode === 'drawing' ? 'crosshair'
                  : panMode ? 'grab' : 'default' }}>
      <DeckGL ref={deckRef} views={activeView}
              controller={{
                // 3D orbit uses a custom ctrl-wheel handler (pinch -> zoom-
                // to-cursor) and disables the default scroll zoom. In 2D
                // ortho drawing mode there is no custom handler, so wheel
                // would do nothing — turn deck.gl's scrollZoom on while
                // drawing so the wheel + trackpad zoom normally.
                scrollZoom: isDrawing,
                // While box-select is active, the canvas drag belongs to us
                // (paints the selection rectangle) — disable deck.gl's own
                // drag handlers so they don't fight us. Drag-rotate is also
                // meaningless in a top-down ortho view.
                dragRotate: !panMode && !boxSelect && !isDrawing,
                dragPan: !boxSelect,
                // iPad / touch: two-finger pinch zooms, two-finger twist rotates.
                // touchRotate is off in deck.gl's defaults; we explicitly enable it.
                touchRotate: !isDrawing,
                touchZoom: true,
              }}
              effects={[flatLighting]}
              viewState={viewState}
              onViewStateChange={({ viewState: vs }) => setViewState((cur) => {
                // OrthographicView's viewState can hand back a 2-tuple
                // target; the OrbitView path expects 3-tuple. Normalise and
                // strip any NaN values — once NaN gets into viewState it
                // poisons every subsequent projection and floods the
                // console with "value 'NaN' cannot be parsed" errors.
                const ct = Array.isArray(cur.target) ? cur.target : [];
                const vt = Array.isArray(vs.target) ? vs.target : [];
                const target = [
                  finite(vt[0], finite(ct[0], 0)),
                  finite(vt[1], finite(ct[1], 0)),
                  finite(vt[2], finite(ct[2], 0)),
                ];
                return {
                  ...cur, ...vs, target,
                  zoom: finite(vs.zoom, finite(cur.zoom, 0)),
                  rotationX: clampX(finite(vs.rotationX, finite(cur.rotationX, 55))),
                  rotationOrbit: finite(vs.rotationOrbit, finite(cur.rotationOrbit, 0)),
                };
              })}
              onInteractionStateChange={(s) => setInteracting(!!(s.isDragging || s.isPanning || s.isRotating || s.isZooming))}
              onHover={(info) => {
                if (fillMode === 'drawing' || placeMode === 'bikelane') {
                  const p = computeSurfacePos(info);
                  if (p) setFillCursor([p[0], p[1]]);
                }
              }}
              onClick={(info) => {
                // Vertex-drag just finished — eat this click so it doesn't
                // drop a new waypoint where we let go.
                if (suppressClickRef.current) { suppressClickRef.current = false; return; }
                const mod = info.srcEvent && (info.srcEvent.metaKey || info.srcEvent.ctrlKey || info.srcEvent.shiftKey);
                const isPropPick = info.layer
                  && (info.layer.id === 'props-billboard' || info.layer.id === 'props-flat'
                      || info.layer.id === 'bikelanes' || info.layer.id === 'poly-props' || info.layer.id === 'labels')
                  && info.object;

                // Delete shortcut: Delete mode OR Cmd/Ctrl/Shift + click on a
                // placed prop → remove it. In select mode, the modifier is
                // repurposed for multi-select (handled in the next block).
                if (deleteMode && isPropPick) {
                  setPropsItems((p) => p.filter((pp) => pp.id !== info.object.id));
                  return;
                }
                if (!selectMode && mod && isPropPick) {
                  setPropsItems((p) => p.filter((pp) => pp.id !== info.object.id));
                  return;
                }

                // Select mode: click a prop to open its editor; Cmd/Ctrl/
                // Shift+click toggles the prop in the multi-selection set
                // (without opening the single-item editor on toggle). Click
                // empty space to deselect everything.
                if (selectMode) {
                  if (mod && isPropPick) {
                    const id = info.object.id;
                    setSelectedPropIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
                    // Don't move the editor focus on a toggle; leave whatever
                    // single-item the user already had open (if any).
                    return;
                  }
                  if (isPropPick) {
                    setSelectedPropId(info.object.id);
                    setSelectedPropIds([info.object.id]);
                    return;
                  }
                  setSelectedPropId(null);
                  setSelectedPropIds([]);
                  return;
                }

                // Polygon-fill drawing: clicks add vertices. Click within ~3m
                // of the first vertex (and we have ≥3 verts) closes the loop
                // and advances to the config step.
                if (fillMode === 'drawing') {
                  const fp = computeSurfacePos(info);
                  if (!fp) return;
                  // Close the loop if click lands within 6 m of the first vertex.
                  if (fillPolygon.length >= 3) {
                    const start = fillPolygon[0];
                    const dx = fp[0] - start[0], dy = fp[1] - start[1];
                    if (dx * dx + dy * dy <= 36) { setFillMode('config'); return; }
                  }
                  setFillPolygon((v) => [...v, [fp[0], fp[1]]]);
                  return;
                }

                // Move mode: first click on a prop picks it up; the next click
                // anywhere drops it on the surface at the cursor.
                if (moveMode) {
                  if (movingPropId == null) {
                    if (isPropPick) setMovingPropId(info.object.id);
                    return;
                  }
                  const target = computeSurfacePos(info);
                  if (!target) return;
                  const moving = propsItems.find((p) => p.id === movingPropId);
                  if (!moving) { setMovingPropId(null); return; }
                  const snapped = applySmartPlacement(target, moving.type, moving.id);
                  if (!snapped) {
                    flashRejection(`Too close to another ${PROP_META[moving.type]?.label || moving.type} (smart placement on)`);
                    return;
                  }
                  if (!isPlacementValid(snapped, moving.type)) {
                    flashRejection(PROP_META[moving.type]?.flat
                      ? 'Can\'t drop here — building in the way'
                      : 'Can\'t drop here — building or road in the way');
                    return;
                  }
                  setPropsItems((p) => p.map((pp) => pp.id === movingPropId ? { ...pp, position: snapped } : pp));
                  setMovingPropId(null);
                  return;
                }
                // Placement mode: always snap the prop to the current surface
                // plane (so every prop sits 0 m above the surface). The (x, y)
                // come from unprojecting the cursor against z = surfaceZ. We
                // also pick a random canopy variant so each placed canopy gets
                // a unique tree-top shape.
                // Path / polygon drawing modes (bikelane, beach, sea): each
                // click adds a vertex to the shared bikeLanePath buffer. Enter
                // commits (in the keydown handler below). Esc cancels.
                if (placeMode === 'bikelane' || PROP_META[placeMode]?.polygon) {
                  const target = computeSurfacePos(info); if (!target) return;
                  setBikeLanePath((p) => [...p, [target[0], target[1]]]);
                  return;
                }
                // Label (text) prop: prompt for the word, drop it at the
                // click. Selected-prop editor lets you change text / size /
                // colour later.
                if (placeMode === 'label') {
                  const target = computeSurfacePos(info); if (!target) return;
                  const text = window.prompt('Label text:', 'Label');
                  if (!text) return;
                  setPropsItems((p) => [...p, {
                    id: Math.random().toString(36).slice(2, 10),
                    type: 'label',
                    position: target,
                    text, fontSize: 12,
                    layerId: activeLayerId || null,
                  }]);
                  setPlaceMode(null);
                  return;
                }
                if (placeMode) {
                  const target = computeSurfacePos(info); if (!target) return;
                  const snapped = applySmartPlacement(target, placeMode, null);
                  if (!snapped) {
                    flashRejection(`Too close to another ${PROP_META[placeMode]?.label || placeMode} (smart placement on)`);
                    return;
                  }
                  if (!isPlacementValid(snapped, placeMode)) {
                    flashRejection(PROP_META[placeMode]?.flat
                      ? 'Can\'t place here — building in the way'
                      : 'Can\'t place here — building or road in the way');
                    return;
                  }
                  const next = {
                    id: Math.random().toString(36).slice(2, 10),
                    type: placeMode,
                    position: snapped,
                    layerId: activeLayerId || null,
                  };
                  if (placeMode === 'canopy') {
                    next.variant = Math.floor(Math.random() * CANOPY_URLS.length);
                  }
                  setPropsItems((p) => [...p, next]);
                  return;
                }
                if (info.layer && info.layer.id === 'bldg' && info.object) {
                  setSelectedBldg((prev) => prev === info.object.num ? null : info.object.num);
                } else if (!info.object) {
                  setSelectedBldg(null);
                }
              }}
              getCursor={({ isDragging, isHovering }) =>
                placeMode ? 'crosshair'
                : deleteMode ? (isHovering ? 'not-allowed' : 'default')
                : moveMode ? (movingPropId ? 'crosshair' : (isHovering ? 'grab' : 'default'))
                : panMode ? (isDragging ? 'grabbing' : 'grab')
                : isDragging ? 'grabbing'
                : isHovering ? 'pointer' : 'default'}
              layers={layers} />

      {/* In-progress polygon overlay (screen-space SVG). Vertices are world
          coords; we reproject them every render so they stay glued to the
          ground under the cursor regardless of camera tilt / zoom. */}
      {fillPolygon.length > 0 && (() => {
        const screenVerts = fillPolygon.map(([x, y]) => projectToScreen(x, y)).filter(Boolean);
        if (screenVerts.length === 0) return null;
        const cursorScreen = (fillMode === 'drawing' && fillCursor) ? projectToScreen(fillCursor[0], fillCursor[1]) : null;
        const previewVerts = cursorScreen && screenVerts.length >= 1
          ? [...screenVerts, cursorScreen]
          : screenVerts;
        const CLOSE_PX = 14;
        const firstScreen = screenVerts[0];
        const nearClose = cursorScreen && screenVerts.length >= 3
          ? Math.hypot(cursorScreen[0] - firstScreen[0], cursorScreen[1] - firstScreen[1]) <= CLOSE_PX
          : false;
        const polyD = previewVerts.length >= 3
          ? `M${previewVerts.map(([x, y]) => `${x},${y}`).join(' L')} Z`
          : '';
        const outlineD = `M${screenVerts.map(([x, y]) => `${x},${y}`).join(' L')}`
          + (screenVerts.length >= 3 ? ` L${firstScreen[0]},${firstScreen[1]}` : '');
        return (
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                        pointerEvents: 'none', zIndex: 4 }}>
            {polyD && <path d={polyD} fill="rgba(60,200,110,0.22)" stroke="none" />}
            {/* Solid placed outline */}
            <path d={outlineD} fill="none" stroke="#28a050" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round" />
            {/* Rubber-band: last placed vertex → cursor */}
            {cursorScreen && (
              <line x1={screenVerts[screenVerts.length - 1][0]} y1={screenVerts[screenVerts.length - 1][1]}
                    x2={cursorScreen[0]} y2={cursorScreen[1]}
                    stroke="#28a050" strokeWidth="2" strokeDasharray="4 3"
                    strokeLinecap="round" opacity="0.9" />
            )}
            {/* Close-loop preview: cursor → first vertex when ≥3 verts */}
            {cursorScreen && screenVerts.length >= 3 && (
              <line x1={cursorScreen[0]} y1={cursorScreen[1]}
                    x2={firstScreen[0]} y2={firstScreen[1]}
                    stroke={nearClose ? '#ffc83c' : '#28a050'}
                    strokeWidth={nearClose ? 2.4 : 1.4}
                    strokeDasharray="3 3" opacity={nearClose ? 0.95 : 0.6} />
            )}
            {/* Vertex dots — first is yellow (closing target), rest are green */}
            {screenVerts.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y}
                      r={i === 0 ? (nearClose ? 7.5 : 5.5) : 4}
                      fill={i === 0 ? (nearClose ? '#ffdc3c' : '#ffe65a') : '#28a050'}
                      stroke="#000" strokeOpacity="0.7" strokeWidth="1" />
            ))}
            {/* Cursor preview dot */}
            {cursorScreen && (
              <circle cx={cursorScreen[0]} cy={cursorScreen[1]} r="3.5"
                      fill="#ffffff" stroke="#28a050" strokeWidth="1.4" />
            )}
          </svg>
        );
      })()}

      {/* Live box-select rectangle. Position absolute over the canvas. */}
      {boxRect && (
        <div style={{
          position: 'absolute',
          left: boxRect.x0, top: boxRect.y0,
          width: boxRect.x1 - boxRect.x0, height: boxRect.y1 - boxRect.y0,
          border: '1.5px dashed #4cb8dc',
          background: 'rgba(76, 184, 220, 0.10)',
          pointerEvents: 'none',
          zIndex: 5,
        }} />
      )}

      {/* Bulk-action bar — appears when more than one prop is selected. */}
      {selectedPropIds.length > 1 && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 24, transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(20, 28, 48, 0.95)', color: '#e6efff',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
          padding: '7px 12px', fontSize: 12, zIndex: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>
          <span style={{ fontWeight: 600 }}>{selectedPropIds.length} props selected</span>
          <button onClick={() => {
                    const ids = new Set(selectedPropIds);
                    setPropsItems((items) => items.filter((pp) => !ids.has(pp.id)));
                    setSelectedPropIds([]); setSelectedPropId(null);
                  }}
                  style={{
                    background: '#b03030', color: '#fff', border: 'none',
                    borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                  }}>
            Delete all
          </button>
          <button onClick={() => { setSelectedPropIds([]); setSelectedPropId(null); }}
                  style={{
                    background: 'transparent', color: '#cbd5e1',
                    border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                  }}>
            Clear
          </button>
        </div>
      )}

      {selectedPropId && (() => {
        const p = propsItems.find((pp) => pp.id === selectedPropId);
        if (!p) return null;
        const m = PROP_META[p.type] || {};
        const upd = (changes) => setPropsItems((items) => items.map((pp) => pp.id === selectedPropId ? { ...pp, ...changes } : pp));
        const typeSize = propSizes[p.type] || {};
        const naturalAspect = m.w / m.h;
        const hDefault = typeSize.h ?? m.size;
        const wDefault = typeSize.w ?? +(hDefault * naturalAspect).toFixed(2);
        const hVal = p.instanceSize?.h ?? hDefault;
        const wVal = p.instanceSize?.w ?? wDefault;
        const isPath = !!m.path || !!m.polygon || !!m.text;
        return (
          <div style={{ position: 'absolute', right: 16, top: 'calc(var(--header-inset, 0px) + 16px)',
                        zIndex: 8, background: 'rgba(255,255,255,0.96)', border: '1px solid var(--line)',
                        borderRadius: 8, padding: '10px 12px', boxShadow: '0 4px 14px rgba(0,0,0,0.16)',
                        minWidth: 240, maxWidth: 280, fontSize: 12, color: '#3a342c' }}
               onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          marginBottom: 6, gap: 8 }}>
              <strong style={{ fontSize: 13 }}>{m.label || p.type}</strong>
              <button onClick={() => setSelectedPropId(null)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer',
                               fontSize: 15, color: '#6f685c', padding: 0, lineHeight: 1 }}>×</button>
            </div>
            {!isPath && (
              <>
                <NumStepRow label="X (m)" value={+p.position[0].toFixed(2)} step={1}
                            onChange={(v) => upd({ position: [v, p.position[1], p.position[2]] })} />
                <NumStepRow label="Y (m)" value={+p.position[1].toFixed(2)} step={1}
                            onChange={(v) => upd({ position: [p.position[0], v, p.position[2]] })} />
                <NumStepRow label="H (m)" value={+hVal.toFixed(2)} step={0.5} min={0.1}
                            onChange={(v) => upd({ instanceSize: { ...(p.instanceSize || {}), h: v } })} />
                <NumStepRow label="W (m)" value={+wVal.toFixed(2)} step={0.5} min={0.1}
                            onChange={(v) => upd({ instanceSize: { ...(p.instanceSize || {}), w: v } })} />
                {p.instanceSize && (
                  <button onClick={() => upd({ instanceSize: null })}
                          style={{ fontSize: 10, padding: '2px 6px', border: '1px solid var(--line)',
                                   background: '#fff', borderRadius: 3, cursor: 'pointer', color: '#6f685c',
                                   marginTop: 2 }}>
                    Reset to type default
                  </button>
                )}
              </>
            )}
            {isPath && (
              <div style={{ fontSize: 11, color: '#6f685c', padding: '2px 0' }}>
                Path · {p.path?.length || 0} vertices
              </div>
            )}
            {m.polygon && (
              <>
                <div style={{ fontSize: 11, color: '#6f685c', padding: '2px 0' }}>
                  Polygon · {p.polygon?.length || 0} vertices (smoothed)
                </div>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                gap: 6, padding: '2px 0' }}>
                  <span style={{ color: '#6f685c' }}>Colour</span>
                  <input type="color"
                         value={p.color || propColors[p.type] || m.defaultColor || '#cccccc'}
                         onChange={(e) => upd({ color: e.target.value })}
                         style={{ width: 32, height: 20, border: '1px solid var(--line)', borderRadius: 3, padding: 0, cursor: 'pointer' }} />
                </label>
              </>
            )}
            {m.text && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                gap: 6, padding: '2px 0' }}>
                  <span style={{ color: '#6f685c' }}>Text</span>
                  <input type="text" value={p.text || ''}
                         onChange={(e) => upd({ text: e.target.value })}
                         style={{ flex: 1, fontSize: 11, padding: '2px 5px',
                                  border: '1px solid var(--line)', borderRadius: 3, marginLeft: 8 }} />
                </label>
                <NumStepRow label="Font size (px)" value={p.fontSize || 16} step={2} min={4} max={200}
                            onChange={(v) => upd({ fontSize: v })} />
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                gap: 6, padding: '2px 0' }}>
                  <span style={{ color: '#6f685c' }}>Colour</span>
                  <input type="color"
                         value={p.color || propColors.label || m.defaultColor || '#1a1a1a'}
                         onChange={(e) => upd({ color: e.target.value })}
                         style={{ width: 32, height: 20, border: '1px solid var(--line)', borderRadius: 3, padding: 0, cursor: 'pointer' }} />
                </label>
                <NumStepRow label="X (m)" value={+p.position[0].toFixed(2)} step={1}
                            onChange={(v) => upd({ position: [v, p.position[1], p.position[2]] })} />
                <NumStepRow label="Y (m)" value={+p.position[1].toFixed(2)} step={1}
                            onChange={(v) => upd({ position: [p.position[0], v, p.position[2]] })} />
              </>
            )}
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: 6, padding: '4px 0 2px 0' }}>
              <span style={{ color: '#6f685c' }}>Layer</span>
              <select value={p.layerId || ''} onChange={(e) => upd({ layerId: e.target.value || null })}
                      style={{ fontSize: 11, padding: '2px 4px', flex: 1, marginLeft: 8 }}>
                <option value="">(no layer — on surface)</option>
                {propLayers.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}>
              <button onClick={() => { setPropsItems((items) => items.filter((pp) => pp.id !== selectedPropId)); setSelectedPropId(null); }}
                      style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #b03030',
                               background: '#b03030', color: '#fff', borderRadius: 4, cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          </div>
        );
      })()}
      {(() => {
        const isPolyDraw = !!placeMode && PROP_META[placeMode]?.polygon;
        const isLineDraw = placeMode === 'bikelane';
        const isFillDraw = fillMode === 'drawing';
        if (!isPolyDraw && !isLineDraw && !isFillDraw) return null;
        const buf = isFillDraw ? fillPolygon : bikeLanePath;
        const minNeeded = isLineDraw ? 2 : 3;
        const undo = () => {
          if (isFillDraw) setFillPolygon((v) => v.slice(0, -1));
          else setBikeLanePath((v) => v.slice(0, -1));
        };
        const cancel = () => {
          if (isFillDraw) { setFillMode('idle'); setFillPolygon([]); }
          if (bikeLanePath.length) setBikeLanePath([]);
          if (isLineDraw || isPolyDraw) setPlaceMode(null);
        };
        const done = () => {
          if (buf.length < minNeeded) return;
          if (isFillDraw) { setFillMode('config'); setFillCursor(null); return; }
          if (isLineDraw) {
            setPropsItems((p) => [...p, { id: Math.random().toString(36).slice(2, 10),
              type: 'bikelane', path: bikeLanePath, layerId: activeLayerId || null }]);
            setBikeLanePath([]); setPlaceMode(null); return;
          }
          if (isPolyDraw) {
            setPropsItems((p) => [...p, { id: Math.random().toString(36).slice(2, 10),
              type: placeMode, polygon: bikeLanePath, layerId: activeLayerId || null }]);
            setBikeLanePath([]); setPlaceMode(null); return;
          }
        };
        const label = isPolyDraw ? (PROP_META[placeMode]?.label || placeMode)
                      : isLineDraw ? 'Bicycle lane'
                      : 'Polygon fill';
        const btn = (bg, color, border) => ({
          padding: '7px 12px', fontSize: 12, fontWeight: 600,
          border: `1px solid ${border}`, borderRadius: 4,
          background: bg, color, cursor: 'pointer',
          touchAction: 'manipulation',
        });
        return (
          <div style={{ position: 'absolute', left: '50%',
                        bottom: 'calc(var(--footer-inset, 0px) + 16px)',
                        transform: 'translateX(-50%)',
                        background: 'rgba(255,255,255,0.97)',
                        border: '1px solid var(--line)', borderRadius: 6,
                        padding: '6px 8px', boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                        display: 'flex', gap: 8, alignItems: 'center', zIndex: 50 }}>
            <span style={{ fontSize: 11, color: '#6f685c', marginRight: 4 }}>
              {label} · {buf.length} pt{buf.length === 1 ? '' : 's'}
            </span>
            <button onClick={undo} disabled={buf.length === 0}
                    style={{ ...btn('#fff', '#3a342c', 'var(--line)'),
                             opacity: buf.length === 0 ? 0.45 : 1 }}>
              ↶ Undo last
            </button>
            <button onClick={done} disabled={buf.length < minNeeded}
                    style={{ ...btn(buf.length < minNeeded ? '#a3c8b0' : '#2f6f3e', '#fff', '#2f6f3e'),
                             opacity: buf.length < minNeeded ? 0.7 : 1 }}>
              ✓ Done
            </button>
            <button onClick={cancel}
                    style={btn('#b03030', '#fff', '#b03030')}>
              ✕ Cancel
            </button>
            <div style={{ fontSize: 10, color: '#9a948a', marginLeft: 4 }}>
              tap a vertex to drag it
            </div>
          </div>
        );
      })()}
      {rejectionMsg && (
        <div style={{ position: 'absolute', left: '50%', top: 'calc(var(--header-inset, 0px) + 18px)',
                      transform: 'translateX(-50%)', zIndex: 50,
                      background: 'rgba(176, 48, 48, 0.95)', color: '#fff',
                      padding: '7px 14px', borderRadius: 5, fontSize: 12,
                      boxShadow: '0 2px 10px rgba(0,0,0,0.3)', pointerEvents: 'none',
                      maxWidth: '60%', textAlign: 'center', lineHeight: 1.3 }}
             aria-live="polite">
          {rejectionMsg}
        </div>
      )}
      {selected && (
        <div style={{ position: 'absolute', left: 16, bottom: 'calc(var(--footer-inset, 0px) + 12px)', zIndex: 7,
                      background: 'rgba(255,255,255,0.96)', border: '1px solid var(--line)',
                      borderRadius: 8,
                      padding: infoCollapsed ? '6px 10px' : '12px 14px',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.14)',
                      minWidth: infoCollapsed ? 0 : 200, fontSize: 12, color: '#3a342c',
                      transition: 'padding 0.18s ease' }}
             onMouseDown={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                        marginBottom: infoCollapsed ? 0 : 6 }}>
            <strong style={{ fontSize: 13 }}>Building #{selected.num}</strong>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => setInfoCollapsed((c) => !c)}
                      title={infoCollapsed ? 'expand' : 'collapse'}
                      style={{ border: 'none', background: 'none', cursor: 'pointer',
                               color: '#6f685c', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
                <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden style={{ display: 'block' }}>
                  <g transform={infoCollapsed ? '' : 'rotate(180 8 8)'}
                     fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3,9 8,4 13,9" />
                    <polyline points="3,13 8,8 13,13" />
                  </g>
                </svg>
              </button>
              <button onClick={() => setSelectedBldg(null)} title="close"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 15, color: '#6f685c', padding: 0, lineHeight: 1 }}>×</button>
            </div>
          </div>
          {!infoCollapsed && (
            <>
              <div style={{ lineHeight: 1.6 }}>
                <div>Floors: <b>{selected.floors ?? '—'}</b>{selected.largeGround ? ' + large ground' : ''}</div>
                <div>Height: <b>{selected.height.toFixed(1)} m</b></div>
                {selected.kind === 'special' && <div style={{ color: '#a36a16' }}>Special / landmark building</div>}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: '#9a948a', borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                Floors shown exploded above the site. Click again or click empty space to close.
              </div>
            </>
          )}
        </div>
      )}

      {/* Top-left stack: clickable Layers legend (toggle visibility) and
          Saved Views panel (camera bookmarks). Both sit to the right of
          the Customization panel's collapse tab. Each box is independent
          and only appears when it has rows to show. */}
      {(propLayers.length > 0 || savedViews.length > 0) && (
        <div style={{ position: 'absolute',
                      left: 50,
                      top: 'calc(var(--header-inset, 0px) + 16px)',
                      zIndex: 5,
                      display: 'flex', flexDirection: 'column', gap: 8,
                      maxHeight: 'calc(100% - var(--header-inset, 0px) - var(--footer-inset, 0px) - 32px)',
                      pointerEvents: 'none' }}>
          {propLayers.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.94)',
                          border: '1px solid var(--line)', borderRadius: 6,
                          padding: '6px 8px', fontSize: 11,
                          boxShadow: '0 1px 5px rgba(0,0,0,0.1)',
                          maxWidth: 240, overflowY: 'auto', pointerEvents: 'auto' }}
                 onMouseDown={(e) => e.stopPropagation()}>
              <div style={{ color: '#5e564a', fontWeight: 600, marginBottom: 4,
                            fontSize: 10, letterSpacing: 0.6 }}>LAYERS</div>
              {propLayers.map((l, i) => {
                const defaultColor = ['#4cc4dc','#78c460','#dca84c','#dc608c','#b478dc','#4cdcc4','#dcdc60','#4c8cdc'][i % 8];
                const color = l.color || defaultColor;
                const visible = l.visible !== false;
                return (
                  <div key={l.id}
                       onClick={() => setPropLayers((ls) => ls.map((x) =>
                         x.id === l.id ? { ...x, visible: !visible } : x))}
                       style={{ display: 'flex', alignItems: 'center', gap: 6,
                                padding: '3px 0', cursor: 'pointer',
                                opacity: visible ? 1 : 0.45, color: '#3a342c',
                                userSelect: 'none' }}
                       title={visible ? `Hide ${l.name}` : `Show ${l.name}`}>
                    <span style={{ width: 12, height: 12, borderRadius: 2,
                                   background: color,
                                   border: '1px solid rgba(0,0,0,0.18)',
                                   flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden',
                                   textOverflow: 'ellipsis',
                                   textDecoration: visible ? 'none' : 'line-through' }}>
                      {l.name || 'Untitled'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {savedViews.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.94)',
                          border: '1px solid var(--line)', borderRadius: 6,
                          padding: '6px 8px', fontSize: 11,
                          boxShadow: '0 1px 5px rgba(0,0,0,0.1)',
                          maxWidth: 240, overflowY: 'auto', pointerEvents: 'auto' }}
                 onMouseDown={(e) => e.stopPropagation()}>
              <div style={{ color: '#5e564a', fontWeight: 600, marginBottom: 4,
                            fontSize: 10, letterSpacing: 0.6 }}>VIEWS</div>
              {savedViews.map((view) => (
                <div key={view.id}
                     style={{ display: 'flex', alignItems: 'center', gap: 4,
                              padding: '3px 0', color: '#3a342c', userSelect: 'none' }}>
                  <span onClick={() => applyView(view)}
                        title={`Apply ${view.name}`}
                        style={{ flex: 1, cursor: 'pointer', whiteSpace: 'nowrap',
                                 overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {view.name}
                  </span>
                  <button onClick={() => renameView(view.id)} title="rename"
                          style={{ border: 'none', background: 'transparent',
                                   cursor: 'pointer', color: '#6f685c', padding: 0,
                                   fontSize: 12, lineHeight: 1 }}>✎</button>
                  <button onClick={() => deleteView(view.id)} title="delete"
                          style={{ border: 'none', background: 'transparent',
                                   cursor: 'pointer', color: '#b03030', padding: 0,
                                   fontSize: 13, lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {show('layers') && (
        <LayersPanel items={[
          { label: 'Free orbit 3D', checked: !!freeOrbit, onChange: (v) => onFreeOrbitChange?.(v) },
          { label: 'Buildings', checked: showBuildings, onChange: setShowBuildings },
          { label: 'Podium (ground floor)', checked: showPodium, onChange: setShowPodium },
          { label: 'Skip podium for 1-floor buildings', checked: hidePodium1Floor, onChange: setHidePodium1Floor, indent: true },
          { label: 'Show floors', checked: showFloors, onChange: setShowFloors },
          { label: 'AOI as raised platform', checked: showAoiPlatform, onChange: setShowAoiPlatform },
          { label: 'Surface plane (in bg colour)', checked: showGroundPlane, onChange: setShowGroundPlane },
          { label: 'Roads (traced)', checked: showRoads, onChange: setShowRoads },
          { label: 'Height colours', checked: heightColors, onChange: setHeightColors },
          { label: 'Borders', checked: showBorders, onChange: setShowBorders },
          { label: 'Building #', checked: showIds, onChange: setShowIds },
          { label: 'Trees (random scatter)', checked: showTrees, onChange: setShowTrees },
          { label: 'Basemap (static)', checked: showBasemap, onChange: setShowBasemap },
        ]}>
          {showAoiPlatform && (
            <NumStepRow label="Platform height (m)" value={platformHeight} step={0.5} min={0.1} max={20}
                        onChange={setPlatformHeight} />
          )}
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <div style={{ color: '#3a342c', fontWeight: 600, marginBottom: 4 }}>Basemap shape</div>
          <select value={shape} onChange={(e) => setShape(e.target.value)}
                  style={{ width: '100%', fontSize: 12, padding: '2px', marginBottom: 4 }}>
            <option value="none">Full (site bbox)</option>
            <option value="circle">Circle</option>
            <option value="square">Square</option>
            <option value="rectangle">Rectangle</option>
            <option value="hexagon">Hexagon</option>
          </select>
          {(shape === 'circle' || shape === 'hexagon') && (
            <SizeRow label="radius (m)" value={size.radius} onChange={(v) => setSize((s) => ({ ...s, radius: v }))} />
          )}
          {shape === 'square' && (
            <SizeRow label="½ side (m)" value={size.half} onChange={(v) => setSize((s) => ({ ...s, half: v }))} />
          )}
          {shape === 'rectangle' && (<>
            <SizeRow label="½ width (m)" value={size.halfX} onChange={(v) => setSize((s) => ({ ...s, halfX: v }))} />
            <SizeRow label="½ height (m)" value={size.halfY} onChange={(v) => setSize((s) => ({ ...s, halfY: v }))} />
          </>)}
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <div style={{ color: '#3a342c', fontWeight: 600, marginBottom: 4 }}>Basemap style</div>
          <select value={basemapStyle} onChange={(e) => setBasemapStyle(e.target.value)}
                  style={{ width: '100%', fontSize: 12, padding: '2px' }}>
            <option value="streets-v12">Streets (roads + POIs + labels)</option>
            <option value="outdoors-v12">Outdoors (terrain + labels)</option>
            <option value="light-v11">Light (minimal labels)</option>
            <option value="dark-v11">Dark (minimal labels)</option>
            <option value="satellite-v9">Satellite (no labels)</option>
            <option value="satellite-streets-v12">Satellite + streets</option>
          </select>
          <div style={{ fontSize: 11, color: '#9a948a', marginTop: 3, lineHeight: 1.3 }}>
            (Static image — labels &amp; POIs are baked into the style)
          </div>
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <div style={{ color: '#3a342c', fontWeight: 600, marginBottom: 4 }}>Architectural style</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={archBuildings} onChange={(e) => setArchBuildings(e.target.checked)} /> Buildings
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={archRoads} onChange={(e) => setArchRoads(e.target.checked)} /> Roads
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={archBasemap} onChange={(e) => setArchBasemap(e.target.checked)} /> Basemap
          </label>
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <div style={{ color: '#3a342c', fontWeight: 600, marginBottom: 4 }}>Surface</div>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '2px 0' }}>
            <span style={{ color: '#6f685c' }}>Background</span>
            <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                   style={{ width: 36, height: 22, border: '1px solid var(--line)', borderRadius: 3, padding: 0, cursor: 'pointer' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid pattern
          </label>
          {showGrid && (<>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '2px 0 2px 22px' }}>
              <span style={{ color: '#6f685c' }}>Grid extent</span>
              <select value={gridExtent} onChange={(e) => setGridExtent(e.target.value)}
                      style={{ fontSize: 11, padding: '1px' }}>
                <option value="full">Full canvas</option>
                <option value="shape">Within shape</option>
                <option value="aoi">Within AOI</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '2px 0 2px 22px' }}>
              <span style={{ color: '#6f685c' }}>Grid colour</span>
              <input type="color" value={gridColor} onChange={(e) => setGridColor(e.target.value)}
                     style={{ width: 36, height: 22, border: '1px solid var(--line)', borderRadius: 3, padding: 0, cursor: 'pointer' }} />
            </label>
            <NumStepRow label="Grid thickness (px)" value={gridWidth} step={0.05} min={0.05} max={5}
                        onChange={setGridWidth} indent />
          </>)}
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={fillCutouts} onChange={(e) => setFillCutouts(e.target.checked)} />
            Hide cutouts (fill with surface)
          </label>
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <div style={{ color: '#3a342c', fontWeight: 600, marginBottom: 4 }}>Props library</div>
          <div style={{ fontSize: 11, color: '#9a948a', marginBottom: 5, lineHeight: 1.3 }}>
            Click a prop, then click the canvas to drop it under the cursor.
            Use <b>Delete mode</b> below (or ⌘/Ctrl/Shift-click) to remove placed props. Esc cancels.
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0 4px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={propAvoidIntersect}
                   onChange={(e) => setPropAvoidIntersect(e.target.checked)} />
            Don't allow props to intersect buildings / roads
          </label>
          {placeMode === 'bikelane' && (
            <div style={{ background: '#0e172c', color: '#cbd5e1', padding: '6px 8px',
                          borderRadius: 4, fontSize: 11, lineHeight: 1.35, marginBottom: 6 }}>
              Bicycle lane — click on the canvas to add a waypoint
              ({bikeLanePath.length} placed). Press <b>Enter</b> to finish the lane,
              <b> Esc</b> to cancel.
            </div>
          )}
          {fillMode === 'drawing' && (
            <div style={{ background: '#0e172c', color: '#cbd5e1', padding: '6px 8px',
                          borderRadius: 4, fontSize: 11, lineHeight: 1.35, marginBottom: 6 }}>
              Click on the canvas to add a vertex.
              Click near the first (yellow) vertex or press <b>Enter</b> to close.
              <b> Esc</b> cancels.
            </div>
          )}
          {fillMode === 'config' && (
            <div style={{ background: '#f5f3eb', border: '1px solid var(--line)', padding: 8,
                          borderRadius: 4, marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: '#3a342c', marginBottom: 6 }}>
                Polygon closed ({fillPolygon.length} vertices). Pick a prop and count to fill.
              </div>
              <div style={{ color: '#6f685c', fontSize: 11, marginBottom: 4 }}>Prop</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {Object.entries(PROP_META).map(([k, m]) => (
                  <button key={k} onClick={() => setFillType(k)}
                          title={m.label}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px',
                            fontSize: 11, border: '1px solid var(--line)', borderRadius: 4,
                            background: fillType === k ? '#1a1a1a' : '#fff',
                            color: fillType === k ? '#fff' : '#3a342c', cursor: 'pointer',
                          }}>
                    <img src={m.icon} alt="" style={{ width: 14, height: 14,
                                                       filter: fillType === k ? 'invert(1)' : 'none' }} />
                    {m.label}
                  </button>
                ))}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '2px 0' }}>
                <span style={{ color: '#6f685c', fontSize: 11 }}>Count (0 = auto)</span>
                <input type="number" min={0} value={fillCount}
                       onChange={(e) => setFillCount(Math.max(0, Number(e.target.value) || 0))}
                       style={{ width: 60, fontSize: 11, padding: '1px 4px', textAlign: 'center' }} />
              </label>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                <button onClick={() => { setFillMode('idle'); setFillPolygon([]); }}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 3,
                                 border: '1px solid var(--line)', background: '#fff', cursor: 'pointer', color: '#6f685c' }}>
                  Cancel
                </button>
                <button onClick={() => runPolygonFill(fillType, fillCount)}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 3,
                                 border: '1px solid #2f6f3e', background: '#2f6f3e', color: '#fff', cursor: 'pointer' }}>
                  Fill
                </button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            <button onClick={() => { setDeleteMode((d) => !d); setPlaceMode(null); setMoveMode(false); setMovingPropId(null); }}
                    title="toggle delete mode — click any prop to remove"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '4px 8px', fontSize: 11, border: '1px solid var(--line)',
                      borderRadius: 4,
                      background: deleteMode ? '#b03030' : '#fff',
                      color: deleteMode ? '#fff' : '#3a342c', cursor: 'pointer',
                    }}>
              <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
                <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                      d="M3 4h10M6 4V2.5h4V4M5 4l1 9.5h4L11 4M7 7v4M9 7v4" />
              </svg>
              {deleteMode ? 'Delete ON' : 'Delete mode'}
            </button>
            <button onClick={() => {
                      if (fillMode !== 'idle') { setFillMode('idle'); setFillPolygon([]); }
                      else { setFillMode('drawing'); setFillPolygon([]); setPlaceMode(null); setDeleteMode(false); setMoveMode(false); setMovingPropId(null); }
                    }}
                    title="polygon fill — click on the canvas to draw the area, then choose a prop and count"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '4px 8px', fontSize: 11, border: '1px solid var(--line)',
                      borderRadius: 4,
                      background: fillMode !== 'idle' ? '#2f6f3e' : '#fff',
                      color: fillMode !== 'idle' ? '#fff' : '#3a342c', cursor: 'pointer',
                    }}>
              <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
                <polygon points="2,4 8,1 14,5 13,13 6,15 1,11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              </svg>
              {fillMode === 'drawing'  ? `Drawing — ${fillPolygon.length} vert${fillPolygon.length === 1 ? '' : 's'}`
              : fillMode === 'config'  ? 'Configure fill'
              : 'Polygon fill'}
            </button>
            <button onClick={() => {
                      const next = !selectMode;
                      setSelectMode(next);
                      if (!next) { setSelectedPropId(null); setSelectedPropIds([]); setBoxSelect(false); setBoxRect(null); }
                      setPlaceMode(null); setDeleteMode(false); setMoveMode(false); setMovingPropId(null);
                    }}
                    title="toggle select mode — click to edit one prop; ⌘/Ctrl/Shift+click to add to selection"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '4px 8px', fontSize: 11, border: '1px solid var(--line)',
                      borderRadius: 4,
                      background: selectMode ? '#1860a8' : '#fff',
                      color: selectMode ? '#fff' : '#3a342c', cursor: 'pointer',
                    }}>
              <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
                <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                      d="M2 2l5 12 2-5 5-2z"/>
              </svg>
              {selectMode ? (selectedPropIds.length > 1 ? `Select — ${selectedPropIds.length} props`
                : (selectedPropId ? 'Select — editing' : 'Select — click a prop'))
                : 'Select mode'}
            </button>
            {/* Box-select sub-toggle: only useful while Select mode is on. */}
            {selectMode && (
              <button onClick={() => setBoxSelect((b) => !b)}
                      title="drag a rectangle to select multiple props (Shift+drag to add)"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '4px 8px', fontSize: 11, border: '1px solid var(--line)',
                        borderRadius: 4,
                        background: boxSelect ? '#1860a8' : '#fff',
                        color: boxSelect ? '#fff' : '#3a342c', cursor: 'pointer',
                      }}>
                <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
                  <rect x="2" y="2" width="12" height="12" fill="none"
                        stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.5" rx="1" />
                </svg>
                {boxSelect ? 'Box-select on' : 'Box select'}
              </button>
            )}
            <button onClick={() => { setMoveMode((m) => !m); setMovingPropId(null); setPlaceMode(null); setDeleteMode(false); setSelectMode(false); setSelectedPropId(null); }}
                    title="toggle move mode — click a prop to pick up, click anywhere to drop"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '4px 8px', fontSize: 11, border: '1px solid var(--line)',
                      borderRadius: 4,
                      background: moveMode ? '#2f6f3e' : '#fff',
                      color: moveMode ? '#fff' : '#3a342c', cursor: 'pointer',
                    }}>
              <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
                <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                      d="M8 1v14M1 8h14M5 4l3-3 3 3M5 12l3 3 3-3M4 5L1 8l3 3M12 5l3 3-3 3" />
              </svg>
              {moveMode ? (movingPropId ? 'Move ON — drop' : 'Move ON — pick') : 'Move mode'}
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {Object.entries(PROP_META).map(([k, m]) => (
              <button key={k} title={`Place ${m.label}`}
                      onClick={() => setPlaceMode((p) => p === k ? null : k)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px',
                        fontSize: 11, border: '1px solid var(--line)', borderRadius: 4,
                        background: placeMode === k ? '#1a1a1a' : '#fff',
                        color: placeMode === k ? '#fff' : '#3a342c', cursor: 'pointer',
                      }}>
                <img src={m.icon} alt="" style={{ width: 14, height: 14, filter: placeMode === k ? 'invert(1)' : 'none' }} />
                {m.label}
              </button>
            ))}
          </div>
          {propsItems.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#6f685c' }}>{propsItems.length} placed</span>
              <button onClick={() => setPropsItems([])}
                      style={{ fontSize: 11, padding: '2px 7px', border: '1px solid var(--line)',
                               borderRadius: 3, background: '#fff', cursor: 'pointer', color: '#6f685c' }}>
                Clear all
              </button>
            </div>
          )}
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <div style={{ color: '#3a342c', fontWeight: 600, marginBottom: 4 }}>Prop dimensions (m)</div>
          <div style={{ fontSize: 11, color: '#9a948a', marginBottom: 4, lineHeight: 1.3 }}>
            Enter custom height & width per prop type. Affects existing placements too.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: '2px 8px', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#6f685c' }} />
            <div style={{ fontSize: 10, color: '#9a948a', textAlign: 'center', letterSpacing: 0.5 }}>H</div>
            <div style={{ fontSize: 10, color: '#9a948a', textAlign: 'center', letterSpacing: 0.5 }}>W</div>
            <div style={{ fontSize: 10, color: '#9a948a', textAlign: 'center', letterSpacing: 0.5 }} title="Smart placement: tiles snap to grid; trees/canopy enforce minimum distance">Smart</div>
            <div style={{ fontSize: 10, color: '#9a948a', textAlign: 'center', letterSpacing: 0.5 }} title="Tint colour applied to the prop">Colour</div>
            {Object.entries(PROP_META).map(([k, m]) => {
              const o = propSizes[k] || {};
              const naturalAspect = m.w / m.h;
              const hVal = o.h ?? m.size;
              const wVal = o.w ?? +(hVal * naturalAspect).toFixed(2);
              const setH = (v) => setPropSizes((p) => ({ ...p, [k]: { ...(p[k] || {}), h: v } }));
              const setW = (v) => setPropSizes((p) => ({ ...p, [k]: { ...(p[k] || {}), w: v } }));
              return (
                <Fragment key={k}>
                  <div style={{ fontSize: 11, color: '#3a342c', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <img src={m.icon} alt="" style={{ width: 12, height: 12 }} />
                    {m.label}
                  </div>
                  <input type="number" value={hVal} step={0.5} min={0.1}
                         onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) setH(n); }}
                         style={{ width: 46, fontSize: 11, padding: '1px 3px', textAlign: 'center' }} />
                  <input type="number" value={wVal} step={0.5} min={0.1}
                         onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) setW(n); }}
                         style={{ width: 46, fontSize: 11, padding: '1px 3px', textAlign: 'center' }} />
                  <input type="checkbox" checked={!!smartPlace[k]}
                         onChange={(e) => setSmartPlace((s) => ({ ...s, [k]: e.target.checked }))}
                         title={m.flat
                           ? 'Snap to a grid sized by the tile so they tessellate side-by-side'
                           : 'Enforce minimum distance between props of this type so they don’t overlap'}
                         style={{ margin: '0 auto' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}>
                    <input type="color" value={propColors[k] || '#ffffff'}
                           onChange={(e) => setPropColors((c) => ({ ...c, [k]: e.target.value }))}
                           title="pick a tint colour for this prop"
                           style={{ width: 22, height: 18, border: '1px solid var(--line)', borderRadius: 3, padding: 0, cursor: 'pointer' }} />
                    {propColors[k] && (
                      <button onClick={() => setPropColors((c) => { const n = { ...c }; delete n[k]; return n; })}
                              title="reset to default"
                              style={{ fontSize: 10, padding: '1px 4px', border: '1px solid var(--line)',
                                       background: '#fff', borderRadius: 3, cursor: 'pointer', color: '#6f685c', lineHeight: 1 }}>
                        ↻
                      </button>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
          {(Object.keys(propSizes).length > 0 || Object.keys(propColors).length > 0) && (
            <button onClick={() => { setPropSizes({}); setPropColors({}); }}
                    style={{ marginTop: 4, fontSize: 11, padding: '2px 7px', border: '1px solid var(--line)',
                             borderRadius: 3, background: '#fff', cursor: 'pointer', color: '#6f685c' }}>
              Reset all to defaults
            </button>
          )}
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <div style={{ color: '#3a342c', fontWeight: 600, marginBottom: 4 }}>Custom prop layers</div>
          <div style={{ fontSize: 11, color: '#9a948a', marginBottom: 5, lineHeight: 1.3 }}>
            Group props into named layers. Newly placed / filled props are tagged
            with the active layer. Use "Explode layers" to stack them vertically
            like building floors.
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '2px 0' }}>
            <span style={{ color: '#6f685c' }}>Place into</span>
            <select value={activeLayerId || ''}
                    onChange={(e) => setActiveLayerId(e.target.value || null)}
                    style={{ flex: 1, fontSize: 11, padding: '2px 4px', minWidth: 130 }}>
              <option value="">(no layer — on surface)</option>
              {propLayers.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <input type="text" placeholder="New layer name…" value={newLayerName}
                   onChange={(e) => setNewLayerName(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter' && newLayerName.trim()) {
                       const id = `lyr-${Date.now()}`;
                       setPropLayers((ls) => [...ls, { id, name: newLayerName.trim() }]);
                       setActiveLayerId(id);
                       setNewLayerName('');
                     }
                   }}
                   style={{ flex: 1, fontSize: 11, padding: '2px 5px',
                            border: '1px solid var(--line)', borderRadius: 3 }} />
            <button onClick={() => {
                      const n = newLayerName.trim(); if (!n) return;
                      const id = `lyr-${Date.now()}`;
                      setPropLayers((ls) => [...ls, { id, name: n }]);
                      setActiveLayerId(id);
                      setNewLayerName('');
                    }}
                    style={{ fontSize: 11, padding: '2px 8px', border: '1px solid var(--line)',
                             borderRadius: 3, background: '#fff', cursor: 'pointer', color: '#3a342c' }}>
              + Add
            </button>
          </div>
          {propLayers.length > 0 && (
            <div style={{ marginTop: 6, border: '1px solid var(--line)', borderRadius: 3 }}>
              {propLayers.map((l, i) => {
                const count = propsItems.filter((p) => p.layerId === l.id).length;
                const isActive = l.id === activeLayerId;
                const visible = l.visible !== false;
                const updateLayer = (changes) => setPropLayers((ls) => ls.map((x) => x.id === l.id ? { ...x, ...changes } : x));
                return (
                  <div key={l.id} style={{
                          display: 'flex', flexDirection: 'column',
                          background: isActive ? 'rgba(60, 200, 110, 0.16)' : 'transparent',
                          borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px' }}>
                    <button onClick={() => updateLayer({ visible: !visible })}
                            title={visible ? 'hide this layer' : 'show this layer'}
                            style={{ fontSize: 12, padding: '1px 5px', border: '1px solid var(--line)',
                                     background: '#fff', borderRadius: 3, cursor: 'pointer',
                                     color: visible ? '#3a342c' : '#bdb6a4', lineHeight: 1, opacity: visible ? 1 : 0.6 }}>
                      {visible ? '\u{1F441}' : '\u{2715}'}
                    </button>
                    <span style={{ flex: 1, fontSize: 11, color: visible ? '#3a342c' : '#9a948a',
                                   cursor: 'pointer', textDecoration: visible ? 'none' : 'line-through' }}
                          title="set active"
                          onClick={() => setActiveLayerId(l.id)}>
                      <b>{i + 1}.</b> {l.name}
                    </span>
                    <span style={{ fontSize: 10, color: '#6f685c' }}>{count}</span>
                    {l.polygon && l.polygon.length >= 3 && (
                      <button onClick={() => {
                                setActiveLayerId(l.id);
                                setFillPolygon(l.polygon.map(([x, y]) => [x, y]));
                                setFillMode('config');
                                // close any conflicting modes
                                setPlaceMode(null); setDeleteMode(false);
                                setMoveMode(false); setMovingPropId(null);
                                setSelectMode(false); setSelectedPropId(null);
                              }}
                              title="add more props into this layer's polygon"
                              style={{ fontSize: 10, padding: '1px 5px', border: '1px solid var(--line)',
                                       background: '#fff', borderRadius: 3, cursor: 'pointer', color: '#2f6f3e' }}>
                        + Add
                      </button>
                    )}
                    <button onClick={() => {
                              const nn = prompt('Rename layer', l.name);
                              if (nn && nn.trim()) {
                                setPropLayers((ls) => ls.map((x) => x.id === l.id ? { ...x, name: nn.trim() } : x));
                              }
                            }}
                            title="rename"
                            style={{ fontSize: 10, padding: '1px 4px', border: '1px solid var(--line)',
                                     background: '#fff', borderRadius: 3, cursor: 'pointer', color: '#6f685c' }}>
                      ✎
                    </button>
                    <button onClick={() => {
                              setPropLayers((ls) => ls.filter((x) => x.id !== l.id));
                              setPropsItems((items) => items.map((p) => p.layerId === l.id ? { ...p, layerId: null } : p));
                              if (activeLayerId === l.id) setActiveLayerId(null);
                            }}
                            title="delete layer — props in this layer revert to no layer"
                            style={{ fontSize: 11, padding: '1px 5px', border: '1px solid var(--line)',
                                     background: '#fff', borderRadius: 3, cursor: 'pointer', color: '#b03030', lineHeight: 1 }}>
                      ×
                    </button>
                  </div>
                  {/* per-layer offsets row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px 4px 28px',
                                fontSize: 10, color: '#6f685c' }}>
                    <span title="Shift the layer along the X axis">X</span>
                    <input type="number" step={1} value={l.offsetX || 0}
                           onChange={(e) => updateLayer({ offsetX: Number(e.target.value) || 0 })}
                           style={{ width: 44, fontSize: 10, padding: '1px 3px', textAlign: 'center' }} />
                    <span title="Shift the layer along the Y axis">Y</span>
                    <input type="number" step={1} value={l.offsetY || 0}
                           onChange={(e) => updateLayer({ offsetY: Number(e.target.value) || 0 })}
                           style={{ width: 44, fontSize: 10, padding: '1px 3px', textAlign: 'center' }} />
                    <span title="Extra vertical offset on top of the explode gap">Z</span>
                    <input type="number" step={0.5} value={l.offsetZ || 0}
                           onChange={(e) => updateLayer({ offsetZ: Number(e.target.value) || 0 })}
                           style={{ width: 44, fontSize: 10, padding: '1px 3px', textAlign: 'center' }} />
                    {(l.offsetX || l.offsetY || l.offsetZ) ? (
                      <button onClick={() => updateLayer({ offsetX: 0, offsetY: 0, offsetZ: 0 })}
                              title="reset offsets"
                              style={{ fontSize: 9, padding: '1px 4px', border: '1px solid var(--line)',
                                       background: '#fff', borderRadius: 3, cursor: 'pointer', color: '#6f685c' }}>
                        ↻
                      </button>
                    ) : null}
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span title="layer slab + label colour">
                        <input type="color"
                               value={l.color || ['#4cc4dc','#78c460','#dca84c','#dc608c','#b478dc','#4cdcc4','#dcdc60','#4c8cdc'][i % 8]}
                               onChange={(e) => updateLayer({ color: e.target.value })}
                               style={{ width: 22, height: 16, border: '1px solid var(--line)',
                                        borderRadius: 3, padding: 0, cursor: 'pointer' }} />
                      </span>
                      <input type="range" min={0} max={1} step={0.05}
                             value={typeof l.alpha === 'number' ? l.alpha : 0.5}
                             onChange={(e) => updateLayer({ alpha: Number(e.target.value) })}
                             title={`slab transparency (${Math.round((typeof l.alpha === 'number' ? l.alpha : 0.5) * 100)}%)`}
                             style={{ width: 50, height: 14, accentColor: l.color || '#7a7468' }} />
                    </span>
                  </div>
                  </div>
                );
              })}
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0 2px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={layersExploded}
                   onChange={(e) => setLayersExploded(e.target.checked)}
                   disabled={propLayers.length === 0} />
            <span style={{ color: propLayers.length === 0 ? '#bdb6a4' : '#3a342c' }}>
              Explode layers vertically
            </span>
          </label>
          {layersExploded && propLayers.length > 0 && (
            <NumStepRow label="Layer gap (m)" value={layerExplodeGap} step={1} min={0} max={100}
                        onChange={setLayerExplodeGap} indent />
          )}
          {layersExploded && propLayers.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0 2px 22px', cursor: 'pointer' }}>
              <input type="checkbox" checked={showLayerPolygons}
                     onChange={(e) => setShowLayerPolygons(e.target.checked)} />
              <span style={{ color: '#3a342c' }}>Show layer polygons</span>
            </label>
          )}
          {layersExploded && propLayers.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0 2px 22px', cursor: 'pointer' }}>
              <input type="checkbox" checked={showLayerNames}
                     onChange={(e) => setShowLayerNames(e.target.checked)} />
              <span style={{ color: '#3a342c' }}>Show layer names</span>
            </label>
          )}
          {layersExploded && propLayers.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0 2px 22px', cursor: 'pointer' }}
                   title="When on, layer slabs and names paint over buildings from any camera angle">
              <input type="checkbox" checked={layersInFront}
                     onChange={(e) => setLayersInFront(e.target.checked)} />
              <span style={{ color: '#3a342c' }}>Layers in front of buildings</span>
            </label>
          )}
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <div style={{ color: '#3a342c', fontWeight: 600, marginBottom: 4 }}>Colours</div>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '2px 0' }}>
            <span style={{ color: '#6f685c' }}>Building fill</span>
            <input type="color" value={bldgFill}
                   onChange={(e) => { setBldgFill(e.target.value); if (heightColors) setHeightColors(false); }}
                   style={{ width: 32, height: 20, border: '1px solid var(--line)', borderRadius: 3, padding: 0, cursor: 'pointer' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '2px 0' }}>
            <span style={{ color: '#6f685c' }}>Building outline</span>
            <input type="color" value={bldgLine}
                   onChange={(e) => { setBldgLine(e.target.value); if (archBuildings) setArchBuildings(false); }}
                   style={{ width: 32, height: 20, border: '1px solid var(--line)', borderRadius: 3, padding: 0, cursor: 'pointer' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '2px 0' }}>
            <span style={{ color: '#6f685c' }}>Podium fill</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {podiumFill && (
                <button onClick={() => setPodiumFill(null)} title="reset to building colour"
                        style={{ fontSize: 10, padding: '1px 5px', border: '1px solid var(--line)',
                                 background: '#fff', borderRadius: 3, cursor: 'pointer', color: '#6f685c' }}>
                  ↻
                </button>
              )}
              <input type="color" value={podiumFill || bldgFill}
                     onChange={(e) => setPodiumFill(e.target.value)}
                     style={{ width: 32, height: 20, border: '1px solid var(--line)', borderRadius: 3, padding: 0, cursor: 'pointer' }} />
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '2px 0' }}>
            <span style={{ color: '#6f685c' }}>Road</span>
            <input type="color" value={roadFill}
                   onChange={(e) => setRoadFill(e.target.value)}
                   style={{ width: 32, height: 20, border: '1px solid var(--line)', borderRadius: 3, padding: 0, cursor: 'pointer' }} />
          </label>
          <div style={{ fontSize: 11, color: '#9a948a', marginTop: 2, lineHeight: 1.3 }}>
            Picking building fill / outline disables Height colours / Architectural. Podium ↻ resets it to follow the building.
          </div>
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <div style={{ color: '#3a342c', fontWeight: 600, marginBottom: 4 }}>Line thickness</div>
          <NumStepRow label="Roof outline (px)" value={roofWidth} step={0.2} min={0.4} max={10}
                      onChange={setRoofWidth} />
          <NumStepRow label="Building edges (px)" value={edgeWidth} step={0.2} min={0.2} max={6}
                      onChange={setEdgeWidth} />
          <div style={{ fontSize: 11, color: '#9a948a', marginTop: 2, lineHeight: 1.3 }}>
            Roof outline draws the building silhouette; edges control every other wireframe line.
          </div>
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <div style={{ color: '#3a342c', fontWeight: 600, marginBottom: 4 }}>Photo export</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={photoIncludeUi}
                   onChange={(e) => setPhotoIncludeUi(e.target.checked)} />
            Include UI panels in saved photo
          </label>
          <div style={{ fontSize: 11, color: '#9a948a', marginTop: 2, lineHeight: 1.3 }}>
            Use the camera icon in the bottom-right to save the current view as PNG.
            Default capture is canvas-only at full pixel resolution; with this on, the
            UI panels are baked into the image.
          </div>
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <div style={{ color: '#3a342c', fontWeight: 600, marginBottom: 4 }}>Floor explode</div>
          <NumStepRow label="Gap between floors (m)" value={explodeGap} step={0.2} min={0} max={20}
                      onChange={setExplodeGap} />
          <div style={{ fontSize: 11, color: '#9a948a', marginTop: 2, lineHeight: 1.3 }}>
            Vertical gap used when a building is clicked open into its floors.
          </div>
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <div style={{ color: '#3a342c', fontWeight: 600, marginBottom: 4 }}>Labels</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={numbersThrough} onChange={(e) => setNumbersThrough(e.target.checked)} />
            Building #s always visible
          </label>
          <div style={{ fontSize: 11, color: '#9a948a', marginTop: 2, lineHeight: 1.3 }}>
            (Off = buildings can hide the number; turn the camera to see it)
          </div>
        </LayersPanel>
      )}
      {show('legend') && <Legend geo={geo} />}
      {/* Camera-tour (fly-through) panel — slides in from the right edge.
          Collapsed = a slim vertical tab on the right; expanded = a wide
          drawer with the configurable parameters and a Play button. */}
      <FlyThroughPanel open={flyOpen} setOpen={setFlyOpen}
                       config={flyConfig} setConfig={setFlyConfig}
                       playing={flyPlaying}
                       onPlay={() => {
                         if (flyAbortRef.current) flyAbortRef.current();
                         flyAbortRef.current = runFlyThrough(flyConfig);
                       }}
                       onStop={() => {
                         if (flyAbortRef.current) flyAbortRef.current();
                         flyAbortRef.current = null;
                       }} />

      {/* Full-height right-hand control stack. Top → bottom:
            (1) Compass   (2) Rotation + Zoom tall sliders
            (3) Gizmo3D   (4) Target X + Y tall sliders   (5) Target Z tall slider
            (6) Hand / Reset / Photo   (7) Save settings */}
      <div style={{ position: 'absolute', right: 16,
                    top: 'calc(var(--header-inset, 0px) + 14px)',
                    bottom: 'calc(var(--footer-inset, 0px) + 12px)',
                    zIndex: 6,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 8,
                    transition: 'top 0.22s ease, bottom 0.22s ease' }}
           onMouseDown={(e) => e.stopPropagation()}>

        {/* Row 1 — Compass */}
        {show('compass') && <Compass bearing={finite(viewState.rotationOrbit, 0)} onBearing={setBearing} />}

        {/* Row 2 — Rotation + Zoom + Tilt tall sliders */}
        {(show('compass') || show('zoom') || show('tilt')) && (
          <div style={{ display: 'flex', gap: 1, alignItems: 'stretch',
                        flex: 1, minHeight: 0, width: 108 }}>
            {show('compass') && (
              <TallSlider label="Rot°" value={finite(viewState.rotationOrbit, 0)}
                          min={0} max={360} step={1} wrap color="#dc8a3a"
                          valueFmt={(v) => Math.round(((v % 360) + 360) % 360)}
                          onChange={(v) => setBearing(((v % 360) + 360) % 360)} />
            )}
            {show('zoom') && (
              <TallSlider label="Zoom" value={finite(viewState.zoom, 0)}
                          min={-3} max={6} step={0.1} color="#3a8fdc"
                          onChange={(z) => setViewState((vs) => ({ ...vs, zoom: Math.max(-3, Math.min(6, z)) }))} />
            )}
            {show('tilt') && (
              <TallSlider label="Tilt°" value={finite(viewState.rotationX, 55)}
                          min={0} max={89} step={1} color="#7a6fd0"
                          valueFmt={(v) => Math.round(v)}
                          onChange={(p) => setPitch(p)} />
            )}
          </div>
        )}

        {/* Row 3 — Gizmo3D (visual XYZ orientation indicator) */}
        {show('gizmo') && (
          <Gizmo3D bearing={finite(viewState.rotationOrbit, 0)} pitch={finite(viewState.rotationX, 55)}
                   onSet={({ bearing, pitch }) => setViewState((v) => ({
                     ...v,
                     rotationOrbit: bearing != null ? bearing : v.rotationOrbit,
                     rotationX: pitch != null ? clampX(pitch) : v.rotationX,
                   }))} />
        )}

        {/* Row 4 — Target X + Y + Z tall sliders */}
        {show('gizmo') && (
          <div style={{ display: 'flex', gap: 1, alignItems: 'stretch',
                        flex: 1, minHeight: 0, width: 108 }}>
            <TallSlider label="X" value={finite(viewState.target?.[0], 0)}
                        min={-2000} max={2000} step={5} color="#d04a3a"
                        valueFmt={(v) => Math.round(v)}
                        onChange={(x) => setViewState((vs) => {
                          const t = Array.isArray(vs.target) ? [...vs.target] : [0, 0, 0];
                          t[0] = x; return { ...vs, target: t };
                        })} />
            <TallSlider label="Y" value={finite(viewState.target?.[1], 0)}
                        min={-2000} max={2000} step={5} color="#3a8f4a"
                        valueFmt={(v) => Math.round(v)}
                        onChange={(y) => setViewState((vs) => {
                          const t = Array.isArray(vs.target) ? [...vs.target] : [0, 0, 0];
                          t[1] = y; return { ...vs, target: t };
                        })} />
            <TallSlider label="Z" value={finite(viewState.target?.[2], 0)}
                        min={-100} max={500} step={1} color="#3a6fd0"
                        valueFmt={(v) => Math.round(v)}
                        onChange={(z) => setViewState((vs) => {
                          const t = Array.isArray(vs.target) ? [...vs.target] : [0, 0, 0];
                          t[2] = z; return { ...vs, target: t };
                        })} />
          </div>
        )}

        {/* Row 6 — Hand, Reset, Save photo */}
        <div style={{ display: 'flex', gap: 5 }}>
          <button title="hand tool — drag to pan instead of rotate"
                  onClick={() => setPanMode((p) => !p)}
                  style={{ ...btn, width: 28, height: 28, lineHeight: '26px',
                           background: panMode ? '#1a1a1a' : 'rgba(255,255,255,0.92)',
                           color: panMode ? '#fff' : '#3a342c' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: 'middle' }} aria-hidden>
              <path fill="currentColor" d="M9 11V4.5a1.5 1.5 0 0 1 3 0V11h.5V3.5a1.5 1.5 0 0 1 3 0V11h.5V5.5a1.5 1.5 0 0 1 3 0v8.4c0 4.36-3.14 7.6-7.5 7.6-3.5 0-5.13-1.96-6.7-4.55l-1.74-2.86a1.5 1.5 0 0 1 2.45-1.72L6.5 14V6.5a1.5 1.5 0 0 1 3 0V11Z"/>
            </svg>
          </button>
          <button title="reset camera to default view"
                  onClick={resetCamera}
                  style={{ ...btn, width: 28, height: 28, lineHeight: '26px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: 'middle' }} aria-hidden>
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    d="M20 11A8 8 0 1 0 6.3 17.7M20 4v6h-6"/>
            </svg>
          </button>
          <button title={photoIncludeUi ? 'save PNG of current view (incl. UI)' : 'save PNG of current view (no UI)'}
                  onClick={savePhoto}
                  style={{ ...btn, width: 28, height: 28, lineHeight: '26px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: 'middle' }} aria-hidden>
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    d="M3 8h3l2-3h8l2 3h3v12H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
            </svg>
          </button>
        </div>

        {/* Row 7 — Save view (named camera bookmark) + Save settings */}
        {show('save') && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <button onClick={saveCurrentView}
                    title="bookmark the current camera position (X, Y, Z, tilt, zoom, rotation) under a name"
                    style={{ ...btn, padding: '5px 8px', fontSize: 11,
                             background: '#fff', color: '#3a342c' }}>
              Save view
            </button>
            <SaveButton dirty={dirty} save={save} />
          </div>
        )}
      </div>
    </div>
  );
}

// XYZ orientation gizmo: Y-up convention (matches Three.js / the user's reference).
// X = east (red), Y = up (green), Z = north (blue). Three coloured arrows with
// triangle tips and labels at the tips. Click an axis to align the view.
function Gizmo3D({ bearing, pitch, onSet }) {
  const L = 26, HEAD = 6;
  // Bake any non-finite input (NaN from a transient view-swap, undefined
  // from a fresh OrthographicView's onViewStateChange) into a safe value
  // before the trig — otherwise polygon `points` strings end up like
  // "NaN,NaN ..." and the SVG attribute setter spam-rejects them.
  const safe = (v, fb) => (typeof v === 'number' && isFinite(v) ? v : fb);
  const pitchN = safe(pitch, 0), bearingN = safe(bearing, 0);
  const p = (pitchN * Math.PI) / 180;
  const horiz = (az) => { const a = ((az - bearingN) * Math.PI) / 180; return [Math.sin(a) * L, -Math.cos(a) * Math.cos(p) * L]; };
  const items = [
    { v: horiz(90),                       color: '#d04a3a', label: 'X', click: () => onSet({ bearing: 90 }) },
    { v: [0, -Math.sin(p) * L],           color: '#3a8f4a', label: 'Y', click: () => onSet({ pitch: 0 }) },
    { v: horiz(0),                        color: '#3a6fd0', label: 'Z', click: () => onSet({ bearing: 0 }) },
  ].sort((a, b) => a.v[1] - b.v[1]); // far axes first so near labels sit on top

  const arrow = (v, color, label, onClick) => {
    const len = Math.hypot(v[0], v[1]) || 0.0001;
    const ux = v[0] / len, uy = v[1] / len;
    const tipX = v[0], tipY = v[1];
    const baseX = tipX - ux * HEAD, baseY = tipY - uy * HEAD;
    const px = -uy * HEAD * 0.55, py = ux * HEAD * 0.55;
    const tri = `${tipX.toFixed(1)},${tipY.toFixed(1)} ${(baseX + px).toFixed(1)},${(baseY + py).toFixed(1)} ${(baseX - px).toFixed(1)},${(baseY - py).toFixed(1)}`;
    const lx = v[0] + ux * 9, ly = v[1] + uy * 9;
    return (
      <g style={{ cursor: 'pointer' }} onClick={onClick}>
        <line x1="0" y1="0" x2={tipX.toFixed(1)} y2={tipY.toFixed(1)} stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <polygon points={tri} fill={color} />
        <text x={lx.toFixed(1)} y={ly.toFixed(1)} fontSize="12" fontWeight="700" fill={color}
              textAnchor="middle" dominantBaseline="middle">{label}</text>
      </g>
    );
  };

  return (
    <div title="orientation · click an axis to align (X→east, Y→top-down, Z→north)"
         style={{ background: 'rgba(255,255,255,0.92)', borderRadius: 8,
                  border: '1px solid var(--line)', boxShadow: '0 1px 5px rgba(0,0,0,0.15)', padding: 3 }}
         onMouseDown={(e) => e.stopPropagation()}>
      <svg width="86" height="86" viewBox="-44 -44 88 88">
        <circle r="2.4" fill="#26211a" />
        {items.map((it) => <g key={it.label}>{arrow(it.v, it.color, it.label, it.click)}</g>)}
      </svg>
    </div>
  );
}

// Click-and-hold button: fires once on press, then repeats with an
// accelerating cadence until the user lets go. Multi-clicks still work
// naturally — every onMouseDown fires the step immediately.
function HoldButton({ onStep, children, title, style, disabled }) {
  const timer = useRef(null);
  const stop = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => stop, []);
  const start = (e) => {
    if (disabled) return;
    e.preventDefault();
    onStep();
    let delay = 320;
    const tick = () => {
      onStep();
      delay = Math.max(35, Math.round(delay * 0.85));
      timer.current = setTimeout(tick, delay);
    };
    timer.current = setTimeout(tick, 320);
  };
  // user-select:none + touchAction:manipulation prevents the browser from
  // selecting the +/− glyph as text when the user multi-clicks or drags,
  // and skips the long-press context menu on touch devices.
  const noSelect = {
    userSelect: 'none', WebkitUserSelect: 'none', msUserSelect: 'none',
    WebkitTouchCallout: 'none', touchAction: 'manipulation',
  };
  return (
    <button type="button" disabled={disabled} title={title}
            onMouseDown={start} onMouseUp={stop} onMouseLeave={stop}
            onTouchStart={start} onTouchEnd={stop} onTouchCancel={stop}
            onContextMenu={(e) => e.preventDefault()}
            style={{ ...noSelect, ...style }}>{children}</button>
  );
}

// Tall vertical drag-bar: top of the track = max, bottom = min. Click /
// drag anywhere on the track to set the value absolutely. Above and below
// the track sit +/− HoldButtons (click, multi-click, OR press-and-hold).
// Editable numeric input below pins the exact value.
function TallSlider({ label, value, min, max, step = 1, color = '#7a7468',
                     wrap = false, onChange, valueFmt }) {
  const trackRef = useRef(null);
  const v = Number.isFinite(value) ? value : (min + max) / 2;
  const clamp = (n) => {
    if (!Number.isFinite(n)) return v;
    if (wrap) return ((n % 360) + 360) % 360;
    return Math.max(min, Math.min(max, n));
  };
  const startDrag = (e) => {
    const track = trackRef.current; if (!track) return;
    const isTouch = !!e.touches;
    if (!isTouch) e.preventDefault();
    const r = track.getBoundingClientRect();
    const setFromY = (cy) => {
      const ratio = Math.max(0, Math.min(1, (r.bottom - cy) / r.height));
      let next = min + ratio * (max - min);
      if (step) next = Math.round(next / step) * step;
      onChange(clamp(next));
    };
    const onMove = (ev) => {
      const cy = ev.clientY ?? ev.touches?.[0]?.clientY ?? 0;
      setFromY(cy);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    setFromY(e.clientY ?? e.touches?.[0]?.clientY ?? 0);
  };
  const ratio = Math.max(0, Math.min(1, (v - min) / (max - min)));
  const inc = (sign) => onChange(clamp(v + sign * step));
  const btnStyle = {
    width: 22, height: 18, lineHeight: '16px',
    padding: 0, fontSize: 13, fontWeight: 700,
    border: '1px solid var(--line)', borderRadius: 3,
    background: '#fff', color: '#3a342c', cursor: 'pointer',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  flex: 1, height: '100%', minWidth: 0,
                  userSelect: 'none', WebkitUserSelect: 'none' }}>
      <div style={{ fontSize: 9, color: '#5e564a', letterSpacing: 1.3,
                    textTransform: 'uppercase', fontWeight: 600,
                    textShadow: '0 0 4px rgba(255,255,255,0.9)' }}>{label}</div>
      <HoldButton onStep={() => inc(+1)} title={`${label} +`} style={btnStyle}>+</HoldButton>
      {/* EQ-style stack of glowing segments. The whole track is a single
          drag target (cursor Y absolutely maps to value, same as before);
          each segment is also clickable as a quick way to jump to its
          level. The indicator line glows at the current value. */}
      <div ref={trackRef} onMouseDown={startDrag} onTouchStart={startDrag}
           style={{ position: 'relative', width: 22, flex: 1, minHeight: 70,
                    border: '1px solid #1c1726', borderRadius: 7,
                    background: '#0c0a14',
                    boxShadow: 'inset 0 0 8px rgba(0,0,0,0.55), 0 0 4px rgba(0,0,0,0.25)',
                    cursor: 'ns-resize',
                    touchAction: 'none',
                    padding: '3px 3px',
                    display: 'flex', flexDirection: 'column-reverse',
                    gap: 2 }}>
        {Array.from({ length: 22 }, (_, i) => {
          // Segment threshold from min (i=0) to max (i=21). Below or equal
          // to v -> 'on' (glowing), above -> 'off' (dim).
          const threshold = min + ((i + 1) / 22) * (max - min);
          const on = v + 1e-9 >= threshold;
          const dim = `${color}25`; // ~15% alpha hex shorthand-ish (browsers parse)
          return (
            <div key={i}
                 onClick={(e) => {
                   e.stopPropagation();
                   // Click a tick -> jump value to that segment's level.
                   onChange(clamp(min + ((i + 1) / 22) * (max - min)));
                 }}
                 style={{ flex: 1, minHeight: 3,
                          borderRadius: 2,
                          background: on ? color : dim,
                          opacity: on ? 0.95 : 0.55,
                          boxShadow: on ? `0 0 6px ${color}, 0 0 2px ${color}` : 'none',
                          transition: 'background 70ms ease, box-shadow 70ms ease, opacity 70ms ease' }} />
          );
        })}
        {/* Glowing indicator line at the current value. Sits above the
            segments so dragging it visually tracks the cursor. */}
        <div style={{ position: 'absolute', left: -2, right: -2,
                      top: `${(1 - ratio) * 100}%`, transform: 'translateY(-50%)',
                      height: 2, background: '#fff', borderRadius: 2,
                      boxShadow: `0 0 8px ${color}, 0 0 2px #fff`,
                      pointerEvents: 'none' }} />
      </div>
      <HoldButton onStep={() => inc(-1)} title={`${label} −`} style={btnStyle}>−</HoldButton>
      <input type="number" step={step}
             value={valueFmt ? valueFmt(v) : (Math.round(v * 100) / 100)}
             onChange={(e) => {
               const n = Number(e.target.value);
               if (Number.isFinite(n)) onChange(clamp(n));
             }}
             onWheel={(e) => e.currentTarget.blur()}
             style={{ width: 32, fontSize: 10, padding: '1px 1px', textAlign: 'center',
                      border: '1px solid #c8c2b3', borderRadius: 3 }} />
    </div>
  );
}

// Slide-in drawer from the right edge with the camera-tour controls.
// Collapsed = a slim ▶ tab on the right; expanded = a 240 px drawer
// with each tour parameter as an editable number, the collapse-on-max-
// tilt checkbox, and a Play / Stop button.
function FlyThroughPanel({ open, setOpen, config, setConfig, playing, onPlay, onStop }) {
  const upd = (patch) => setConfig((c) => ({ ...c, ...patch }));
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="camera tour"
              onMouseDown={(e) => e.stopPropagation()}
              style={{ position: 'absolute', left: 0,
                       // Sits BELOW the Customization collapse tab so the
                       // two left-edge tabs don't overlap.
                       top: 'calc(var(--header-inset, 0px) + 60px)',
                       zIndex: 7, background: 'rgba(255,255,255,0.94)',
                       border: '1px solid var(--line)', borderLeft: 'none',
                       borderRadius: '0 6px 6px 0', padding: '8px 7px',
                       cursor: 'pointer', color: '#3a342c',
                       boxShadow: '0 1px 5px rgba(0,0,0,0.1)',
                       display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                       fontSize: 14, lineHeight: 1, userSelect: 'none' }}>
        <span style={{ fontWeight: 700 }}>▶</span>
        <span style={{ writingMode: 'vertical-rl', textOrientation: 'mixed',
                       fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase',
                       color: '#5e564a', fontWeight: 600 }}>Tour</span>
      </button>
    );
  }
  const numRow = (label, key, min, max, step, suffix) => (
    <label style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', gap: 8, fontSize: 12,
                    padding: '3px 0', color: '#3a342c' }}>
      <span>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input type="number" step={step} min={min} max={max}
               value={config[key] ?? ''}
               onChange={(e) => upd({ [key]: Number(e.target.value) })}
               style={{ width: 64, fontSize: 12, padding: '2px 4px', textAlign: 'right',
                        border: '1px solid var(--line)', borderRadius: 3 }} />
        {suffix && <span style={{ color: '#6f685c', fontSize: 11 }}>{suffix}</span>}
      </span>
    </label>
  );
  return (
    <div style={{ position: 'absolute', left: 0,
                  top: 'calc(var(--header-inset, 0px) + 16px)',
                  bottom: 'calc(var(--footer-inset, 0px) + 12px)',
                  zIndex: 7,
                  background: 'rgba(255,255,255,0.96)',
                  border: '1px solid var(--line)', borderLeft: 'none',
                  borderRadius: '0 6px 6px 0',
                  padding: '0 12px 10px 12px',
                  boxShadow: '2px 0 10px rgba(0,0,0,0.12)',
                  width: 248, fontSize: 12, color: '#3a342c',
                  overflowY: 'auto',
                  animation: 'flyslide 180ms ease-out' }}
         onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <div style={{ position: 'sticky', top: 0, zIndex: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    margin: '0 -12px 10px -12px', padding: '8px 12px',
                    background: 'rgba(58, 62, 70, 0.97)', color: '#f1f5f9',
                    borderBottom: '1px solid #1f2937' }}>
        <div style={{ fontWeight: 600, fontSize: 12, letterSpacing: 0.3 }}>Camera tour</div>
        <button onClick={() => setOpen(false)} title="hide"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer',
                         color: '#cbd5e1', padding: 0, fontSize: 18, lineHeight: 1 }}>‹</button>
      </div>
      {numRow('Min tilt',         'minTilt',       0, 89,  1, '°')}
      {numRow('Optimal tilt',     'optTilt',       0, 89,  1, '°')}
      {numRow('Max tilt',         'maxTilt',       0, 89,  1, '°')}
      {numRow('Tilt speed',       'tiltSpeed',     1, 120, 1, '°/s')}
      {numRow('Rotation speed',   'rotSpeed',      1, 180, 1, '°/s')}
      {numRow('Expanded zoom',    'expandedZoom', -3,  6, 0.1, '')}
      {numRow('Collapsed zoom',   'collapsedZoom',-3,  6, 0.1, '')}
      {numRow('Wait at each pose','waitSec',       0, 30, 0.5, 's')}
      <label style={{ display: 'flex', alignItems: 'center', gap: 7,
                      padding: '6px 0', cursor: 'pointer', fontSize: 12 }}>
        <input type="checkbox" checked={!!config.collapseAtMaxTilt}
               onChange={(e) => upd({ collapseAtMaxTilt: e.target.checked })} />
        <span>Collapse layers at max tilt</span>
      </label>
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        {playing ? (
          <button onClick={onStop}
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid #b03030',
                           background: '#b03030', color: '#fff', borderRadius: 4,
                           cursor: 'pointer', fontWeight: 600 }}>
            ■ Stop
          </button>
        ) : (
          <button onClick={onPlay}
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid #2f6f3e',
                           background: '#2f6f3e', color: '#fff', borderRadius: 4,
                           cursor: 'pointer', fontWeight: 600 }}>
            ▶ Play
          </button>
        )}
      </div>
    </div>
  );
}

function SizeRow({ label, value, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '2px 0' }}>
      <span style={{ color: '#6f685c' }}>{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)}
             style={{ width: 64, fontSize: 12, padding: '1px 3px' }} />
    </label>
  );
}

// −/+ stepper with editable numeric input, used for platform height + grid thickness.
function NumStepRow({ label, value, step = 1, min = -Infinity, max = Infinity, onChange, indent = false }) {
  const round = (v) => Math.round(v * 1000) / 1000;
  const clamp = (v) => Math.max(min, Math.min(max, v));
  const btn = {
    width: 20, height: 20, lineHeight: '18px', fontSize: 13, padding: 0, cursor: 'pointer',
    border: '1px solid var(--line)', borderRadius: 3, background: '#fff', color: '#3a342c',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 6, padding: indent ? '2px 0 2px 22px' : '2px 0' }}>
      <span style={{ color: '#6f685c' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <button style={btn} onClick={() => onChange(round(clamp(value - step)))}>−</button>
        <input type="number" value={value} step={step} min={min} max={max}
               onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) onChange(round(clamp(n))); }}
               style={{ width: 50, fontSize: 12, padding: '1px 3px', textAlign: 'center' }} />
        <button style={btn} onClick={() => onChange(round(clamp(value + step)))}>+</button>
      </div>
    </div>
  );
}
