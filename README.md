# Proposal Reviewer

<div align="center">

**Enterprise AI-Powered Proposal Compliance & Risk Review System**

A complete proposal lifecycle management platform with AI-powered risk analysis, real-time compliance checking, contract management, and enterprise integrations.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-336791.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Features](#-features) • [Quick Start](#-quick-start) • [Tech Stack](#-tech-stack) • [Documentation](#-documentation) • [Screenshots](#-screenshots)

</div>

---

## 📖 Overview

**Proposal Reviewer** is an enterprise-grade application designed to streamline proposal creation, review, and approval workflows. It ensures all business proposals comply with company pricing policies, legal requirements, and structural standards through automated compliance checking and AI-powered risk analysis.

### Key Capabilities

- 🤖 **AI-Powered Analysis** - Azure OpenAI integration for intelligent risk assessment and recommendations
- ⚖️ **Compliance Engine** - Customizable rules for pricing, legal, and structural validation
- 📄 **Document Management** - Upload, create, and export proposals (DOCX/PDF support)
-  **Contract Lifecycle** - Monitor renewals, expiration dates, and auto-renewal flags
- 🔗 **Enterprise Integrations** - Salesforce, HubSpot, Gmail, Google Drive, DocuSign, SharePoint
- 🔐 **Role-Based Access** - Granular permissions for Sales Reps, Managers, Legal, RevOps, Admins, Auditors
- 📊 **Audit Trail** - Complete activity logging and compliance reporting

---

## ✨ Features

### 📝 Proposal Management

- **Multi-Format Upload**: Drag-and-drop DOCX/PDF files with automatic text extraction
- **Rich Text Editor**: Create and edit proposals with live compliance validation
- **Template Library**: Pre-built templates for Sales Proposals, MSAs, SOWs, NDAs
- **DOCX Export**: Generate professional Word documents with proper formatting
- **Metadata Management**: Deal size, client info, industry, custom fields

### 🛡️ Compliance Engine

- **18+ Rule Types**: PRICING, LEGAL, STRUCTURAL categories
- **Severity Levels**: LOW, MEDIUM, HIGH, CRITICAL
- **Real-Time Validation**: Instant feedback as proposals are edited
- **Risk Scoring**: Automatic readiness calculation (0-100%)
- **Violation Detection**: 
  - Pricing overages (discount thresholds, payment terms)
  - Missing legal clauses (indemnification, liability, warranties)
  - Structural issues (formatting, required sections)
- **Custom Rules**: Create organization-specific compliance requirements

### 🔄 Approval Workflow

- **Multi-Stage Process**: PENDING → REVIEWED → APPROVED/REJECTED
- **Role-Based Routing**: Sales Rep → Sales Manager → Legal → RevOps
- **Auto-Escalation**: High-risk proposals automatically routed to Legal
- **Status Dashboard**: Track all proposals in review pipeline
- **Approval History**: Full audit trail of review decisions

### 📅 Contract Management

- **Renewal Tracking**: Dashboard alerts for contracts expiring within 30/60/90 days
- **Date Management**: Contract start, end, and renewal dates
- **Auto-Renewal Flags**: Mark and track automatic renewals

### 🔗 Integrations

| Service | Status | Features |
|---------|--------|----------|
| **Salesforce** | ✅ Ready | OAuth2, sync opportunities and accounts |
| **HubSpot** | ✅ Ready | OAuth2, sync deals and contacts |
| **Gmail** | ✅ Ready | OAuth2, send proposals via email |
| **Google Drive** | ✅ Ready | OAuth2, automatic proposal backup |
| **DocuSign** | 🚧 Framework | E-signature workflow integration |
| **SharePoint** | 🚧 Framework | Document library upload |

### 👥 User Management

**6 Role Types with Granular Permissions:**

| Role | Capabilities |
|------|--------------|
| **SALES_REP** | Create/edit proposals, submit for review |
| **SALES_MANAGER** | Approve deals, manage team proposals |
| **LEGAL** | Review high-risk proposals, manage legal rules |
| **REVOPS** | Analytics, reporting, process optimization |
| **ADMIN** | Full system access, user management |
| **AUDITOR** | Read-only access to audit logs |

### 📊 Analytics & Reporting

- **Audit Logs**: Complete action history with user, timestamp, details
- **Compliance Dashboard**: Active rules, violation trends, risk metrics
- **Proposal Analytics**: Success rates, average review time, approval bottlenecks
- **Integration Status**: Sync logs, connection health, error tracking

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18.x or higher
- **PostgreSQL** 14.x or higher (or Supabase account)
- **npm** or **yarn**

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/proposal-reviewer.git
cd proposal-reviewer

# Install dependencies
npm install
```

### 2. Environment Configuration

Create a `.env` file in the project root:

```env
# Database - PostgreSQL/Supabase
DATABASE_URL="postgresql://user:password@localhost:5432/proposal_reviewer"
# Supabase format: postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

# API Configuration
VITE_API_URL=http://localhost:3001
API_PORT=3001

# JWT Authentication (REQUIRED)
JWT_SECRET=your_jwt_secret_here_min_32_chars
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Azure OpenAI (for AI-powered risk analysis)
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your_api_key_here
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4

# Supabase Storage (Optional - for file uploads)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Integrations (Optional)
SALESFORCE_CLIENT_ID=your_salesforce_client_id
SALESFORCE_CLIENT_SECRET=your_salesforce_client_secret
SALESFORCE_DEMO_MODE=true  # Set to false for production

HUBSPOT_CLIENT_ID=your_hubspot_client_id
HUBSPOT_CLIENT_SECRET=your_hubspot_client_secret

GMAIL_CLIENT_ID=your_gmail_client_id
GMAIL_CLIENT_SECRET=your_gmail_client_secret

GOOGLE_DRIVE_CLIENT_ID=your_drive_client_id
GOOGLE_DRIVE_CLIENT_SECRET=your_drive_client_secret
```

### 3. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Seed database with demo data
npm run seed
```

The seed script creates:
- 6 demo users (admin@reviewer.ai + test1-5@reviewer.ai, password: `demo`)
- 8 compliance rules (discount limits, legal clauses, etc.)
- 4 proposal templates (Sales Proposal, MSA, SOW, NDA)
- 3 sample proposals with risk reports
- 5 legal clause templates

### 4. Start the Application

**🪟 Windows Users (Easiest Method)**
```bash
# Double-click start.bat or run in terminal
start.bat
```
This improved startup script will:
- ✅ Check Node.js installation and dependencies
- ✅ Clean up any existing servers on ports 3001/8080
- ✅ Start the backend API server
- ✅ Verify API health before continuing
- ✅ Start the frontend dev server
- ✅ Provide troubleshooting guidance

**To stop the servers:**
```bash
stop.bat
```

**Option A: Full Stack (Recommended for CLI)**
```bash
# Start both frontend and backend concurrently
npm run dev:full
```

**Option B: Separate Terminals**
```bash
# Terminal 1 - Backend API
npm run server

# Terminal 2 - Frontend Dev Server  
npm run dev
```

**⚠️ Important**: You must have the backend API server running before attempting to log in. If you only run the frontend (`npm run dev`), you will see a "Network error" when trying to log in.

**🔄 New Stability Features:**
- **Automatic Reconnection**: Frontend automatically retries failed API requests (up to 3 times)
- **Connection Monitoring**: Real-time notifications when API server goes offline/online
- **Graceful Error Handling**: Server logs errors but continues running
- **Port Conflict Resolution**: Automatic detection and cleanup of port conflicts

See [docs/SERVER_STABILITY.md](docs/SERVER_STABILITY.md) for more details on reliability improvements.

### 5. Access the Application

- **Frontend**: http://localhost:8080 (or http://localhost:5173)
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/api/health

The application will automatically monitor the API connection and notify you if the server goes offline.

### 6. Login

**Demo Accounts:**

| Email | Password | Role | Access Level |
|-------|----------|------|--------------|
| admin@reviewer.ai | demo | ADMIN | Full system access |
| test1@reviewer.ai | demo | SALES_REP | Create proposals |
| test2@reviewer.ai | demo | SALES_MANAGER | Approve proposals |
| test3@reviewer.ai | demo | LEGAL | Review compliance |
| test4@reviewer.ai | demo | REVOPS | Analytics |
| test5@reviewer.ai | demo | AUDITOR | View audit logs |

---

## 🏗️ Tech Stack

### Frontend
- **React** 18.3 - UI library with hooks
- **TypeScript** 5.0 - Type-safe JavaScript
- **Vite** - Fast build tool and dev server
- **React Router** 6.30 - Client-side routing
- **TanStack Query** - Server state management
- **Radix UI** - Accessible component primitives
- **Tailwind CSS** - Utility-first styling
- **Framer Motion** - Animation library
- **Lucide Icons** - Icon library
- **Sonner** - Toast notifications

### Backend
- **Node.js** 18+ - JavaScript runtime
- **Express** 5.2 - Web application framework
- **TypeScript** - Type-safe backend code
- **Prisma** 7.3 - Type-safe ORM
- **PostgreSQL** - Relational database
- **JWT** - Token-based authentication
- **bcryptjs** - Password hashing

### Document Processing
- **mammoth.js** - DOCX to HTML conversion
- **docx** - DOCX file generation
- **pdf-parse** - PDF text extraction

### AI & Analysis
- **Azure OpenAI** - GPT-4 for risk analysis
- **OpenAI SDK** - API client library

### Storage & Integration
- **Supabase** - PostgreSQL hosting + file storage
- **OAuth2** - Third-party integrations (Salesforce, HubSpot, Google)

### Development Tools
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **tsx** - TypeScript execution
- **Concurrently** - Run multiple npm scripts

---

## 📚 Documentation

### Core Documentation
- **[SETUP.md](SETUP.md)** - Detailed setup guide with troubleshooting
- **[COMPLIANCE_RULES.md](COMPLIANCE_RULES.md)** - Complete list of 18+ compliance rules
- **[CREDENTIALS.md](CREDENTIALS.md)** - API keys and integration credentials

### Integration Guides
- **[AUTH_QUICKSTART.md](docs/AUTH_QUICKSTART.md)** - Authentication system implementation
- **[SALESFORCE_INTEGRATION.md](docs/SALESFORCE_INTEGRATION.md)** - Salesforce OAuth setup

---

## 🗂️ Project Structure

```
proposal-reviewer/
├── src/
│   ├── pages/              # React pages/routes
│   │   ├── Dashboard.tsx   # Main dashboard
│   │   ├── Proposals.tsx   # Proposal list
│   │   ├── ProposalReview.tsx  # Review interface
│   │   ├── Compliance.tsx  # Rules management
│   │   ├── Integrations.tsx    # External connections
│   │   └── Audit.tsx       # Activity logs
│   │
│   ├── components/         # React components
│   │   ├── ui/            # Reusable UI components
│   │   ├── layout/        # Layout wrappers
│   │   └── proposals/     # Proposal-specific components
│   │
│   ├── api/               # Backend API routes
│   │   ├── proposals.ts   # Proposal CRUD operations
│   │   ├── rules.ts       # Compliance rule management
│   │   ├── auth.ts        # Authentication endpoints
│   │   ├── analyze.ts     # AI risk analysis
│   │   ├── integrations.ts    # External system sync
│   │   └── middleware/    # Auth middleware
│   │
│   ├── lib/               # Utility functions
│   │   ├── api-client.ts  # API request wrapper
│   │   ├── auth.ts        # JWT utilities
│   │   └── supabase.ts    # Supabase client
│   │
│   ├── context/           # React context providers
│   ├── hooks/             # Custom React hooks
│   └── types/             # TypeScript definitions
│
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── seed.ts            # Seed data script
│
├── docs/                  # Additional documentation
├── scripts/               # Utility scripts
└── public/                # Static assets
```

---

## 🔧 API Endpoints

### Authentication
```typescript
POST   /api/auth/signup      # Create new user account
POST   /api/auth/login       # Login and get JWT token
GET    /api/auth/verify      # Verify JWT token validity
POST   /api/auth/logout      # Invalidate session
```

### Proposals
```typescript
GET    /api/proposals        # List all proposals (with filters)
POST   /api/proposals        # Create new proposal
GET    /api/proposals/:id    # Get proposal by ID
PUT    /api/proposals/:id    # Update proposal
DELETE /api/proposals/:id    # Delete proposal
POST   /api/proposals/:id/analyze    # Run AI risk analysis
GET    /api/proposals/:id/export     # Export as DOCX
POST   /api/proposals/:id/amendment  # Create amendment version
```

### Compliance Rules
```typescript
GET    /api/rules            # List all compliance rules
POST   /api/rules            # Create new rule
PUT    /api/rules/:id        # Update rule
DELETE /api/rules/:id        # Delete rule
POST   /api/rules/validate   # Validate proposal against rules
```

### Templates
```typescript
GET    /api/templates        # List all templates
POST   /api/templates        # Create new template
GET    /api/templates/:id    # Get template by ID
PUT    /api/templates/:id    # Update template
DELETE /api/templates/:id    # Delete template
```

### Integrations
```typescript
GET    /api/integrations     # List all integrations
POST   /api/integrations     # Connect new integration
GET    /api/integrations/:id # Get integration details
PUT    /api/integrations/:id # Update integration config
DELETE /api/integrations/:id # Disconnect integration
POST   /api/integrations/:id/sync    # Trigger manual sync
GET    /api/integrations/:id/logs    # Get sync logs
```

### Audit
```typescript
GET    /api/audit            # List audit logs (paginated)
GET    /api/audit/user/:id   # Get user's activity
GET    /api/audit/proposal/:id   # Get proposal history
```

---

## 🎨 Screenshots

### Dashboard
*Main dashboard showing proposals in review, compliance metrics, and renewal alerts*

### Proposal Review
*AI-powered risk analysis with compliance violation highlights and recommendations*

### Compliance Rules
*Manage pricing, legal, and structural compliance rules with severity levels*

### Integrations
*Connect to Salesforce, HubSpot, Gmail, and other enterprise systems*

---

## 🚦 Usage Guide

### Creating a Proposal

1. **From Template**
   - Navigate to "Proposals" → "New Proposal"
   - Select a template (Sales Proposal, MSA, SOW, NDA)
   - Fill in metadata and customize content
   - Save and submit for review

2. **From Upload**
   - Navigate to "Proposals" → "Upload"
   - Drag and drop DOCX/PDF file
   - System extracts text and metadata
   - Review and submit

3. **From Scratch**
   - Navigate to "Proposals" → "Create"
   - Use rich text editor
   - Real-time compliance checking as you type
   - Export as DOCX when complete

### Managing Compliance Rules

```typescript
// Example: Create a discount threshold rule
{
  name: "Maximum Discount Threshold",
  type: "PRICING",
  severity: "HIGH",
  description: "Discounts exceeding 20% require Manager approval",
  logic: "discount > 20",
  active: true
}
```

### Running AI Risk Analysis

The AI analysis evaluates proposals across multiple dimensions:

- **Pricing Compliance**: Discount thresholds, payment terms, deal sizing
- **Legal Requirements**: Required clauses, liability limits, warranties  
- **Structural Quality**: Formatting, completeness, clarity
- **Risk Score**: 0-100% readiness rating
- **Recommendations**: Specific improvements to make

### Setting Up Integrations

**Salesforce Example:**

1. Create a Connected App in Salesforce Setup
2. Configure OAuth settings (callback URL: `http://localhost:3001/api/oauth/salesforce/callback`)
3. Copy Client ID and Secret to `.env`
4. Navigate to "Integrations" in the app
5. Click "Connect" on Salesforce card
6. Authorize access
7. Configure sync settings (opportunities, accounts, frequency)

*See [SALESFORCE_INTEGRATION.md](docs/SALESFORCE_INTEGRATION.md) for detailed steps*

---

## 🧪 Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Database Management

```bash
# Create new migration
npx prisma migrate dev --name migration_name

# Reset database (wipes all data)
npx prisma migrate reset

# Open Prisma Studio (GUI)
npx prisma studio

# Format schema file
npx prisma format
```

### Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format
```

### Building for Production

```bash
# Build frontend and backend
npm run build

# Start production server
npm start

# Preview production build locally
npm run preview
```

---

## 🔐 Security

### Authentication
- **JWT Tokens**: 7-day expiration with secure signing
- **Password Hashing**: bcrypt with 10 salt rounds
- **Protected Routes**: Middleware-based authentication on all API endpoints
- **Role-Based Access**: Granular permission system

### Data Protection
- **Input Validation**: Zod schemas for all API inputs
- **SQL Injection Prevention**: Prisma ORM parameterized queries
- **XSS Protection**: Content sanitization
- **CORS**: Configured for specific origins only

### Environment Variables
- **Never commit `.env` files** to version control
- **Use `.env.example`** as template
- **Rotate secrets regularly** in production
- **Use environment-specific configs** (dev, staging, prod)

### Production Recommendations
- Enable HTTPS with valid SSL certificates
- Use secure cookie settings (httpOnly, secure, sameSite)
- Implement rate limiting on API endpoints
- Set up intrusion detection and monitoring
- Regular security audits and dependency updates

---

## 🐛 Troubleshooting

### Database Connection Issues

```bash
# Verify PostgreSQL is running
psql -U postgres -c "SELECT version();"

# Test connection string
node -e "require('pg').Client({connectionString: process.env.DATABASE_URL}).connect().then(() => console.log('✅ Connected')).catch(e => console.error('❌ Error:', e.message))"

# Regenerate Prisma client
npx prisma generate
```

### Prisma Migration Errors

```bash
# If migrations are out of sync
npx prisma migrate reset  # WARNING: Deletes all data
npx prisma migrate deploy
npm run seed

# Check migration status
npx prisma migrate status
```

### Frontend Build Errors

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Vite cache
rm -rf node_modules/.vite
npm run dev
```

### JWT Authentication Issues

```bash
# Ensure JWT_SECRET is set (min 32 characters)
echo $JWT_SECRET  # Unix/Mac
echo %JWT_SECRET%  # Windows

# Generate new secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### File Upload Problems

- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set
- Check bucket permissions in Supabase dashboard
- Ensure `proposal-files` bucket exists
- Verify file size limits (default 10MB)

---

## 📊 Performance

### Optimization Techniques
- **Code Splitting**: React Router lazy loading for routes
- **Image Optimization**: Compressed assets and lazy loading
- **Database Indexing**: Optimized queries with Prisma indexes
- **Caching**: React Query for client-side data caching
- **Bundle Size**: Tree-shaking and minification with Vite

### Monitoring
- API response times tracked in audit logs
- Integration sync performance metrics
- Database query performance via Prisma logging
- Frontend performance with Lighthouse

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Guidelines
- Follow the existing code style (ESLint + Prettier)
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting PR

### Code Style
- Use TypeScript for all new code
- Follow React best practices and hooks conventions
- Use functional components over class components
- Keep functions small and focused (single responsibility)
- Add JSDoc comments for complex functions

---

## 📝 Roadmap

### Q1 2026
- [ ] Real-time collaboration (multiple users editing)
- [ ] Advanced AI features (clause recommendations, risk prediction)
- [ ] Mobile app (React Native)
- [ ] Enhanced analytics dashboard

### Q2 2026
- [ ] DocuSign e-signature integration (full implementation)
- [ ] SharePoint document management (full implementation)
- [ ] Slack notifications for approvals
- [ ] Custom workflow builder

### Q3 2026
- [ ] Multi-language support (i18n)
- [ ] Advanced reporting (custom dashboards)
- [ ] API webhooks for external systems
- [ ] SSO integration (SAML, LDAP)

### Future
- [ ] Machine learning for auto-categorization
- [ ] Blockchain-based audit trail
- [ ] White-label support
- [ ] Enterprise SaaS offering

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

### Technologies
- [React](https://reactjs.org/) - UI library
- [Prisma](https://www.prisma.io/) - Database ORM
- [Supabase](https://supabase.com/) - Backend as a Service
- [Radix UI](https://www.radix-ui.com/) - Accessible components
- [Tailwind CSS](https://tailwindcss.com/) - Styling framework
- [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service) - AI analysis

### Inspiration
- Enterprise proposal management workflows
- Legal compliance automation needs
- Modern SaaS application patterns

---

## 📞 Support

### Documentation
- **Setup Issues**: See [SETUP.md](SETUP.md)
- **Authentication**: See [AUTH_QUICKSTART.md](docs/AUTH_QUICKSTART.md)
- **Integrations**: See [SALESFORCE_INTEGRATION.md](docs/SALESFORCE_INTEGRATION.md)

### Contact
- **Issues**: [GitHub Issues](https://github.com/yourusername/proposal-reviewer/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/proposal-reviewer/discussions)
- **Email**: support@proposalreviewer.ai

### Community
- Join our [Discord server](#) for real-time help
- Follow us on [Twitter](#) for updates
- Star ⭐ this repository if you find it helpful!

---

<div align="center">

**Built with ❤️ for enterprise sales teams**

[⬆ Back to Top](#proposal-reviewer)

</div>
   RESEND_FROM_EMAIL=noreply@yourcompany.com
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   
   # OpenAI (Optional - for AI recommendations)
   OPENAI_API_KEY=your_openai_api_key
   
   # Integrations (Optional)
   SALESFORCE_CLIENT_ID=
   SALESFORCE_CLIENT_SECRET=
   HUBSPOT_API_KEY=
   GOOGLE_CLIENT_ID=
   MICROSOFT_CLIENT_ID=
   DOCUSIGN_INTEGRATION_KEY=
   ```

4. **Initialize database**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Set up authentication system**
   ```bash
   # Create default admin user
   npx tsx scripts/migrate-auth.ts
   ```
   
   Default admin credentials:
   - Email: `admin@proposal-reviewer.com`
   - Password: `Admin@123`
   
   **⚠️ IMPORTANT:** Change this password immediately after first login!

6. **Run development server**
   ```bash
   # Option 1: Run frontend and backend together
   npm run dev:full
   
   # Option 2: Run separately
   # Terminal 1:
   npm run dev
   
   # Terminal 2:
   npm run server
   ```

7. **Open in browser**
   ```
   http://localhost:5173
   ```

---

## 📖 Usage Guide

### Creating Your First Proposal

**Option 1: Start from Template**
1. Navigate to **Proposals** → **Create New**
2. Select a template (Sales Proposal, MSA, SOW, NDA)
3. Fill in client details and edit content
4. Click "Check Compliance" to see live validation
5. Submit for review

**Option 2: Upload Existing Document**
1. Navigate to **Proposals** → **Upload**
2. Select DOCX or PDF file
3. Enter client information and deal details
4. System automatically extracts text and runs compliance checks
5. Review findings and approve/reject

### Managing Compliance Rules

1. Navigate to **Compliance** page
2. Click **Create Rule**
3. Configure:
   - **Name**: e.g., "Maximum Discount"
   - **Type**: PRICING, LEGAL, or STRUCTURAL
   - **Value**: e.g., "15%" for maximum discount
   - **Description**: When this rule applies
4. Rule is immediately active for all future proposals

### Viewing Expiring Contracts

1. Dashboard shows "Contracts Expiring Soon" widget
2. Contracts expiring within 30 days are listed
3. Click **Review** to see contract details
4. Click **Create Renewal** to start renewal process

### Comparing Versions

1. Open any proposal
2. Navigate to **Versions** tab (or `/proposals/[id]/versions`)
3. Select two versions to compare
4. View side-by-side diff
5. Click **Restore** to revert to previous version

### Setting Up Integrations

1. Navigate to **Integrations** page
2. Click **Connect** on desired integration
3. Enter credentials:
   - API Key
   - OAuth Client ID/Secret (if applicable)
4. Click **Connect**
5. Use **Sync Now** to trigger sync

---

## 🔐 Security

- **Environment Variables**: All sensitive credentials stored in `.env.local` (gitignored)
- **API Keys**: Integration credentials encrypted in database
- **Role-Based Access**: Different permissions for Sales Rep, Manager, Legal, Admin
- **Audit Trail**: All actions logged with user ID and timestamp

---

## 🗂️ Project Structure

```
proposal-reviewer/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── app/
│   │   ├── api/               # API routes
│   │   │   ├── proposals/
│   │   │   ├── rules/
│   │   │   ├── integrations/
│   │   │   └── renewals/
│   │   ├── dashboard/         # Main dashboard
│   │   ├── proposals/         # Proposal management
│   │   ├── compliance/        # Rules management
│   │   ├── integrations/      # Integration admin
│   │   ├── audit/             # Audit logs
│   │   └── admin/             # User management
│   └── lib/
│       └── services/
│           ├── ingestion.service.ts      # Document processing
│           ├── risk-scoring.engine.ts    # Compliance checking
│           └── reasoning.engine.ts       # AI recommendations
└── public/                    # Static assets
```

---

## 🚢 Deployment

### Vercel (Recommended)

1. **Push to GitHub**
   ```bash
   git push origin main
   ```

2. **Deploy to Vercel**
   - Connect GitHub repository
   - Add environment variables in Vercel dashboard
   - Deploy

3. **Database Setup**
   - Use Vercel Postgres or external PostgreSQL (Supabase, Neon, etc.)
   - Run migrations: `npx prisma db push`

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build
CMD ["npm", "start"]
```

```bash
docker build -t proposal-reviewer .
docker run -p 3000:3000 proposal-reviewer
```

---

## 🧪 Testing

Run the development server and test key workflows:

1. **Upload Proposal**: Upload test DOCX/PDF
2. **Create Rule**: Add pricing limit (15% max discount)
3. **Check Compliance**: Upload proposal with 20% discount
4. **View Violations**: Confirm violation appears
5. **Export**: Download as DOCX
6. **Share**: Send via email (requires RESEND_API_KEY)

---

## 📊 Feature Coverage

| Use Case | Coverage | Status |
|----------|----------|--------|
| **Proposal Crafting** | 100% | ✅ Complete |
| **Pre-Sales Review** | 100% | ✅ Complete |
| **Contract Management** | 90% | ✅ Core features |
| **Integrations** | 80% | 🟡 Framework ready |

---

## 🛣️ Roadmap

### Completed ✅
- Core proposal management
- Compliance engine
- DOCX export & email sharing
- Renewal tracking
- Integration admin panel

### In Progress 🚧
- OAuth flows for Salesforce/HubSpot
- Actual sync implementations
- Advanced analytics dashboard

### Planned 📋
- Mobile app
- Bulk operations
- Custom report builder
- SSO integration

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

---

## 📄 License

Proprietary - Enterprise Use Only

---

## 🆘 Support

For issues or questions:
- Create an issue in GitHub
- Contact: support@yourcompany.com
- Docs: https://docs.yourapp.com

---

## 🎯 Key Benefits

✅ **Ensures compliance** with company pricing, legal, and style guidelines  
✅ **Improves quality** with AI-powered recommendations  
✅ **Faster approvals** with automated workflows  
✅ **Better tracking** with audit logs  
✅ **Enterprise-ready** with integrations and role-based access  

---