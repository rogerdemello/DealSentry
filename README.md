# Proposal Reviewer

**Enterprise AI-powered proposal compliance and risk review system**

A complete proposal lifecycle management platform that ensures proposals follow company style, pricing rules, and legal guidelines. Features AI-powered recommendations, real-time compliance checking, contract management, and integrations with enterprise systems.

---

## 🚀 Features

### Core Proposal Management
- **Upload & Review**: Support for DOCX and PDF uploads with automatic text extraction
- **Proposal Templates**: Pre-built templates for Sales Proposals, MSAs, SOWs, and NDAs
- **In-App Editor**: Create and edit proposals with live compliance checking
- **Version Control**: Track amendments and changes with parent-child relationships
- **DOCX Export**: Download proposals as professional Word documents
- **Email Sharing**: Share proposals with colleagues via email

### Compliance Engine
- **Custom Rules**: Create and manage PRICING, LEGAL, and STRUCTURAL compliance rules
- **Live Validation**: Real-time compliance checking while editing
- **Risk Scoring**: Automatic readiness score calculation (0-100%)
- **Violation Detection**: Identifies pricing overages, missing legal clauses, and structural issues
- **AI Recommendations**: Intelligent suggestions for improving proposal quality

### Approval Workflow
- **Multi-Level Review**: Sales Rep → Manager → Legal escalation paths
- **Status Tracking**: PENDING → REVIEWED → APPROVED/REJECTED
- **Workflow Automation**: Auto-escalation for high-risk proposals
- **Audit Trail**: Complete history of all actions and changes

### Contract Management
- **Renewal Tracking**: Dashboard alerts for contracts expiring within 30 days
- **Contract Dates**: Start date, end date, and renewal date tracking
- **Version History**: Side-by-side comparison of proposal versions
- **Auto-Renewal Flags**: Mark contracts for automatic renewal

### Integrations Framework
- **Salesforce**: Sync opportunities and accounts (framework ready)
- **HubSpot**: Sync deals and contacts (framework ready)
- **Gmail/Outlook**: Send proposals via email clients
- **Google Drive**: Auto-backup proposals (framework ready)
- **DocuSign**: E-signature integration (framework ready)
- **SharePoint**: Document upload (framework ready)

### Admin & Analytics
- **User Management**: Role-based access control (SALES_REP, MANAGER, LEGAL, ADMIN)
- **Compliance Dashboard**: View active rules and violations
- **Audit Logs**: Track all user actions and changes
- **Integration Management**: Configure and monitor external system connections

---

## 📋 Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Prisma ORM
- **Document Processing**: PDF parsing, DOCX generation
- **Email**: Resend API
- **Styling**: CSS custom properties (professional, GitHub-inspired design)

---

## 🛠️ Installation

### Prerequisites
- Node.js 18+ 
- PostgreSQL database
- npm or yarn

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd proposal-reviewer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create `.env` file in the root directory:
   ```env
   # Database
   DATABASE_URL="postgresql://user:password@localhost:5432/proposal_reviewer"
   
   # Authentication (REQUIRED)
   NEXTAUTH_SECRET=your_secure_secret_key_here
   # Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   
   # API Configuration
   VITE_API_URL=http://localhost:3001
   
   # Email (Optional - for sharing feature)
   RESEND_API_KEY=your_resend_api_key
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
- Version history
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
✅ **Better tracking** with version control and audit logs  
✅ **Enterprise-ready** with integrations and role-based access  

---