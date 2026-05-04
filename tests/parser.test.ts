import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseFindings } from '../src/parser';

const fixture = (name: string): string =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');

describe('parseFindings', () => {
  it('returns no findings for a clean report', () => {
    const out = parseFindings(fixture('clean-report.md'), 'eval.report.md');
    expect(out).toEqual([]);
  });

  it('parses a P1 probability-stacking finding', () => {
    const out = parseFindings(fixture('p1-prob-stacking.md'), 'eval.report.md');
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('P1');
    expect(out[0].quote).toContain('35.7% per eval');
    expect(out[0].issue).toMatch(/1-\(1-p\)\^N/i);
    expect(out[0].correction).toMatch(/73\.4%/);
    expect(out[0].file).toBe('eval.report.md');
  });

  it('parses multiple P1s + a P3 from the tail-stacking fixture', () => {
    const out = parseFindings(fixture('p1-tail-stacking.md'), 'bust.report.md');
    const p1s = out.filter((f) => f.severity === 'P1');
    const p3s = out.filter((f) => f.severity === 'P3');
    expect(p1s).toHaveLength(2);
    expect(p3s).toHaveLength(1);
    // First P1 contains an escaped pipe — make sure splitter restored it.
    expect(p1s[0].quote).toContain('|');
    expect(p3s[0].issue).toMatch(/trading.*calendar/i);
  });

  it('parses P2 percentage-confusion findings, ignores empty P1/P3 sections', () => {
    const out = parseFindings(fixture('p2-percentage-confusion.md'), 'sweep.report.md');
    expect(out).toHaveLength(2);
    expect(out.every((f) => f.severity === 'P2')).toBe(true);
    expect(out[0].issue).toMatch(/percentage points/i);
    expect(out[1].quote).toMatch(/Top config/);
  });

  it('returns empty for empty / whitespace input', () => {
    expect(parseFindings('', 'x.md')).toEqual([]);
    expect(parseFindings('   \n\n  ', 'x.md')).toEqual([]);
  });

  it('ignores tables inside fenced code blocks', () => {
    const md = `
## P1
\`\`\`
| Quote | Why wrong | Correct |
|---|---|---|
| "fake" | lol | nope |
\`\`\`
| "real" | actual issue | actual fix |
`;
    const out = parseFindings(md, 'x.md');
    expect(out).toHaveLength(1);
    expect(out[0].quote).toBe('real');
  });

  it('skips header rows the model repeats inside the table', () => {
    const md = `## P1
| Quote | Why wrong | Correct number |
|---|---|---|
| "actual finding" | bad math | corrected |
`;
    const out = parseFindings(md, 'x.md');
    expect(out).toHaveLength(1);
    expect(out[0].quote).toBe('actual finding');
  });
});
