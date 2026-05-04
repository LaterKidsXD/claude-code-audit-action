import { describe, it, expect } from 'vitest';
import { filterByGlob } from '../src/diff';
import type { ChangedFile } from '../src/types';

const files: ChangedFile[] = [
  { filename: 'reports/eval.report.md', status: 'modified', size: -1 },
  { filename: 'reports/nested/sweep.report.md', status: 'added', size: -1 },
  { filename: 'src/foo.ts', status: 'modified', size: -1 },
  { filename: 'docs/README.md', status: 'modified', size: -1 },
  { filename: 'analysis/A.md', status: 'added', size: -1 },
];

describe('filterByGlob', () => {
  it('matches default report glob', () => {
    const out = filterByGlob(files, '**/*.report.md');
    expect(out.map((f) => f.filename)).toEqual([
      'reports/eval.report.md',
      'reports/nested/sweep.report.md',
    ]);
  });

  it('returns empty when nothing matches', () => {
    const out = filterByGlob(files, '**/*.xyz');
    expect(out).toEqual([]);
  });

  it('matches multiple comma-separated patterns', () => {
    const out = filterByGlob(files, '**/*.report.md,analysis/*.md');
    expect(out.map((f) => f.filename).sort()).toEqual(
      ['analysis/A.md', 'reports/eval.report.md', 'reports/nested/sweep.report.md'].sort(),
    );
  });

  it('matches src files when explicitly globbed', () => {
    const out = filterByGlob(files, 'src/**/*.ts');
    expect(out.map((f) => f.filename)).toEqual(['src/foo.ts']);
  });

  it('returns empty for an empty pattern', () => {
    const out = filterByGlob(files, '');
    expect(out).toEqual([]);
  });
});
