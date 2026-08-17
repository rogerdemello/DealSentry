import { useEffect, useState } from 'react';
import { authApi } from '@/lib/api-client';
import { AuthUser, cacheSessionUser, getCurrentUser } from '@/lib/auth-utils';

/**
 * The acting user, as reported by /api/auth/session.
 *
 * There is no login screen — the API resolves a default user — so this is a
 * one-shot fetch shared by every consumer. It starts from the localStorage cache
 * so a reload renders the right name and role before the request lands.
 */
let cached: AuthUser | null = null;
let inflight: Promise<AuthUser | null> | null = null;
const subscribers = new Set<(user: AuthUser | null) => void>();

function loadSession(): Promise<AuthUser | null> {
  if (!inflight) {
    inflight = authApi
      .session()
      .then(({ user }) => {
        cached = user as AuthUser;
        cacheSessionUser(cached);
        subscribers.forEach((notify) => notify(cached));
        return cached;
      })
      .catch((err) => {
        console.warn('Could not load session:', err);
        inflight = null; // allow a later mount to retry
        return null;
      });
  }
  return inflight;
}

export function useSession(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(() => cached ?? getCurrentUser());

  useEffect(() => {
    subscribers.add(setUser);
    loadSession().then((resolved) => {
      if (resolved) setUser(resolved);
    });
    return () => {
      subscribers.delete(setUser);
    };
  }, []);

  return user;
}
