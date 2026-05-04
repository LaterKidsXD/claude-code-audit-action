import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as core from '@actions/core';
import { applyOutputs, decideStatus } from '../src/status';
import type { ActionInputs, Finding } from '../src/types';

vi.mock('@actions/core', () => ({
  setOutput: vi.fn(),
  setFailed: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  getInput: vi.fn(),
  setSecret: vi.fn(),
}));

const inputs: ActionInputs = {
  apiKey: 'sk',
  model: 'claude-opus-4-7',
  reportGlob: '**/*.report.md',
  severityFloor: 'P2',
  failOnP1: true,
  githubToken: 'gh',
};

const p1: Finding = { file: 'a.md', severity: 'P1', quote: 'q', issue: 'i' };
const p2: Finding = { file: 'a.md', severity: 'P2', quote: 'q', issue: 'i' };

describe('applyOutputs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits zero counts + decision_safe=true for empty findings', () => {
    applyOutputs([]);
    expect(core.setOutput).toHaveBeenCalledWith('findings_json', '[]');
    expect(core.setOutput).toHaveBeenCalledWith('p1_count', '0');
    expect(core.setOutput).toHaveBeenCalledWith('p2_count', '0');
    expect(core.setOutput).toHaveBeenCalledWith('p3_count', '0');
    expect(core.setOutput).toHaveBeenCalledWith('decision_safe', 'true');
  });

  it('emits real counts + decision_safe=false when findings exist', () => {
    applyOutputs([p1, p2, p2]);
    expect(core.setOutput).toHaveBeenCalledWith('p1_count', '1');
    expect(core.setOutput).toHaveBeenCalledWith('p2_count', '2');
    expect(core.setOutput).toHaveBeenCalledWith('decision_safe', 'false');
    const findingsCall = (core.setOutput as any).mock.calls.find(
      ([k]: [string]) => k === 'findings_json',
    );
    expect(JSON.parse(findingsCall[1])).toHaveLength(3);
  });
});

describe('decideStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails when fail_on_p1 is true and P1s exist', () => {
    decideStatus([p1], inputs);
    expect(core.setFailed).toHaveBeenCalledOnce();
    expect((core.setFailed as any).mock.calls[0][0]).toMatch(/found 1 P1/);
  });

  it('does not fail when fail_on_p1 is false', () => {
    decideStatus([p1], { ...inputs, failOnP1: false });
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('does not fail when there are no P1 findings', () => {
    decideStatus([p2], inputs);
    expect(core.setFailed).not.toHaveBeenCalled();
  });
});
