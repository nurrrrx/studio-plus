import { useEffect, useMemo, useRef, useState } from 'react';
import { colorForFloors, siteBasemap } from '../geo.js';
import { Legend, ZoomBar, Compass, SaveButton, ControlStack, LayersPanel, useViewSettings } from '../controls.jsx';

// Top-down 2D plan: world (x east, y north) -> screen (x, -y) so north is up.
const plan = ([x, y]) => [x, -y];

export default function Plan2D({ geo, chrome = {} }) {
  const show = (k) => chrome[k] !== false; // chrome widget visible unless explicitly false
  const [showIds, setShowIds] = useState(true);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showRoads, setShowRoads] = useState(true);
  const [heightColors, setHeightColors] = useState(true);
  const [showBorders, setShowBorders] = useState(true);
  const [showBasemap, setShowBasemap] = useState(false);
  const [bearing, setBearing] = useState(0); // map rotation, degrees CW (where north points)
  const { buildings, roads, aoi, viewBox, center } = useMemo(() => buildScene(geo), [geo]);
  const bm = useMemo(() => siteBasemap(geo), [geo]);
  const [cx, cy] = center;

  const [t, setT] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey) setT((p) => ({ ...p, k: Math.min(20, Math.max(0.2, p.k * Math.exp(-e.deltaY * 0.01))) }));
      else setT((p) => ({ ...p, x: p.x - e.deltaX, y: p.y - e.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  useEffect(() => {
    const guard = (e) => { if (e.ctrlKey) e.preventDefault(); };
    window.addEventListener('wheel', guard, { passive: false });
    return () => window.removeEventListener('wheel', guard);
  }, []);

  const onDown = (e) => { drag.current = { sx: e.clientX, sy: e.clientY, x0: t.x, y0: t.y }; };
  const onMove = (e) => {
    if (!drag.current) return;
    const d = drag.current;
    setT((p) => ({ ...p, x: d.x0 + (e.clientX - d.sx), y: d.y0 + (e.clientY - d.sy) }));
  };
  const onUp = () => { drag.current = null; };

  const { dirty, save } = useViewSettings('plan',
    { zoom: t.k, bearing, panX: t.x, panY: t.y },
    (s) => { setT({ k: s.zoom ?? 1, x: s.panX ?? 0, y: s.panY ?? 0 }); setBearing(s.bearing ?? 0); });

  return (
    <div className="svgwrap" ref={wrapRef} onMouseDown={onDown} onMouseMove={onMove}
         onMouseUp={onUp} onMouseLeave={onUp}>
      <svg width="100%" height="100%" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
        <g transform={`translate(${t.x} ${t.y}) scale(${t.k}) rotate(${bearing} ${cx} ${cy})`}>
          {showBasemap && (
            <image href={bm.url} x={bm.minX} y={-bm.maxY} width={bm.maxX - bm.minX} height={bm.maxY - bm.minY}
                   preserveAspectRatio="none" opacity={0.95} />
          )}
          {showBorders && aoi.map((d, i) => (
            <path key={'a' + i} d={d} fill="none" stroke="#c4392f" strokeWidth={1.4} strokeDasharray="6 5" opacity={0.8} />
          ))}
          {showRoads && (
            <g fill={showBasemap ? 'rgba(207,200,187,0.55)' : '#cfc8bb'} stroke="#b3aa99" strokeWidth={0.6} fillRule="evenodd">
              {roads.map((d, i) => <path key={'r' + i} d={d} />)}
            </g>
          )}
          {showBuildings && (
            <g stroke="#26211a" strokeWidth={0.8} strokeLinejoin="round" fillRule="evenodd">
              {buildings.map((b) => (
                <path key={b.i} d={b.d} fill={heightColors ? colorForFloors(b.floors) : '#ece6da'}
                      stroke={b.floors == null && heightColors ? '#7a7468' : '#26211a'}
                      strokeWidth={b.floors == null && heightColors ? 1.1 : 0.8} />
              ))}
            </g>
          )}
          {showBuildings && showIds && buildings.map((b) => (
            <text key={'t' + b.i} x={b.cx} y={b.cy} fontSize={8} fill="#1c1813"
                  textAnchor="middle" dominantBaseline="middle"
                  transform={`rotate(${-bearing} ${b.cx} ${b.cy})`}>{b.i}</text>
          ))}
        </g>
      </svg>

      {show('layers') && <LayersPanel items={[
        { label: 'Buildings', checked: showBuildings, onChange: setShowBuildings },
        { label: 'Roads', checked: showRoads, onChange: setShowRoads },
        { label: 'Height colours', checked: heightColors, onChange: setHeightColors },
        { label: 'Borders', checked: showBorders, onChange: setShowBorders },
        { label: 'Basemap (map)', checked: showBasemap, onChange: setShowBasemap },
      ]} />}
      {show('legend') && <Legend geo={geo} />}
      <ControlStack>
        {show('save') && <SaveButton dirty={dirty} save={save} />}
        {show('ids') && (
          <label style={{ fontSize: 12, background: 'rgba(255,255,255,0.85)', padding: '5px 9px',
                          borderRadius: 5, border: '1px solid var(--line)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showIds} onChange={(e) => setShowIds(e.target.checked)} /> building #
          </label>
        )}
        {show('zoom') && <ZoomBar onStep={(f) => setT((p) => ({ ...p, k: Math.min(20, Math.max(0.2, p.k * f)) }))} />}
        {show('compass') && <Compass bearing={bearing} onBearing={setBearing} />}
      </ControlStack>
    </div>
  );
}

function buildScene(geo) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const track = ([sx, sy]) => {
    if (sx < minx) minx = sx; if (sx > maxx) maxx = sx;
    if (sy < miny) miny = sy; if (sy > maxy) maxy = sy;
  };
  const toPath = (rings, doTrack) =>
    rings.map((ring) => {
      const pts = ring.map((c) => { const p = plan(c); if (doTrack) track(p); return p; });
      return 'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z';
    }).join(' ');

  const aoi = geo.aoi.map((ring) => toPath([ring], true));
  const roads = geo.roads.map((rd) => toPath(rd.rings, true));
  const buildings = geo.buildings.map((b) => {
    const d = toPath(b.rings, true);
    const outer = b.ring.map(plan);
    const c = outer.reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
    return { i: b.i, kind: b.kind, floors: b.floors, d, cx: c[0] / outer.length, cy: c[1] / outer.length };
  });

  const pad = 40;
  const viewBox = `${minx - pad} ${miny - pad} ${maxx - minx + 2 * pad} ${maxy - miny + 2 * pad}`;
  const center = [(minx + maxx) / 2, (miny + maxy) / 2];
  return { buildings, roads, aoi, viewBox, center };
}
