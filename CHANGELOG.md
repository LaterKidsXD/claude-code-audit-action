# Changelog

All notable changes to this project will be documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/), versioning is [SemVer](https://semver.org/).

## [1.0.0] — 2026-05-04

### Added

- Initial public release.
- Wraps the `claim-auditor` subagent from [claude-code-audit-stack](https://github.com/LaterKidsXD/claude-code-audit-stack) as a GitHub Action.
- BYOK Anthropic API key — no backend, no database, no telemetry.
- Inputs: `api_key`, `model`, `report_glob`, `severity_floor`, `fail_on_p1`, `github_token`.
- Outputs: `findings_json`, `p1_count`, `p2_count`, `p3_count`, `decision_safe`.
- Idempotent PR comment via marker `<!-- claim-auditor -->`.
- Check status FAIL on P1 findings (toggleable via `fail_on_p1`).
- Cost caps: max 20 files / PR, max 50 KB / file, max $5 estimated cost / PR.
- Exponential-backoff retry (1s, 4s, 16s) on 429 rate-limit responses.
- API key masked via `core.setSecret()` so it never appears in logs.
- Self-test workflow that dogfoods the Action on this repo's own PRs.
