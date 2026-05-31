import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrthographicCamera, OrbitControls, GizmoHelper, GizmoViewport, Line } from '@react-three/drei';
import * as THREE from 'three';
import { colorForFloors, siteBasemap } from '../geo.js';
import { Legend, ZoomBar, Compass, SaveButton, ControlStack, LayersPanel } from '../controls.jsx';

const NEUTRAL = '#d9d3c7';

function extrude(ring, height) {
  const s = new THREE.Shape();
  ring.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}
function flat(rings) {
  const s = new THREE.Shape();
  rings[0].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  for (let h = 1; h < rings.length; h++) {
    const p = new THREE.Path();
    rings[h].forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    s.holes.push(p);
  }
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  return g;
}

function Buildings({ buildings, heightColors }) {
  const items = useMemo(() => buildings.map((b) => {
    const geom = extrude(b.ring, b.height);
    return { geom, edges: new THREE.EdgesGeometry(geom, 25), color: heightColors ? colorForFloors(b.floors) : NEUTRAL };
  }), [buildings, heightColors]);
  return (
    <group>
      {items.map(({ geom, edges, color }, i) => (
        <group key={i}>
          <mesh geometry={geom} castShadow receiveShadow>
            <meshStandardMaterial color={color} flatShading roughness={0.92} metalness={0} />
          </mesh>
          <lineSegments geometry={edges}><lineBasicMaterial color="#5a5247" /></lineSegments>
        </group>
      ))}
    </group>
  );
}
function Roads({ roads, faded }) {
  const geoms = useMemo(() => roads.map((rd) => flat(rd.rings)), [roads]);
  return (
    <group position={[0, 0.06, 0]}>
      {geoms.map((g, i) => (
        <mesh key={i} geometry={g} receiveShadow>
          <meshStandardMaterial color="#d7d0c2" roughness={1} transparent={faded} opacity={faded ? 0.5 : 1} />
        </mesh>
      ))}
    </group>
  );
}
function Basemap({ bm }) {
  const tex = useLoader(THREE.TextureLoader, bm.url);
  const w = bm.maxX - bm.minX, h = bm.maxY - bm.minY;
  return (
    <mesh position={[(bm.minX + bm.maxX) / 2, 0.02, -(bm.minY + bm.maxY) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
function AoiBorder({ aoi }) {
  return aoi.map((ring, i) => (
    <Line key={i} points={ring.map(([x, y]) => [x, 0.12, -y])} color="#c4392f" lineWidth={1.6} dashed dashSize={6} gapSize={4} />
  ));
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

export default function ThreeMassing({ geo, chrome = {} }) {
  const show = (k) => chrome[k] !== false;
  const controls = useRef(null);
  const [bearing, setBearing] = useState(0);
  const [tilt, setTilt] = useState(45);   // polar angle, deg (0 = top-down, 90 = horizon)
  const [moved, setMoved] = useState(false);
  const [heightColors, setHeightColors] = useState(true);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showRoads, setShowRoads] = useState(true);
  const [showBorders, setShowBorders] = useState(true);
  const [showBasemap, setShowBasemap] = useState(false);
  const bm = useMemo(() => siteBasemap(geo), [geo]);
  const R = useMemo(() => {
    let r = 0; for (const b of geo.buildings) for (const [x, y] of b.ring) r = Math.max(r, Math.hypot(x, y));
    return r || 400;
  }, [geo]);

  useEffect(() => {
    let cancelled = false, timer;
    fetch('/api/settings').then((r) => (r.ok ? r.json() : {})).then((all) => {
      if (cancelled) return;
      const s = all && all.three;
      timer = setTimeout(() => {
        const c = controls.current, cam = c?.object;
        if (!c || !cam) return;
        c.target.set(0, 0, 0);
        if (s && finite(s.bearing)) { c.setAzimuthalAngle((-s.bearing * Math.PI) / 180); setBearing(((s.bearing % 360) + 360) % 360); }
        else { c.setAzimuthalAngle(-Math.PI / 6); setBearing(30); }            // default ¾ view
        if (s && finite(s.polar)) { c.setPolarAngle(s.polar); setTilt(Math.round((s.polar * 180) / Math.PI)); }
        else { c.setPolarAngle((58 * Math.PI) / 180); setTilt(58); }
        if (s && Array.isArray(s.target) && s.target.every(finite)) c.target.set(s.target[0], s.target[1], s.target[2]);
        if (s && finite(s.zoom) && s.zoom > 0) { cam.zoom = s.zoom; }
        else { const fw = cam.right - cam.left, fh = cam.top - cam.bottom; cam.zoom = Math.min(fw, fh) / (2 * R * 1.3); } // fit
        cam.updateProjectionMatrix();
        c.update();
        setMoved(false);
      }, 150);
    }).catch(() => {});
    return () => { cancelled = true; clearTimeout(timer); };
  }, [R]);

  const onChange = () => {
    const c = controls.current; if (!c) return;
    const deg = (((Math.round((-c.getAzimuthalAngle() * 180) / Math.PI)) % 360) + 360) % 360;
    setBearing((b) => (b === deg ? b : deg));
    const pol = Math.round((c.getPolarAngle() * 180) / Math.PI);
    setTilt((p) => (p === pol ? p : pol));
    setMoved(true);
  };
  const setBearingCtrl = (b) => { setBearing(b); const c = controls.current; if (c) { c.setAzimuthalAngle((-b * Math.PI) / 180); c.update(); } };
  const setTiltCtrl = (deg) => {
    const d = Math.min(89, Math.max(2, deg)); setTilt(d);
    const c = controls.current; if (c) { c.setPolarAngle((d * Math.PI) / 180); c.update(); }
  };
  const zoom = (f) => { const c = controls.current, cam = c?.object; if (cam) { cam.zoom = Math.min(8, Math.max(0.1, cam.zoom * f)); cam.updateProjectionMatrix(); c.update(); setMoved(true); } };
  const save = () => {
    const c = controls.current, cam = c?.object; if (!c || !cam) return;
    const snap = { bearing, polar: c.getPolarAngle(), zoom: cam.zoom, target: [c.target.x, c.target.y, c.target.z] };
    fetch('/api/settings').then((r) => (r.ok ? r.json() : {})).then((all) =>
      fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(all || {}), three: snap }) })
    ).then(() => setMoved(false)).catch(() => {});
  };

  const btn = { width: 22, height: 22, lineHeight: '20px', fontSize: 15, padding: 0, cursor: 'pointer',
                border: '1px solid var(--line)', borderRadius: 4, background: 'rgba(255,255,255,0.92)', color: '#3a342c' };

  return (
    <div className="svgwrap" style={{ cursor: 'default' }}>
      <Canvas shadows dpr={[1, 2]} style={{ background: 'linear-gradient(#fdfcf9,#eee9df)' }}>
        <OrthographicCamera makeDefault position={[600, 650, 600]} near={-5000} far={5000} zoom={0.8} />
        <ambientLight intensity={1.05} />
        <hemisphereLight args={['#ffffff', '#d8d2c4', 0.6]} />
        <directionalLight position={[400, 800, 300]} intensity={0.75} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
          <planeGeometry args={[5000, 5000]} /><meshStandardMaterial color="#f2efe7" roughness={1} />
        </mesh>
        {showBasemap && <Suspense fallback={null}><Basemap bm={bm} /></Suspense>}
        {showRoads && <Roads roads={geo.roads} faded={showBasemap} />}
        {showBorders && <AoiBorder aoi={geo.aoi} />}
        {showBuildings && <Buildings buildings={geo.buildings} heightColors={heightColors} />}
        <OrbitControls ref={controls} makeDefault enablePan enableDamping={false} onChange={onChange}
                       target={[0, 0, 0]} minPolarAngle={0.15} maxPolarAngle={Math.PI / 2 - 0.05} />
        {show('gizmo') && (
          <GizmoHelper alignment="bottom-right" margin={[72, 320]}>
            <GizmoViewport axisColors={['#d04a3a', '#3a8f4a', '#3a6fd0']} labelColor="#222" />
          </GizmoHelper>
        )}
      </Canvas>

      {show('layers') && <LayersPanel items={[
        { label: 'Buildings', checked: showBuildings, onChange: setShowBuildings },
        { label: 'Roads', checked: showRoads, onChange: setShowRoads },
        { label: 'Height colours', checked: heightColors, onChange: setHeightColors },
        { label: 'Borders', checked: showBorders, onChange: setShowBorders },
        { label: 'Basemap (map)', checked: showBasemap, onChange: setShowBasemap },
      ]} />}
      {show('legend') && <Legend geo={geo} />}
      <ControlStack>
        {show('save') && <SaveButton dirty={moved} save={save} />}
        {show('tilt') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.92)',
                        border: '1px solid var(--line)', borderRadius: 5, padding: '3px 5px' }}
               title="tilt: 0° top-down, 90° horizon" onMouseDown={(e) => e.stopPropagation()}>
            <button style={btn} onClick={() => setTiltCtrl(tilt - 2)}>−</button>
            <span style={{ fontSize: 11, color: '#6f685c', minWidth: 54, textAlign: 'center' }}>tilt {tilt}°</span>
            <button style={btn} onClick={() => setTiltCtrl(tilt + 2)}>+</button>
          </div>
        )}
        {show('zoom') && <ZoomBar onStep={zoom} />}
        {show('compass') && <Compass bearing={bearing} onBearing={setBearingCtrl} />}
      </ControlStack>
    </div>
  );
}
