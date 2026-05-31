import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, HEIGHT_CATEGORIES, UNKNOWN_COLOR, maskFeature } from '../geo.js';
const NEUTRAL_FILL = UNKNOWN_COLOR; // grey when height colours are off
import { Legend, ZoomBar, TiltBar, CtrlLabel, Compass, SaveButton, ControlStack, LayersPanel, useViewSettings } from '../controls.jsx';

const STYLE = 'mapbox://styles/mapbox/streets-v12';
const heightColorExpr = () => {
  const e = ['match', ['get', 'floors']];
  for (const c of HEIGHT_CATEGORIES) e.push(c.floors, c.color);
  e.push(UNKNOWN_COLOR);
  return e;
};

export default function MapView({ geo, mode, chrome = {}, freeOrbit, onFreeOrbitChange }) {
  const show = (k) => chrome[k] !== false;
  const is3D = mode === 'massing';
  const mapRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [showPodium, setShowPodium] = useState(true);
  const [showAoiPlatform, setShowAoiPlatform] = useState(false);

  const [view, setView] = useState({
    longitude: geo.center[0], latitude: geo.center[1],
    zoom: is3D ? 15.2 : 15.4, bearing: is3D ? 30 : 0, pitch: is3D ? 55 : 0,
  });

  // our layers
  const [showBuildings, setShowBuildings] = useState(true);
  const [showRoads, setShowRoads] = useState(true);
  const [showBorders, setShowBorders] = useState(true);
  const [heightColors, setHeightColors] = useState(true);
  const [showIds, setShowIds] = useState(true);
  // basemap + sublayers
  const [showBasemap, setShowBasemap] = useState(true);
  const [bmRoads, setBmRoads] = useState(true);
  const [bmLabels, setBmLabels] = useState(true);
  const [bmPois, setBmPois] = useState(false);
  // basemap clip shape
  const [shape, setShape] = useState('none');
  const [size, setSize] = useState({ radius: 500, half: 450, halfX: 600, halfY: 450 });
  // architectural drawing style (per layer)
  const [archBuildings, setArchBuildings] = useState(false);
  const [archRoads, setArchRoads] = useState(false);
  const [archBasemap, setArchBasemap] = useState(false);

  const { dirty, save } = useViewSettings(mode,
    {
      zoom: view.zoom, bearing: view.bearing, pitch: view.pitch,
      longitude: view.longitude, latitude: view.latitude,
      showBuildings, showRoads, showBorders, heightColors, showIds, showBasemap,
      showPodium, showAoiPlatform, bmRoads, bmLabels, bmPois, shape, size,
      archBuildings, archRoads, archBasemap,
    },
    (s) => {
      setView((v) => ({ ...v,
        zoom: s.zoom ?? v.zoom, bearing: s.bearing ?? v.bearing, pitch: s.pitch ?? v.pitch,
        longitude: s.longitude ?? v.longitude, latitude: s.latitude ?? v.latitude,
      }));
      const setIf = (val, setter) => { if (val !== undefined) setter(val); };
      setIf(s.showBuildings, setShowBuildings); setIf(s.showRoads, setShowRoads);
      setIf(s.showBorders, setShowBorders); setIf(s.heightColors, setHeightColors);
      setIf(s.showIds, setShowIds); setIf(s.showBasemap, setShowBasemap);
      setIf(s.showPodium, setShowPodium); setIf(s.showAoiPlatform, setShowAoiPlatform);
      setIf(s.bmRoads, setBmRoads); setIf(s.bmLabels, setBmLabels); setIf(s.bmPois, setBmPois);
      setIf(s.shape, setShape); setIf(s.size, setSize);
      setIf(s.archBuildings, setArchBuildings); setIf(s.archRoads, setArchRoads);
      setIf(s.archBasemap, setArchBasemap);
    });

  // toggle basemap sublayers by category (skip our 'az-' layers)
  useEffect(() => {
    const map = mapRef.current?.getMap?.(); if (!map || !loaded) return;
    for (const L of map.getStyle().layers || []) {
      if (L.id.startsWith('az-')) continue;
      let vis = showBasemap;
      if (showBasemap) {
        if (/poi/i.test(L.id)) vis = bmPois;
        else if (L.type === 'symbol') vis = bmLabels;
        else if (/road|bridge|tunnel|street/i.test(L.id)) vis = bmRoads;
      }
      try { map.setLayoutProperty(L.id, 'visibility', vis ? 'visible' : 'none'); } catch { /* layer gone */ }
    }
  }, [loaded, showBasemap, bmRoads, bmLabels, bmPois]);

  const ARCH_FILL = '#fafaf3', ARCH_INK = '#1c1813';
  const fillColor = archBuildings ? ARCH_FILL
                  : heightColors ? heightColorExpr() : NEUTRAL_FILL;
  const bldgLineColor = archBuildings ? ARCH_INK : '#26211a';
  const bldgLineWidth = archBuildings ? 1.4 : 0.8;
  const roadFillColor = archRoads ? ARCH_FILL : '#cfc8bb';
  const roadOutline = archRoads ? '#5f5346' : '#b3aa99';
  const effectiveStyle = archBasemap ? 'mapbox://styles/mapbox/light-v11' : STYLE;
  const maskFC = useMemo(() => (shape === 'none' ? null
    : { type: 'FeatureCollection', features: [maskFeature(geo.center, shape, size, geo.mLon, geo.mLat)] }),
    [shape, size, geo]);

  const vis = (on) => ({ visibility: on ? 'visible' : 'none' });

  return (
    <div className="svgwrap" style={{ cursor: 'default' }}>
      <Map ref={mapRef} mapboxAccessToken={MAPBOX_TOKEN} mapStyle={effectiveStyle}
           {...view} onMove={(e) => setView(e.viewState)} onLoad={() => setLoaded(true)}
           maxPitch={75} dragRotate touchZoomRotate attributionControl={false} reuseMaps
           style={{ width: '100%', height: '100%' }}>
        {/* shape mask above basemap, below our drawing */}
        {maskFC && (
          <Source id="az-mask" type="geojson" data={maskFC}>
            <Layer id="az-mask" type="fill" paint={{ 'fill-color': '#f4f1ea', 'fill-opacity': 1 }} />
          </Source>
        )}
        <Source id="az-roads" type="geojson" data={geo.roadsLL}>
          <Layer id="az-roads" type="fill" layout={vis(showRoads)}
                 paint={{ 'fill-color': roadFillColor, 'fill-opacity': archRoads ? 0.95 : 0.85, 'fill-outline-color': roadOutline }} />
        </Source>
        <Source id="az-podium" type="geojson" data={geo.podiumsLL}>
          {is3D ? (
            <Layer id="az-podium-extr" type="fill-extrusion" layout={vis(showPodium)}
                   paint={{ 'fill-extrusion-color': '#c4bea7',
                            'fill-extrusion-height': ['get', 'podiumHeight'],
                            'fill-extrusion-base': 0, 'fill-extrusion-opacity': 1 }} />
          ) : (
            <Layer id="az-podium-fill" type="fill" layout={vis(showPodium)}
                   paint={{ 'fill-color': '#cdc6b1', 'fill-opacity': 0.6, 'fill-outline-color': '#7a7059' }} />
          )}
        </Source>
        <Source id="az-aoi-platform" type="geojson" data={geo.aoiLL}>
          {is3D ? (
            <Layer id="az-aoi-platform-extr" type="fill-extrusion" layout={vis(showAoiPlatform)}
                   paint={{ 'fill-extrusion-color': '#e1dbcc', 'fill-extrusion-height': 1.5,
                            'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.95 }} />
          ) : (
            <Layer id="az-aoi-platform-fill" type="fill" layout={vis(showAoiPlatform)}
                   paint={{ 'fill-color': '#e1dbcc', 'fill-opacity': 0.65 }} />
          )}
        </Source>
        <Source id="az-aoi" type="geojson" data={geo.aoiLL}>
          <Layer id="az-aoi" type="line" layout={vis(showBorders)}
                 paint={{ 'line-color': '#c4392f', 'line-width': 1.6, 'line-dasharray': [3, 2], 'line-opacity': 0.85 }} />
        </Source>
        <Source id="az-bldg" type="geojson" data={geo.buildingsLL}>
          {is3D ? (
            <Layer id="az-bldg-extr" type="fill-extrusion" layout={vis(showBuildings)}
                   paint={{ 'fill-extrusion-color': fillColor,
                            'fill-extrusion-height': ['get', 'height'],
                            'fill-extrusion-base': showPodium ? ['get', 'podiumHeight'] : 0,
                            'fill-extrusion-opacity': 0.95 }} />
          ) : (
            <>
              <Layer id="az-bldg-fill" type="fill" layout={vis(showBuildings)}
                     paint={{ 'fill-color': fillColor, 'fill-opacity': 1 }} />
              <Layer id="az-bldg-line" type="line" layout={vis(showBuildings)}
                     paint={{ 'line-color': bldgLineColor, 'line-width': bldgLineWidth }} />
            </>
          )}
          <Layer id="az-nums" type="symbol" layout={{ ...vis(showBuildings && showIds), 'text-field': ['to-string', ['get', 'num']], 'text-size': 11, 'text-allow-overlap': true }}
                 paint={{ 'text-color': '#1c1813', 'text-halo-color': '#fff', 'text-halo-width': 1.4 }} />
        </Source>
      </Map>

      {show('layers') && (
        <LayersPanel items={[
          ...(is3D ? [{ label: 'Free orbit 3D', checked: !!freeOrbit, onChange: (v) => onFreeOrbitChange?.(v) }] : []),
          { label: 'Buildings', checked: showBuildings, onChange: setShowBuildings },
          { label: 'Podium (ground floor)', checked: showPodium, onChange: setShowPodium },
          { label: 'AOI as raised platform', checked: showAoiPlatform, onChange: setShowAoiPlatform },
          { label: 'Roads (traced)', checked: showRoads, onChange: setShowRoads },
          { label: 'Height colours', checked: heightColors, onChange: setHeightColors },
          { label: 'Borders', checked: showBorders, onChange: setShowBorders },
          { label: 'Building #', checked: showIds, onChange: setShowIds },
          { label: 'Basemap', checked: showBasemap, onChange: setShowBasemap },
          { label: 'Basemap roads', checked: bmRoads, onChange: setBmRoads, indent: true },
          { label: 'Basemap POIs', checked: bmPois, onChange: setBmPois, indent: true },
          { label: 'Basemap labels', checked: bmLabels, onChange: setBmLabels, indent: true },
        ]}>
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <div style={{ color: '#3a342c', fontWeight: 600, marginBottom: 4 }}>Basemap shape</div>
          <select value={shape} onChange={(e) => setShape(e.target.value)}
                  style={{ width: '100%', fontSize: 12, padding: '2px', marginBottom: 4 }}>
            <option value="none">Full (rectangle)</option>
            <option value="circle">Circle</option>
            <option value="square">Square</option>
            <option value="rectangle">Rectangle</option>
            <option value="hexagon">Hexagon</option>
          </select>
          {(shape === 'circle' || shape === 'hexagon') && (
            <SizeInput label="radius (m)" value={size.radius} onChange={(v) => setSize((s) => ({ ...s, radius: v }))} />
          )}
          {shape === 'square' && (
            <SizeInput label="½ side (m)" value={size.half} onChange={(v) => setSize((s) => ({ ...s, half: v }))} />
          )}
          {shape === 'rectangle' && (<>
            <SizeInput label="½ width (m)" value={size.halfX} onChange={(v) => setSize((s) => ({ ...s, halfX: v }))} />
            <SizeInput label="½ height (m)" value={size.halfY} onChange={(v) => setSize((s) => ({ ...s, halfY: v }))} />
          </>)}
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <div style={{ color: '#3a342c', fontWeight: 600, marginBottom: 4 }}>Architectural style</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={archBuildings} onChange={(e) => setArchBuildings(e.target.checked)} /> Buildings
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={archRoads} onChange={(e) => setArchRoads(e.target.checked)} /> Roads
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={archBasemap} onChange={(e) => setArchBasemap(e.target.checked)} /> Basemap (light)
          </label>
        </LayersPanel>
      )}
      {show('legend') && <Legend geo={geo} />}
      <ControlStack>
        {is3D && show('gizmo') && <Gizmo3D bearing={view.bearing} pitch={view.pitch}
                                            onSet={(p) => setView((v) => ({ ...v, ...p }))} />}
        {show('save') && <SaveButton dirty={dirty} save={save} />}
        {((is3D && show('tilt')) || show('zoom')) && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}
               onMouseDown={(e) => e.stopPropagation()}>
            {is3D && show('tilt') && (
              <div>
                <CtrlLabel>Tilt {Math.round(view.pitch)}°</CtrlLabel>
                <TiltBar tilt={view.pitch} min={0} max={75}
                         onTilt={(p) => setView((v) => ({ ...v, pitch: p }))} />
              </div>
            )}
            {show('zoom') && (
              <div>
                <CtrlLabel>Zoom</CtrlLabel>
                <ZoomBar
                  onStep={(f) => setView((v) => ({ ...v, zoom: Math.min(20, Math.max(12, v.zoom + (f > 1 ? 0.4 : -0.4))) }))}
                  onZoom={(dz) => setView((v) => ({ ...v, zoom: Math.min(20, Math.max(12, v.zoom + dz)) }))}
                />
              </div>
            )}
          </div>
        )}
        {show('compass') && <Compass bearing={view.bearing} onBearing={(b) => setView((v) => ({ ...v, bearing: b }))} />}
      </ControlStack>
    </div>
  );
}

const BTN = { width: 22, height: 22, lineHeight: '20px', fontSize: 15, padding: 0, cursor: 'pointer',
              border: '1px solid var(--line)', borderRadius: 4, background: 'rgba(255,255,255,0.92)', color: '#3a342c' };

// XYZ orientation gizmo (Mapbox 3D). Arrows + labels at the tips, Y-up
// convention. X = east (red), Y = up (green), Z = north (blue). Click to align.
function Gizmo3D({ bearing, pitch, onSet }) {
  const L = 26, HEAD = 6;
  const p = (pitch * Math.PI) / 180;
  const horiz = (az) => { const a = ((az - bearing) * Math.PI) / 180; return [Math.sin(a) * L, -Math.cos(a) * Math.cos(p) * L]; };
  const items = [
    { v: horiz(90),                color: '#d04a3a', label: 'X', click: () => onSet({ bearing: 90 }) },
    { v: [0, -Math.sin(p) * L],    color: '#3a8f4a', label: 'Y', click: () => onSet({ pitch: 0 }) },
    { v: horiz(0),                 color: '#3a6fd0', label: 'Z', click: () => onSet({ bearing: 0 }) },
  ].sort((a, b) => a.v[1] - b.v[1]);
  const arrow = (v, color, label, onClick) => {
    const len = Math.hypot(v[0], v[1]) || 0.0001;
    const ux = v[0] / len, uy = v[1] / len;
    const baseX = v[0] - ux * HEAD, baseY = v[1] - uy * HEAD;
    const px = -uy * HEAD * 0.55, py = ux * HEAD * 0.55;
    const tri = `${v[0].toFixed(1)},${v[1].toFixed(1)} ${(baseX + px).toFixed(1)},${(baseY + py).toFixed(1)} ${(baseX - px).toFixed(1)},${(baseY - py).toFixed(1)}`;
    return (
      <g style={{ cursor: 'pointer' }} onClick={onClick}>
        <line x1="0" y1="0" x2={v[0].toFixed(1)} y2={v[1].toFixed(1)} stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <polygon points={tri} fill={color} />
        <text x={(v[0] + ux * 9).toFixed(1)} y={(v[1] + uy * 9).toFixed(1)} fontSize="12" fontWeight="700"
              fill={color} textAnchor="middle" dominantBaseline="middle">{label}</text>
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

function SizeInput({ label, value, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '2px 0' }}>
      <span style={{ color: '#6f685c' }}>{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)}
             style={{ width: 64, fontSize: 12, padding: '1px 3px' }} />
    </label>
  );
}
