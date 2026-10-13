# Authentication

DealSentry has two authentication modes, chosen by the `AUTH_MODE` environment
variable. Both are implemented in `src/api/middleware/auth.ts` and
`src/api/lib/authConfig.ts`.

| | `demo` (default) | `login` |
| --- | --- | --- |
| Sign-in screen | none | email + password |
| Request without a token | served as the **default user** | `401 AUTH_REQUIRED` |
| Who is the default user | `DEMO_USER_EMAIL`, else the first `ADMIN`, else the first user | — |
| Data isolation | everyone is an admin, so everything is visible | per company; users with no company see only what they own |
| `NEXTAUTH_SECRET` | should be set (warning if not) | **required** — the server refuses to start without a real one |
| Typical use | demos, a single team | real multi-user deployments |

A valid bearer token is honoured in both modes and identifies the user.

## Turning on multi-user mode

1. **Secrets.** Generate a signing secret and set both variables:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
   ```

   ```env
   AUTH_MODE=login
   NEXTAUTH_SECRET=<the value above>
   ```

   On Render, `NEXTAUTH_SECRET` is generated for you by `render.yaml`; add `AUTH_MODE=login` in the dashboard.

2. **Database.** Add the company column and indexes (idempotent):

   ```bash
   npx prisma db execute --file prisma/manual/multi_user.sql
   ```

3. **Passwords.** The seed data creates users *without* passwords. Issue each one a random password
   (printed once, never stored in clear text):

   ```bash
   npm run set-passwords                       # everyone who has none
   npm run set-passwords -- --dry-run          # preview
   npm run set-passwords -- --reset a@b.com    # new password for one user
   ```

4. **Start the server.** `npm run dev:full` (or deploy). People now land on the sign-in page.

### Creating more users

- **Admin:** `POST /api/users` with `{ email, name, role, password, companyId }` (admin only). `companyId` puts the
  user in a tenant; users in the same company share proposals, users with no company only see their own.
- **Self-service:** set `ALLOW_SELF_REGISTRATION=true` and the sign-in page offers "Create an account". New accounts are
  always `SALES_REP` with no company — the API ignores a client-supplied company or role.
- **Password change:** Settings → Change password (`POST /api/auth/change-password`).

## How it works

- `POST /api/auth/login` checks the bcrypt hash and returns a 7-day JWT (`{ userId, ... }`), stored by the SPA as
  `auth_token` in `localStorage`. The middleware **re-reads the user from the database on every request**, so role and
  company changes and deleted accounts take effect immediately.
- `GET /api/auth/config` (public) tells the SPA which mode the server is in.
- When the API answers `401 AUTH_REQUIRED`, the SPA clears the session and shows the sign-in page.
- Login, registration and password-change are rate limited (10 attempts per 15 minutes per client in production).
  Behind a proxy such as Render, `TRUST_PROXY` (default `1` in production) makes "per client" mean the real visitor.

### OAuth redirects (Salesforce, HubSpot, Gmail)

Browser redirects cannot carry an `Authorization` header, and the 7-day session token must not be put in a URL. So the SPA
calls `POST /api/oauth/start-token` first and navigates with the returned **2-minute, single-purpose** token. The
`state` parameter sent through the provider is a signed, 10-minute token too — a callback cannot be forged for another
user's id. Neither token can be used as a session token.

## Security notes

- Passwords are bcrypt-hashed (10 rounds) and **never returned** by any endpoint.
- In login mode, `GET /api/users` is admin-only and non-admins can read only their own user record.
- Session tokens are signed with `NEXTAUTH_SECRET`; rotating it signs everyone out.
- Not implemented (would be natural next steps): password reset by email, email verification, 2FA, and server-side
  session revocation (a token stays valid until it expires or the user is deleted).
