# 🚀 Quick Start Guide - Proposal Reviewer

## ✅ System Status

**Database**: PostgreSQL (Supabase) - Connected ✅  
**Backend API**: Express.js on port 3001  
**Frontend**: Vite + React on port 5173  
**Authentication**: JWT-based with role-based access control  
**File Storage**: Supabase Storage (proposal-files bucket)

---

## 🎯 Getting Started (5 Minutes)

### 1. Start the Backend API Server

```bash
npm run server
```

The API will start on `http://localhost:3001`

### 2. Start the Frontend Development Server

In a new terminal:

```bash
npm run dev
```

The app will open at `http://localhost:5173`

### 3. Login

**Demo Accounts Available:**

- **Admin User**
  - Email: `admin@reviewer.ai`
  - Password: `demo`
  - Access: Full system access, audit logs, user management

- **Sales Rep**
  - Email: `demo@reviewer.ai`
  - Password: `demo`
  - Access: Create proposals, review, integrations

---

## 📊 Features Available

### ✅ Fully Implemented

1. **Proposal Management**
   - Create, upload, and review proposals
   - AI-powered risk analysis with Azure OpenAI
   - Version control and amendments
   - Contract renewal tracking

2. **Compliance Engine**
   - 8+ pre-configured compliance rules
   - Custom rule creation (PRICING, LEGAL, STRUCTURAL)
   - Real-time validation
   - Risk scoring (0-100%)

3. **Authentication & Security**
   - JWT-based authentication
   - Role-based access control (6 roles)
   - Secure API endpoints
   - Audit logging

4. **Database & Storage**
   - PostgreSQL with Supabase
   - Seeded with demo data
   - File upload support (DOCX, PDF)
   - Automatic text extraction

5. **Integrations Framework**
   - Salesforce OAuth (demo mode ready)
   - HubSpot OAuth (demo mode ready)
   - Gmail OAuth (demo mode ready)
   - Sync logs and status tracking

6. **Audit System**
   - Complete action history
   - User activity tracking
   - Proposal change logs

### 📋 Sample Data Included

- **2 Users** (admin@reviewer.ai, demo@reviewer.ai)
- **8 Compliance Rules** (discount limits, legal clauses, etc.)
- **4 Templates** (Sales Proposal, MSA, SOW, NDA)
- **3 Sample Proposals** (with risk reports)
- **5 Legal Clauses** (indemnification, liability, etc.)

---

## 🔧 Configuration

### Environment Variables (.env)

All critical environment variables are already configured:

```env
# Database (Supabase PostgreSQL)
DATABASE_URL="postgresql://..."
SUPABASE_URL="https://..."
SUPABASE_ANON_KEY="..."

# Azure OpenAI (for AI risk analysis)
AZURE_OPENAI_ENDPOINT="https://..."
OPENAI_API_KEY="..."
AZURE_OPENAI_DEPLOYMENT="gpt-4o"

# Authentication
NEXTAUTH_SECRET="..." # JWT secret key

# Integrations (Demo Mode Enabled)
SALESFORCE_DEMO_MODE="true"
HUBSPOT_DEMO_MODE="false"
GMAIL_DEMO_MODE="false"
```

### Supabase Storage Setup

**Required**: Create a storage bucket named `proposal-files`

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Navigate to Storage
3. Create new bucket: `proposal-files`
4. Set to **Public** (for file URLs)

---

## 🛠️ Development Commands

```bash
# Install dependencies
npm install

# Start backend API server (port 3001)
npm run server

# Start frontend dev server (port 5173)
npm run dev

# Run both servers concurrently
npm run dev:full

# Database commands
npm run seed              # Seed database with demo data
npx prisma db push        # Push schema changes
npx prisma studio         # Open Prisma Studio GUI

# Build for production
npm run build
```

---

## 📁 Project Structure

```
proposal-reviewer/
├── src/
│   ├── api/              # Backend API routes
│   │   ├── auth.ts       # Authentication endpoints
│   │   ├── proposals.ts  # Proposal CRUD
│   │   ├── rules.ts      # Compliance rules
│   │   ├── templates.ts  # Proposal templates
│   │   ├── users.ts      # User management
│   │   ├── integrations.ts # Integration management
│   │   ├── oauth.ts      # OAuth flows
│   │   ├── files.ts      # File upload/download
│   │   ├── analyze.ts    # AI risk analysis
│   │   └── audit.ts      # Audit logs
│   │
│   ├── pages/            # Frontend pages
│   │   ├── Login.tsx     # Authentication page
│   │   ├── Dashboard.tsx # Main dashboard
│   │   ├── Proposals.tsx # Proposal list
│   │   ├── ProposalReview.tsx # Review interface
│   │   ├── Compliance.tsx # Rules management
│   │   ├── Integrations.tsx # Integration setup
│   │   └── Audit.tsx     # Audit logs (admin only)
│   │
│   ├── components/       # Reusable UI components
│   ├── lib/              # Utilities and clients
│   │   ├── api-client.ts # Frontend API client
│   │   ├── supabase.ts   # Supabase client
│   │   └── db.ts         # Prisma client
│   │
│   └── types/            # TypeScript definitions
│
├── prisma/
│   └── schema.prisma     # Database schema
│
├── scripts/
│   └── seed-supabase.ts  # Database seeding script
│
└── server.ts             # Express API server
```

---

## 🔐 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/verify` - Verify JWT token

### Proposals
- `GET /api/proposals` - List all proposals
- `GET /api/proposals/:id` - Get single proposal
- `POST /api/proposals` - Create proposal
- `PUT /api/proposals/:id/status` - Update status
- `DELETE /api/proposals/:id` - Delete proposal
- `POST /api/analyze/:id` - Analyze with AI

### Rules & Templates
- `GET /api/rules` - List compliance rules
- `POST /api/rules` - Create rule
- `GET /api/templates` - List templates

### Users
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `PATCH /api/users/:id` - Update user

### Integrations
- `GET /api/integrations` - List integrations
- `POST /api/integrations/:id/sync` - Trigger sync
- `GET /api/integrations/:id/logs` - Get sync logs

### OAuth
- `GET /api/oauth/salesforce/authorize` - Start Salesforce OAuth
- `GET /api/oauth/hubspot/authorize` - Start HubSpot OAuth
- `GET /api/oauth/gmail/authorize` - Start Gmail OAuth

### Files
- `POST /api/files/upload` - Upload file
- `POST /api/files/extract-text` - Extract text from document
- `GET /api/files/download/:path` - Download file

### Audit
- `GET /api/audit` - Get audit logs (admin only)

---

## 🎨 Key Features by Page

### Dashboard
- Proposal statistics
- Recent proposals
- Contract renewal alerts
- Quick actions

### Proposals
- List view with filters
- Status badges
- Readiness scores
- Quick actions

### Proposal Review
- Full proposal content
- AI risk analysis
- Compliance findings
- Edit and approve

### Compliance
- Active rules list
- Rule creation
- Rule toggle

### Integrations
- OAuth connection status
- Sync triggers
- Sync history
- Demo mode support

### Audit (Admin Only)
- Complete action history
- User filtering
- Proposal filtering
- Timestamp tracking

---

## 🚨 Troubleshooting

### API Server Won't Start
```bash
# Check if port 3001 is in use
netstat -ano | findstr :3001

# Kill process if needed
taskkill /PID <pid> /F
```

### Database Connection Issues
```bash
# Verify DATABASE_URL in .env
# Check Supabase dashboard for connection status
# Try pushing schema again
npx prisma db push
```

### Frontend Won't Connect to API
- Ensure backend is running on port 3001
- Check console for CORS errors
- Verify VITE_API_URL in .env (default: http://localhost:3001)

### File Upload Fails
- Create `proposal-files` bucket in Supabase Storage
- Ensure bucket is set to public
- Check SUPABASE_ANON_KEY in .env

---

## 🎯 Next Steps

1. **Create Supabase Storage Bucket**
   - Name: `proposal-files`
   - Access: Public

2. **Test All Features**
   - Login as admin and sales rep
   - Create a proposal
   - Run AI analysis
   - Test integrations
   - Review audit logs

3. **Customize**
   - Add more compliance rules
   - Create custom templates
   - Configure real OAuth credentials for integrations

4. **Production Deployment**
   - Update environment variables
   - Configure domain
   - Enable real OAuth apps
   - Set up proper authentication with password hashing

---

## 📞 Support

For issues or questions:
- Check the [TODO.md](TODO.md) for known issues
- Review [FRONTEND_DOCUMENTATION.md](FRONTEND_DOCUMENTATION.md) for frontend details
- See [HUBSPOT_SETUP.md](HUBSPOT_SETUP.md) for integration setup

---

**Ready to go! 🎉**

Start both servers and login with the demo accounts to explore all features.
