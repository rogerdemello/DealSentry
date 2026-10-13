/**
 * Authentication mode and secrets.
 *
 * demo  (default) — no login screen. Every request without a valid token is
 *                   served as one default user (DEMO_USER_EMAIL, else the first
 *                   ADMIN). This is what the hosted demo runs.
 * login           — real multi-user mode (AUTH_MODE=login). A valid bearer token
 *                   is required for every protected route; there is no default
 *                   identity, and data is isolated per company / per owner.
 *
 * Read from the environment on every call so tests (and a restarted dev server)
 * can switch modes without re-importing modules.
 */

export type AuthMode = 'demo' | 'login';

/** Placeholder previously used when NEXTAUTH_SECRET was unset. Never trusted in login mode. */
const INSECURE_DEFAULT_SECRET = 'default-secret-change-in-production';

export function getAuthMode(): AuthMode {
  return process.env.AUTH_MODE === 'login' ? 'login' : 'demo';
}

export function isLoginMode(): boolean {
  return getAuthMode() === 'login';
}

/**
 * Whether anyone may create their own account via POST /api/auth/register.
 * Off unless ALLOW_SELF_REGISTRATION=true: accounts are otherwise created by an
 * administrator (POST /api/users) or scripts/migrate-auth.ts.
 */
export function allowSelfRegistration(): boolean {
  return process.env.ALLOW_SELF_REGISTRATION === 'true';
}

/**
 * The secret used to sign and verify session tokens. In login mode a missing or
 * placeholder secret is a hard error — anyone could otherwise mint a token for
 * any user. In demo mode the placeholder is tolerated (tokens only choose which
 * user a request acts as, and every visitor is already the default admin).
 */
export function getJwtSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret && secret !== INSECURE_DEFAULT_SECRET) return secret;
  if (isLoginMode()) {
    throw new Error('AUTH_MODE=login requires NEXTAUTH_SECRET to be set to a long random value');
  }
  return INSECURE_DEFAULT_SECRET;
}

/**
 * Fail fast at startup on an unsafe configuration instead of failing on the
 * first request. Returns warnings for configurations that are legal but risky.
 */
export function checkAuthConfig(): string[] {
  const warnings: string[] = [];
  if (isLoginMode()) {
    getJwtSecret(); // throws if unsafe
  } else if (process.env.NODE_ENV === 'production') {
    if (!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET === INSECURE_DEFAULT_SECRET) {
      warnings.push('NEXTAUTH_SECRET is not set; session tokens are signed with a public placeholder.');
    }
    warnings.push('AUTH_MODE is "demo": every visitor is served as the default user. Set AUTH_MODE=login for multi-user deployments.');
  }
  return warnings;
}
