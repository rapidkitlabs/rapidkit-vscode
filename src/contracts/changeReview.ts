/** Extension projection of Git observations and CLI-owned workspace impact. */
export type ChangeReview = {
  id: string;
  repositoryPath: string;
  base: string;
  /** User-selected ref; base above is the immutable resolved commit. */
  requestedBase: string;
  head: string;
  fingerprint: string;
  observedAt: string;
  files: Array<{ path: string; status: string }>;
  impact: Array<{ title: string; summary: string; origin: string; reasons: string[] }>;
  checks: Array<{ id: string; label: string; command: string; required: boolean }>;
  limitations: string[];
  impactAvailable: boolean;
};
