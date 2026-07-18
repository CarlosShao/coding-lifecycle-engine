# Feature Flags Standard

> Phase: Phase 1 (design) + Phase 2 (impl) + Phase 4 (rollout).
> Injected when the AI adds a toggle, env switch, or "enable X for some users" logic.
> Authority: plan §8.3 #6; architecture Layer 4.7 (environments & feature flags).

## Why

Hardcoded `if (FEATURE) {}` blocks can't be rolled back without a redeploy, can't be
percentage-rolled-out, and rot in the codebase. Feature flags decouple *deploy* from
*release* (architecture Layer 4.7), enabling safe gradual rollout and instant kill-switch.

## Patterns

| Approach | When | Tooling |
|---|---|---|
| **Config/Env flag** | Simple on/off, same for all users | env var (`FEATURE_X=true`) |
| **Self-built store** | Few flags, DB/redis-backed, per-tenant | own table + cache |
| **LaunchDarkly** | Percentage/A-B/targeting at scale | [launchdarkly.com/docs](https://launchdarkly.com/docs) |
| **Unleash** | OSS, self-hosted, targeting rules | [docs.getunleash.io](https://docs.getunleash.io) |

## Kill-switch rule (hard)

Every flag that gates a non-trivial or risky path **must** default to **OFF** in production
and be flippable at runtime without redeploy. A dead toggled-off path must not crash.

## Gradual rollout

1. Ship code behind flag = OFF.
2. Enable for internal/staging users.
3. Percentage ramp: 1% → 10% → 50% → 100% with monitoring between steps.
4. If error budget burns (see `performance-budget.md`, `observability-minimal.md`) → flip OFF.

## Code shape (illustrative)

```ts
if (flags.isEnabled('new-checkout', { userId })) {
  return newCheckout(req);
}
return legacyCheckout(req);
```

- Centralize flag evaluation (one `flags` service), not scattered `process.env` reads.
- Never branch business logic on raw env vars for user-targeted features.

## Cleanup of stale flags (critical, easy to forget)

Flags are tech debt. Every flag has an owner + expiration.

- [ ] When flag reaches 100% and is stable ≥ 1 release → remove flag AND the dead branch.
- [ ] Add a `flags-inventory.md` entry: name, owner, created, planned-removal.
- [ ] CI lint warns on flags older than their planned-removal date.
- [ ] Never leave `if (false)` / permanently-disabled dead code.

## Checklist

- [ ] Flag via a flag system, not inline `process.env` for user targeting
- [ ] Risky flags default OFF in prod + runtime kill-switch exists
- [ ] Rollout plan is percentage-based with monitoring gates
- [ ] Flag recorded in inventory with owner + removal date
- [ ] Dead branch removed once flag is fully rolled out
- [ ] No leftover hardcoded `true/false` feature constants
