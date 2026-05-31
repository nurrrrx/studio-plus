// Shared view chrome used across all renders: height legend, zoom buttons,
// compass, save-settings button, and a per-view settings.json persistence hook.
import { useEffect, useMemo, useRef, useState } from 'react';
import { HEIGHT_CATEGORIES, UNKNOWN_COLOR } from './geo.js';

// ---------- settings.json (namespaced per view) ----------
const roundStr = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v));

export function useViewSettings(viewId, snapshot, applyLoaded) {
  const snapRef = useRef(snapshot); snapRef.current = snapshot;
  const applyRef = useRef(applyLoaded); applyRef.current = applyLoaded;
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    fetch('/api/settings').then((r) => (r.ok ? r.json() : {})).then((all) => {
      const s = all && all[viewId];
      if (s) applyRef.current(s);
      setSaved(s || snapRef.current);
    }).catch(() => setSaved(snapRef.current));
  }, [viewId]);
  const dirty = !!saved && roundStr(snapshot) !== roundStr(saved);
  const save = () => {
    fetch('/api/settings').then((r) => (r.ok ? r.json() : {})).then((all) => {
      const next = { ...(all || {}), [viewId]: snapshot };
      return fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
    }).then(() => setSaved(snapshot)).catch(() => {});
  };
  return { dirty, save };
}

export function SaveButton({ dirty, save }) {
  return (
    <button onClick={save} disabled={!dirty} onMouseDown={(e) => e.stopPropagation()}
            title={dirty ? 'save this view to settings.json' : 'no changes to save'}
            style={{ fontSize: 12, padding: '5px 10px', borderRadius: 5, border: '1px solid var(--line)',
                     cursor: dirty ? 'pointer' : 'default',
                     background: dirty ? '#2f6f3e' : 'rgba(255,255,255,0.85)',
                     color: dirty ? '#fff' : '#9a948a' }}>
      {dirty ? 'Save settings' : 'Saved'}
    </button>
  );
}

// ---------- building-height legend ----------
function Row({ color, label, n, outline }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '1.5px 0' }}>
      <span style={{ width: 13, height: 13, background: color, borderRadius: 3, flex: 'none',
                     border: outline ? '1px solid #7a7468' : '1px solid rgba(0,0,0,0.15)' }} />
      <span style={{ color: '#3a342c', flex: 1 }}>{label}</span>
      <span style={{ color: '#9a948a' }}>{n}</span>
    </div>
  );
}

export function Legend({ geo }) {
  const counts = useMemo(() => {
    const m = new Map(); let unknown = 0;
    for (const b of geo.buildings) { if (b.floors == null) unknown++; else m.set(b.floors, (m.get(b.floors) || 0) + 1); }
    return { m, unknown };
  }, [geo]);
  return (
    <div style={{ position: 'absolute', right: 16, top: 'calc(var(--header-inset, 0px) + 16px)', zIndex: 6, fontSize: 12,
                  background: 'rgba(255,255,255,0.92)', border: '1px solid var(--line)',
                  borderRadius: 6, padding: '9px 11px', boxShadow: '0 1px 5px rgba(0,0,0,0.1)', minWidth: 150 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#3a342c' }}>Building heights</div>
      {HEIGHT_CATEGORIES.map((c) => (
        <Row key={c.floors} color={c.color} label={c.label} n={counts.m.get(c.floors) || 0} />
      ))}
      {counts.unknown > 0 && (
        <>
          <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
          <Row color={UNKNOWN_COLOR} label="not set — review" n={counts.unknown} outline />
        </>
      )}
    </div>
  );
}

// ---------- zoom buttons + drag-slider ----------
const CTRL_BTN = {
  width: 26, height: 26, lineHeight: '24px', fontSize: 16, padding: 0, cursor: 'pointer',
  background: 'rgba(255,255,255,0.92)', color: '#3a342c', border: 'none',
};
export function ZoomBar({ onStep, onZoom }) {
  const STEP = 1.1;
  const trackRef = useRef(null);
  const [drag, setDrag] = useState(0); // -1..+1 (handle offset from centre)

  // Continuous zoom while the handle is held off-centre. Faster the further you
  // drag toward + or −. Released → handle springs back, zoom stops.
  useEffect(() => {
    if (!drag || !onZoom) return;
    const id = setInterval(() => onZoom(drag * 0.12), 40);
    return () => clearInterval(id);
  }, [drag, onZoom]);

  const startDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    const track = trackRef.current; if (!track) return;
    const r = track.getBoundingClientRect();
    const update = (ev) => {
      const cy = ev.clientY;
      const mid = r.top + r.height / 2;
      const half = r.height / 2;
      // +1 at top (zoom in), -1 at bottom (zoom out)
      setDrag(Math.max(-1, Math.min(1, (mid - cy) / half)));
    };
    const stop = () => {
      setDrag(0);
      window.removeEventListener('mousemove', update);
      window.removeEventListener('mouseup', stop);
    };
    window.addEventListener('mousemove', update);
    window.addEventListener('mouseup', stop);
    update(e);
  };

  const handleOffset = drag * 22; // visual handle travel in px (track is ~52px tall)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 5, overflow: 'hidden',
                  border: '1px solid var(--line)', boxShadow: '0 1px 5px rgba(0,0,0,0.12)',
                  background: 'rgba(255,255,255,0.92)' }}>
      <button style={{ ...CTRL_BTN, borderBottom: '1px solid var(--line)' }} title="zoom in"
              onMouseDown={(e) => e.stopPropagation()} onClick={() => onStep(STEP)}>+</button>
      {/* drag track: pull up toward +, pull down toward − */}
      <div ref={trackRef} onMouseDown={startDrag}
           title="drag toward + or − for fast zoom"
           style={{ position: 'relative', width: 26, height: 52, cursor: 'ns-resize',
                    borderBottom: '1px solid var(--line)', background: 'rgba(245,243,237,0.9)' }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0,
                      width: 2, transform: 'translateX(-50%)',
                      background: 'linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.05) 50%, rgba(0,0,0,0.18))' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%',
                      width: 16, height: 8, borderRadius: 4,
                      background: drag !== 0 ? '#2f6f3e' : '#7a7468',
                      border: '1px solid rgba(0,0,0,0.2)',
                      transform: `translate(-50%, calc(-50% - ${handleOffset}px))`,
                      transition: drag === 0 ? 'transform 0.18s ease' : 'none',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.18)' }} />
      </div>
      <button style={CTRL_BTN} title="zoom out"
              onMouseDown={(e) => e.stopPropagation()} onClick={() => onStep(1 / STEP)}>−</button>
    </div>
  );
}

// ---------- tilt bar (vertical, same look as ZoomBar) ----------
export function TiltBar({ tilt, onTilt, min = 0, max = 89 }) {
  const trackRef = useRef(null);
  const [drag, setDrag] = useState(0); // -1..+1, +1 = increasing tilt
  const tiltRef = useRef(tilt); tiltRef.current = tilt;

  useEffect(() => {
    if (!drag || !onTilt) return;
    const id = setInterval(() => {
      const next = Math.max(min, Math.min(max, tiltRef.current + drag * 1.4));
      onTilt(next);
    }, 40);
    return () => clearInterval(id);
  }, [drag, onTilt, min, max]);

  const startDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    const track = trackRef.current; if (!track) return;
    const r = track.getBoundingClientRect();
    const update = (ev) => {
      const cy = ev.clientY;
      const mid = r.top + r.height / 2;
      const half = r.height / 2;
      setDrag(Math.max(-1, Math.min(1, (mid - cy) / half)));
    };
    const stop = () => {
      setDrag(0);
      window.removeEventListener('mousemove', update);
      window.removeEventListener('mouseup', stop);
    };
    window.addEventListener('mousemove', update);
    window.addEventListener('mouseup', stop);
    update(e);
  };

  const handleOffset = drag * 22;
  const stepUp = () => onTilt(Math.min(max, tilt + 3));
  const stepDown = () => onTilt(Math.max(min, tilt - 3));

  return (
    <div title={`tilt ${Math.round(tilt)}° — drag handle for fast change`}
         style={{ display: 'flex', flexDirection: 'column', borderRadius: 5, overflow: 'hidden',
                  border: '1px solid var(--line)', boxShadow: '0 1px 5px rgba(0,0,0,0.12)',
                  background: 'rgba(255,255,255,0.92)' }}
         onMouseDown={(e) => e.stopPropagation()}>
      <button style={{ ...CTRL_BTN, borderBottom: '1px solid var(--line)' }} title="tilt up"
              onClick={stepUp}>+</button>
      <div ref={trackRef} onMouseDown={startDrag}
           style={{ position: 'relative', width: 26, height: 52, cursor: 'ns-resize',
                    borderBottom: '1px solid var(--line)', background: 'rgba(245,243,237,0.9)' }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0,
                      width: 2, transform: 'translateX(-50%)',
                      background: 'linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.05) 50%, rgba(0,0,0,0.18))' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%',
                      width: 16, height: 8, borderRadius: 4,
                      background: drag !== 0 ? '#2f6f3e' : '#7a7468',
                      border: '1px solid rgba(0,0,0,0.2)',
                      transform: `translate(-50%, calc(-50% - ${handleOffset}px))`,
                      transition: drag === 0 ? 'transform 0.18s ease' : 'none',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.18)' }} />
      </div>
      <button style={CTRL_BTN} title="tilt down" onClick={stepDown}>−</button>
    </div>
  );
}

// Small uppercase header label shown above a vertical control bar.
export function CtrlLabel({ children }) {
  return (
    <div style={{ fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase',
                  color: '#5e564a', textAlign: 'center', marginBottom: 3,
                  textShadow: '0 0 4px rgba(255,255,255,0.9)' }}>
      {children}
    </div>
  );
}

// ---------- compass (drag / ±1° / type to set bearing) ----------
export function Compass({ bearing, onBearing }) {
  const ref = useRef(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const angleAt = (e) => {
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    return (Math.atan2(dx, -dy) * 180) / Math.PI;
  };
  const onDown = (e) => {
    e.stopPropagation(); e.preventDefault();
    const move = (ev) => onBearing(angleAt(ev));
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    onBearing(angleAt(e));
  };
  const nudge = (d) => onBearing(bearing + d);
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); nudge(1); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); nudge(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const deg = Math.round((((bearing % 360) + 360) % 360));
  const commit = () => { const v = parseFloat(draft); if (!Number.isNaN(v)) onBearing(v); setEditing(false); };
  const btn = { width: 22, height: 22, lineHeight: '20px', fontSize: 15, padding: 0, cursor: 'pointer',
                border: '1px solid var(--line)', borderRadius: 4, background: 'rgba(255,255,255,0.92)', color: '#3a342c' };
  return (
    <div style={{ textAlign: 'center' }}>
      <svg ref={ref} width="78" height="78" viewBox="-50 -50 100 100"
           onMouseDown={onDown} onDoubleClick={(e) => { e.stopPropagation(); onBearing(0); }}
           style={{ background: 'rgba(255,255,255,0.92)', borderRadius: '50%', border: '1px solid var(--line)',
                    boxShadow: '0 1px 5px rgba(0,0,0,0.15)', cursor: 'grab' }}>
        <circle r="45" fill="none" stroke="#ece7dc" />
        <polygon points="0,-46 -3,-40 3,-40" fill="#bdb6a7" />
        <g transform={`rotate(${bearing})`}>
          <polygon points="0,-34 -7,3 0,-3 7,3" fill="#c4392f" />
          <polygon points="0,34 -7,-3 0,3 7,-3" fill="#8a8377" />
          <text x="0" y="-22" fontSize="11" fontWeight="700" textAnchor="middle" dominantBaseline="middle"
                fill="#c4392f" fontFamily="Helvetica,Arial">N</text>
        </g>
        <circle r="3" fill="#26211a" />
      </svg>
      <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <button style={btn} title="rotate −1° (key: −)" onMouseDown={(e) => e.stopPropagation()} onClick={() => nudge(-1)}>−</button>
        {editing ? (
          <input autoFocus type="number" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
                 onMouseDown={(e) => e.stopPropagation()}
                 onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setEditing(false); }}
                 style={{ width: 38, fontSize: 11, textAlign: 'center', padding: '1px 2px', border: '1px solid var(--line)', borderRadius: 3 }} />
        ) : (
          <span title="double-click to type an angle" onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => { e.stopPropagation(); setDraft(String(deg)); setEditing(true); }}
                style={{ fontSize: 11, color: '#6f685c', minWidth: 30, cursor: 'text' }}>{deg}°</span>
        )}
        <button style={btn} title="rotate +1° (key: +)" onMouseDown={(e) => e.stopPropagation()} onClick={() => nudge(1)}>+</button>
      </div>
    </div>
  );
}

// Double-chevron icon for the panel collapse button. dir = 'left' | 'right'.
function ChevDoubleHoriz({ dir = 'left', size = 13 }) {
  const flip = dir === 'right' ? `rotate(180 ${size / 2} ${size / 2})` : '';
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden style={{ display: 'block' }}>
      <g transform={flip} fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round">
        <polyline points="10,3 5,8 10,13" />
        <polyline points="14,3 9,8 14,13" />
      </g>
    </svg>
  );
}

// Customization panel (collapsible to the left). `items` are checkboxes;
// `children` adds extra controls below them.
export function LayersPanel({ items = [], children, title = 'Customization' }) {
  const [collapsed, setCollapsed] = useState(false);
  const headerTop = 'calc(var(--header-inset, 0px) + 16px)';

  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)}
              title="show customization"
              style={{ position: 'absolute', left: 0, top: headerTop, zIndex: 6,
                       background: 'rgba(255,255,255,0.94)', border: '1px solid var(--line)',
                       borderLeft: 'none', borderRadius: '0 6px 6px 0', padding: '8px 6px',
                       cursor: 'pointer', color: '#3a342c', display: 'flex', alignItems: 'center',
                       boxShadow: '0 1px 5px rgba(0,0,0,0.1)' }}
              onMouseDown={(e) => e.stopPropagation()}>
        <ChevDoubleHoriz dir="right" />
      </button>
    );
  }
  return (
    <div style={{ position: 'absolute', left: 16, top: headerTop, zIndex: 6, fontSize: 12,
                  maxHeight: 'calc(100% - var(--header-inset, 0px) - var(--footer-inset, 0px) - 32px)',
                  overflowY: 'auto', background: 'rgba(255,255,255,0.94)', border: '1px solid var(--line)',
                  borderRadius: 6, padding: '0 14px 10px 14px', boxShadow: '0 1px 5px rgba(0,0,0,0.1)',
                  width: 320, maxWidth: '70vw',
                  transition: 'transform 0.18s ease' }}
         onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <div style={{ position: 'sticky', top: 0, zIndex: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    margin: '0 -14px 8px -14px', padding: '8px 14px',
                    background: 'rgba(58, 62, 70, 0.97)',
                    borderBottom: '1px solid #1f2937',
                    backdropFilter: 'saturate(140%) blur(4px)' }}>
        <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: 12, letterSpacing: 0.3 }}>{title}</div>
        <button onClick={() => setCollapsed(true)}
                title="collapse to the left"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer',
                         color: '#cbd5e1', padding: 0, display: 'flex', alignItems: 'center' }}>
          <ChevDoubleHoriz dir="left" />
        </button>
      </div>
      {items.map((it) => (
        <label key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0', cursor: 'pointer',
                                       color: '#3a342c', paddingLeft: it.indent ? 16 : 0 }}>
          <input type="checkbox" checked={it.checked} onChange={(e) => it.onChange(e.target.checked)} />
          {it.label}
        </label>
      ))}
      {children}
    </div>
  );
}

// shared bottom-right vertical control stack wrapper — lifts above the footer
// when one is visible (via the --footer-inset CSS variable).
export function ControlStack({ children }) {
  return (
    <div style={{ position: 'absolute', right: 16,
                  bottom: 'calc(var(--footer-inset, 0px) + 12px)',
                  zIndex: 6, display: 'flex',
                  flexDirection: 'column', alignItems: 'center', gap: 8,
                  transition: 'bottom 0.22s ease' }}>
      {children}
    </div>
  );
}
