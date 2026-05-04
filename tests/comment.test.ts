import { describe, it, expect, vi } from 'vitest';
import {
  COMMENT_MARKER,
  formatComment,
  formatNoMatchComment,
  postOrUpdateComment,
} from '../src/comment';
import type { ActionInputs, AuditResult, Finding } from '../src/types';

const inputs: ActionInputs = {
  apiKey: 'sk',
  model: 'claude-opus-4-7',
  reportGlob: '**/*.report.md',
  severityFloor: 'P2',
  failOnP1: true,
  githubToken: 'gh',
};

const findingsP1P2: Finding[] = [
  {
    file: 'a.report.md',
    severity: 'P1',
    quote: 'wrong claim',
    issue: 'bad math',
    correction: 'right number',
  },
  {
    file: 'b.report.md',
    severity: 'P2',
    quote: 'sloppy framing',
    issue: 'pp vs %',
  },
];

const auditResults: AuditResult[] = [
  { file: 'a.report.md', findings: [findingsP1P2[0]], rawResponse: '...' },
  { file: 'b.report.md', findings: [findingsP1P2[1]], rawResponse: '...' },
];

describe('formatComment', () => {
  it('renders findings counts + per-severity table', () => {
    const out = formatComment(auditResults, findingsP1P2, inputs);
    expect(out).toContain('2 findings');
    expect(out).toContain('1 P1 / 1 P2 / 0 P3');
    expect(out).toContain('### P1');
    expect(out).toContain('### P2');
    expect(out).toContain('wrong claim');
    expect(out).toContain('claude-opus-4-7');
    expect(out).toContain('Check status will FAIL');
  });

  it('renders decision-safe headline when no findings', () => {
    const out = formatComment(auditResults, [], inputs);
    expect(out).toContain('Decision-safe');
    expect(out).not.toContain('### P1');
    expect(out).not.toContain('Check status will FAIL');
  });

  it('does not warn about failure when fail_on_p1 is off', () => {
    const out = formatComment(auditResults, findingsP1P2, { ...inputs, failOnP1: false });
    expect(out).not.toContain('Check status will FAIL');
  });

  it('escapes pipe characters in finding cells', () => {
    const tricky: Finding[] = [
      {
        file: 'x.md',
        severity: 'P1',
        quote: 'A | B',
        issue: 'split',
        correction: 'OK',
      },
    ];
    const out = formatComment(
      [{ file: 'x.md', findings: tricky, rawResponse: '' }],
      tricky,
      inputs,
    );
    expect(out).toContain('A \\| B');
  });

  it('renders skipped files in the per-file detail', () => {
    const skipped: AuditResult = {
      file: 'big.report.md',
      findings: [],
      rawResponse: '',
      skippedReason: 'file too big',
    };
    const out = formatComment([skipped], [], inputs);
    expect(out).toContain('skipped (file too big)');
  });
});

describe('formatNoMatchComment', () => {
  it('mentions the configured glob', () => {
    const out = formatNoMatchComment('reports/**/*.md');
    expect(out).toContain('reports/**/*.md');
    expect(out).toContain('Audit skipped');
  });
});

function makeMockOctokit(existingComments: { id: number; body: string }[] = []): {
  octokit: any;
  list: any;
  create: any;
  update: any;
} {
  const list = vi.fn();
  const create = vi.fn().mockResolvedValue({ data: { id: 999 } });
  const update = vi.fn().mockResolvedValue({ data: { id: existingComments[0]?.id } });
  const iterator = async function* () {
    yield { data: existingComments };
  };
  return {
    octokit: {
      rest: { issues: { listComments: list, createComment: create, updateComment: update } },
      paginate: { iterator: () => iterator() },
    },
    list,
    create,
    update,
  };
}

describe('postOrUpdateComment', () => {
  it('creates a new comment when none exists', async () => {
    const { octokit, create, update } = makeMockOctokit([]);
    await postOrUpdateComment(octokit, 'o', 'r', 1, 'hello');
    expect(create).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(create.mock.calls[0][0].body).toContain(COMMENT_MARKER);
    expect(create.mock.calls[0][0].body).toContain('hello');
  });

  it('updates an existing comment when marker is present', async () => {
    const { octokit, create, update } = makeMockOctokit([
      { id: 42, body: `${COMMENT_MARKER}\nold body` },
      { id: 99, body: 'unrelated' },
    ]);
    await postOrUpdateComment(octokit, 'o', 'r', 1, 'fresh body');
    expect(update).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].comment_id).toBe(42);
    expect(update.mock.calls[0][0].body).toContain('fresh body');
  });

  it('ignores comments that lack the marker', async () => {
    const { octokit, create, update } = makeMockOctokit([
      { id: 1, body: 'random comment' },
      { id: 2, body: 'another one' },
    ]);
    await postOrUpdateComment(octokit, 'o', 'r', 7, 'new');
    expect(create).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });
});
