<<<<<<< HEAD
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
# DealSentry

DealSentry is an AI-assisted proposal compliance and risk review system for sales teams, compliance managers, and operations leaders. It helps teams create, upload, analyze, and approve business proposals while checking pricing, legal, and structural requirements before a deal moves forward.

## Problem

Proposal reviews are usually slow, inconsistent, and spread across too many tools. Teams have to check discounting, missing clauses, approval thresholds, and document quality by hand, which creates delays and increases the chance of risky proposals going out unchecked.

## Approach

The application combines a React frontend, an Express/TypeScript API, Prisma, and PostgreSQL to manage proposals end to end. Uploaded or created proposals are analyzed against compliance rules, scored for risk, and routed through review workflows so users can see issues early and act on them quickly.

Core capabilities include proposal creation, document upload, AI-assisted analysis, approval routing, audit logging, and enterprise integrations such as Salesforce, HubSpot, Gmail, and Google Drive.

## Iterations

The project evolved in stages:

1. Built the core proposal management flow so users could create, store, and review proposals.
2. Added compliance rules and risk scoring to catch pricing, legal, and structural issues.
3. Expanded the workflow with uploads, approvals, audit logs, and role-based access control.
4. Added integrations and stability improvements so the system can fit into a real sales operations stack.

## Key Design Choices

The main design choices were made to keep the system practical for enterprise use:

- A clear separation between frontend, API, and database logic keeps the codebase easier to maintain.
- Prisma is used for schema-driven data access and safer database operations.
- Role-based access control limits what each user can see and do.
- Automated analysis and scoring reduce manual review time and make risk visible earlier.
- Responsive UI patterns and reusable components keep the interface consistent across proposal, compliance, and admin screens.
- Integration support is built in from the start so the system can connect to external business tools without major redesign.

## Daily Time Commitment

Typical development time was about 2 to 4 focused hours per day during active implementation. That pace was enough to make steady progress on UI, backend routes, compliance logic, and integration work without sacrificing review and testing time.

## Setup

### Requirements

- Node.js 18 or newer
- PostgreSQL 14 or newer, or a Supabase project
- npm

### Install

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed
```

### Run

```bash
npm run dev:full
```

On Windows, you can also use `start.bat` to launch the backend and frontend together.

## Documentation

- [SETUP.md](SETUP.md)
- [COMPLIANCE_RULES.md](COMPLIANCE_RULES.md)
- [docs/SERVER_STABILITY.md](docs/SERVER_STABILITY.md)
- [docs/AUTH_QUICKSTART.md](docs/AUTH_QUICKSTART.md)
- [docs/SALESFORCE_INTEGRATION.md](docs/SALESFORCE_INTEGRATION.md)
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
DealSentry/
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
=======
# DealSentry

DealSentry is an AI-assisted proposal compliance and risk review system for sales teams, compliance managers, and operations leaders. It helps teams create, upload, analyze, and approve business proposals while checking pricing, legal, and structural requirements before a deal moves forward.

## Problem

Proposal reviews are usually slow, inconsistent, and spread across too many tools. Teams have to check discounting, missing clauses, approval thresholds, and document quality by hand, which creates delays and increases the chance of risky proposals going out unchecked.

## Approach

The application combines a React frontend, an Express/TypeScript API, Prisma, and PostgreSQL to manage proposals end to end. Uploaded or created proposals are analyzed against compliance rules, scored for risk, and routed through review workflows so users can see issues early and act on them quickly.

Core capabilities include proposal creation, document upload, AI-assisted analysis, approval routing, audit logging, and enterprise integrations such as Salesforce, HubSpot, Gmail, and Google Drive.

## Iterations

The project evolved in stages:

1. Built the core proposal management flow so users could create, store, and review proposals.
2. Added compliance rules and risk scoring to catch pricing, legal, and structural issues.
3. Expanded the workflow with uploads, approvals, audit logs, and role-based access control.
4. Added integrations and stability improvements so the system can fit into a real sales operations stack.

## Key Design Choices

The main design choices were made to keep the system practical for enterprise use:

- A clear separation between frontend, API, and database logic keeps the codebase easier to maintain.
- Prisma is used for schema-driven data access and safer database operations.
- Role-based access control limits what each user can see and do.
- Automated analysis and scoring reduce manual review time and make risk visible earlier.
- Responsive UI patterns and reusable components keep the interface consistent across proposal, compliance, and admin screens.
- Integration support is built in from the start so the system can connect to external business tools without major redesign.

## Daily Time Commitment

Typical development time was about 2 to 4 focused hours per day during active implementation. That pace was enough to make steady progress on UI, backend routes, compliance logic, and integration work without sacrificing review and testing time.

## Setup

### Requirements

- Node.js 18 or newer
- PostgreSQL 14 or newer, or a Supabase project
- npm

### Install

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed
```

### Run

```bash
npm run dev:full
```

On Windows, you can also use `start.bat` to launch the backend and frontend together.

## Documentation

- [SETUP.md](SETUP.md)
- [COMPLIANCE_RULES.md](COMPLIANCE_RULES.md)
- [docs/SERVER_STABILITY.md](docs/SERVER_STABILITY.md)
- [docs/AUTH_QUICKSTART.md](docs/AUTH_QUICKSTART.md)
- [docs/SALESFORCE_INTEGRATION.md](docs/SALESFORCE_INTEGRATION.md)
>>>>>>> 0b654cf (Update README.md)
