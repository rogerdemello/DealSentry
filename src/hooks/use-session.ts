import { useEffect, useSyncExternalStore } from 'react';
import { ApiError, authApi, type AuthConfig } from '@/lib/api-client';
import { onAuthRequired } from '@/lib/auth-events';
import { AuthUser, cacheSessionUser, clearAuthData, getCurrentUser } from '@/lib/auth-utils';

/**
 * The app's authentication state, shared by every consumer.
 *
 * Two server modes (see GET /api/auth/config):
 *  - demo:  no sign-in. The API serves every request as a default user, so the
 *           session is a one-shot fetch.
 *  - login: a token from login/register is required. When the server answers
 *           401 AUTH_REQUIRED the status becomes "login-required" and App shows
 *           the sign-in page.
 *
 * It starts from the localStorage cache so a reload renders the right name and
 * role before any request lands, and never blocks rendering in demo mode.
 */

/** `unavailable`: the session check could not reach the API (offline, 5xx); it is retried later. */
export type AuthStatus = 'loading' | 'authenticated' | 'login-required' | 'unavailable';

export interface AuthState {
  status: AuthStatus;
  mode: AuthConfig['mode'];
  allowRegistration: boolean;
  user: AuthUser | null;
}

const MODE_KEY = 'authMode';

function readCachedMode(): AuthConfig['mode'] {
  try {
    return localStorage.getItem(MODE_KEY) === 'login' ? 'login' : 'demo';
  } catch {
    return 'demo';
  }
}

function cacheMode(mode: AuthConfig['mode']): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* storage unavailable (private window): the mode is re-fetched on next load */
  }
}

let state: AuthState = {
  status: 'loading',
  mode: readCachedMode(),
  allowRegistration: false,
  user: getCurrentUser(),
};
const subscribers = new Set<() => void>();

function setState(patch: Partial<AuthState>): void {
  state = { ...state, ...patch };
  subscribers.forEach((notify) => notify());
}

const subscribe = (notify: () => void) => {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
};
const getSnapshot = () => state;

const RETURN_TO_KEY = 'returnTo';
const AUTH_PATHS = ['/', '/login', '/auth', '/signup'];

/** Remember where the visitor was headed so signing in can take them back there. */
function rememberReturnTo(): void {
  try {
    const { pathname, search } = window.location;
    if (!AUTH_PATHS.includes(pathname)) sessionStorage.setItem(RETURN_TO_KEY, pathname + search);
  } catch {
    /* storage unavailable: sign-in lands on the dashboard instead */
  }
}

/** The remembered destination (same-site paths only), else the dashboard. Clears it. */
function takeReturnTo(): string {
  try {
    const target = sessionStorage.getItem(RETURN_TO_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
    // Only same-site absolute paths: "//evil.example" would be an open redirect.
    if (target && target.startsWith('/') && !target.startsWith('//')) return target;
  } catch {
    /* fall through */
  }
  return '/dashboard';
}

// The HTTP layer saw a 401 AUTH_REQUIRED: the stored token is dead or missing.
onAuthRequired(() => {
  rememberReturnTo();
  cacheMode('login');
  setState({ status: 'login-required', mode: 'login', user: null });
});

let inflight: Promise<void> | null = null;

/** Work out the mode and who is signed in. Safe to call repeatedly. */
export function loadSession(): Promise<void> {
  if (!inflight) {
    inflight = (async () => {
      try {
        const config = await authApi.config();
        cacheMode(config.mode);
        setState({ mode: config.mode, allowRegistration: config.allowRegistration });
      } catch {
        // An older or unreachable server: assume the mode we last saw.
      }

      try {
        const { user } = await authApi.session();
        cacheSessionUser(user as AuthUser);
        setState({ status: 'authenticated', user: user as AuthUser });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          rememberReturnTo();
          setState({ status: 'login-required', user: null });
        } else {
          console.warn('Could not load session:', err);
          setState({ status: 'unavailable' });
          inflight = null; // allow a later mount to retry
        }
      }
    })();
  }
  return inflight;
}

/** Sign in with a password; reloads into the app so no previous user's data lingers. */
export async function signIn(email: string, password: string): Promise<void> {
  const { token, user } = await authApi.login(email, password);
  finishSignIn(token, user as AuthUser);
}

/** Create an account (when the server allows it) and sign in. */
export async function signUp(data: { email: string; password: string; name?: string }): Promise<void> {
  const { token, user } = await authApi.register(data);
  finishSignIn(token, user as AuthUser);
}

function finishSignIn(token: string, user: AuthUser): void {
  const destination = takeReturnTo();
  clearAuthData();
  localStorage.setItem('auth_token', token);
  cacheSessionUser(user);
  window.location.replace(destination);
}

/** Forget the session and return to the sign-in page. */
export function signOut(): void {
  clearAuthData();
  window.location.replace('/login');
}

/** Full auth state plus the actions that change it. */
export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** The signed-in user (null before the session has loaded and there is no cache). */
export function useSession(): AuthUser | null {
  const { user } = useAuth();
  // Kick off the one-shot load on first use.
  useEffect(() => {
    void loadSession();
  }, []);
  return user;
}
