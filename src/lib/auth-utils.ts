/**
 * Session helpers.
 *
 * The app has no login screen: the API resolves a default user for every request
 * and the SPA caches that identity in localStorage so the sidebar, role-gated nav
 * and Settings can render it without an extra round trip on each page.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  companyId?: string | null;
}

/**
 * Get the current user from the cached session, or null before /api/auth/session
 * has resolved.
 */
export function getCurrentUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;

  const userId = localStorage.getItem('userId');
  const email = localStorage.getItem('userEmail');
  const role = localStorage.getItem('userRole');

  if (!userId || !email || !role) {
    return null;
  }

  return {
    id: userId,
    email,
    name: localStorage.getItem('userName') || null,
    role,
    companyId: localStorage.getItem('companyId') || null,
  };
}

/**
 * Always true — sign-in was removed, so every visitor is treated as a valid
 * session. Kept so callers don't need to special-case the old auth flow.
 */
export function isAuthenticated(): boolean {
  return true;
}

/** Cache the session user returned by /api/auth/session. */
export function cacheSessionUser(user: AuthUser): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem('userId', user.id);
  localStorage.setItem('userEmail', user.email);
  localStorage.setItem('userName', user.name || user.email);
  localStorage.setItem('userRole', user.role);

  if (user.companyId) {
    localStorage.setItem('companyId', user.companyId);
  } else {
    localStorage.removeItem('companyId');
  }
}

/** Clear the cached session. */
export function clearAuthData(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem('auth_token');
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('userId');
  localStorage.removeItem('userEmail');
  localStorage.removeItem('userName');
  localStorage.removeItem('userRole');
  localStorage.removeItem('companyId');
}

/** Check if the current user has a specific role. */
export function hasRole(role: string | string[]): boolean {
  const currentUser = getCurrentUser();
  if (!currentUser) return false;

  if (Array.isArray(role)) {
    return role.includes(currentUser.role);
  }

  return currentUser.role === role;
}

/** Check if the current user is an admin. */
export function isAdmin(): boolean {
  return hasRole('ADMIN');
}
