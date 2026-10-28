import { refresh, saveSession, type AuthConfig, type Session } from "./auth";

export class SessionExpired extends Error {}

/** Fetches an admin endpoint, refreshing the Supabase session when it's about to expire. */
export function createApi(config: AuthConfig, getSession: () => Session | null, setSession: (s: Session | null) => void) {
  async function ensureFresh(): Promise<Session> {
    const session = getSession();
    if (!session) throw new SessionExpired();
    if (session.expiresAt - 60 > Date.now() / 1000) return session;
    const next = await refresh(config, session);
    if (!next) throw new SessionExpired();
    saveSession(next);
    setSession(next);
    return next;
  }

  return async function get<T>(view: string): Promise<T> {
    let session = await ensureFresh();
    let res = await fetch(`/api/admin/${view}`, { headers: { authorization: `Bearer ${session.accessToken}` } });
    if (res.status === 401) {
      const next = await refresh(config, session);
      if (!next) throw new SessionExpired();
      saveSession(next);
      setSession(next);
      session = next;
      res = await fetch(`/api/admin/${view}`, { headers: { authorization: `Bearer ${session.accessToken}` } });
    }
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) throw new SessionExpired();
    if (!res.ok) throw new Error(body.message ?? "Couldn't load this page. Please try again.");
    return body as T;
  };
}

export type Api = ReturnType<typeof createApi>;
