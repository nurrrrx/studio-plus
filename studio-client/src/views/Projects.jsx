// Projects (home) page: dark navy with a subtle tilted blueprint grid (fine +
// accent lines) and a radial vignette. Project cubes are isometric SVGs
// arranged in a centred row, sized so they visually rest on the grid texture.
import { useEffect, useState } from 'react';
import { listProjects, createProject, deleteProject, isAuthed, backendConfigured } from '../api.js';

const DEFAULT_PROJECT = {
  id: 'alzeina',
  name: 'Al Zeina — Axonometric Study',
  location: 'Al Raha Beach, Abu Dhabi',
};

// Stable slug for an arbitrary project name.
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || `p-${Date.now()}`;

export default function Projects({ activeTitle, activeId, onOpen, onRename }) {
  const [projects, setProjects] = useState([{ ...DEFAULT_PROJECT, name: activeTitle || DEFAULT_PROJECT.name }]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  // Hydrate from the backend if it's reachable. On failure (no backend in
  // dev, or network) the default project remains visible.
  useEffect(() => {
    if (!backendConfigured()) return;
    listProjects().then((list) => {
      if (!list || list.length === 0) return;
      setProjects(list.map((p) => ({ id: p.id, name: p.name, location: p.location || '—' })));
    }).catch(() => {});
  }, []);

  // Keep the active card's name in sync with the live header title.
  useEffect(() => {
    setProjects((ps) => ps.map((p) => p.id === (activeId || 'alzeina') ? { ...p, name: activeTitle || p.name } : p));
  }, [activeTitle, activeId]);

  const commitAdd = async () => {
    const n = newName.trim();
    if (!n) { setAdding(false); return; }
    const id = slugify(n);
    // Optimistic add; the backend mirror happens in the background if authed.
    setProjects((ps) => ps.find((p) => p.id === id) ? ps : [...ps, { id, name: n, location: '—' }]);
    setAdding(false); setNewName('');
    if (backendConfigured() && isAuthed()) {
      try { await createProject(id, n, ''); }
      catch (e) { /* 409 (already exists) is fine; surface other errors silently */ }
    }
  };

  const removeProject = async (p) => {
    if (!window.confirm(`Delete project "${p.name}"? This can't be undone.`)) return;
    setProjects((ps) => ps.filter((x) => x.id !== p.id));
    if (backendConfigured() && isAuthed()) {
      try { await deleteProject(p.id); }
      catch (e) { /* swallow; if it fails, a refresh will bring it back */ }
    }
  };
  // Only show the ✕ for projects we can actually delete: requires auth and
  // we don't allow deleting the project that's currently open.
  const canDelete = backendConfigured() && isAuthed();

  return (
    <div className="projects-page">
      <div className="projects-bg-grid" />
      <div className="projects-vignette" />
      <div className="projects-cubes">
        {projects.map((p, i) => (
          <CubeTile key={p.id}
                    name={p.name}
                    sub={p.location}
                    paletteIndex={i}
                    onClick={() => onOpen?.(p)}
                    onDelete={canDelete && p.id !== (activeId || 'alzeina') ? () => removeProject(p) : undefined}
                    onDoubleClick={() => {
                      const next = prompt('Rename project', p.name);
                      if (next && next.trim()) {
                        setProjects((ps) => ps.map((x) => x.id === p.id ? { ...x, name: next.trim() } : x));
                        if (p.id === (activeId || 'alzeina')) onRename?.(next.trim());
                      }
                    }} />
        ))}
        {adding ? (
          <NewCubeInput value={newName} onChange={setNewName}
                        onCommit={commitAdd}
                        onCancel={() => { setAdding(false); setNewName(''); }} />
        ) : (
          <CubeTile isNew name="New project" sub="Start a fresh study"
                    onClick={() => { setAdding(true); setNewName(''); }} />
        )}
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
