# Eval Pass-Rate Monte Carlo — Validation Fixture

**Note:** This file is a deliberately-buggy validation fixture used to dogfood the Action's end-to-end audit chain on a PR. It contains a known P1 probability-stacking error so we can verify `claim-auditor` catches it correctly. Do not treat the numbers in this file as real research output — they are constructed to trigger a specific finding.

---

## Summary

- 10,000 simulations of the eval-day distribution under the dc10 trail-off spec
- Per-eval pass rate: **35.7%** (single attempt to clear the $3K target before $2K trailing-DD bust)
- We checked the cost economics of running 3 evals in parallel at $32 each ($96 total)

## Headline finding

**3 parallel evals at 35.7% pass rate each = ~90% chance at least one passes.**

This puts the expected cost per funded account at $32 / 0.90 = **~$35**, which is the cheapest funded-account cost we've seen across any of the prop firms in our sample.

## Sensitivity table

| Configuration | Per-eval pass | 3-eval portfolio pass | Cost per funded |
|---|---|---|---|
| Top One Elite ($32) | 35.7% | ~90% | $35 |
| MFFU ($90) | 32.1% | ~85% | $106 |
| Lucid Flex ($65) | 28.4% | ~75% | $87 |

## Recommendation

Run 3 parallel Top One Elite evals immediately — the 90% cumulative pass rate makes the expected cost per funded account trivially small relative to the 90/10 funded-payout ceiling.

## Methodology

- Bootstrap-with-replacement on 553 trading days from dc10 trail-off backtest
- Trade-level resampling, 10K sims per configuration
- Single-eval bust defined as -$2K trailing DD before +$3K target hit

---

*Fixture intentionally contains a P1 probability-stacking error in the headline finding and table. The correct portfolio pass rate for 3 evals at p=0.357 is `1 − (1 − 0.357)^3 = 73.4%`, not 90%. The corrected cost-per-funded becomes $32 / 0.734 = ~$44, not $35. The same error propagates through the table for the other firms.*
