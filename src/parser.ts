import type { Finding, Severity } from './types';

/**
 * Parse the claim-auditor's structured Markdown output into a list of findings.
 *
 * The system prompt instructs the model to return:
 *   ## P1 (decision-shaping, must address)
 *   | Quote | Why wrong | Correct number |
 *   |---|---|---|
 *   | "..." | ... | ... |
 *
 *   ## P2 (misleading framing)
 *   | Quote | Why misleading | Correction or context |
 *   ...
 *
 *   ## P3 (pedantic)
 *   | Quote | Issue | Fix |
 *   ...
 *
 * Or, when nothing is found:
 *   No errors at or above <severity_floor>. Report is decision-safe...
 *
 * We tolerate variation in casing + section heading text — the only hard
 * requirement is that section headings start with `##` and contain `P1`, `P2`, or `P3`.
 */

interface ParsedSection {
  severity: Severity;
  rows: string[][];
}

const SEVERITY_HEADER_RE = /^##\s+(?:.*?\b)?(P[123])\b/i;
/** A row is a `|`-delimited line that is NOT the separator row (`|---|---|`). */
const TABLE_ROW_RE = /^\s*\|(.+)\|\s*$/;
const SEPARATOR_RE = /^\s*\|?\s*[:\-\s|]+\|[\s:\-|]*\s*$/;

export function parseFindings(markdown: string, filename: string): Finding[] {
  if (!markdown || markdown.trim().length === 0) return [];

  // Fast-path the explicit "no errors" output.
  if (/no errors at or above/i.test(markdown) && !/^##\s+P[123]/im.test(markdown)) {
    return [];
  }

  const sections = extractSections(markdown);
  const findings: Finding[] = [];
  for (const section of sections) {
    for (const cells of section.rows) {
      if (cells.length < 2) continue;
      const quote = sanitize(cells[0]);
      const issue = sanitize(cells[1]);
      const correction = cells.length >= 3 ? sanitize(cells[2]) : undefined;
      // Skip header rows the model occasionally repeats inside its tables.
      if (isHeaderRow(quote, issue)) continue;
      // Skip placeholder "(none)" rows.
      if (isEmptyPlaceholder(quote, issue, correction)) continue;
      if (!quote && !issue) continue;
      findings.push({
        file: filename,
        severity: section.severity,
        quote,
        issue,
        correction: correction || undefined,
      });
    }
  }
  return findings;
}

function extractSections(markdown: string): ParsedSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  let inCodeFence = false;

  for (const line of lines) {
    if (/^```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const headerMatch = line.match(SEVERITY_HEADER_RE);
    if (headerMatch) {
      const severity = headerMatch[1].toUpperCase() as Severity;
      current = { severity, rows: [] };
      sections.push(current);
      continue;
    }

    // A new non-severity heading ends the current section.
    if (/^#{1,6}\s+/.test(line) && !headerMatch) {
      current = null;
      continue;
    }

    if (!current) continue;

    if (SEPARATOR_RE.test(line)) continue;

    const rowMatch = line.match(TABLE_ROW_RE);
    if (!rowMatch) continue;

    const cells = splitRow(rowMatch[1]);
    current.rows.push(cells);
  }

  return sections;
}

/**
 * Split a single Markdown table row into cells. Honors `\|` as an escaped pipe
 * (rendered as a literal `|` inside a cell), per the GFM spec.
 */
function splitRow(rowBody: string): string[] {
  const cells: string[] = [];
  let buf = '';
  for (let i = 0; i < rowBody.length; i++) {
    const ch = rowBody[i];
    if (ch === '\\' && rowBody[i + 1] === '|') {
      buf += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  cells.push(buf);
  return cells;
}

function sanitize(cell: string): string {
  return cell
    .replace(/^\s+|\s+$/g, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

function isHeaderRow(quote: string, issue: string): boolean {
  const q = quote.toLowerCase();
  const i = issue.toLowerCase();
  if (q === 'quote' && (i === 'why wrong' || i === 'why misleading' || i === 'issue')) return true;
  return false;
}

function isEmptyPlaceholder(quote: string, issue: string, correction?: string): boolean {
  const allBlank = !quote && !issue && !correction;
  if (allBlank) return true;
  const placeholder = /^\(?(?:none(?: flagged)?|n\/a|—|-|nothing flagged)\)?$/i;
  return placeholder.test(quote) && (!issue || placeholder.test(issue));
}
