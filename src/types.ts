export type Severity = 'P1' | 'P2' | 'P3';

export const SEVERITIES: ReadonlyArray<Severity> = ['P1', 'P2', 'P3'];

export interface Finding {
  /** Source file the finding was raised against (relative to repo root). */
  file: string;
  severity: Severity;
  /** The exact quote from the report that contains the alleged error. */
  quote: string;
  /** One-line explanation of why the quote is wrong / misleading. */
  issue: string;
  /** Optional corrected number or recommended fix from the auditor. */
  correction?: string;
}

export interface AuditResult {
  file: string;
  findings: Finding[];
  /** Raw model response. Useful for debugging when parsing fails. */
  rawResponse: string;
  /** Set when the audit was skipped (oversize, API error, etc.). */
  skippedReason?: string;
}

export interface ActionInputs {
  apiKey: string;
  model: string;
  reportGlob: string;
  severityFloor: Severity;
  failOnP1: boolean;
  githubToken: string;
}

export interface ChangedFile {
  filename: string;
  status: string;
  /** Bytes in the changed file at PR head; -1 when unknown. */
  size: number;
}

/** Hard cost-cap budget per PR run (see action.yml + spec). */
export interface CostCaps {
  maxFiles: number;
  maxFileSizeBytes: number;
  maxCostUsd: number;
}

export const DEFAULT_COST_CAPS: CostCaps = {
  maxFiles: 20,
  maxFileSizeBytes: 50 * 1024,
  maxCostUsd: 5.0,
};
