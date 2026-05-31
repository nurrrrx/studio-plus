// Projects (home) page: dark navy with a subtle tilted blueprint grid (fine +
// accent lines) and a radial vignette. Project cubes are isometric SVGs
// arranged in a centred row, sized so they visually rest on the grid texture.
import { useEffect, useState } from 'react';
import { listProjects, createProject, deleteProject, saveProject, isAuthed, backendConfigured } from '../api.js';

// Used only as a dev-time fallback when the backend isn't configured
// (VITE_API_URL unset). In production the server is the sole source of truth
// — projects not in Postgres don't appear on the home grid.
const DEV_FALLBACK_PROJECT = {
  id: 'alzeina',
  name: 'Al Zeina — Axonometric Study',
  location: 'Al Raha Beach, Abu Dhabi',
};

// Stable slug for an arbitrary project name.
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || `p-${Date.now()}`;

export default function Projects({ activeTitle, activeId, onOpen, onRename }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  // Project pending delete confirmation (rendered as a modal). null = closed.
  const [pendingDelete, setPendingDelete] = useState(null);

  // Hydrate from the backend. Server is the source of truth — the list shown
  // is whatever Postgres says. If the backend is unreachable, surface that as
  // an error rather than fabricating a default cube. In dev (no backend at
  // all), fall back to the legacy single-project view so local work isn't
  // blocked.
  const refresh = () => {
    if (!backendConfigured()) {
      setProjects([{ ...DEV_FALLBACK_PROJECT, name: activeTitle || DEV_FALLBACK_PROJECT.name }]);
      setLoading(false); setLoadError(null);
      return;
    }
    setLoading(true); setLoadError(null);
    listProjects()
      .then((list) => {
        setProjects((list || []).map((p) => ({ id: p.id, name: p.name, location: p.location || '—' })));
        setLoading(false);
      })
      .catch((e) => { setLoadError(e.message || 'Could not reach the server'); setLoading(false); });
  };
  useEffect(refresh, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the active card's name in sync with the live header title (purely
  // visual — the canonical name in Postgres only changes on rename).
  useEffect(() => {
    if (!activeId) return;
    setProjects((ps) => ps.map((p) => p.id === activeId ? { ...p, name: activeTitle || p.name } : p));
  }, [activeTitle, activeId]);

  const commitAdd = async () => {
    const n = newName.trim();
    if (!n) { setAdding(false); return; }
    const id = slugify(n);
    setAdding(false); setNewName('');
    if (!backendConfigured()) {
      // Dev fallback: optimistic add to local state, no backend to mirror.
      setProjects((ps) => ps.find((p) => p.id === id) ? ps : [...ps, { id, name: n, location: '—' }]);
      return;
    }
    if (!isAuthed()) {
      window.alert('Sign in to create a project.');
      return;
    }
    try {
      await createProject(id, n, '');
      // Authoritative: only show what the server now has.
      setProjects((ps) => ps.find((p) => p.id === id) ? ps : [...ps, { id, name: n, location: '—' }]);
    } catch (e) {
      // 409 means the slug already exists — just show what's there.
      if (/409|already exists/i.test(e.message || '')) refresh();
      else window.alert(`Couldn't create: ${e.message}`);
    }
  };

  const confirmDelete = async () => {
    const p = pendingDelete; if (!p) return;
    setPendingDelete(null);
    if (!backendConfigured()) {
      // Dev fallback: local-only delete.
      setProjects((ps) => ps.filter((x) => x.id !== p.id));
      return;
    }
    if (!isAuthed()) { window.alert('Sign in to delete projects.'); return; }
    // Optimistic remove, rollback on failure so the UI mirrors Postgres.
    setProjects((ps) => ps.filter((x) => x.id !== p.id));
    try { await deleteProject(p.id); }
    catch (e) {
      setProjects((ps) => ps.find((x) => x.id === p.id) ? ps : [...ps, p]);
      window.alert(`Couldn't delete: ${e.message}`);
    }
  };

  const renameProject = async (p) => {
    const next = window.prompt('Rename project', p.name);
    const trimmed = next?.trim();
    if (!trimmed || trimmed === p.name) return;
    // Optimistic local update; mirror to Postgres so the next list-load
    // returns the new name too.
    setProjects((ps) => ps.map((x) => x.id === p.id ? { ...x, name: trimmed } : x));
    if (p.id === activeId) onRename?.(trimmed);
    if (!(backendConfigured() && isAuthed())) return;
    try { await saveProject(p.id, { name: trimmed }); }
    catch (e) {
      setProjects((ps) => ps.map((x) => x.id === p.id ? { ...x, name: p.name } : x));
      window.alert(`Couldn't rename: ${e.message}`);
    }
  };

  // ✕ visible only when we can actually persist the delete, and never on the
  // currently open project (would orphan the view).
  const canDelete = backendConfigured() && isAuthed();

  return (
    <div className="projects-page">
      <div className="projects-bg-grid" />
      <div className="projects-vignette" />
      <div className="projects-cubes">
        {loading && <div className="projects-status">Loading projects…</div>}
        {loadError && (
          <div className="projects-status projects-status-err">
            Couldn't load projects: {loadError}.{' '}
            <button type="button" className="projects-status-link" onClick={refresh}>Retry</button>
          </div>
        )}
        {!loading && !loadError && projects.map((p, i) => (
          <CubeTile key={p.id}
                    name={p.name}
                    sub={p.location}
                    paletteIndex={i}
                    onClick={() => onOpen?.(p)}
                    onDelete={canDelete && p.id !== activeId ? () => setPendingDelete(p) : undefined}
                    onDoubleClick={() => renameProject(p)} />
        ))}
        {!loading && !loadError && (adding ? (
          <NewCubeInput value={newName} onChange={setNewName}
                        onCommit={commitAdd}
                        onCancel={() => { setAdding(false); setNewName(''); }} />
        ) : (
          <CubeTile isNew name="New project" sub="Start a fresh study"
                    onClick={() => { setAdding(true); setNewName(''); }} />
        ))}
      </div>

      {pendingDelete && (
        <DeleteModal name={pendingDelete.name}
                     onConfirm={confirmDelete}
                     onCancel={() => setPendingDelete(null)} />
      )}
    </div>
  );
}

function DeleteModal({ name, onConfirm, onCancel }) {
  // Close on Esc; confirm on Enter. Backdrop click also cancels.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
      else if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm, onCancel]);
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>Delete project?</h3>
        <p>
          “{name}” will be permanently removed from the server, including all of its
          saved view and prop layers. This can't be undone.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-danger" onClick={onConfirm} autoFocus>Delete</button>
        </div>
      </div>
    </div>
  );
}

const PALETTES = [
  { top: '#3d4f73', right: '#2a3556', left: '#1c2540', stroke: '#8aa3c8' },
  { top: '#4a5582', right: '#33406a', left: '#212b4e', stroke: '#a3b8d8' },
  { top: '#46527a', right: '#2f3b62', left: '#1f2848', stroke: '#94a8c8' },
  { top: '#3b4d72', right: '#283455', left: '#1a2240', stroke: '#88a2c8' },
];

function CubeTile({ name, sub, paletteIndex = 0, isNew, onClick, onDoubleClick, onDelete }) {
  return (
    <button className={`cube-tile ${isNew ? 'new' : ''}`}
            onClick={onClick} onDoubleClick={onDoubleClick}
            title={onDoubleClick ? 'Click to open · double-click to rename' : 'Click to open'}>
      {/* Per-cube delete trigger. Span (not button) so we don't nest buttons.
          Stops propagation so it doesn't also open the project. */}
      {onDelete && (
        <span role="button" tabIndex={0} aria-label="Delete project"
              className="cube-delete" title="Delete project"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onDelete(); } }}>
          ×
        </span>
      )}
      <div className="cube-svg-wrap">
        <Cube isNew={isNew} palette={PALETTES[paletteIndex % PALETTES.length]} />
      </div>
      <div className="cube-caption">
        <div className="name">{name}</div>
        <div className="sub">{sub}</div>
      </div>
    </button>
  );
}

function Cube({ palette, isNew }) {
  const W = 192, H = 192;
  const p = {
    topUp:    `${W/2},${H*0.21}`,
    topRight: `${W*0.97},${H*0.42}`,
    topDown:  `${W/2},${H*0.63}`,
    topLeft:  `${W*0.03},${H*0.42}`,
    botRight: `${W*0.97},${H*0.84}`,
    botDown:  `${W/2},${H*1.0}`,
    botLeft:  `${W*0.03},${H*0.84}`,
  };
  const topFace   = `${p.topUp} ${p.topRight} ${p.topDown} ${p.topLeft}`;
  const leftFace  = `${p.topLeft} ${p.topDown} ${p.botDown} ${p.botLeft}`;
  const rightFace = `${p.topRight} ${p.topDown} ${p.botDown} ${p.botRight}`;
  const stroke = palette.stroke;
  const strokeProps = isNew
    ? { stroke, strokeWidth: 1.6, strokeLinejoin: 'round', strokeDasharray: '6 5' }
    : { stroke, strokeWidth: 1.6, strokeLinejoin: 'round' };
  const fillTop   = isNew ? 'rgba(122,184,255,0.10)' : palette.top;
  const fillRight = isNew ? 'rgba(122,184,255,0.07)' : palette.right;
  const fillLeft  = isNew ? 'rgba(122,184,255,0.05)' : palette.left;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polygon points={topFace}   fill={fillTop}   {...strokeProps} />
      <polygon points={leftFace}  fill={fillLeft}  {...strokeProps} />
      <polygon points={rightFace} fill={fillRight} {...strokeProps} />
    </svg>
  );
}

function NewCubeInput({ value, onChange, onCommit, onCancel }) {
  return (
    <div className="cube-tile new" style={{ cursor: 'default' }}>
      <div className="cube-svg-wrap">
        <Cube isNew palette={PALETTES[0]} />
      </div>
      <div className="cube-caption" style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        <input autoFocus value={value} onChange={(e) => onChange(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') onCommit(); else if (e.key === 'Escape') onCancel(); }}
               placeholder="Project name…"
               style={{ fontSize: 13, padding: '4px 8px', background: '#0b1226',
                        border: '1px solid #27334a', borderRadius: 4, color: '#e2e8f0',
                        outline: 'none', textAlign: 'center', minWidth: 160 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onCancel}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 3,
                           border: '1px solid #27334a', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onCommit}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 3,
                           border: '1px solid #7ab8ff', background: '#7ab8ff', color: '#0e172c', cursor: 'pointer' }}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
