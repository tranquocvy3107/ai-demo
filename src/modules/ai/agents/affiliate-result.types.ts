// ─── OUTPUT CONTRACT ──────────────────────────────────────────────────────────
// Single source of truth for the affiliate research result shape.
// The prompt's JSON example is derived from this — if you change a field here,
// update OUTPUT_EXAMPLE in prompts.v2.ts to match.

export interface AffiliateProduct {
  name: string;
  price: string | null;
  currency: string | null;
  url: string | null;
  trustScore: number;
  trustReason: string;
}

export interface AffiliateProgram {
  found: boolean;
  signupUrl: string | null;
  commissionRate: string | null;
  commissionType: 'recurring' | 'one-time' | 'unknown' | null;
  cookieDuration: string | null;
  payoutMethod: string | null;
  notes: string | null;
  trustScore: number;
  trustReason: string;
}

export interface DecisionLogEntry {
  step: string;
  decision: string;
  reason: string;
  sourceUrl: string;
}

export interface AffiliateResult {
  domain: string;
  homepageUrl: string;
  pageType: 'store' | 'landing' | 'unknown';
  productType: 'physical' | 'digital' | 'unknown';
  products: AffiliateProduct[];
  affiliateProgram: AffiliateProgram;
  decisionLog: DecisionLogEntry[];
  overallTrustScore: number;
  overallTrustReason: string;
  exitReason: string | null;
}
