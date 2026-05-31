// Blueprint splash. Doubles as the auth gate: while the splash is visible
// the user can sign in (read+write) or skip (read-only). The splash stays
// until the user takes an action, then fades out via the parent.
import { useState } from 'react';
import { login, isAuthed, backendConfigured } from '../api.js';

export default function Loader({ visible, onDone }) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const alreadyIn = isAuthed();

  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    setBusy(true); setErr('');
    try {
      await login(u, p);
      onDone?.({ authed: true });
    } catch (e) {
      setErr(e.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`loader-blueprint ${visible ? '' : 'fade-out'}`} aria-hidden={!visible}>
      <div className="loader-blueprint-grid" />
      <div className="loader-blueprint-vignette" />
      <div className="loader-blueprint-content">
        <div className="loader-blueprint-title">
          studio<sup className="loader-blueprint-plus">+</sup>
        </div>

        {alreadyIn ? (
          <>
            <div className="loader-blueprint-progress"><span /></div>
            <button className="loader-skip" type="button" onClick={() => onDone?.({ authed: true })}>
              Enter
            </button>
          </>
        ) : (
          <form className="loader-login" onSubmit={submit} autoComplete="off">
            <input className="loader-login-input" type="text" placeholder="username"
                   value={u} onChange={(e) => setU(e.target.value)} autoFocus />
            <input className="loader-login-input" type="password" placeholder="password"
                   value={p} onChange={(e) => setP(e.target.value)} />
            {err && <div className="loader-login-err">{err}</div>}
            <div className="loader-login-row">
              <button className="loader-login-btn" type="submit" disabled={busy || !backendConfigured()}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <button className="loader-skip" type="button" onClick={() => onDone?.({ authed: false })}>
                Continue as guest
              </button>
            </div>
            {!backendConfigured() && (
              <div className="loader-login-hint">Backend not configured — running in local mode.</div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
