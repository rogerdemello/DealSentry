# DealSentry - Quick Reference Guide

## 🎯 Main User Flows

```
┌─────────────────────────────────────────────────────────────┐
│                    LOGIN & AUTHENTICATION                    │
│  /auth → Enter Credentials → Dashboard                      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                         DASHBOARD                            │
│  • View metrics (Total, Pending, Approved, Rejected)        │
│  • Recent proposals                                          │
│  • Quick actions                                             │
└─────────────────────────────────────────────────────────────┘
                           ↓
                  ┌────────┴────────┐
                  │                 │
         ┌────────▼─────┐    ┌─────▼──────┐
         │ CREATE NEW   │    │   MANAGE   │
         │  PROPOSAL    │    │  EXISTING  │
         └────────┬─────┘    └─────┬──────┘
                  │                 │
    ┌─────────────┼─────────────┐   │
    │             │             │   │
┌───▼───┐   ┌────▼────┐   ┌───▼───▼──┐
│  AI   │   │ MANUAL  │   │  UPLOAD  │
│  NLP  │   │  ENTRY  │   │   FILE   │
└───┬───┘   └────┬────┘   └───┬──────┘
    │            │            │
    │            ▼            │
    │    ┌──────────────┐    │
    └───→│  AUTO        │◄───┘
         │  ANALYSIS    │
         └──────┬───────┘
                │
         ┌──────▼──────────┐
         │  REVIEW PAGE    │
         │  • Risk Score   │
         │  • Findings     │
         │  • Content      │
         └──────┬──────────┘
                │
         ┌──────┴──────────┐
         │                 │
    ┌────▼─────┐    ┌─────▼────┐
    │  ADMIN   │    │  SALES   │
    │  REVIEW  │    │  EXPORT  │
    └────┬─────┘    └─────┬────┘
         │                 │
    ┌────▼─────┐    ┌─────▼────┐
    │ APPROVE/ │    │  EXPORT  │
    │  REJECT  │    │   PDF    │
    └──────────┘    └──────────┘
```

---

## 🚀 Quick Start Workflows

### New User First Time Setup
```
1. Navigate to /auth
2. Sign up with email/password
3. Set role (ADMIN/USER)
4. Redirected to Dashboard
5. Create first proposal
```

### AI Proposal in 3 Steps
```
1. Click "Create Proposal" → AI Tab
2. Enter: "Make proposal for X company, $Y price, Z services"
3. Wait 10-15 seconds → Done! ✅
   • Proposal generated with legal terms
   • Automatically analyzed
   • Ready for review
```

### Upload & Analyze
```
1. Click "Upload Proposal"
2. Drag DOCX/PDF file
3. Enter company name
4. Wait for extraction & analysis
5. Review results
```

---

## 📱 Page-by-Page Guide

### `/` - Home
- Welcome page
- Login/Signup buttons
- Feature highlights

### `/auth` - Authentication
- Login form
- Sign up form  
- Password toggle
- Auto-redirect after login

### `/dashboard` - Dashboard
**User View:**
- Summary cards (4 metrics)
- Recent proposals grid
- Quick action buttons

**Admin View:**
- System-wide metrics
- All proposals overview
- Pending approvals highlighted

### `/proposals` - All Proposals
- Grid view of all proposals
- Search bar
- Filter by status
- Sort options (date, score, title)
- Bulk actions (select multiple)
- Delete proposals

### `/proposals/create` - Create New
**Two Tabs:**

**AI Generate:**
- Text area for natural language
- Example prompts
- Generate button
- Shows progress

**Manual Entry:**
- Company name (required)
- Title (required)
- Content (optional)
- Submit button

### `/proposals/upload` - Upload Document
- Drag & drop zone
- File selection button
- Company name input
- Progress bar with stages:
  - Uploading (0-30%)
  - Extracting (30-60%)
  - Analyzing (60-100%)
- Auto-redirect on complete

### `/proposals/{id}/review` - Review Page
**Layout:**

**Left Column (Main):**
1. **Header**
   - Title
   - Client name, deal size, discount, date
   - Status badge

2. **Risk Overview Card**
   - Readiness score (circle)
   - 3 risk bars (Legal, Pricing, Structural)

3. **Findings & Recommendations**
   - Paired cards
   - Color-coded severity
   - Location tags
   - Actionable suggestions

**Right Column (Sidebar):**
1. **Actions Card**
   - Approve button (Admin)
   - Reject button (Admin)
   - Export PDF
   - Delete

2. **Details Card**
   - Region
   - Industry
   - Created date
   - Updated date

### `/compliance` - Compliance Rules
- All rules table
- Filter: Active only toggle
- Add new rule button
- Edit/Delete actions
- Rule categories

### `/integrations` - Integrations
- Integration cards:
  - Salesforce
  - HubSpot  
  - Microsoft Dynamics
  - DocuSign
- Connect/Configure buttons
- Status indicators
- Sync settings

### `/settings` - Settings
- Profile settings
- Notification preferences
- Company settings (Admin)
- API keys
- Security options

### `/audit` - Audit Log
- Complete action history
- Filter by:
  - User
  - Action type
  - Date range
  - Proposal
- Export audit logs

---

## 🎨 UI Components Reference

### Status Badges
- 🟡 **PENDING** - Yellow, needs review
- 🔵 **IN_REVIEW** - Blue, under review
- 🟢 **APPROVED** - Green, ready to send
- 🔴 **REJECTED** - Red, needs revision

### Severity Levels
- 🔴 **CRITICAL** - Must fix before approval
- 🟠 **HIGH** - Should fix soon
- 🔵 **MEDIUM** - Recommended to fix
- ⚪ **LOW** - Nice to have

### Risk Scores
- **0-39**: High risk (red)
- **40-69**: Medium risk (yellow)
- **70-100**: Low risk (green)

---

## ⌨️ Keyboard Shortcuts

```
Dashboard:
  N - New proposal
  U - Upload proposal
  C - Compliance rules

Proposals List:
  / - Focus search
  A - Select all
  Delete - Delete selected

Review Page:
  E - Export PDF
  A - Approve (Admin)
  R - Reject (Admin)
  Esc - Back to list
```

---

## 🔔 Notifications & Toasts

### Success Messages
- ✅ "Proposal generated successfully"
- ✅ "Analysis complete"
- ✅ "Proposal approved"
- ✅ "PDF exported"

### Error Messages
- ❌ "Failed to generate proposal"
- ❌ "Analysis timeout - retry available"
- ❌ "Invalid file format"
- ❌ "Connection failed - working offline"

### Info Messages
- ℹ️ "Running analysis..."
- ℹ️ "Uploading file..."
- ℹ️ "Extracting content..."

---

## 💡 Pro Tips

### For Sales Reps
1. **Use AI generation** for fast proposals
2. **Include deal size and discount** in prompt for automatic extraction
3. **Export PDF immediately after approval** for quick delivery
4. **Check readiness score** before submitting for review

### For Admins
1. **Filter by Pending** to see what needs review
2. **Check findings carefully** - critical issues must be resolved
3. **Use audit log** to track team activity
4. **Create custom rules** for specific client requirements
5. **Bulk operations** for efficient workflow

### General
1. **Refreshing is safe** - all data is saved
2. **Offline mode works** with mock data
3. **Markdown supported** in content (##, **bold**, etc.)
4. **Mobile friendly** - review on any device

---

## 🔧 Troubleshooting

### Proposal won't generate
- Check API connection (look for offline indicator)
- Verify prompt has enough detail
- Try manual entry as fallback

### Analysis taking too long
- Normal: 10-30 seconds
- If > 1 minute: refresh page
- Analysis resumes automatically

### PDF export fails
- Check if proposal has content
- Verify you have permissions
- Try refreshing and export again

### Can't approve proposal
- Must be Admin role
- Proposal must be PENDING or IN_REVIEW
- Check if you have company access

---

## 📞 Support

### Common Issues
- "Not connected" → Check API server running
- "Access denied" → Check user role/permissions
- "Missing fields" → Ensure required fields filled

### Contact
- In-app support button
- Email: support@proposalreviewer.com
- Documentation: /docs folder
