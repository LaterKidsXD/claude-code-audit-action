# claim-auditor — GitHub Action

[![CI](https://github.com/LaterKidsXD/claude-code-audit-action/actions/workflows/ci.yml/badge.svg)](https://github.com/LaterKidsXD/claude-code-audit-action/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Adversarial quantitative claim audit for Markdown reports in PRs.**
> Catches probability-stacking, conditional-vs-marginal, percentage-vs-percentage-points, and best-of-N selection-bias errors that human reviewers and generic linters miss.

## Why this exists

A real-world incident: an LLM-generated report claimed *"3 evals at 35.7% per eval = ~90% chance one passes."* That math is wrong — `P(≥1 of N) = 1 − (1−p)^N`, which gives **73.4%**, not 90%. A 16.6 percentage-point gap that materially changes whether the strategy is +EV. The error sat in a PR for two days because review eyes glaze over numbers in long reports.

The `claim-auditor` Action bolts an adversarial reviewer onto every PR that touches your reports. It re-derives every probability/EV/pass-rate claim, flags the ones that don't pencil out, and posts a single PR comment with P1/P2/P3 findings. Optionally fails the check on P1 to block merge until addressed.

## What it catches

| Severity | Class | Example |
| --- | --- | --- |
| **P1** | Probability stacking | `N × p` instead of `1 − (1−p)^N` |
| **P1** | "N-worst stacked" tail estimates | `5 × worst-of-1000` is ~10⁻¹⁵, not realistic |
| **P1** | Conditional vs marginal pass-rate confusion | "P(pass ≤5d) = 30%" treated as "30% pass rate" |
| **P1** | Percentage vs percentage-points mixups | "60% → 50% = 10% drop" (it's 10pp / 16.7%) |
| **P1** | Bootstrap-with-replacement implications | small recent-N source pool drives extreme percentile tails |
| **P2** | EV-per-attempt × N attempts | only valid if you commit to all N |
| **P2** | Best-of-N selection bias | top-config out-of-sample is lower than in-sample |
| **P2** | Median vs mean conflation | unflagged gaps imply asymmetric distributions |
| **P2** | Sample-size red flags | n<30 probability claims |
| **P3** | Unit/scale errors | ticks vs points, $/contract vs $/trade |
| **P3** | Time-window labeling | calendar vs trading days, YTD vs trailing-365 |

The full taxonomy lives in the [`claim-auditor` system prompt](./system-prompts/claim-auditor.md), vendored from [`claude-code-audit-stack`](https://github.com/LaterKidsXD/claude-code-audit-stack).

## Quick start

### 1. Add an Anthropic API key as a repo secret

Repo settings → Secrets and variables → Actions → New repository secret. Name it `ANTHROPIC_API_KEY`. Get a key at <https://console.anthropic.com>.

### 2. Drop in the workflow

Create `.github/workflows/claim-auditor.yml`:

```yaml
name: Claim Auditor

on:
  pull_request:
    types: [opened, synchronize, reopened]
    paths:
      - '**/*.report.md'

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: LaterKidsXD/claude-code-audit-action@v1
        with:
          api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

That's it. Open a PR that touches any `*.report.md`, and the Action will post a comment with the audit findings.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `api_key` | yes | — | Anthropic API key. Pass via `${{ secrets.ANTHROPIC_API_KEY }}`. Masked in logs via `core.setSecret`. |
| `model` | no | `claude-opus-4-7` | Anthropic model ID. Use `claude-sonnet-4-6` (~5× cheaper) or `claude-haiku-4-5` (~15× cheaper) to lower cost. |
| `report_glob` | no | `**/*.report.md` | Glob for files to audit. Comma-separate multiple patterns: `'reports/**/*.md,analysis/**/*.md'`. |
| `severity_floor` | no | `P2` | Minimum severity to surface in the PR comment: `P1`, `P2`, or `P3`. |
| `fail_on_p1` | no | `true` | Fail the check (block merge) when any P1 findings are present. |
| `github_token` | no | `${{ github.token }}` | Token for PR comment + check API. The default scopes are sufficient. |

## Outputs

| Output | Description |
| --- | --- |
| `findings_json` | JSON array of all findings at or above `severity_floor`. Useful for piping into other steps. |
| `p1_count` | Number of P1 findings. |
| `p2_count` | Number of P2 findings. |
| `p3_count` | Number of P3 findings. |
| `decision_safe` | `"true"` if no findings at or above `severity_floor`; `"false"` otherwise. |

## Example PR comment

```markdown
## Claim Auditor

**3 findings** at or above P2 — 2 P1 / 1 P2 / 0 P3.

Audited 1 file with model `claude-opus-4-7`.

> Check status will FAIL because `fail_on_p1` is enabled and 2 P1 findings were found.

### P1 — decision-shaping, must address

| File | Quote | Issue | Correction |
| --- | --- | --- | --- |
| `reports/eval.report.md` | "3 evals at 35.7% per eval = ~90% chance one passes" | P(≥1 of N) = 1−(1−p)^N, not N×p | 73.4%, not 90% |
| `reports/eval.report.md` | "5-worst stacked = 5 × −$5,580 = −$27,900" | Joint P(5 worst-of-1000) ≈ 10⁻¹⁵ | typical 5-streak ≈ −$7,500 |

### P2 — misleading framing

| File | Quote | Issue | Correction |
| --- | --- | --- | --- |
| `reports/eval.report.md` | "Top config X has 67.7% pass rate" | Selected from 504 configs — selection bias | Out-of-sample expectation 5–15pp lower |
```

## Cost & limits

The Action uses your Anthropic API key (BYOK), so the cost lands on your account. Per audit:

- **Opus 4.7:** ~$0.05–0.20 per file (1–5K input tokens, ~2K output)
- **Sonnet 4.6:** ~$0.01–0.04 per file
- **Haiku 4.5:** ~$0.005–0.02 per file

Built-in safety caps per PR run:

- Max **20 files** audited per PR
- Max **50 KB** per file (oversize files are skipped with a note in the comment)
- Max **~$5** estimated cost per PR (run aborts mid-way if estimate exceeds budget)

## Inputs that are *not* configurable in v1

Deliberately omitted from MVP scope:

- Custom severity rules / org-level config
- Historical trend tracking across PRs
- Slack / email integration
- Self-hosted runner-only modes
- Models from non-Anthropic providers

These are on the v0.2+ roadmap. Open an issue if any of them are blockers for you.

## How it works (under the hood)

```
PR open / sync
  ↓
Action reads PR diff via Octokit
  ↓
Filters changed files by `report_glob`
  ↓
For each match (up to caps):
   1. Fetch file content at PR head SHA
   2. Estimate cost — abort if budget exceeded
   3. Send to Anthropic API with the claim-auditor system prompt
   4. Parse the structured Markdown findings
  ↓
Aggregate findings, filter by `severity_floor`
  ↓
Post / update single PR comment (marker: <!-- claim-auditor -->)
  ↓
Set check status (FAIL if fail_on_p1 && any P1)
  ↓
Set Action outputs
```

No backend, no database, no telemetry. The audit runs entirely on your GitHub-hosted runner.

## Permissions required

Your workflow needs:

```yaml
permissions:
  contents: read           # checkout + fetch file content
  pull-requests: write     # post the audit comment
  issues: write            # update existing comment (issue API endpoint)
```

## Related projects

- **[claude-code-audit-stack](https://github.com/LaterKidsXD/claude-code-audit-stack)** — the Claude Code subagent + hook the Action wraps. Run the audits locally inside Claude Code; this Action wraps the same logic for CI.
- **[Sample audit findings](https://github.com/LaterKidsXD/claude-code-audit-stack/blob/main/reports/sample-findings.md)** — redacted excerpt from a real audit on a production trading bot.

## Contributing

PRs welcome. The system prompt is vendored from the upstream [audit-stack](https://github.com/LaterKidsXD/claude-code-audit-stack) — to update it, run `npm run sync-prompt` and commit the result. CI verifies that the vendored copy matches upstream before release.

```bash
git clone https://github.com/LaterKidsXD/claude-code-audit-action
cd claude-code-audit-action
npm install
npm test
npm run build      # rebuild dist/
```

## License

MIT — see [LICENSE](./LICENSE).
