import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { auditFile } from '../src/auditor';
import { Budget } from '../src/cost';
import type { CostCaps } from '../src/types';

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '..', 'system-prompts', 'claim-auditor.md'),
  'utf-8',
);

const CAPS: CostCaps = {
  maxFiles: 20,
  maxFileSizeBytes: 50 * 1024,
  maxCostUsd: 5.0,
};

const FIXTURE_P1 = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'p1-prob-stacking.md'),
  'utf-8',
);

interface MockOctokitOpts {
  content?: string;
  fetchError?: Error;
}

function mockOctokit(opts: MockOctokitOpts = {}): { octokit: any } {
  return {
    octokit: {
      rest: {
        repos: {
          getContent: vi.fn().mockImplementation(async () => {
            if (opts.fetchError) throw opts.fetchError;
            const content = opts.content ?? 'sample report body';
            return {
              data: {
                type: 'file',
                encoding: 'base64',
                content: Buffer.from(content, 'utf-8').toString('base64'),
              },
            };
          }),
        },
      },
    },
  };
}

function mockClient(impl: () => Promise<any>): any {
  return {
    messages: { create: vi.fn().mockImplementation(impl) },
  };
}

describe('auditFile', () => {
  it('parses findings on the happy path', async () => {
    const { octokit } = mockOctokit({ content: 'Probability claim: 90% chance of success.' });
    const client = mockClient(async () => ({
      content: [{ type: 'text', text: FIXTURE_P1 }],
    }));

    const result = await auditFile({
      octokit,
      owner: 'o',
      repo: 'r',
      filename: 'eval.report.md',
      ref: 'abc123',
      systemPrompt: SYSTEM_PROMPT,
      apiKey: 'sk-test',
      model: 'claude-opus-4-7',
      caps: CAPS,
      clientFactory: () => client,
    });

    expect(result.skippedReason).toBeUndefined();
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('P1');
    expect(client.messages.create).toHaveBeenCalledOnce();
  });

  it('skips files larger than the size cap', async () => {
    const big = 'x'.repeat(60 * 1024);
    const { octokit } = mockOctokit({ content: big });
    const client = mockClient(async () => ({ content: [{ type: 'text', text: '' }] }));

    const result = await auditFile({
      octokit,
      owner: 'o',
      repo: 'r',
      filename: 'big.report.md',
      ref: 'abc',
      systemPrompt: SYSTEM_PROMPT,
      apiKey: 'sk',
      model: 'claude-opus-4-7',
      caps: CAPS,
      clientFactory: () => client,
    });

    expect(result.skippedReason).toMatch(/exceeds the 50 KB cap/);
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it('skips when the budget is exhausted', async () => {
    const { octokit } = mockOctokit({ content: 'tiny report' });
    const client = mockClient(async () => ({ content: [{ type: 'text', text: '' }] }));
    const tinyBudget = new Budget(0.001); // sub-cent budget — cannot afford any audit.

    const result = await auditFile({
      octokit,
      owner: 'o',
      repo: 'r',
      filename: 'a.report.md',
      ref: 'abc',
      systemPrompt: SYSTEM_PROMPT,
      apiKey: 'sk',
      model: 'claude-opus-4-7',
      caps: CAPS,
      budget: tinyBudget,
      clientFactory: () => client,
    });

    expect(result.skippedReason).toMatch(/exceeds remaining budget/);
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it('retries with backoff on 429 then succeeds', async () => {
    const { octokit } = mockOctokit({ content: 'tiny report' });
    let callCount = 0;
    const client = mockClient(async () => {
      callCount++;
      if (callCount < 3) {
        const err = new Error('rate limited') as Error & { status?: number };
        err.status = 429;
        throw err;
      }
      return { content: [{ type: 'text', text: FIXTURE_P1 }] };
    });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await auditFile({
      octokit,
      owner: 'o',
      repo: 'r',
      filename: 'a.report.md',
      ref: 'abc',
      systemPrompt: SYSTEM_PROMPT,
      apiKey: 'sk',
      model: 'claude-opus-4-7',
      caps: CAPS,
      clientFactory: () => client,
      sleep,
    });

    expect(result.skippedReason).toBeUndefined();
    expect(result.findings).toHaveLength(1);
    expect(client.messages.create).toHaveBeenCalledTimes(3);
    // First retry waited 1000ms, second waited 4000ms.
    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(sleep).toHaveBeenNthCalledWith(2, 4000);
  });

  it('throws on 401 (auth failure) without retrying', async () => {
    const { octokit } = mockOctokit({ content: 'tiny' });
    const client = mockClient(async () => {
      const err = new Error('bad key') as Error & { status?: number };
      err.status = 401;
      throw err;
    });

    await expect(
      auditFile({
        octokit,
        owner: 'o',
        repo: 'r',
        filename: 'a.report.md',
        ref: 'abc',
        systemPrompt: SYSTEM_PROMPT,
        apiKey: 'sk',
        model: 'claude-opus-4-7',
        caps: CAPS,
        clientFactory: () => client,
      }),
    ).rejects.toThrow(/Anthropic API auth failed/);

    expect(client.messages.create).toHaveBeenCalledOnce();
  });

  it('skips on persistent 429 after exhausting retries', async () => {
    const { octokit } = mockOctokit({ content: 'tiny' });
    const client = mockClient(async () => {
      const err = new Error('rate limited') as Error & { status?: number };
      err.status = 429;
      throw err;
    });

    const result = await auditFile({
      octokit,
      owner: 'o',
      repo: 'r',
      filename: 'a.report.md',
      ref: 'abc',
      systemPrompt: SYSTEM_PROMPT,
      apiKey: 'sk',
      model: 'claude-opus-4-7',
      caps: CAPS,
      clientFactory: () => client,
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.skippedReason).toMatch(/API call failed after retries/);
    expect(client.messages.create).toHaveBeenCalledTimes(4); // 1 + 3 retries
  });

  it('skips when fetchContent fails', async () => {
    const { octokit } = mockOctokit({ fetchError: new Error('not found') });
    const client = mockClient(async () => ({ content: [{ type: 'text', text: '' }] }));

    const result = await auditFile({
      octokit,
      owner: 'o',
      repo: 'r',
      filename: 'gone.report.md',
      ref: 'abc',
      systemPrompt: SYSTEM_PROMPT,
      apiKey: 'sk',
      model: 'claude-opus-4-7',
      caps: CAPS,
      clientFactory: () => client,
    });

    expect(result.skippedReason).toMatch(/failed to fetch content/);
    expect(client.messages.create).not.toHaveBeenCalled();
  });
});

describe('Budget', () => {
  it('refuses to overcharge beyond the cap', () => {
    const b = new Budget(1.0);
    expect(b.canAfford(0.5)).toBe(true);
    b.charge(0.5);
    expect(b.canAfford(0.5)).toBe(true);
    b.charge(0.5);
    expect(b.canAfford(0.01)).toBe(false);
    expect(b.remainingUsd).toBeCloseTo(0);
  });
});
