import { useEffect, useMemo, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer } from '@deck.gl/layers';
import { Map } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CENTER, FLOOR_H, GROUND_H, colorForFloors } from '../geo.js';
import { Legend, ZoomBar, Compass, SaveButton, ControlStack, useViewSettings } from '../controls.jsx';

const MAP_STYLE = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};
const INITIAL = { longitude: CENTER[0], latitude: CENTER[1], zoom: 15.6, pitch: 55, bearing: 25, maxPitch: 75 };

const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const elevation = (p) => {
  const f = Math.max(p.number_of_floors || 0, p.number_of_floors_2 || 0);
  return f ? f * FLOOR_H + (p.large_ground_floor ? GROUND_H : 0) : 9.6;
};
const notCutout = (fc) => fc ? { ...fc, features: fc.features.filter((f) => (f.properties?.name || '') !== 'cutout') } : null;

export default function DeckMap({ geo }) {
  const [view, setView] = useState(INITIAL);
  const [bldg, setBldg] = useState(null);
  const [rd, setRd] = useState(null);

  useEffect(() => {
    // Prefix with Vite's BASE_URL so the fetches work from any sub-route.
    const D = import.meta.env.BASE_URL || '/';
    fetch(`${D}data/alzeina-buildings.geojson`).then((r) => r.json()).then((d) => setBldg(notCutout(d))).catch(() => {});
    fetch(`${D}data/alzeina-roads.geojson`).then((r) => r.json()).then((d) => setRd(notCutout(d))).catch(() => {});
  }, []);

  const { dirty, save } = useViewSettings('deck',
    { zoom: view.zoom, bearing: view.bearing, pitch: view.pitch, longitude: view.longitude, latitude: view.latitude },
    (s) => setView((v) => ({ ...v, ...s })));

  const layers = useMemo(() => [
    new GeoJsonLayer({
      id: 'roads', data: rd || { type: 'FeatureCollection', features: [] },
      stroked: true, filled: true, getFillColor: [205, 198, 184, 220], getLineColor: [150, 142, 128, 200], getLineWidth: 0.4, lineWidthMinPixels: 0.5,
    }),
    new GeoJsonLayer({
      id: 'buildings', data: bldg || { type: 'FeatureCollection', features: [] },
      extruded: true, getElevation: (f) => elevation(f.properties || {}),
      getFillColor: (f) => hexRgb(colorForFloors(f.properties?.number_of_floors ?? null)),
      getLineColor: [90, 82, 71], getLineWidth: 0.3, wireframe: true,
      material: { ambient: 0.7, diffuse: 0.6, shininess: 6 }, pickable: true,
      updateTriggers: { getFillColor: [bldg], getElevation: [bldg] },
    }),
  ], [bldg, rd]);

  return (
    <div className="svgwrap" style={{ cursor: 'default' }}>
      <DeckGL
        viewState={view}
        onViewStateChange={({ viewState }) => setView(viewState)}
        controller={true}
        layers={layers}
        getTooltip={({ object }) => object && object.properties?.number_of_floors
          ? `Building ${object.properties.number_of_floors} floors` : null}
      >
        <Map mapStyle={MAP_STYLE} reuseMaps />
      </DeckGL>

      {geo && <Legend geo={geo} />}
      <ControlStack>
        <SaveButton dirty={dirty} save={save} />
        <ZoomBar onStep={(f) => setView((v) => ({ ...v, zoom: Math.min(20, Math.max(12, v.zoom + (f > 1 ? 0.25 : -0.25))) }))} />
        <Compass bearing={view.bearing} onBearing={(b) => setView((v) => ({ ...v, bearing: b }))} />
      </ControlStack>
    </div>
  );
}
