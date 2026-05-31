// Studio+ v2 — fresh layout modelled on shadcn's sidebar-12 + sidebar-03
// patterns. A collapsible sidebar on the left (with grouped, accordion-
// style nav items) and a main inset that has a sticky breadcrumb header
// and a content grid of cards. Stub for now: rendering placeholders the
// user can flesh out feature by feature.

import { useEffect, useState } from 'react';
import './v2.css';
import { listProjects, backendConfigured } from './api.js';
import { loadGeo } from './geo.js';
import DeckOrbit3D from './views/DeckOrbit3D.jsx';

const SIDEBAR_W_OPEN = 256;
const SIDEBAR_W_COLLAPSED = 56;
const RIGHT_W_OPEN = 280;
const RIGHT_W_COLLAPSED = 0;
const BASE = '/studio-plus';

// Top-level switch: with a projectId we show the full project view
// (both sidebars, sample TOC, big pane). Without one we show the
// projects-list page — no sidebars, just the breadcrumb + a grid of
// project cards. The /studio-plus/v2/ URL hits the listing; clicking
// a card navigates to /studio-plus/v2/<id>/.
export default function AppV2({ projectId = null }) {
  if (!projectId) return <ProjectsListPage />;
  return <ProjectViewPage projectId={projectId} />;
}

// ---------- Projects list (no sidebars) -------------------------------------

function ProjectsListPage() {
  const [projects, setProjects] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  useEffect(() => {
    if (!backendConfigured()) {
      // Dev / no backend → show a single hardcoded project entry so the
      // page isn't empty.
      setProjects([{ id: 'alzeina', name: 'Al Zeina — Axonometric Study', location: 'Al Raha Beach, Abu Dhabi' }]);
      return;
    }
    listProjects()
      .then((list) => setProjects(list || []))
      .catch((e) => setLoadErr(e.message || 'Could not reach the server'));
  }, []);
  return (
    <div className="v2-root">
      <div className="v2-inset" style={{ marginLeft: 0, marginRight: 0 }}>
        <header className="v2-header">
          <Breadcrumb crumbs={[
            { label: 'studio+', href: '#' },
            { label: 'projects', current: true },
          ]} />
          <div style={{ flex: 1 }} />
          <a href="../" className="v2-link" title="Back to the canvas app">
            ← classic view
          </a>
        </header>
        <main className="v2-main">
          <div className="v2-big-pane" style={{ minHeight: 'auto', padding: 0, background: 'transparent', border: 'none' }}>
            <div className="v2-big-pane-text" style={{ maxWidth: 720, marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Projects</h2>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#71717a', lineHeight: 1.5 }}>
                Pick a project to open its detailed view.
              </p>
            </div>
            {loadErr ? (
              <div style={{ color: '#b03030', fontSize: 13 }}>Couldn't load projects: {loadErr}</div>
            ) : projects == null ? (
              <div style={{ color: '#71717a', fontSize: 13 }}>Loading…</div>
            ) : projects.length === 0 ? (
              <div style={{ color: '#71717a', fontSize: 13 }}>No projects yet.</div>
            ) : (
              <div className="v2-card-grid">
                {projects.map((p) => (
                  <a key={p.id} href={`${BASE}/v2/${encodeURIComponent(p.id)}/`}
                     className="v2-card v2-project-card">
                    <div>
                      <div className="v2-card-title">{p.name || p.id}</div>
                      {p.location && (
                        <div className="v2-card-hint" style={{ marginTop: 4 }}>{p.location}</div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#a1a1aa', alignSelf: 'flex-end' }}>
                      Open →
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ---------- Project view (both sidebars) ------------------------------------

function ProjectViewPage({ projectId }) {
  const [open, setOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [active, setActive] = useState('overview');
  const [activeToc, setActiveToc] = useState('layers/bike-lanes');
  // Friendly project name for the breadcrumb (lazy fetch).
  const [projectName, setProjectName] = useState(projectId);
  // Geometry + chrome for the embedded canvas. chrome controls which of
  // DeckOrbit3D's built-in overlay widgets render; we leave them all
  // visible so the page is fully functional with the canvas. Future
  // iterations can hide overlays and reproduce them as sidebar-native
  // components.
  const [geo, setGeo] = useState(null);
  const [chrome] = useState({ legend: false });
  const [freeOrbit, setFreeOrbit] = useState(true);

  // Tell the fetch interceptor in main.jsx which project to talk to.
  useEffect(() => {
    if (typeof window !== 'undefined') window.__studioPlusProject = projectId;
  }, [projectId]);

  // Load the hand-traced Al Zeina geometry (same source as the classic
  // App). loadGeo fetches the GeoJSONs under public/data/.
  useEffect(() => {
    loadGeo().then(setGeo).catch(() => {});
  }, []);

  useEffect(() => {
    if (!backendConfigured()) return;
    listProjects()
      .then((list) => {
        const me = (list || []).find((p) => p.id === projectId);
        if (me?.name) setProjectName(me.name);
      })
      .catch(() => {});
  }, [projectId]);

  return (
    <div className="v2-root">
      <AppSidebar open={open} setOpen={setOpen} active={active} setActive={setActive} />
      <SidebarInset open={open} rightOpen={rightOpen}>
        <header className="v2-header">
          <button className="v2-icon-btn"
                  title={open ? 'Collapse sidebar' : 'Expand sidebar'}
                  onClick={() => setOpen((o) => !o)}>
            <Icon name={open ? 'sidebar-left' : 'sidebar-right'} />
          </button>
          <span className="v2-sep" />
          <Breadcrumb crumbs={[
            { label: 'studio+',  href: `${BASE}/v2/` },
            { label: 'projects', href: `${BASE}/v2/` },
            { label: projectName || projectId, current: true },
          ]} />
          <div style={{ flex: 1 }} />
          <a href="../../" className="v2-link" title="Back to the canvas app">
            ← classic view
          </a>
          <button className="v2-icon-btn"
                  title={rightOpen ? 'Hide details panel' : 'Show details panel'}
                  onClick={() => setRightOpen((o) => !o)}>
            <Icon name={rightOpen ? 'sidebar-right' : 'sidebar-left'} />
          </button>
        </header>
        <main className="v2-main v2-main-canvas">
          {!geo ? (
            <div className="v2-canvas-loading">Loading Al Zeina geometry…</div>
          ) : (
            <div className="v2-canvas-frame">
              <DeckOrbit3D geo={geo} chrome={chrome}
                           freeOrbit={freeOrbit}
                           onFreeOrbitChange={setFreeOrbit} />
            </div>
          )}
        </main>
      </SidebarInset>
      <RightSidebar open={rightOpen} active={activeToc} setActive={setActiveToc} />
    </div>
  );
}

// ---------- Sidebar ----------------------------------------------------------

const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { key: 'overview',   label: 'Overview',     icon: 'home'    },
      { key: 'canvas',     label: '3D canvas',    icon: 'cube'    },
      { key: 'views',      label: 'Saved views',  icon: 'star'    },
    ],
  },
  {
    label: 'Customization',
    items: [
      { key: 'layers',     label: 'Layers',       icon: 'layers'  },
      { key: 'props',      label: 'Props library', icon: 'package' },
      { key: 'colours',    label: 'Colours',      icon: 'palette' },
    ],
  },
  {
    label: 'Animation',
    items: [
      { key: 'tour',       label: 'Camera tour',  icon: 'play'    },
    ],
  },
];

function AppSidebar({ open, setOpen, active, setActive }) {
  return (
    <aside className={`v2-sidebar ${open ? 'is-open' : 'is-collapsed'}`}
           style={{ width: open ? SIDEBAR_W_OPEN : SIDEBAR_W_COLLAPSED }}>
      <div className="v2-sidebar-header">
        <div className="v2-sidebar-logo" title="studio+">
          <Icon name="logo" />
        </div>
        {open && (
          <div className="v2-sidebar-title">
            <div className="v2-sidebar-title-main">studio+</div>
            <div className="v2-sidebar-title-sub">Al Zeina</div>
          </div>
        )}
      </div>
      <div className="v2-sidebar-content">
        {NAV_GROUPS.map((g) => (
          <SidebarGroup key={g.label} group={g} open={open}
                        active={active} setActive={setActive} />
        ))}
      </div>
      <div className="v2-sidebar-footer">
        {open ? (
          <div className="v2-sidebar-user">
            <div className="v2-sidebar-avatar">K</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#27272a',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>kitty</div>
              <div style={{ fontSize: 11, color: '#71717a' }}>signed in</div>
            </div>
          </div>
        ) : (
          <div className="v2-sidebar-avatar" title="kitty">K</div>
        )}
      </div>
      {/* Rail handle to expand a collapsed sidebar */}
      <button className="v2-sidebar-rail"
              onClick={() => setOpen((o) => !o)}
              title={open ? 'Collapse' : 'Expand'} />
    </aside>
  );
}

function SidebarGroup({ group, open, active, setActive }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="v2-sb-group">
      {open && (
        <button className="v2-sb-group-label"
                onClick={() => setExpanded((e) => !e)}>
          <span>{group.label}</span>
          <Icon name="chevron" style={{
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 120ms ease',
          }} />
        </button>
      )}
      {(expanded || !open) && (
        <ul className="v2-sb-list">
          {group.items.map((it) => (
            <li key={it.key}>
              <button className={`v2-sb-item ${active === it.key ? 'is-active' : ''}`}
                      onClick={() => setActive(it.key)}
                      title={open ? '' : it.label}>
                <span className="v2-sb-icon"><Icon name={it.icon} /></span>
                {open && <span className="v2-sb-label">{it.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Right sidebar (Table of Contents, shadcn sidebar-15 style) ------

// Studio+-flavoured nav so the page reads like the real app. Replace with
// dynamic data (savedViews, propLayers) once the panel is wired.
const TOC_GROUPS = [
  {
    title: 'Overview',
    items: [
      { key: 'overview/project', label: 'Project info' },
      { key: 'overview/snapshot', label: 'Current snapshot' },
    ],
  },
  {
    title: 'Layers',
    items: [
      { key: 'layers/pavement',  label: 'High-albedo pavement' },
      { key: 'layers/bike-lanes', label: 'Bike lanes', isActive: true },
      { key: 'layers/green',     label: 'Green corridors' },
      { key: 'layers/park',      label: 'Dense large park' },
      { key: 'layers/burjeel',   label: 'Burjeel wind tower' },
    ],
  },
  {
    title: 'Views',
    items: [
      { key: 'views/default',  label: 'Default' },
    ],
  },
  {
    title: 'Camera tour',
    items: [
      { key: 'tour/config',   label: 'Configuration' },
      { key: 'tour/playback', label: 'Playback' },
    ],
  },
];

function RightSidebar({ open, active, setActive }) {
  if (!open) return null;
  return (
    <aside className="v2-right-sidebar"
           style={{ width: RIGHT_W_OPEN }}>
      <div className="v2-sidebar-content">
        <div className="v2-sb-group">
          <div className="v2-sb-group-label" style={{ cursor: 'default' }}>
            <span>Table of contents</span>
          </div>
          <ul className="v2-sb-list">
            {TOC_GROUPS.map((group) => (
              <li key={group.title}>
                <div className="v2-toc-section">
                  <button className="v2-sb-item v2-toc-section-btn"
                          onClick={() => setActive(`section/${group.title}`)}>
                    <span className="v2-sb-label" style={{ fontWeight: 600 }}>{group.title}</span>
                  </button>
                  {group.items?.length > 0 && (
                    <ul className="v2-toc-sub">
                      {group.items.map((it) => (
                        <li key={it.key}>
                          <button className={`v2-sb-item v2-toc-sub-item ${active === it.key ? 'is-active' : ''}`}
                                  onClick={() => setActive(it.key)}>
                            <span className="v2-sb-label">{it.label}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}

// ---------- Inset (main column) ---------------------------------------------

function SidebarInset({ open, rightOpen, children }) {
  return (
    <div className="v2-inset"
         style={{
           marginLeft:  open ? SIDEBAR_W_OPEN : SIDEBAR_W_COLLAPSED,
           marginRight: rightOpen ? RIGHT_W_OPEN : RIGHT_W_COLLAPSED,
         }}>
      {children}
    </div>
  );
}

function Breadcrumb({ crumbs }) {
  return (
    <nav className="v2-breadcrumb" aria-label="breadcrumb">
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {c.current
            ? <span className="v2-breadcrumb-current">{c.label}</span>
            : <a className="v2-breadcrumb-link" href={c.href}>{c.label}</a>}
          {i < crumbs.length - 1 && <span className="v2-breadcrumb-sep">/</span>}
        </span>
      ))}
    </nav>
  );
}

function CardPlaceholder({ title, hint }) {
  return (
    <div className="v2-card">
      <div className="v2-card-title">{title}</div>
      <div className="v2-card-hint">{hint}</div>
    </div>
  );
}

// ---------- Tiny inline icon set --------------------------------------------

function Icon({ name, style }) {
  const s = { width: 16, height: 16, ...style };
  const stroke = 'currentColor', sw = 1.6;
  const cap = 'round', join = 'round', fill = 'none';
  const Box = ({ children }) => (
    <svg viewBox="0 0 24 24" style={s} fill={fill} stroke={stroke}
         strokeWidth={sw} strokeLinecap={cap} strokeLinejoin={join}>{children}</svg>
  );
  switch (name) {
    case 'logo':
      return <Box><polygon points="12,3 21,7.5 12,12 3,7.5" /><polyline points="3,7.5 3,16.5 12,21 21,16.5 21,7.5" /><polyline points="12,12 12,21" /></Box>;
    case 'sidebar-left':
      return <Box><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="9" y1="4" x2="9" y2="20" /></Box>;
    case 'sidebar-right':
      return <Box><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="15" y1="4" x2="15" y2="20" /></Box>;
    case 'chevron':
      return <Box><polyline points="9,5 15,12 9,19" /></Box>;
    case 'home':
      return <Box><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></Box>;
    case 'cube':
      return <Box><polygon points="12,3 21,7.5 12,12 3,7.5" /><polyline points="3,7.5 3,16.5 12,21 21,16.5 21,7.5" /><polyline points="12,12 12,21" /></Box>;
    case 'star':
      return <Box><polygon points="12,3 14.5,9 21,9.5 16,14 17.5,21 12,17.5 6.5,21 8,14 3,9.5 9.5,9" /></Box>;
    case 'layers':
      return <Box><polygon points="12,3 21,8 12,13 3,8" /><polyline points="3,12 12,17 21,12" /><polyline points="3,16 12,21 21,16" /></Box>;
    case 'package':
      return <Box><polyline points="3,8 12,3 21,8 21,16 12,21 3,16 3,8" /><polyline points="3,8 12,13 21,8" /><line x1="12" y1="13" x2="12" y2="21" /></Box>;
    case 'palette':
      return <Box><circle cx="12" cy="12" r="9" /><circle cx="8" cy="9" r="1.2" /><circle cx="12" cy="7" r="1.2" /><circle cx="16" cy="9" r="1.2" /><circle cx="17" cy="13" r="1.2" /><path d="M12 17a1.5 1.5 0 0 1 1.5-1.5h2A2.5 2.5 0 0 0 18 13" /></Box>;
    case 'play':
      return <Box><polygon points="6,3 21,12 6,21" /></Box>;
    default:
      return <Box><circle cx="12" cy="12" r="3" /></Box>;
  }
}
