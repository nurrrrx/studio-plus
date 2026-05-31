// Blueprint splash. Doubles as the auth gate.
// - Not signed in: show username/password form. Submit -> auth, then
//   auto-dismiss 3s later. "Continue as guest" dismisses immediately
//   in read-only mode.
// - Signed in (token already in localStorage on load, or just submitted):
//   no Enter button — show a "Signed in" message and auto-dismiss 3s later.
import { useEffect, useState } from 'react';
import { login, isAuthed, backendConfigured } from '../api.js';

const AUTO_DISMISS_MS = 3000;

export default function Loader({ visible, onDone }) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(isAuthed);

  // Once the user is signed in (already on mount, or after a successful
  // submit), auto-advance to the projects page after a short pause.
  useEffect(() => {
    if (!signedIn || !visible) return;
    const id = setTimeout(() => onDone?.({ authed: true }), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [signedIn, visible, onDone]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    setBusy(true); setErr('');
    try {
      await login(u, p);
      setSignedIn(true);
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

        {signedIn ? (
          <>
            <div className="loader-signed-in">Signed in. Loading projects…</div>
            <div className="loader-blueprint-progress"><span /></div>
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
