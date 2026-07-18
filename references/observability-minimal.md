# Observability (Minimal → Scale)

> Phase: Phase 1 (plan) + Phase 2 (impl) + Phase 4 (verify).
> Injected when the AI wires logging/monitoring or before first prod traffic.
> Authority: plan §8.3 #18; architecture Layer 5 (Maintenance & Ops), esp. 5.1/5.2/5.3.

## Why

"Eyes blind in prod" is the default AI outcome. The lifecycle mandates a **minimal but real**
observability baseline from day one, with a clear path to scale (plan §8.3: Sentry + logs first).

## MVP-minimal baseline (do this even for prototypes)

1. **Structured logs** — JSON, leveled, correlation id (`logging-standards.md`). This is free.
2. **Error tracking — Sentry** — catch exceptions + unhandled rejections with stack + context.
   ```ts
   Sentry.init({ dsn: process.env.SENTRY_DSN /* secret ref */, tracesSampleRate: 0.1 });
   ```
3. **Health endpoint** — `/healthz` (liveness) + `/readyz` (readiness) for the platform.
4. **Basic metrics** — request count, error rate, p95 latency (even via simple counters).
5. **Alert on the one thing that matters**: error rate spike → notify owner.

That's the floor. No dashboards required yet, but errors must be visible the day you ship.

## Path to scale (when pain appears)

| Need | Adopt | Source |
|---|---|---|
| Metrics + dashboards | **Prometheus + Grafana** | architecture Layer 5.1 |
| Vendor-neutral telemetry | **OpenTelemetry** (logs/metrics/traces) | opentelemetry.io |
| Distributed tracing | OTel + **Jaeger/Tempo** | cross-service flows |
| Logs aggregation | **Loki / ELK** | searchable logs |
| APM / deep perf | **Datadog / New Relic** | when one platform suffices |
| SLO / error budgets | **SLO + Alertmanager** | sre.google SLO book |

Adopt OpenTelemetry early to avoid vendor lock-in (architecture Layer 5.1 guidance).

## SLOs & alerting (from first prod traffic)

- Define 3–5 SLOs per critical service: e.g. 99.9% availability, p99 < 500ms (ties to
  `performance-budget.md`).
- Alert on **symptoms** (error rate, latency), not causes; avoid alert fatigue (architecture 5.2).
- Wire alerts to on-call (PagerDuty/Opsgenie) once you have real users.

## Checklist

- [ ] Structured logging with correlation id in place
- [ ] Sentry (or equivalent) initialized; unhandled errors captured
- [ ] `/healthz` + `/readyz` endpoints exist
- [ ] Basic error-rate/latency signal visible to owner
- [ ] Alert fires on error-rate spike before users complain
- [ ] (Scale) OTel/Prometheus/Grafana adopted as needs grow; SLOs defined
