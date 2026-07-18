# Performance Budget

> Phase: Phase 1 (NFR capture) + Phase 2 (impl) + Phase 3/4 (verify).
> Injected when the AI sets or violates latency/throughput/size targets.
> Authority: plan §8.3 #9 and §16.6 (NFR as first-class, `nfr` field on tasks).

## Why

"You find out in prod" is too late. Performance is a non-functional requirement captured at
task level (`tasks.nfr`). Budgets give a baseline; CI gates regressions before merge.

## Budget categories

| Category | Metric | Example budget |
|---|---|---|
| **Response time** | p50 / p95 / p99 latency | p95 < 200ms, p99 < 500ms |
| **Throughput** | req/s at target load | ≥ 500 rps @ p95 budget |
| **Bundle size** | JS gzipped per route | < 200KB initial, < 500KB total |
| **DB** | query time / connection use | < 50ms hot query, pool ≥ N |
| **Memory** | RSS per instance | < 512MB steady |

Budgets are **per project/route**, set from the NFR, not invented per commit.

## Setting baselines

1. At Phase 1, record target NFR per route/feature in the task's `nfr` field.
2. Measure a baseline on a representative environment (same class as prod, not a laptop).
3. Baseline = measured p95 under expected load via k6/Artillery (architecture Layer 3.5).
4. Store baseline in `perf-baselines.json` (committed) so regressions are diffable.

## CI performance gate

```
build → lint → test → perf-check → scan → deploy
                              │
                  compare p95 vs baseline.json
                  regression > 10%  → FAIL (block merge)
```

- Run a slim load test on PRs touching hot paths; full suite on main/nightly.
- Threshold: a **>10% regression** on any budgeted metric fails the gate (tune per project).

## On regression

1. **Do not silently bump the baseline.** Investigate first.
2. Profile (Sentry/Pyroscope/pprof) to find the cause: N+1 query, unindexed scan, extra
   serialization, missing cache.
3. Fix the root cause; re-measure; only update the baseline with a documented reason + ADR.
4. If the regression is intentional (new feature cost), split the budget or accept via review.

## Checklist

- [ ] NFR (latency/throughput/size) captured in task `nfr` at Phase 1
- [ ] Baseline measured and committed (`perf-baselines.json`)
- [ ] CI perf gate compares against baseline; >10% regression blocks
- [ ] Regression investigated (not baseline-bumped) before merge
- [ ] Hot queries indexed / cached; bundle within budget
