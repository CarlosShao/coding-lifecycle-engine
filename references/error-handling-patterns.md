# Error Handling Patterns

> Phase: Phase 2 (impl). Injected when the AI writes fallible code in any language.
> Authority: plan §8.3 #15 and §9 quality rules G9 (no empty catch / bare unwrap); architecture Layer 3.7 (resilience).

## Why

AI code is riddled with `.unwrap()` crashes, `except: pass`, and `_ = err` swallowers. Errors
must be explicit, contextual, and lead to graceful degradation — not panics or silence.

## Per-language paradigms

**Rust** — `Result<T, E>` everywhere fallible; `thiserror` for typed errors.
```rust
fn load() -> Result<Config, ConfigError> { /* ... */ }
// NEVER unwrap in app code (clippy::unwrap_used = deny, plan §9 R3)
let cfg = load().map_err(|e| tracing::error!(?e, "load failed"))?;
```

**TypeScript** — typed errors or `Result` (never `any`); handle promises.
```ts
async function getUser(id: string): Promise<User> {
  const u = await repo.find(id);          // no floating promise (no-floating-promises)
  if (!u) throw new UserNotFoundError(id);
  return u;
}
```
Avoid `as` casts; use `unknown` narrowing. Never `catch { }` empty.

**Python** — exceptions, typed; never bare `except:`.
```python
try:
    data = parse(raw)
except ValueError as e:              # ruff E722: no bare except
    logger.warning("bad payload", extra={"raw_id": rid})
    raise BadPayloadError(rid) from e
```

**Go** — return `error`, wrap with `%w`, never `_ =`.
```go
res, err := db.Query(ctx, q)
if err != nil { return fmt.Errorf("load user %s: %w", id, err) } // errcheck
```

## Degradation, retry, circuit-breaker

- **Transient failures** (network, 5xx): retry with **exponential backoff + jitter**; cap attempts.
- **Idempotency**: retries must be safe (use idempotency keys for writes).
- **Circuit breaker**: after N consecutive failures, open the circuit; half-open to test recovery
  (architecture Layer 3.7 resilience). Avoid hammering a downed dependency.
- **Timeouts**: every external call has a bounded `context`/timeout; never wait forever.
- **Degrade gracefully**: return cached/stale data or a clear error; never crash the process.

## Hard prohibitions (lint-deny in the lifecycle)

- [ ] **No empty `catch` / `except:` / bare `unwrap` / `expect`** (tests excepted).
- [ ] **No swallowed errors** (`_ =`, `errcheck` deny, `try {} catch {}`).
- [ ] **No `panic` for expected errors** in library/service code (Go: panic only for truly
  unrecoverable start-up failures).
- [ ] **No error strings leaked to users** without a safe, generic message + correlation id.

## Checklist

- [ ] Fallible ops return typed errors / `Result` (language-appropriate)
- [ ] Errors wrapped with context (cause chain preserved: `%w` / `from e`)
- [ ] No empty catch / bare unwrap / swallowed error anywhere
- [ ] External calls: timeout + bounded retry + (for flaky deps) circuit breaker
- [ ] Failures logged with correlation id, not crashing the process
- [ ] User-facing errors are safe/generic; details stay server-side
