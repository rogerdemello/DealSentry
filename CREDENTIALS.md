# Current User Credentials

## All Users - Default Password

**Default Password for all existing users:** `ChangeMe@123`

⚠️ **IMPORTANT:** Users should change their passwords immediately after first login!

## User List

### Admin User
- **Email:** `admin@dealsentry.ai`
- **Password:** `ChangeMe@123`
- **Role:** ADMIN

### Sales Representatives
1. **Email:** `demo@dealsentry.ai`
   - **Password:** `ChangeMe@123`
   - **Role:** SALES_REP

2. **Email:** `test@dealsentry.ai`
   - **Password:** `ChangeMe@123`
   - **Role:** SALES_REP

3. **Email:** `test@gmail.com`
   - **Password:** `ChangeMe@123`
   - **Role:** SALES_REP

## Quick Start

1. **Start the application:**
   ```bash
   npm run dev:full
   ```

2. **Navigate to:** http://localhost:5173/auth

3. **Login with any of the credentials above**

4. **Change your password immediately** (recommended)

## Password Requirements

When changing passwords, ensure they meet these requirements:
- ✅ At least 8 characters
- ✅ One uppercase letter
- ✅ One lowercase letter
- ✅ One number

## Security Notes

🔒 The password field is currently optional to support migration. Once all users have set their passwords, consider making it required again by:

1. Updating `schema.prisma`:
   ```prisma
   password  String   // Remove the ? to make it required
   ```

2. Running:
   ```bash
   npx prisma db push
   ```

---

**Migration completed:** February 5, 2026
**Total users migrated:** 4
**Status:** ✅ All users now have hashed passwords
