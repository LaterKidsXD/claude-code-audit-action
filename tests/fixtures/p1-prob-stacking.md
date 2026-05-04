# Claim Audit — eval_pass_rate_monte_carlo.report.md

## P1 (decision-shaping, must address)

| Quote | Why wrong | Correct number |
|---|---|---|
| "3 evals at 35.7% per eval = ~90% chance one passes" | P(>=1 of N) = 1-(1-p)^N, not N*p | 73.4%, not 90% |

## P2 (misleading framing)

| Quote | Why misleading | Correction or context |
|---|---|---|

## P3 (pedantic)

| Quote | Issue | Fix |
|---|---|---|

## Summary

- 1 P1 error — materially changes the eval-cost economics
- 0 P2 framings
- 0 P3 nits
- **Recommended action:** Recompute eval-cost economics with the corrected probability.
