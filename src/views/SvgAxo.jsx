import { useEffect, useMemo, useRef, useState } from 'react';
import { colorForFloors } from '../geo.js';
import { Legend, ZoomBar, Compass, SaveButton, ControlStack, useViewSettings } from '../controls.jsx';

// Axonometric: world (x east, y north, z up) -> screen, viewed from above so
// north/east recede toward the top-back (looking from the SW-above).
const A = Math.PI / 6; // 30°
const COSA = Math.cos(A), SINA = Math.sin(A);
const ZS = 1.0;
const iso = (x, y, z = 0) => [(x - y) * COSA, -(x + y) * SINA - z * ZS];

function signedArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2;
}
// darken a hex colour by factor f (0..1)
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

export default function SvgAxo({ geo }) {
  const [showIds, setShowIds] = useState(false);
  const [bearing, setBearing] = useState(0);
  const base = useMemo(() => buildBase(geo), [geo]);
  const scene = useMemo(() => project(base, bearing), [base, bearing]);

  const [t, setT] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef(null);
  const wrapRef = useRef(null);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey) setT((p) => ({ ...p, k: Math.min(20, Math.max(0.2, p.k * Math.exp(-e.deltaY * 0.01))) }));
      else setT((p) => ({ ...p, x: p.x - e.deltaX, y: p.y - e.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const onDown = (e) => { drag.current = { sx: e.clientX, sy: e.clientY, x0: t.x, y0: t.y }; };
  const onMove = (e) => { if (!drag.current) return; const d = drag.current; setT((p) => ({ ...p, x: d.x0 + (e.clientX - d.sx), y: d.y0 + (e.clientY - d.sy) })); };
  const onUp = () => { drag.current = null; };

  const { dirty, save } = useViewSettings('svg',
    { zoom: t.k, bearing, panX: t.x, panY: t.y },
    (s) => { setT({ k: s.zoom ?? 1, x: s.panX ?? 0, y: s.panY ?? 0 }); setBearing(s.bearing ?? 0); });

  return (
    <div className="svgwrap" ref={wrapRef} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
      <svg width="100%" height="100%" viewBox={scene.viewBox} preserveAspectRatio="xMidYMid meet">
        <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
          {/* ground: roads + aoi */}
          <g fill="#d8d2c4" stroke="#b3aa99" strokeWidth={0.5} fillRule="evenodd">
            {scene.roads.map((d, i) => <path key={'r' + i} d={d} />)}
          </g>
          <path d={scene.aoi} fill="none" stroke="#c4392f" strokeWidth={1.2} strokeDasharray="6 5" opacity={0.55} />
          {/* building faces, painter-ordered */}
          {scene.faces.map((f, i) => (
            <polygon key={i} points={f.pts} fill={f.fill} stroke="#3a322a" strokeWidth={0.4} strokeLinejoin="round" />
          ))}
          {showIds && scene.labels.map((l) => (
            <text key={'t' + l.i} x={l.x} y={l.y} fontSize={7} fill="#1c1813" textAnchor="middle" dominantBaseline="middle">{l.i}</text>
          ))}
        </g>
      </svg>

      <Legend geo={geo} />
      <ControlStack>
        <SaveButton dirty={dirty} save={save} />
        <label style={{ fontSize: 12, background: 'rgba(255,255,255,0.85)', padding: '5px 9px',
                        borderRadius: 5, border: '1px solid var(--line)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showIds} onChange={(e) => setShowIds(e.target.checked)} /> building #
        </label>
        <ZoomBar onStep={(f) => setT((p) => ({ ...p, k: Math.min(20, Math.max(0.2, p.k * f)) }))} />
        <Compass bearing={bearing} onBearing={setBearing} />
      </ControlStack>
    </div>
  );
}

function buildBase(geo) {
  let sx = 0, sy = 0, n = 0, maxH = 0;
  for (const b of geo.buildings) { for (const [x, y] of b.ring) { sx += x; sy += y; n++; } if (b.height > maxH) maxH = b.height; }
  const C = [sx / n, sy / n];
  let R = 0;
  for (const b of geo.buildings) for (const [x, y] of b.ring) R = Math.max(R, Math.hypot(x - C[0], y - C[1]));
  return { geo, C, R, maxH };
}

function project(base, bearing) {
  const { geo, C, R, maxH } = base;
  const a = (bearing * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const rot = (x, y) => [C[0] + (x - C[0]) * ca - (y - C[1]) * sa, C[1] + (x - C[0]) * sa + (y - C[1]) * ca];
  const P = (x, y, z = 0) => { const [rx, ry] = rot(x, y); return iso(rx, ry, z); };
  const fmt = (arr) => arr.map(([a2, b2]) => `${a2.toFixed(1)},${b2.toFixed(1)}`).join(' ');
  const ringPath = (ring) => 'M' + ring.map(([x, y]) => { const [px, py] = P(x, y, 0); return `${px.toFixed(1)},${py.toFixed(1)}`; }).join('L') + 'Z';

  const roads = geo.roads.map((rd) => rd.rings.map(ringPath).join(' '));
  const aoi = geo.aoi.map(ringPath).join(' ');

  // buildings: per-building walls (back-face culled) + roof, painter-ordered
  const items = [];
  for (const b of geo.buildings) {
    let ring = b.ring; if (signedArea(ring) < 0) ring = [...ring].reverse(); // CCW
    const h = b.height;
    const roofCol = colorForFloors(b.floors), wallCol = shade(roofCol, 0.74);
    const faces = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const [wx1, wy1] = rot(ring[i][0], ring[i][1]);
      const [wx2, wy2] = rot(ring[i + 1][0], ring[i + 1][1]);
      const dx = wx2 - wx1, dy = wy2 - wy1;
      if (dy - dx >= 0) continue; // camera at SW: keep walls with outward normal toward camera
      const quad = [iso(wx1, wy1, 0), iso(wx2, wy2, 0), iso(wx2, wy2, h), iso(wx1, wy1, h)];
      faces.push({ pts: fmt(quad), fill: wallCol });
    }
    const roof = ring.map(([x, y]) => P(x, y, h));
    faces.push({ pts: fmt(roof), fill: roofCol });
    const cw = ring.reduce((s, [x, y]) => { const [rx, ry] = rot(x, y); return [s[0] + rx, s[1] + ry]; }, [0, 0]).map((v) => v / ring.length);
    const depth = cw[0] + cw[1]; // along view direction (SW->NE)
    items.push({ depth, faces, i: b.i, labelPt: iso(cw[0], cw[1], h) });
  }
  items.sort((p, q) => q.depth - p.depth); // far (large x+y) first, near last
  const faces = items.flatMap((it) => it.faces);
  const labels = items.map((it) => ({ i: it.i, x: it.labelPt[0], y: it.labelPt[1] }));

  // stable viewBox from the bounding circle (so rotation spins within a fixed frame)
  const cP = iso(C[0], C[1], 0);
  const hw = R * (COSA * 1.45) + 30, hh = R * (SINA * 1.2) + maxH + 30;
  const viewBox = `${(cP[0] - hw).toFixed(1)} ${(cP[1] - hh).toFixed(1)} ${(2 * hw).toFixed(1)} ${(2 * hh).toFixed(1)}`;
  return { roads, aoi, faces, labels, viewBox };
}
