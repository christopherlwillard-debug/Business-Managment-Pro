---
name: Bid Education Layer
description: Per-bid plain-English education panel — what the gov is buying, fit analysis, requirements, how to respond, glossary. Phase 3 of the bid engine.
---

# Bid Education Layer (Phase 3)

## DB Schema
Two new columns on `bid_opportunities`:
- `education_summary jsonb` — EducationSummaryData stored by the educate API endpoint
- `education_summary_at timestamptz` — generation timestamp
Applied via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (no drizzle push).
Drizzle schema: `lib/db/src/schema/bid-opportunities.ts`

## API Endpoint
`POST /api/bids/:id/educate`
- Requires `businessId` in body
- Optional `force: true` to regenerate even when cached
- Returns `{ education: EducationSummaryData, cached: boolean }`
- Stores result to DB; subsequent calls return cached instantly
- Located in `artifacts/api-server/src/routes/bids.ts` (alongside summarize endpoint)
- Uses `buildEducationPrompt()` and `sanitizeEducation()` helper functions defined in same file
- Uses `getCapabilitiesForBusinessType(business.type)` to build contractor profile
- Grounded in existing `aiSummary` if available (passed as `existingSummary` context)
- MUST NOT call `capSettingsRow?.businessType` — that column does not exist on bidBusinessSettingsTable

## Education Summary Structure
```typescript
interface EducationSummaryData {
  whatTheGovIsBuying: string;
  noticeTypeContext:   string;
  capabilityVerdict:  "good_fit" | "possible_fit" | "need_more_info" | "likely_not_fit";
  whyItFits:          string[];
  whyYouMayPass:      string[];
  requirements:       EducationRequirementData[];  // { item, plain, action }
  howToRespond:       string[];
  questionsForCO:     string[];
  nextStep:           string;
  detectedTerms:      EducationTermData[];  // { term, plain }
}
```

## Frontend Files
- `ProcurementGlossary.ts` — 25-term static glossary with `lookupTerm()` and `findTermsInText()` helpers
- `BidEducationPanel.tsx` — Sheet-based panel (side="right", full-width on mobile)
  - Auto-generates when opened (no explicit trigger needed)
  - Sections: next step banner → what buying → fit analysis → requirements → how to respond → questions for CO → detected terms → regenerate
  - `onGenerated` callback updates parent's `educationCache` to avoid re-fetching within session
  - Manages its own loading/error/generation state
- `types.ts` — `EducationSummary`, `EducationRequirement`, `EducationTerm`, `CapabilityVerdict` exported

## UI Integration
- `BidCard.tsx` — "Learn" button (BookOpen icon, muted style) in action row; turns violet when educationSummary is present
- `PipelineBoard.tsx` / `PipelineCard` — BookOpen button added to PipelineCard action row; `onEducate` prop threads through PipelineBoard → PipelineCard
- `BidOpportunities.tsx` — `educatingBid` + `educationCache` state; `BidEducationPanel` rendered at end of component; `initialEducation` populated from cache or `bid.educationSummary`

## AI Prompt Design Principles
1. Plain English — no jargon without explanation
2. "Verify before bidding:" for license/cert/bond issues — not legal conclusions
3. Specific to this bid + this contractor's capabilities
4. howToRespond is tailored to notice type (Sources Sought ≠ active solicitation response)
5. detectedTerms: only terms actually in the opportunity description that a new contractor might not know
6. `likely_disqualifier` requirement action: hard bar only (HazMat, CDL-A, security clearance); still use "Verify before bidding:" in plain field
