import type { Finding, Severity } from './types';

const RANK: Record<Severity, number> = { P1: 1, P2: 2, P3: 3 };

export function filterBySeverity(findings: Finding[], floor: Severity): Finding[] {
  const max = RANK[floor];
  return findings.filter((f) => RANK[f.severity] <= max);
}

export function severityCounts(findings: Finding[]): {
  p1: number;
  p2: number;
  p3: number;
  total: number;
} {
  const p1 = findings.filter((f) => f.severity === 'P1').length;
  const p2 = findings.filter((f) => f.severity === 'P2').length;
  const p3 = findings.filter((f) => f.severity === 'P3').length;
  return { p1, p2, p3, total: p1 + p2 + p3 };
}
