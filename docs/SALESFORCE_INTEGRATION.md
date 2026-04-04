# Salesforce Integration Steps

This guide explains how to connect DealSentry to Salesforce so you can sync **open Opportunities** into proposals.

---

## Option A: Demo mode (no Salesforce account)

1. In `.env`, ensure:
   ```env
   SALESFORCE_DEMO_MODE="true"
   ```
2. Start the app and go to **Integrations**.
3. Click **Connect** on the Salesforce card.
4. You are redirected back with Salesforce marked as “connected” (demo). Sync will not pull real data.

---

## Option B: Real Salesforce connection (production)

### 1. Create a Connected App in Salesforce

**If you don’t see “New Connected App” or get permission errors, see [“I can’t create a Connected App”](#cant-create-connected-app) below.**

1. Log in to [Salesforce](https://login.salesforce.com) (or [Sandbox](https://test.salesforce.com) for testing).
2. Go to **Setup** (gear icon) → **Setup** (opens in new tab). In the left **Quick Find** box, type **App Manager** and open **App Manager**.
3. Click **New Connected App** (top right).
4. Fill in:
   - **Connected App Name**: e.g. `DealSentry`
   - **API Name**: auto-filled
   - **Contact Email**: your email
5. Enable **OAuth Settings**:
   - Check **Enable OAuth Settings**.
   - **Callback URL** (must match your backend exactly):
     - Local: `http://localhost:3001/api/oauth/salesforce/callback`
     - Production: `https://your-api-domain.com/api/oauth/salesforce/callback`
   - **Selected OAuth Scopes**: add:
     - **Access and manage your data (api)**
     - **Perform requests at any time (refresh_token)**
     - **Allow access to your unique identifiers (openid)** (optional)
6. Under **Additional Settings** (if shown):
   - **Refresh Token Policy**: “Refresh token is valid until revoked”.
7. Save. Wait a few minutes for the app to activate.
8. In the Connected App, open **Manage Consumer Details** and note:
   - **Consumer Key** → use as `SALESFORCE_CLIENT_ID`
   - **Consumer Secret** → use as `SALESFORCE_CLIENT_SECRET`

### 2. Configure environment variables

In your project `.env`:

```env
# Disable demo mode
SALESFORCE_DEMO_MODE="false"

# From Connected App > Manage Consumer Details
SALESFORCE_CLIENT_ID="your_consumer_key_here"
SALESFORCE_CLIENT_SECRET="your_consumer_secret_here"

# Callback URL must match the value in the Connected App exactly
# Default backend port is 3001 (see server.ts / API_PORT)
SALESFORCE_REDIRECT_URI="http://localhost:3001/api/oauth/salesforce/callback"

# Use "true" for Salesforce Sandbox (test.salesforce.com)
SALESFORCE_SANDBOX="false"
```

For production, set:

- `SALESFORCE_REDIRECT_URI="https://your-api-domain.com/api/oauth/salesforce/callback"`
- `SALESFORCE_SANDBOX="true"` only if the Connected App was created in a Sandbox.

### 3. Run the app

- Backend (API) must be running on the port used in `SALESFORCE_REDIRECT_URI` (e.g. 3001).
- Frontend: e.g. `http://localhost:8080`.

```bash
npm run server    # API on port 3001
npm run dev       # Frontend (e.g. 8080)
# Or: npm run dev:full
```

### 4. Connect in the UI

1. Open **Integrations** (e.g. `http://localhost:8080/integrations`).
2. Find **Salesforce** and click **Connect**.
3. You are redirected to Salesforce to log in and authorize the app.
4. After authorizing, you are redirected back to Integrations with Salesforce shown as connected.

### 5. Sync opportunities

1. On the **Integrations** page, with Salesforce connected, click **Sync** (or the sync action for Salesforce).
2. The app fetches **open Opportunities** (not closed) from Salesforce (up to 100, by last modified).
3. New opportunities are created as **proposals** in DealSentry with:
   - Title = Opportunity Name  
   - Content = Opportunity Description (or a short summary if empty)  
   - Metadata: Account name, Amount, Stage, Close Date, `opportunityId`, etc.
4. Opportunities that were already imported are skipped (matched by `opportunityId` in proposal metadata).

---

## “I can’t create a Connected App” (permission / option missing)

If you don’t see **New Connected App** in App Manager, or you get “page not found” / “insufficient privileges”, do the following.

### 1. Check your profile permissions

Your user must have permission to create Connected Apps.

- **Setup** → **Users** → **Profiles** → open your profile (e.g. **System Administrator**).
- Under **Administrative Permissions**, ensure:
  - **Customize Application** = checked  
  - **Manage Connected Apps** (or **Create and Manage Connected Apps**) = checked  
- Save.

If your profile is locked (e.g. standard “System Administrator” with lock icon), you may not be able to edit it. In that case use a **Permission Set** (see step 3) or a different profile that has these permissions.

### 2. Use the correct Setup path

- Click the **gear** icon → **Setup** (the main Setup, not a community or site).
- In the **left sidebar**, use **Quick Find** and type: **App Manager**.
- Open **App Manager** (under **Apps**).
- On the App Manager page, the button is **New Connected App** (top right).  
  If you don’t see it, your profile/permission set doesn’t allow creating Connected Apps (see step 1 and 3).

### 3. Add permissions via Permission Set (if you can’t edit your profile)

- **Setup** → **Users** → **Permission Sets** → **New** (or open an existing one).
- **Manage Connected Apps** = checked (under App Permissions or similar).
- **Object Settings** → ensure **API** access is enabled if required.
- Assign the permission set to your user: **Manage Assignments** → add your user.

### 4. My Domain (required for OAuth in many orgs)

Connected Apps with OAuth often require **My Domain** to be set up.

- **Setup** → **Company Settings** → **My Domain** (or Quick Find: **My Domain**).
- If it says “My Domain is not configured”, click **Configure** and follow the wizard (subdomain + deploy to users). This can take a few minutes.
- After My Domain is deployed, try creating the Connected App again.

### 5. Use a Developer / Trial org (full access)

If your org is locked down by an admin:

- Sign up for a free [Salesforce Developer Edition](https://developer.salesforce.com/signup) (or Trial).
- In that org you’ll have **System Administrator** with **Manage Connected Apps**.
- Create the Connected App there and use its Consumer Key/Secret in DealSentry.
- For local testing, callback URL: `http://localhost:3001/api/oauth/salesforce/callback`.
- Set `SALESFORCE_SANDBOX="false"` for Developer Edition (it uses login.salesforce.com).

### 6. Ask your Salesforce admin

If you’re in a company org and can’t get the permissions above:

- Ask an admin to create a **Connected App** for "DealSentry" with:
  - Callback URL: `http://localhost:3001/api/oauth/salesforce/callback` (or your production callback).
  - OAuth scopes: **api**, **refresh_token**.
- They can then give you the **Consumer Key** and **Consumer Secret** (from **Manage Consumer Details**) to put in your `.env` as `SALESFORCE_CLIENT_ID` and `SALESFORCE_CLIENT_SECRET`. You don’t need to create the app yourself.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Redirect/callback error | `SALESFORCE_REDIRECT_URI` must match **exactly** the Callback URL in the Connected App (including port and path). |
| “Invalid client” / 401 | Correct `SALESFORCE_CLIENT_ID` and `SALESFORCE_CLIENT_SECRET`; Connected App activated. |
| Sandbox vs Production | Use `SALESFORCE_SANDBOX="true"` only for Sandbox (test.salesforce.com). |
| Sync fails / “Please reconnect” | Token may be expired or revoked. Disconnect and connect again from Integrations. |
| No opportunities synced | Only **open** (not closed) opportunities are queried. Ensure you have open Opportunities in Salesforce. |

---

## Technical summary

- **OAuth**: Authorization code flow; tokens (and optional refresh) stored in DB (Integration credentials).
- **Sync**: GET open Opportunities via Salesforce REST API (e.g. `v60.0`), then insert new ones as Proposals with `metadata.opportunityId` to avoid duplicates.
- **Ports**: API default `3001`; frontend default `8080`. Adjust `SALESFORCE_REDIRECT_URI` and `FRONTEND_URL` if you use different ports or domains.
