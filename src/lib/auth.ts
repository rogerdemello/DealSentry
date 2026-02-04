// Authentication helper functions
// In production, integrate with your actual auth system (NextAuth, Auth0, etc.)

export type UserRole = 'ADMIN' | 'EMPLOYEE' | 'GUEST';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

/**
 * Get the current user's role
 * In production, this would fetch from your auth session/JWT
 */
export function getUserRole(): UserRole {
  // Check localStorage for demo purposes
  if (typeof window !== 'undefined') {
    const storedRole = localStorage.getItem('userRole') as UserRole | null;
    return storedRole || 'ADMIN'; // Default to ADMIN for demo
  }
  return 'ADMIN';
}

/**
 * Set user role (for demo/testing purposes)
 * In production, this would be managed by your auth system
 */
export function setUserRole(role: UserRole): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('userRole', role);
  }
}

/**
 * Check if user has required role
 */
export function hasRole(role: UserRole | UserRole[]): boolean {
  const userRole = getUserRole();
  if (Array.isArray(role)) {
    return role.includes(userRole);
  }
  return userRole === role;
}

/**
 * Check if user can access audit logs
 */
export function canAccessAudit(): boolean {
  return hasRole(['ADMIN', 'EMPLOYEE']);
}
