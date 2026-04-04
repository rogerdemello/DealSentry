# DealSentry - User Journey

## User Personas

### 1. Sales Representative
- Creates proposals for clients
- Uploads documents
- Views compliance feedback
- Makes revisions based on recommendations

### 2. Admin/Compliance Manager
- Reviews all proposals
- Approves/rejects proposals
- Manages compliance rules
- Views audit logs
- Monitors system-wide compliance

---

## Main User Journeys

## Journey 1: Creating a Proposal with AI (Natural Language)

### 👤 Persona: Sales Representative

**Goal:** Quickly generate a professional, compliance-ready proposal

### Steps:

1. **Login**
   - Navigate to `/auth`
   - Enter email/password
   - System authenticates and redirects to dashboard

2. **Dashboard Overview**
   - View summary cards (Total Proposals, Pending, Approved, Rejected)
   - See recent proposals list
   - Identify need to create new proposal

3. **Navigate to Create**
   - Click "Create Proposal" button
   - Redirected to `/proposals/create`

4. **AI Generation (Natural Language)**
   - Select "AI Generate" tab
   - Enter natural language prompt:
     ```
     "Create a proposal for Acme Corporation for cloud migration 
     project worth $250,000 with 15% discount. Include database 
     migration, containerization, and 6 months support. Timeline 4 months."
     ```
   - Click "Generate with AI"

5. **AI Processing**
   - ⏳ System shows: "Generating proposal..."
   - AI extracts:
     - Company name: Acme Corporation
     - Deal size: $250,000
     - Discount: 15%
     - Services: Cloud migration details
     - Timeline: 4 months
   - AI generates complete proposal with:
     - ✅ Executive Summary
     - ✅ Proposed Solution
     - ✅ Pricing breakdown
     - ✅ Timeline & Milestones
     - ✅ **All required legal clauses** (indemnification, liability, termination, etc.)
     - ✅ Next Steps

6. **Automatic Analysis**
   - 🔄 System shows: "Running analysis..."
   - AI analyzes proposal against compliance rules:
     - ✅ Discount within limit (15% < 25%)
     - ✅ Deal size above minimum ($250K > $10K)
     - ✅ Payment terms ≤ 90 days
     - ✅ All legal clauses present
   - Generates **Readiness Score**: 85/100

7. **Review Page**
   - Redirected to `/proposals/{id}/review`
   - See comprehensive overview:
     - **Risk Overview**
       - Readiness Score: 85%
       - Legal Risk: 15%
       - Pricing Risk: 30%
       - Structural Risk: 20%
     - **Findings & Recommendations**
       - Color-coded by severity
       - Specific issues with locations
       - Actionable recommendations

8. **Take Action**
   - If issues found: Make revisions
   - If clean: Export PDF or request approval
   - View detailed proposal content

---

## Journey 2: Uploading an Existing Document

### 👤 Persona: Sales Representative

**Goal:** Review and validate an existing proposal document

### Steps:

1. **Navigate to Upload**
   - From dashboard, click "Upload Proposal"
   - Redirected to `/proposals/upload`

2. **Upload Document**
   - Drag & drop or select file (DOCX/PDF)
   - Enter client/company name: "TechCorp Industries"
   - See file preview with name and size

3. **Processing Stages**
   - 📤 Stage 1: "Uploading file..." (0-30%)
   - 📄 Stage 2: "Extracting content..." (30-60%)
     - System extracts text from DOCX using Mammoth
     - Processes document structure
   - 🤖 Stage 3: "AI analyzing proposal..." (60-100%)
     - Runs compliance analysis
     - Generates risk assessment

4. **Analysis Complete**
   - ✅ "Upload Complete!"
   - Shows analysis results
   - Navigated to review page

5. **View Results**
   - See extracted content with markdown formatting
   - Review compliance findings
   - Export professional PDF for client

---

## Journey 3: Manual Proposal Creation

### 👤 Persona: Sales Representative

**Goal:** Create proposal from scratch with custom content

### Steps:

1. **Navigate to Create**
   - Go to `/proposals/create`
   - Select "Manual Entry" tab

2. **Fill Form**
   - **Company Name**: "Global Enterprises"
   - **Proposal Title**: "Digital Transformation Initiative"
   - **Content** (optional): Paste or write custom content
   - Click "Create Proposal"

3. **Automatic Processing**
   - System creates proposal with status: PENDING
   - Automatically triggers analysis
   - Shows: "Analyzing proposal..."

4. **Review & Edit**
   - Redirected to review page
   - See basic structure
   - Can add more content later

---

## Journey 4: Admin Approval Workflow

### 👤 Persona: Admin/Compliance Manager

**Goal:** Review and approve/reject proposals

### Steps:

1. **Dashboard Overview**
   - Login as Admin
   - View system-wide metrics
   - See all pending proposals

2. **Navigate to Proposals**
   - Go to `/proposals`
   - Filter by status: "Pending"
   - See list of proposals needing review

3. **Open Proposal for Review**
   - Click on proposal card
   - Redirected to `/proposals/{id}/review`

4. **Comprehensive Review**
   - **Risk Overview Section**
     - Check readiness score
     - Review risk breakdown (Legal, Pricing, Structural)
   
   - **Findings Section**
     - Review critical/high severity issues
     - Check issue locations
     - Assess business impact
   
   - **Proposal Content**
     - Read full proposal
     - Verify all sections complete
     - Check legal clauses

5. **Decision Making**
   
   **Option A: Approve** ✅
   - Click "Approve" button
   - Proposal status → APPROVED
   - Sales rep notified
   - Can export PDF for client
   
   **Option B: Reject** ❌
   - Click "Reject" button
   - Confirm rejection
   - Proposal status → REJECTED
   - Sales rep notified to revise
   
   **Option C: Request Revisions**
   - Mark as "In Review"
   - Add comments
   - Sales rep makes changes

6. **Audit Trail**
   - All actions logged
   - Navigate to `/audit`
   - View complete history of actions

---

## Journey 5: Managing Compliance Rules

### 👤 Persona: Admin/Compliance Manager

**Goal:** Define organizational compliance standards

### Steps:

1. **Navigate to Compliance**
   - Go to `/compliance`
   - View all active rules

2. **View Existing Rules**
   - See predefined rules:
     - Maximum Discount (25%)
     - Payment Terms Limit (90 days)
     - Minimum Deal Size ($10,000)
     - Required Legal Clauses
     - Indemnification Requirements

3. **Add New Rule**
   - Click "Add Rule" button
   - Fill rule form:
     - **Name**: "Maximum Liability Cap"
     - **Description**: "Total liability cannot exceed contract value"
     - **Category**: Legal
     - **Severity**: High
     - **Active**: Yes

4. **Rule Application**
   - All new proposals automatically evaluated against new rule
   - Existing proposals can be re-analyzed

5. **Edit/Deactivate Rules**
   - Click edit on any rule
   - Modify parameters
   - Toggle active/inactive status
   - Changes apply immediately

---

## Journey 6: Exporting Professional PDF

### 👤 Persona: Sales Representative

**Goal:** Generate client-facing proposal document

### Steps:

1. **Open Approved Proposal**
   - Navigate to proposal review page
   - Status: APPROVED

2. **Export PDF**
   - Click "Export PDF" button in Actions section
   - System generates professional PDF with:
     - ✅ Professional cover page
     - ✅ Executive summary
     - ✅ Proposal content (with formatted headers, bold text)
     - ✅ Implementation approach
     - ✅ Terms & conditions
     - ✅ Applicable compliance rules (Appendix)
     - ✅ Next steps
     - ✅ Quality assurance summary

3. **PDF Features**
   - Enterprise-level formatting
   - Page numbers
   - Professional styling
   - Client branding ready
   - Confidentiality notices

4. **Download & Share**
   - PDF downloads automatically
   - Filename: `proposal-[Title].pdf`
   - Ready to email to client

---

## Journey 7: Integrations (Salesforce)

### 👤 Persona: Sales Representative

**Goal:** Connect proposal system with Salesforce

### Steps:

1. **Navigate to Integrations**
   - Go to `/integrations`
   - View available integrations

2. **Connect Salesforce**
   - Click "Connect" on Salesforce card
   - OAuth flow opens
   - Login to Salesforce
   - Authorize access

3. **Sync Opportunities**
   - View synced opportunities
   - Import client data
   - Link proposals to opportunities

4. **Automatic Updates**
   - Proposal status syncs to Salesforce
   - Deal values update automatically
   - Bi-directional data flow

---

## Key Features Across Journeys

### 🤖 AI-Powered Features
- Natural language proposal generation
- Automatic compliance analysis
- Risk assessment
- Recommendations for improvement
- Content extraction from documents

### 📊 Analytics & Insights
- Readiness scores (0-100%)
- Risk breakdown (Legal, Pricing, Structural)
- Color-coded severity levels
- Trend analysis on dashboard

### 🔒 Security & Compliance
- Role-based access control (Admin vs User)
- Company-level data isolation
- Audit logging for all actions
- Confidentiality enforcement

### 📝 Document Management
- Multiple file formats (DOCX, PDF)
- Markdown content support
- PDF export with professional formatting
- Version control

### ⚡ Real-Time Features
- Automatic analysis on creation
- Instant feedback
- Live status updates
- Toast notifications

---

## Success Metrics

### For Sales Representatives:
- ✅ Create compliant proposal in < 5 minutes
- ✅ Pass compliance check on first submission
- ✅ Professional PDF ready for client
- ✅ Clear guidance on issues

### For Admins:
- ✅ Review proposal in < 2 minutes
- ✅ Complete visibility into compliance
- ✅ Audit trail for all actions
- ✅ Configurable rules

### For Organization:
- ✅ 90%+ compliance rate
- ✅ Reduced approval time
- ✅ Standardized proposals
- ✅ Risk mitigation

---

## Error Handling & Edge Cases

### Scenario: AI Generation Fails
- User sees clear error message
- Option to retry or use manual entry
- System logs error for investigation

### Scenario: Analysis Times Out
- Proposal still created
- User can manually trigger analysis later
- Notification when analysis completes

### Scenario: Offline Mode
- Mock data allows offline work
- Clear indicator shown to user
- Sync when connection restored

### Scenario: Invalid File Upload
- File type validation
- Size limits enforced
- Clear error with supported formats

---

## Mobile Considerations

### Responsive Design
- ✅ Dashboard cards stack vertically
- ✅ Tables become scrollable
- ✅ Forms adapt to screen size
- ✅ Touch-friendly buttons

### Mobile Workflow
- View proposals on mobile
- Review findings
- Approve/reject decisions
- Export feature available

---

## Next Steps for Enhancement

1. **Email Notifications**
   - Proposal status changes
   - Pending approvals
   - Analysis complete

2. **Collaboration Features**
   - Comments on proposals
   - @mentions
   - Team assignments

3. **Advanced Analytics**
   - Compliance trends over time
   - Team performance metrics
   - Rule effectiveness analysis

4. **Templates Library**
   - Pre-approved proposal templates
   - Industry-specific formats
   - Quick start options

---

## Conclusion

DealSentry provides a streamlined, AI-powered workflow that transforms proposal creation from a manual, error-prone process into an efficient, compliant, and professional experience. Users benefit from automatic compliance checking, intelligent recommendations, and enterprise-grade document output, all while maintaining flexibility and control over their proposals.
