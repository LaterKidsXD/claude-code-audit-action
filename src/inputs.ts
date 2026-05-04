import * as core from '@actions/core';
import type { ActionInputs, Severity } from './types';
import { SEVERITIES } from './types';

function parseSeverity(raw: string): Severity {
  const upper = raw.trim().toUpperCase();
  if ((SEVERITIES as ReadonlyArray<string>).includes(upper)) {
    return upper as Severity;
  }
  throw new Error(`Invalid severity_floor "${raw}". Must be one of: ${SEVERITIES.join(', ')}.`);
}

function parseBoolean(raw: string, fallback: boolean): boolean {
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  if (v === '') return fallback;
  throw new Error(`Invalid boolean "${raw}". Use true/false.`);
}

export function readInputs(): ActionInputs {
  const apiKey = core.getInput('api_key', { required: true });
  // Mask immediately so it never lands in any log line, even if echoed by mistake.
  if (apiKey) {
    core.setSecret(apiKey);
  }

  const model = core.getInput('model') || 'claude-opus-4-7';
  const reportGlob = core.getInput('report_glob') || '**/*.report.md';
  const severityFloor = parseSeverity(core.getInput('severity_floor') || 'P2');
  const failOnP1 = parseBoolean(core.getInput('fail_on_p1') || 'true', true);
  const githubToken = core.getInput('github_token', { required: true });

  return { apiKey, model, reportGlob, severityFloor, failOnP1, githubToken };
}
