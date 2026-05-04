import Anthropic from '@anthropic-ai/sdk';
import type { GitHub } from '@actions/github/lib/utils';
import { parseFindings } from './parser';
import { Budget, MAX_OUTPUT_TOKENS, estimateCostUsd, estimateInputTokens } from './cost';
import type { AuditResult, CostCaps, Finding } from './types';

type Octokit = InstanceType<typeof GitHub>;

export interface AuditFileArgs {
  octokit: Octokit;
  owner: string;
  repo: string;
  filename: string;
  ref: string;
  systemPrompt: string;
  apiKey: string;
  model: string;
  caps: CostCaps;
  /** Optional pre-built budget; created from caps if absent (one-shot use case). */
  budget?: Budget;
  /** Optional injected client for tests. */
  clientFactory?: (apiKey: string) => Anthropic;
  /** Optional sleep override for tests (ms → Promise<void>). */
  sleep?: (ms: number) => Promise<void>;
}

const RETRY_DELAYS_MS = [1000, 4000, 16000];

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const defaultClientFactory = (apiKey: string): Anthropic => new Anthropic({ apiKey });

/**
 * Fetch one report file at the PR head SHA and audit it via the Anthropic API.
 *
 * Returns a result that *always* describes what happened — including skipped reasons
 * for oversize files, budget exhaustion, and API failures. Never throws on
 * recoverable errors; only auth (401) and unexpected programmer errors propagate.
 */
export async function auditFile(args: AuditFileArgs): Promise<AuditResult> {
  const {
    octokit,
    owner,
    repo,
    filename,
    ref,
    systemPrompt,
    apiKey,
    model,
    caps,
    clientFactory = defaultClientFactory,
    sleep = defaultSleep,
  } = args;
  const budget = args.budget ?? new Budget(caps.maxCostUsd);

  let content: string;
  try {
    content = await fetchContent(octokit, owner, repo, filename, ref);
  } catch (err) {
    return skipped(filename, `failed to fetch content: ${errMsg(err)}`);
  }

  const sizeBytes = Buffer.byteLength(content, 'utf-8');
  if (sizeBytes > caps.maxFileSizeBytes) {
    return skipped(
      filename,
      `file is ${(sizeBytes / 1024).toFixed(1)} KB which exceeds the ${(
        caps.maxFileSizeBytes / 1024
      ).toFixed(0)} KB cap`,
    );
  }

  const userPrompt = buildUserPrompt(filename, content);
  const inputTokens = estimateInputTokens(systemPrompt.length, userPrompt.length);
  const estimatedCost = estimateCostUsd(model, inputTokens, MAX_OUTPUT_TOKENS);

  if (!budget.canAfford(estimatedCost)) {
    return skipped(
      filename,
      `estimated cost $${estimatedCost.toFixed(3)} exceeds remaining budget ` +
        `$${budget.remainingUsd.toFixed(3)} (cap $${caps.maxCostUsd.toFixed(2)} per PR)`,
    );
  }

  const client = clientFactory(apiKey);

  let rawResponse = '';
  try {
    rawResponse = await callWithBackoff(client, model, systemPrompt, userPrompt, sleep);
  } catch (err) {
    if (isAuthError(err)) {
      // Auth failures should fail the whole action — re-raise.
      throw new Error(
        `Anthropic API auth failed (401). Check the ANTHROPIC_API_KEY secret. ${errMsg(err)}`,
      );
    }
    return skipped(filename, `API call failed after retries: ${errMsg(err)}`);
  }

  // We don't get exact usage back without a second SDK call; charge the estimate.
  // Slight overcharge is preferred to undercharge (otherwise budget can drift over).
  budget.charge(estimatedCost);

  let findings: Finding[];
  try {
    findings = parseFindings(rawResponse, filename);
  } catch (err) {
    return {
      file: filename,
      findings: [],
      rawResponse,
      skippedReason: `parse error: ${errMsg(err)}`,
    };
  }

  return { file: filename, findings, rawResponse };
}

async function callWithBackoff(
  client: Anthropic,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  sleep: (ms: number) => Promise<void>,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      const block = response.content[0];
      if (!block || block.type !== 'text') {
        throw new Error(`Unexpected response shape (no text block in content[0])`);
      }
      return block.text;
    } catch (err) {
      lastErr = err;
      if (isAuthError(err)) throw err;
      if (!isRetryable(err) || attempt === RETRY_DELAYS_MS.length) {
        throw err;
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('exhausted retries');
}

async function fetchContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string> {
  const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
  if (Array.isArray(data) || data.type !== 'file') {
    throw new Error(`path ${path} is not a regular file`);
  }
  if (typeof data.content !== 'string') {
    throw new Error(`no content returned for ${path}`);
  }
  if (data.encoding === 'base64') {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }
  return data.content;
}

function buildUserPrompt(filename: string, content: string): string {
  return (
    `Audit this report (${filename}) for math/logic errors. ` +
    `Use severity_floor: P3 (return everything you find — the caller will filter). ` +
    `Use output_format: markdown and follow the exact table structure from your system prompt.\n\n` +
    `=== BEGIN REPORT ===\n${content}\n=== END REPORT ===`
  );
}

function isAuthError(err: unknown): boolean {
  const code =
    (err as { status?: number; statusCode?: number })?.status ??
    (err as { statusCode?: number })?.statusCode;
  return code === 401;
}

function isRetryable(err: unknown): boolean {
  const status =
    (err as { status?: number; statusCode?: number })?.status ??
    (err as { statusCode?: number })?.statusCode;
  if (status === 429) return true;
  if (status !== undefined && status >= 500 && status < 600) return true;
  // Network / connection errors typically lack a status code.
  if (status === undefined) return true;
  return false;
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function skipped(filename: string, reason: string): AuditResult {
  return { file: filename, findings: [], rawResponse: '', skippedReason: reason };
}
