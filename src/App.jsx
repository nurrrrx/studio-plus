import { useEffect, useRef, useState } from 'react';
import { loadGeo } from './geo.js';
import MapView from './views/MapView.jsx';
import DeckOrbit3D from './views/DeckOrbit3D.jsx';
import Projects from './views/Projects.jsx';
import Loader from './views/Loader.jsx';

const TABS = [
  { id: 'plan', label: '2D plan' },
  { id: 'three', label: '3D massing' },
];

// chrome widgets that the gear modal can show/hide ('only' limits to a view)
const CHROME = [
  { key: 'layers', label: 'Layers panel' },
  { key: 'legend', label: 'Height legend' },
  { key: 'save', label: 'Save-settings button' },
  { key: 'zoom', label: 'Zoom buttons' },
  { key: 'compass', label: 'Compass' },
  { key: 'ids', label: 'Building numbers', only: 'plan' },
  { key: 'gizmo', label: 'X-Y-Z axis gizmo', only: 'three' },
  { key: 'tilt', label: 'Tilt control', only: 'three' },
];

const DEFAULT_TITLE = 'Al Zeina — Axonometric Study';

const initialTab = () => {
  if (typeof window === 'undefined') return 'three';
  const h = window.location.hash.slice(1);
  return ['plan', 'three'].includes(h) ? h : 'three';
};

// Double-chevron SVG used by the header pin toggle. dir = 'up' | 'down'.
function ChevronDouble({ dir = 'up', size = 14 }) {
  const flip = dir === 'down' ? `rotate(180 ${size / 2} ${size / 2})` : '';
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden style={{ display: 'block' }}>
      <g transform={flip} fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3,9 8,4 13,9" />
        <polyline points="3,13 8,8 13,13" />
      </g>
    </svg>
  );
}

export default function App() {
  const [page, setPage] = useState('projects'); // 'projects' | 'project' — start on home
  const [tab, setTab] = useState(initialTab);
  const [geo, setGeo] = useState(null);
  const [chrome, setChrome] = useState({});
  const [gearOpen, setGearOpen] = useState(false);
  const [freeOrbit3D, setFreeOrbit3D] = useState(true);

  // Blueprint splash: visible for >=3s on every reload, then fades to home.
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [loaderMounted, setLoaderMounted] = useState(true);
  useEffect(() => {
    const t1 = setTimeout(() => setLoaderVisible(false), 3000);
    const t2 = setTimeout(() => setLoaderMounted(false), 3700); // remove from DOM after fade
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Editable project title + header auto-hide / pin (persisted in settings.json `app`).
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [headerPinned, setHeaderPinned] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [footerPinned, setFooterPinned] = useState(true);
  const [footerHovering, setFooterHovering] = useState(false);
  const appLoaded = useRef(false);

  useEffect(() => { loadGeo().then(setGeo); }, []);

  // Load app-level settings (title, pin) once on mount.
  useEffect(() => {
    fetch('/api/settings').then((r) => (r.ok ? r.json() : {})).then((all) => {
      const a = all && all.app;
      if (a) {
        if (typeof a.title === 'string') setTitle(a.title);
        if (typeof a.headerPinned === 'boolean') setHeaderPinned(a.headerPinned);
        if (typeof a.footerPinned === 'boolean') setFooterPinned(a.footerPinned);
      }
      appLoaded.current = true;
    }).catch(() => { appLoaded.current = true; });
  }, []);

  // Persist app settings on change (after initial load).
  useEffect(() => {
    if (!appLoaded.current) return;
    const id = setTimeout(() => {
      fetch('/api/settings').then((r) => (r.ok ? r.json() : {})).then((all) => {
        const next = { ...(all || {}), app: { title, headerPinned, footerPinned } };
        return fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(id);
  }, [title, headerPinned, footerPinned]);

  // Auto-hide: header when not pinned shows on hover near the top edge.
  useEffect(() => {
    if (headerPinned) { setHovering(true); return; }
    const onMove = (e) => setHovering(e.clientY < 36);
    window.addEventListener('mousemove', onMove);
    setHovering(false);
    return () => window.removeEventListener('mousemove', onMove);
  }, [headerPinned]);

  // Global ⌘Z / Ctrl+Z and ⌘⇧Z / Ctrl+⇧Z → undo / redo via custom events.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app-undo'));
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app-redo'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Footer auto-hide: shows when mouse is near the bottom edge.
  useEffect(() => {
    if (footerPinned) { setFooterHovering(true); return; }
    const onMove = (e) => setFooterHovering(window.innerHeight - e.clientY < 36);
    window.addEventListener('mousemove', onMove);
    setFooterHovering(false);
    return () => window.removeEventListener('mousemove', onMove);
  }, [footerPinned]);

  const headerVisible = headerPinned || hovering;
  const footerVisible = footerPinned || footerHovering;

  const startEdit = () => { setDraftTitle(title); setEditingTitle(true); };
  const commitEdit = () => {
    const t = draftTitle.trim() || DEFAULT_TITLE;
    setTitle(t); setEditingTitle(false);
  };

  return (
    <div className="app" style={{
        '--header-inset': headerVisible ? '32px' : '0px',
        '--footer-inset': footerVisible ? '22px' : '0px',
      }}>
      {loaderMounted && <Loader visible={loaderVisible} />}
      <div className={`bar ${headerVisible ? '' : 'hidden'}`}>
        <div className="bar-left">
          <button className="tab icon-btn"
                  title="back to projects"
                  onClick={() => setPage('projects')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                           padding: '6px 9px' }}>
            {/* Tiny isometric cube — mirrors the project cubes on the home page. */}
            <svg width="16" height="17" viewBox="0 0 16 17" aria-hidden>
              <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
                <polygon points="8,1 14,4 8,7 2,4" />
                <polygon points="2,4 8,7 8,15 2,12" />
                <polygon points="14,4 8,7 8,15 14,12" />
              </g>
            </svg>
          </button>
          {/* Grey divider pipe */}
          <span style={{ width: 1, height: 18, background: '#334155', margin: '0 2px' }} />
          {/* Undo / Redo — dispatch global events that the active view subscribes to */}
          <button className="tab icon-btn" title="undo (⌘Z)"
                  onClick={() => window.dispatchEvent(new CustomEvent('app-undo'))}
                  style={{ padding: '4px 7px', display: 'flex', alignItems: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
              <path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
                    d="M4 7h6a3 3 0 0 1 0 6H5M4 7l3-3M4 7l3 3"/>
            </svg>
          </button>
          <button className="tab icon-btn" title="redo (⌘⇧Z)"
                  onClick={() => window.dispatchEvent(new CustomEvent('app-redo'))}
                  style={{ padding: '4px 7px', display: 'flex', alignItems: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
              <path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
                    d="M12 7H6a3 3 0 0 0 0 6h5M12 7L9 4M12 7l-3 3"/>
            </svg>
          </button>
        </div>
        <div className="bar-center"
             onDoubleClick={page === 'project' && !editingTitle ? startEdit : undefined}
             title={page === 'project' ? 'double-click to rename' : ''}>
          {page === 'projects' ? (
            <h1 style={{ fontSize: 20, fontWeight: 300, letterSpacing: 1 }}>
              studio<sup className="bar-plus">+</sup>
            </h1>
          ) : editingTitle ? (
            <input autoFocus value={draftTitle}
                   onChange={(e) => setDraftTitle(e.target.value)}
                   onBlur={commitEdit}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') commitEdit();
                     else if (e.key === 'Escape') setEditingTitle(false);
                   }}
                   style={{ fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 500,
                            textAlign: 'center', padding: '2px 8px', borderRadius: 4,
                            background: '#0b0b0b', color: '#f1f5f9',
                            border: '1px solid #334155', minWidth: 200, outline: 'none' }} />
          ) : (
            <h1 style={{ cursor: 'text', fontSize: 12 }}>{title}</h1>
          )}
        </div>
        <div className="bar-right tabs">
          {page === 'project' && TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
          {page === 'project' && (
            <button className={`tab ${gearOpen ? 'on' : ''}`} title="show / hide on-screen controls"
                    onClick={() => setGearOpen((o) => !o)} style={{ fontSize: 16, lineHeight: 1 }}>⚙</button>
          )}
          {/* Pin/auto-hide chevron — rightmost, after the gear */}
          <button className="tab icon-btn"
                  title={headerPinned ? 'pinned — click to auto-hide on scroll' : 'auto-hide — click to pin'}
                  onClick={() => setHeaderPinned((p) => !p)}
                  style={{ padding: '6px 9px', display: 'flex', alignItems: 'center' }}>
            <ChevronDouble dir={headerPinned ? 'up' : 'down'} />
          </button>
        </div>
      </div>

      {/* Hover sliver at the top of the page that wakes the header when it's hidden */}
      {!headerPinned && !hovering && (
        <div onMouseEnter={() => setHovering(true)}
             style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 8, zIndex: 50 }} />
      )}

      {gearOpen && (
        <>
          <div onClick={() => setGearOpen(false)}
               style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', right: 22, top: 58, zIndex: 41, background: '#fff',
                        border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px',
                        boxShadow: '0 6px 24px rgba(0,0,0,0.16)', minWidth: 220 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>On-screen controls</div>
            {CHROME.filter((c) => !c.only || c.only === tab).map((c) => (
              <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0',
                                          fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={chrome[c.key] !== false}
                       onChange={(e) => setChrome((p) => ({ ...p, [c.key]: e.target.checked }))} />
                {c.label}
              </label>
            ))}
          </div>
        </>
      )}

      {/* Footer: small transparent strip with credit; chevron toggles auto-hide */}
      <div className={`footer ${footerVisible ? '' : 'hidden'}`}>
        Developed by APSR
        <button className="footer-toggle" title={footerPinned ? 'auto-hide footer' : 'pin footer'}
                onClick={() => setFooterPinned((p) => !p)}>
          <ChevronDouble dir={footerPinned ? 'down' : 'up'} size={11} />
        </button>
      </div>
      {!footerPinned && !footerHovering && (
        <div className="footer-wake" onMouseEnter={() => setFooterHovering(true)} />
      )}

      <div className="stage">
        {page === 'projects' ? (
          <Projects activeTitle={title}
                    onOpen={() => setPage('project')}
                    onRename={(n) => setTitle(n)} />
        ) : !geo ? (
          <div className="loading">Loading Al Zeina geometry…</div>
        ) : tab === 'plan' ? (
          <MapView geo={geo} mode="plan" chrome={chrome} />
        ) : freeOrbit3D ? (
          <DeckOrbit3D geo={geo} chrome={chrome} freeOrbit={freeOrbit3D} onFreeOrbitChange={setFreeOrbit3D} />
        ) : (
          <MapView geo={geo} mode="massing" chrome={chrome} freeOrbit={freeOrbit3D} onFreeOrbitChange={setFreeOrbit3D} />
        )}
      </div>
    </div>
  );
}
