# Logging Standards

> Phase: Phase 2 (impl). Injected when the AI adds logging or when observability is wired.
> Authority: plan §8.3 #7 and §16.7 (PII filtering). Architecture Layer 5.1 (observability).

## Why

Two failure modes: (a) no logs → blind in prod; (b) logs that dump passwords/PII → compliance
breach. Structured, leveled, correlation-aware logging is the baseline for every service.

## Log levels (use precisely)

| Level | Meaning | Example |
|---|---|---|
| `TRACE` | Finest detail, dev only | entry/exit of every fn |
| `DEBUG` | Diagnostic, off in prod | SQL executed, cache miss |
| `INFO` | Normal milestone | request received, job finished |
| `WARN` | Recoverable oddity | retry, deprecated usage |
| `ERROR` | Operation failed | exception caught, downstream 5xx |
| `FATAL` | process-ending | cannot bind port |

Never use `console.log` for app logs in production (architecture: ESLint `no-console` for prod).

## Structured logging (JSON)

Emit one JSON object per line — not printf strings. Machines parse; humans `jq`.

```json
{"ts":"2026-07-15T10:00:00Z","level":"INFO","req_id":"a1b2","svc":"checkout","msg":"order created","order_id":42,"latency_ms":120}
```

Required fields on every line: `ts` (ISO8601, UTC), `level`, `msg`, `svc`, `req_id`.

## Correlation IDs (mandatory for request paths)

- Generate/propagate a `req_id` at the edge; thread it through every log + downstream call.
- For distributed: adopt **trace_id** via OpenTelemetry (architecture Layer 5.1 / `observability-minimal.md`).
- Log the `req_id` on every line in a request scope so you can reconstruct a flow.

## What to log

- [x] Request id, route, latency, status code (for served requests).
- [x] Slow operations (> threshold) with the operation name.
- [x] External call failures with partner name + error + `req_id`.
- [x] Business milestones that aid debugging (order state changes).

## What NEVER to log (hard rule, plan §16.7)

- [ ] **Secrets**: passwords, API keys, tokens, JWTs, signing keys.
- [ ] **PII**: emails, national IDs, payment card numbers, health data, addresses.
- [ ] **Full payloads**: log field names / ids, redact bodies. Use a scrubber.
- [ ] Stack traces that include secret values — scrub first.
- [ ] `DEBUG`/`TRACE` in production by default.

Add a redaction middleware that strips known sensitive keys (`password`, `token`, `authorization`,
`ssn`, `card`) before emit.

## Checklist

- [ ] JSON structured logs, not string concat
- [ ] Correct level used; no INFO-spam, no ERROR-for-warnings
- [ ] `req_id`/`trace_id` threaded through request scope
- [ ] No secrets/PII/full-payloads logged; redaction middleware present
- [ ] `console.log` removed from prod paths
- [ ] Log level configurable via env (`LOG_LEVEL`)
