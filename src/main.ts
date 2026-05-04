import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';
import { readInputs } from './inputs';
import { listChangedFiles, filterByGlob } from './diff';
import { auditFile } from './auditor';
import { postOrUpdateComment, formatComment, formatNoMatchComment } from './comment';
import { applyOutputs, decideStatus } from './status';
import { filterBySeverity, severityCounts } from './severity';
import { DEFAULT_COST_CAPS } from './types';
import type { AuditResult, Finding } from './types';

const SYSTEM_PROMPT_PATH = path.join(__dirname, '..', 'system-prompts', 'claim-auditor.md');

function loadSystemPrompt(): string {
  // When bundled with ncc, system-prompts/ is copied alongside dist/index.js
  // (see action.yml + ncc config). Resolve relative to the bundled binary.
  const candidates = [
    SYSTEM_PROMPT_PATH,
    path.join(__dirname, 'system-prompts', 'claim-auditor.md'),
    path.join(process.cwd(), 'system-prompts', 'claim-auditor.md'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf-8');
    }
  }
  throw new Error(`claim-auditor system prompt not found. Searched: ${candidates.join(', ')}`);
}

export async function run(): Promise<void> {
  const inputs = readInputs();
  const ctx = github.context;

  if (!ctx.payload.pull_request) {
    core.info('Not a pull_request event — skipping audit.');
    applyOutputs([]);
    return;
  }

  const owner = ctx.repo.owner;
  const repo = ctx.repo.repo;
  const prNumber = ctx.payload.pull_request.number;
  const headSha = ctx.payload.pull_request.head.sha as string;

  core.info(`Auditing PR #${prNumber} @ ${headSha.slice(0, 7)} (${owner}/${repo})`);

  const octokit = github.getOctokit(inputs.githubToken);
  const changed = await listChangedFiles(octokit, owner, repo, prNumber);
  const matched = filterByGlob(changed, inputs.reportGlob);

  if (matched.length === 0) {
    core.info(`No files matched glob "${inputs.reportGlob}" — nothing to audit.`);
    await postOrUpdateComment(
      octokit,
      owner,
      repo,
      prNumber,
      formatNoMatchComment(inputs.reportGlob),
    );
    applyOutputs([]);
    return;
  }

  if (matched.length > DEFAULT_COST_CAPS.maxFiles) {
    core.warning(
      `Matched ${matched.length} files; audit will only cover the first ${DEFAULT_COST_CAPS.maxFiles} (cost cap).`,
    );
  }
  const toAudit = matched.slice(0, DEFAULT_COST_CAPS.maxFiles);

  const systemPrompt = loadSystemPrompt();
  const results: AuditResult[] = [];

  for (const file of toAudit) {
    core.info(`Auditing ${file.filename}...`);
    const result = await auditFile({
      octokit,
      owner,
      repo,
      filename: file.filename,
      ref: headSha,
      systemPrompt,
      apiKey: inputs.apiKey,
      model: inputs.model,
      caps: DEFAULT_COST_CAPS,
    });
    results.push(result);
    if (result.skippedReason) {
      core.warning(`Skipped ${file.filename}: ${result.skippedReason}`);
    } else {
      core.info(`  → ${result.findings.length} raw findings`);
    }
  }

  const allFindings: Finding[] = results.flatMap((r) => r.findings);
  const filtered = filterBySeverity(allFindings, inputs.severityFloor);
  const counts = severityCounts(filtered);

  core.info(
    `Audit complete: ${counts.p1} P1, ${counts.p2} P2, ${counts.p3} P3 (severity_floor=${inputs.severityFloor})`,
  );

  await postOrUpdateComment(
    octokit,
    owner,
    repo,
    prNumber,
    formatComment(results, filtered, inputs),
  );

  applyOutputs(filtered);
  decideStatus(filtered, inputs);
}

if (require.main === module) {
  run().catch((err: unknown) => {
    if (err instanceof Error) {
      core.setFailed(err.message);
    } else {
      core.setFailed(String(err));
    }
  });
}
