import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createApi } from "./api";
import {
  fetchConfig,
  loadSession,
  saveSession,
  sendPasswordReset,
  setPassword,
  signIn,
  signOut,
  takeLinkError,
  takeLinkSession,
  type AuthConfig,
  type Session,
} from "./auth";
import { Button, ErrorState, Field, Spinner } from "./ui";
import { Overview } from "./views/Overview";
import { Registrations } from "./views/Registrations";
import { Requests } from "./views/Requests";
import { Waitlist } from "./views/Waitlist";

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">FU</span>
      <span>Footy Up Admin</span>
    </div>
  );
}

function Login({ config, onSignedIn, initialError }: { config: AuthConfig; onSignedIn: (s: Session) => void; initialError: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPw] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const dev = config.auth === "dev";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (resetMode) {
        await sendPasswordReset(config, email);
        setNotice("If that email has access, a reset link is on its way. Check your inbox.");
      } else {
        onSignedIn(await signIn(config, email, password));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <Brand />
        <div>
          <h1>{resetMode ? "Reset your password" : "Sign in"}</h1>
          <p>{resetMode ? "We'll email you a link to choose a new password." : "Registrations, Miami spots and training requests."}</p>
        </div>
        {dev && <div className="notice notice-dev">Local test mode: sign in with an admin email, no password needed.</div>}
        {config.auth === "unconfigured" && <div className="notice notice-error">Sign-in isn't configured on this deployment yet.</div>}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        {notice && <div className="notice notice-ok" role="status">{notice}</div>}
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {!dev && !resetMode && (
          <Field label="Password">
            <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPw(e.target.value)} />
          </Field>
        )}
        <Button type="submit" disabled={busy || config.auth === "unconfigured"}>
          {busy ? "Please wait…" : resetMode ? "Send reset link" : "Sign in"}
        </Button>
        {!dev && (
          <button type="button" className="link" onClick={() => { setResetMode(!resetMode); setError(null); setNotice(null); }}>
            {resetMode ? "Back to sign in" : "Forgot your password?"}
          </button>
        )}
      </form>
    </div>
  );
}

function ChoosePassword({ config, session, invited, onDone }: { config: AuthConfig; session: Session; invited: boolean; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 10) return setError("Use at least 10 characters.");
    if (pw !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await setPassword(config, session, pw);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <Brand />
        <div>
          <h1>{invited ? "Welcome — choose a password" : "Choose a new password"}</h1>
          <p>You'll use it with your email to sign in from now on.</p>
        </div>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <Field label="New password" hint="At least 10 characters.">
          <input className="input" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Field label="Confirm password">
          <input className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
      </form>
    </div>
  );
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "registrations", label: "Registrations" },
  { id: "requests", label: "Private training" },
  { id: "waitlist", label: "Waitlist" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function Dashboard({ config, session, setSession, onSignOut }: { config: AuthConfig; session: Session; setSession: (s: Session | null) => void; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>(() => (TABS.find((t) => `#${t.id}` === location.hash)?.id ?? "overview"));
  const sessionRef = useMemo(() => ({ current: session }), []);
  sessionRef.current = session;
  const api = useMemo(() => createApi(config, () => sessionRef.current, setSession), [config, sessionRef, setSession]);
  const expired = useCallback(() => onSignOut(), [onSignOut]);

  useEffect(() => {
    history.replaceState(null, "", `#${tab}`);
    window.scrollTo(0, 0);
  }, [tab]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <nav className="tabs" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t.id} className="tab" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="user">
            <span>{session.email}</span>
            <Button variant="ghost" onClick={onSignOut}>Sign out</Button>
          </div>
        </div>
      </header>
      <main className="main">
        {tab === "overview" && <Overview api={api} onExpired={expired} />}
        {tab === "registrations" && <Registrations api={api} onExpired={expired} />}
        {tab === "requests" && <Requests api={api} onExpired={expired} />}
        {tab === "waitlist" && <Waitlist api={api} onExpired={expired} />}
      </main>
    </>
  );
}

export function App() {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [session, setSessionState] = useState<Session | null>(() => loadSession());
  const [link, setLink] = useState<{ session: Session; type: string } | null>(null);
  const [linkError] = useState(() => takeLinkError());

  const setSession = useCallback((s: Session | null) => {
    saveSession(s);
    setSessionState(s);
  }, []);

  useEffect(() => {
    fetchConfig().then(setConfig, (err) => setConfigError((err as Error).message));
    const fromLink = takeLinkSession();
    if (fromLink) setLink(fromLink);
  }, []);

  const handleSignOut = useCallback(() => {
    if (config) void signOut(config, session);
    setSessionState(null);
  }, [config, session]);

  if (configError) return <div className="auth"><ErrorState message={configError} onRetry={() => location.reload()} /></div>;
  if (!config) return <div className="auth"><Spinner /></div>;

  if (link && (link.type === "recovery" || link.type === "invite")) {
    return (
      <ChoosePassword
        config={config}
        session={link.session}
        invited={link.type === "invite"}
        onDone={() => {
          setSession({ ...link.session, email: "" });
          setLink(null);
        }}
      />
    );
  }

  if (!session) return <Login config={config} onSignedIn={setSession} initialError={linkError} />;
  return <Dashboard config={config} session={session} setSession={setSession} onSignOut={handleSignOut} />;
}
