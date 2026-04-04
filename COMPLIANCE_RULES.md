# Compliance Rules - Example Configuration

## Overview
This document outlines the 18 compliance rules configured for the DealSentry system. These rules are automatically checked against every proposal to ensure compliance with pricing policies, legal requirements, and structural standards.

---

## 📊 Pricing Rules (4 rules)

### 1. Maximum Discount Threshold
- **Severity**: HIGH
- **Description**: Discounts exceeding 20% require Sales Manager approval
- **Logic**: `discount > 20`
- **Example Violation**: A proposal offers 25% discount → Triggers HIGH alert
- **Approval Required**: Sales Manager

### 2. Payment Terms - Net 30
- **Severity**: MEDIUM
- **Description**: Standard payment terms must be Net 30 or less
- **Logic**: `payment_terms <= 30`
- **Example Violation**: Proposal specifies Net 60 → Triggers MEDIUM alert
- **Approval Required**: Finance Department

### 3. Minimum Deal Size
- **Severity**: MEDIUM
- **Description**: Enterprise deals must be at least $50,000
- **Logic**: `deal_value >= 50000`
- **Example Violation**: Proposal total is $45,000 → Triggers MEDIUM alert
- **Action**: Review if this should be classified as SMB deal instead

### 4. Multi-Year Discount Cap
- **Severity**: HIGH
- **Description**: Multi-year contracts (2+ years) cannot exceed 30% discount
- **Logic**: `contract_years >= 2 AND discount > 30`
- **Example Violation**: 3-year contract with 35% discount → Triggers HIGH alert
- **Approval Required**: VP of Sales

---

## ⚖️ Legal Rules (7 rules)

### 5. Indemnification Clause Required
- **Severity**: HIGH
- **Description**: All proposals must include standard indemnification language
- **Check**: Searches for "indemnification" in proposal content
- **Example**: "Company shall indemnify and hold harmless..."
- **Action Required**: Add mandatory indemnification clause

### 6. Limitation of Liability Clause
- **Severity**: HIGH
- **Description**: Proposals must include limitation of liability language
- **Check**: Searches for "limitation of liability"
- **Example**: "In no event shall liability exceed..."
- **Action Required**: Legal review required

### 7. Confidentiality Clause
- **Severity**: MEDIUM
- **Description**: All proposals must reference confidentiality or NDA
- **Check**: Searches for "confidential"
- **Example**: "Information disclosed shall remain confidential..."
- **Action Required**: Add confidentiality clause

### 8. Termination Rights
- **Severity**: MEDIUM
- **Description**: Contract must specify termination conditions
- **Check**: Searches for "termination"
- **Example**: "Either party may terminate with 30 days written notice..."
- **Action Required**: Add termination clause

### 9. Governing Law Specification
- **Severity**: MEDIUM
- **Description**: Contract must specify governing law jurisdiction
- **Check**: Searches for "governing law"
- **Example**: "This agreement shall be governed by the laws of..."
- **Action Required**: Specify jurisdiction

### 10. Data Privacy Compliance
- **Severity**: HIGH
- **Description**: Proposals must include GDPR/data privacy language
- **Check**: Searches for "data privacy"
- **Example**: "Company complies with GDPR and data protection regulations..."
- **Action Required**: Add data privacy compliance clause

### 11. Security Standards Declaration
- **Severity**: MEDIUM
- **Description**: Enterprise proposals must reference security standards
- **Check**: Searches for "SOC 2" or security certifications
- **Example**: "Company maintains SOC 2 Type II certification..."
- **Action**: Include security compliance information

---

## 📝 Structural Rules (7 rules)

### 12. Executive Summary Required
- **Severity**: MEDIUM
- **Description**: All proposals must start with an executive summary
- **Check**: Searches for "executive summary" section
- **Example**: Section titled "Executive Summary" outlining key points
- **Action Required**: Add executive summary section

### 13. Pricing Table Required
- **Severity**: HIGH
- **Description**: Proposals must include a clear pricing breakdown
- **Check**: Searches for "pricing" section
- **Example**: Table showing line items, quantities, unit prices, total
- **Action Required**: Add detailed pricing breakdown

### 14. Scope of Work Defined
- **Severity**: HIGH
- **Description**: Proposals must clearly define scope of work or deliverables
- **Check**: Searches for "scope of work" section
- **Example**: "Scope of Work: Implementation includes..."
- **Action Required**: Define clear scope and deliverables

### 15. Implementation Timeline
- **Severity**: MEDIUM
- **Description**: Proposals must include project timeline or milestones
- **Check**: Searches for "timeline" section
- **Example**: "Phase 1: Discovery (Weeks 1-2)..."
- **Action Required**: Add implementation timeline

### 16. Terms and Conditions Section
- **Severity**: HIGH
- **Description**: Proposals must have a dedicated T&C section
- **Check**: Searches for "terms and conditions"
- **Example**: Section titled "Terms and Conditions" with legal clauses
- **Action Required**: Add comprehensive T&C section

### 17. Contact Information Complete
- **Severity**: LOW
- **Description**: Proposals must include complete contact information
- **Check**: Searches for "email" in content
- **Example**: "For questions, contact sales@company.com"
- **Action Required**: Ensure contact details are included

### 18. Service Level Agreement
- **Severity**: MEDIUM
- **Description**: Enterprise contracts should include SLA commitments
- **Check**: Searches for "SLA" in content
- **Example**: "SLA: 99.9% uptime guarantee with 4-hour response time"
- **Action**: Include SLA details for enterprise deals

---

## 🎯 Sample Proposal Checklist

Using these rules against a sample enterprise proposal:

### High Priority (Must Fix)
- ✅ Indemnification clause present
- ✅ Limitation of liability included
- ✅ Data privacy compliance mentioned
- ✅ Pricing table with breakdown
- ✅ Scope of work clearly defined
- ✅ Terms and conditions section
- ⚠️ Discount within 20% threshold

### Medium Priority (Should Have)
- ✅ Executive summary included
- ✅ Payment terms specified (Net 30)
- ✅ Implementation timeline provided
- ✅ Confidentiality clause
- ✅ Termination rights specified
- ✅ Governing law stated
- ✅ Security standards mentioned
- ✅ SLA commitments defined

### Low Priority (Nice to Have)
- ✅ Complete contact information
- ✅ Professional formatting
- ✅ Client name personalization

---

## 🔍 How Rules are Evaluated

The rules engine evaluates proposals in real-time:

1. **Upload**: When a proposal is uploaded
2. **Parse**: Text content is extracted from document
3. **Check**: Each rule's condition is evaluated against the content
4. **Score**: Violations reduce the overall compliance score
5. **Report**: Detailed findings are generated with severity levels
6. **Block/Warn**: HIGH severity violations may block approval

### Compliance Score Calculation
- **100%**: No violations (Perfect compliance)
- **80-99%**: Low severity violations only
- **60-79%**: Medium severity violations
- **<60%**: High severity violations present (Requires review)

---

## 🛠️ Managing Rules

### Via UI (Compliance Page)
- Navigate to `/compliance` to view all active rules
- View violations by proposal
- See rule statistics

### Via API
```bash
# Get all rules
GET /api/rules

# Create new rule
POST /api/rules
{
  "name": "Rule Name",
  "type": "PRICING|LEGAL|STRUCTURAL",
  "description": "Rule description",
  "logic": { /* rule logic */ },
  "isActive": true
}

# Update rule
PATCH /api/rules/{id}

# Delete rule
DELETE /api/rules/{id}
```

### Via Seed Script
```bash
# Run the seeding script
node scripts/seed-rules-api.js
```

---

## 📋 Rule Logic Format

Each rule contains a `logic` object with the following structure:

```json
{
  "condition": "human-readable condition",
  "operator": "greater_than|less_than|contains|equals",
  "field": "field_name_to_check",
  "threshold": 20,
  "message": "User-friendly violation message",
  "severity": "HIGH|MEDIUM|LOW",
  "requiredText": "text that must be present",
  "requiresApproval": true
}
```

### Operators Supported
- `greater_than`, `less_than`
- `greater_than_or_equal`, `less_than_or_equal`
- `equals`, `not_equals`
- `contains`, `contains_any`, `contains_all`
- `count_greater_than_or_equal`

---

## 🚀 Next Steps

1. **Review Rules**: Ensure rules align with your company policies
2. **Adjust Thresholds**: Modify discount caps, deal sizes as needed
3. **Add Custom Rules**: Create organization-specific compliance rules
4. **Test with Proposals**: Upload sample proposals to see rule evaluation
5. **Monitor Violations**: Track which rules are most commonly violated
6. **Refine Logic**: Update rule conditions based on real-world usage

---

## 📞 Support

For questions about compliance rules:
- **Sales Team**: Pricing rule questions
- **Legal Team**: Legal clause requirements
- **RevOps**: Rule configuration and thresholds
- **Admin**: System access and technical issues
