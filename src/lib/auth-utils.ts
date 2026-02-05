/**
 * Authentication utility functions for managing user sessions
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  companyId?: string | null;
}

/**
 * Get the currently authenticated user from localStorage
 */
export function getCurrentUser(): AuthUser | null {
  const token = localStorage.getItem('auth_token');
  const isLoggedIn = localStorage.getItem('isLoggedIn');

  if (!token || isLoggedIn !== 'true') {
    return null;
  }

  const userId = localStorage.getItem('userId');
  const email = localStorage.getItem('userEmail');
  const name = localStorage.getItem('userName');
  const role = localStorage.getItem('userRole');
  const companyId = localStorage.getItem('companyId');

  if (!userId || !email || !role) {
    return null;
  }

  return {
    id: userId,
    email,
    name: name || null,
    role,
    companyId: companyId || null,
  };
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const token = localStorage.getItem('auth_token');
  const isLoggedIn = localStorage.getItem('isLoggedIn');
  return !!token && isLoggedIn === 'true';
}

/**
 * Get the authentication token
 */
export function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

/**
 * Set authentication data in localStorage
 */
export function setAuthData(token: string, user: AuthUser): void {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('isLoggedIn', 'true');
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

/**
 * Clear all authentication data
 */
export function clearAuthData(): void {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('userId');
  localStorage.removeItem('userEmail');
  localStorage.removeItem('userName');
  localStorage.removeItem('userRole');
  localStorage.removeItem('companyId');
}

/**
 * Check if user has a specific role
 */
export function hasRole(role: string | string[]): boolean {
  const currentUser = getCurrentUser();
  if (!currentUser) return false;

  if (Array.isArray(role)) {
    return role.includes(currentUser.role);
  }

  return currentUser.role === role;
}

/**
 * Check if user is an admin
 */
export function isAdmin(): boolean {
  return hasRole('ADMIN');
}
