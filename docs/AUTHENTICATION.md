# Authentication System

This document describes the authentication system implemented in the Proposal Reviewer application.

## Overview

The application uses a JWT-based authentication system with bcrypt password hashing for secure user authentication.

## Features

- ✅ Secure password hashing with bcrypt (10 salt rounds)
- ✅ JWT token-based authentication (7-day expiration)
- ✅ Protected routes with automatic redirect to login
- ✅ Token verification on each request
- ✅ Password strength validation
- ✅ Email validation
- ✅ User role management
- ✅ Session persistence
- ✅ Automatic logout on token expiration

## Database Schema

The `User` model includes the following fields:

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String   // Hashed with bcrypt
  name      String?
  role      Role     @default(SALES_REP)
  // ... other fields
}
```

## API Endpoints

### POST `/api/auth/register`

Register a new user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "name": "John Doe" // optional
}
```

**Response:**
```json
{
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "SALES_REP",
    "companyId": null
  }
}
```

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

### POST `/api/auth/login`

Login an existing user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Response:** Same as register endpoint

### GET `/api/auth/verify`

Verify if the current JWT token is valid.

**Headers:**
```
Authorization: Bearer jwt-token-here
```

**Response:**
```json
{
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "SALES_REP",
    "companyId": null
  }
}
```

## Frontend Components

### ProtectedRoute Component

Wraps routes that require authentication. Automatically redirects to `/auth` if the user is not authenticated.

**Usage:**
```tsx
<Route 
  path="/dashboard" 
  element={<ProtectedRoute><Dashboard /></ProtectedRoute>} 
/>
```

### Auth Page

Located at `/auth`, `/login`, or `/signup`. Features:

- Toggle between login and signup modes
- Email and password validation
- Real-time password strength indicator
- Password confirmation for signup
- Terms and conditions acceptance for signup
- Error handling with user-friendly messages

## Auth Utilities

The `src/lib/auth-utils.ts` file provides helper functions:

- `getCurrentUser()` - Get the currently authenticated user
- `isAuthenticated()` - Check if user is authenticated
- `getAuthToken()` - Get the JWT token
- `setAuthData(token, user)` - Store authentication data
- `clearAuthData()` - Clear all authentication data
- `hasRole(role)` - Check if user has a specific role
- `isAdmin()` - Check if user is an admin

**Example:**
```typescript
import { isAuthenticated, getCurrentUser, hasRole } from '@/lib/auth-utils';

if (isAuthenticated()) {
  const user = getCurrentUser();
  if (hasRole('ADMIN')) {
    // Admin-only code
  }
}
```

## Setup Instructions

### 1. Update Database Schema

The Prisma schema has been updated to include the password field. Run the migration:

```bash
npx prisma migrate dev --name add_password_field
```

### 2. Create Default Admin User

Run the migration script to create a default admin user:

```bash
npx tsx scripts/migrate-auth.ts
```

Default credentials:
- Email: `admin@proposal-reviewer.com`
- Password: `Admin@123`

**⚠️ IMPORTANT:** Change this password immediately after first login!

### 3. Update Environment Variables

Create or update your `.env` file with:

```env
NEXTAUTH_SECRET=your-secure-secret-key-here
```

Generate a secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Security Best Practices

1. **Password Hashing:** All passwords are hashed using bcrypt with 10 salt rounds
2. **JWT Secret:** Store in environment variable, never commit to version control
3. **Token Expiration:** Tokens expire after 7 days
4. **HTTPS:** Always use HTTPS in production
5. **Password Requirements:** Enforce strong password policies
6. **Rate Limiting:** Consider implementing rate limiting on auth endpoints
7. **Secure Headers:** Set appropriate security headers in production

## User Roles

The system supports the following roles:

- `SALES_REP` - Standard sales representative (default)
- `SALES_MANAGER` - Sales team manager
- `LEGAL` - Legal team member
- `REVOPS` - Revenue operations team
- `ADMIN` - System administrator
- `AUDITOR` - Can access audit logs

## Authentication Flow

1. **Registration:**
   - User submits email, password, and optional name
   - Password is validated (length, complexity)
   - Password is hashed with bcrypt
   - User record is created in database
   - JWT token is generated and returned
   - Token and user data stored in localStorage

2. **Login:**
   - User submits email and password
   - System finds user by email
   - Password is compared with hashed version
   - JWT token is generated and returned
   - Token and user data stored in localStorage

3. **Protected Routes:**
   - User attempts to access protected route
   - ProtectedRoute component checks for valid token
   - Token is verified with backend
   - If valid, render protected content
   - If invalid, redirect to `/auth`

4. **Logout:**
   - Clear all authentication data from localStorage
   - Redirect to `/auth`

## Error Handling

The system handles various error scenarios:

- Invalid credentials
- Expired tokens
- Weak passwords
- Duplicate email addresses
- Network errors
- Server errors

All errors are displayed to users with clear, actionable messages.

## Testing

Test the authentication system:

1. **Register a new user:**
   - Navigate to `/signup`
   - Enter valid credentials
   - Verify account creation and auto-login

2. **Login with existing user:**
   - Navigate to `/login`
   - Enter credentials
   - Verify successful login

3. **Access protected route:**
   - Try accessing `/dashboard` without logging in
   - Verify redirect to `/auth`
   - Login and verify access granted

4. **Token expiration:**
   - Login and wait for token to expire (or manually delete token)
   - Try accessing protected route
   - Verify redirect to `/auth`

5. **Logout:**
   - Click logout button
   - Verify redirect to `/auth`
   - Verify unable to access protected routes

## Troubleshooting

### "Invalid credentials" on login
- Verify email and password are correct
- Check if account exists
- Ensure password field is in database schema

### "Token expired" or automatic logout
- Token expires after 7 days
- Simply login again

### Can't access protected routes after login
- Check browser console for errors
- Verify token is stored in localStorage
- Check network tab for failed API requests

### Migration errors
- Ensure database is running
- Check database connection settings
- Verify Prisma schema is up to date
- Run `npx prisma generate` to regenerate Prisma client

## Future Enhancements

Potential improvements to consider:

- [ ] Password reset functionality
- [ ] Email verification
- [ ] Two-factor authentication (2FA)
- [ ] OAuth integration (Google, Microsoft, etc.)
- [ ] Session management (view/revoke active sessions)
- [ ] Password history (prevent reuse)
- [ ] Account lockout after failed attempts
- [ ] Refresh token rotation
- [ ] Remember me functionality
- [ ] CAPTCHA for signup/login
