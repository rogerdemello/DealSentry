// Authentication helper functions
// This file provides backward compatibility with the new auth-utils

import { getCurrentUser, hasRole as hasRoleUtil, isAdmin as isAdminUtil } from './auth-utils';

export type UserRole = 'ADMIN' | 'SALES_REP' | 'SALES_MANAGER' | 'LEGAL' | 'REVOPS' | 'AUDITOR';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

/**
 * Get the current user's role
 */
export function getUserRole(): UserRole {
  const user = getCurrentUser();
  return (user?.role as UserRole) || 'SALES_REP';
}

/**
 * Set user role (for demo/testing purposes - deprecated, use auth API instead)
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
  return hasRoleUtil(role);
}

/**
 * Check if user can access audit logs
 */
export function canAccessAudit(): boolean {
  return hasRole(['ADMIN', 'AUDITOR']);
}

/**
 * Check if user is an admin
 */
export function isAdmin(): boolean {
  return isAdminUtil();
}
