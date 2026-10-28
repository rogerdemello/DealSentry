import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { signOAuthStart, signOAuthState, verifyOAuthStart, verifyOAuthState } from './oauthState';

const SECRET = process.env.NEXTAUTH_SECRET as string;

describe('OAuth start tokens', () => {
  it('round-trips a user id', () => {
    expect(verifyOAuthStart(signOAuthStart('user-1'))).toBe('user-1');
  });

  it('rejects junk, empty and non-string input', () => {
    for (const bad of ['nope', '', undefined, null, 42, {}]) {
      expect(verifyOAuthStart(bad)).toBeNull();
    }
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ purpose: 'oauth-start', uid: 'u1' }, SECRET, { expiresIn: -5 });
    expect(verifyOAuthStart(expired)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const forged = jwt.sign({ purpose: 'oauth-start', uid: 'u1' }, 'attacker-secret');
    expect(verifyOAuthStart(forged)).toBeNull();
  });
});

describe('OAuth state', () => {
  it('round-trips a user id', () => {
    expect(verifyOAuthState(signOAuthState('user-1'))).toBe('user-1');
  });

  it('rejects the old raw-user-id state, which anyone could forge', () => {
    expect(verifyOAuthState('user-1')).toBeNull();
    // Real user ids are UUIDs; the old state was exactly that, unsigned.
    expect(verifyOAuthState('00000000-0000-4000-8000-000000000001')).toBeNull();
  });

  it('rejects a tampered token', () => {
    const token = signOAuthState('user-1');
    const [header, , signature] = token.split('.');
    const payload = Buffer.from(JSON.stringify({ purpose: 'oauth-state', uid: 'victim' })).toString('base64url');
    expect(verifyOAuthState(`${header}.${payload}.${signature}`)).toBeNull();
  });
});

describe('token purposes are not interchangeable', () => {
  it('a start token is not a valid state, and vice versa', () => {
    expect(verifyOAuthState(signOAuthStart('u1'))).toBeNull();
    expect(verifyOAuthStart(signOAuthState('u1'))).toBeNull();
  });

  it('a session token is neither', () => {
    const session = jwt.sign({ userId: 'u1' }, SECRET, { expiresIn: '7d' });
    expect(verifyOAuthStart(session)).toBeNull();
    expect(verifyOAuthState(session)).toBeNull();
  });

  it('neither can be replayed as a session token', async () => {
    // Decode what a session check would read: there must be no userId claim.
    for (const token of [signOAuthStart('u1'), signOAuthState('u1')]) {
      const claims = jwt.verify(token, SECRET) as Record<string, unknown>;
      expect(claims).not.toHaveProperty('userId');
    }
  });
});
