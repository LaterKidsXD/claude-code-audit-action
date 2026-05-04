import * as core from '@actions/core';
import type { ActionInputs, Finding } from './types';
import { severityCounts } from './severity';

/**
 * Set the Action outputs (findings_json, p1_count, p2_count, p3_count, decision_safe).
 * Always emits all five outputs — even when filtered is empty — so downstream steps
 * can rely on them being defined.
 */
export function applyOutputs(filtered: Finding[]): void {
  const counts = severityCounts(filtered);
  core.setOutput('findings_json', JSON.stringify(filtered));
  core.setOutput('p1_count', String(counts.p1));
  core.setOutput('p2_count', String(counts.p2));
  core.setOutput('p3_count', String(counts.p3));
  core.setOutput('decision_safe', counts.total === 0 ? 'true' : 'false');
}

/**
 * Decide the check-status outcome. Calls core.setFailed() iff fail_on_p1 is enabled
 * and at least one P1 finding survived the severity filter.
 */
export function decideStatus(filtered: Finding[], inputs: ActionInputs): void {
  const counts = severityCounts(filtered);
  if (inputs.failOnP1 && counts.p1 > 0) {
    core.setFailed(
      `claim-auditor found ${counts.p1} P1 finding${counts.p1 === 1 ? '' : 's'}. ` +
        `See PR comment for details. Set fail_on_p1: false to surface as warnings instead.`,
    );
  }
}
