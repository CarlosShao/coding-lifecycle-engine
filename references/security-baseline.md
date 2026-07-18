# Security Baseline

> Phase: Phase 2 (impl) + Phase 3 (review) + Phase 4 (deploy).
> Injected when the AI writes auth, handles input, or before release.
> Authority: plan §8.3 #13 and §16.7; architecture Layer 2.5 (auth), Layer 3.6 (security testing),
> Layer 5.5 (security maintenance). OWASP Top 10 (owasp.org).

## Why

AI-generated code routinely reintroduces OWASP Top 10 flaws (injection, broken auth, XSS).
This is a **security gate**: a critical finding blocks release (plan §16.7 — supply-chain
scan critical = block, not warn).

## OWASP Top 10 baseline (map each to a control)

| # | Risk | Minimum control |
|---|---|---|
| A01 | Broken Access Control | enforce authz on every endpoint; deny by default |
| A02 | Cryptographic Failure | TLS everywhere; no plaintext secrets; strong hashing (argon2/bcrypt) |
| A03 | Injection | parameterized queries; ORM; output encoding; no string-built SQL |
| A04 | Insecure Design | threat-model risky flows; fail safe |
| A05 | Security Misconfiguration | hardened headers, no default creds, least privilege |
| A06 | Vulnerable Components | lockfiles + dependency scan (see `dependency-management.md`) |
| A07 | Auth Failures | rate-limit login; lockout; secure session/JWT; no algo `none` |
| A08 | Integrity Failures | signed commits/artifacts; verify deps (provenance) |
| A09 | Logging Failures | audit logs; never log secrets/PII (`logging-standards.md`) |
| A10 | SSRF | allowlist outbound URLs; block metadata endpoints |

## Input validation (hard)

- Validate **all** external input at the boundary (query/body/params/headers).
- Schema-validate with the framework (zod/pydantic/JSON Schema); reject unknown fields.
- Never trust client-supplied IDs for authorization (re-check ownership server-side).
- Encode output per context (HTML/JS/SQL) to prevent XSS/Injection.

## AuthN / AuthZ

- Use established providers / OIDC (architecture Layer 2.5); don't roll your own crypto.
- Hash passwords with argon2id/bcrypt; never store plaintext or reversible.
- JWT: verify signature + exp + audience; short-lived access + rotate refresh.
- Authorization: check per-request, deny-by-default, server-enforced.

## Secrets & config

- No secrets in code/git/images (plan §16.7 iron rule). Use `env-config.md` secret-ref pattern.
- Rotate via secret manager; scan history for leaks (gitleaks/TruffleHog in CI).

## Headers / CSP

- `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options`/frame-ancestors,
  `Strict-Transport-Security`, `Referrer-Policy`. Set via platform/proxy (architecture Layer 4.5).

## Security gate checklist (block release on any FAIL)

- [ ] SAST + dependency scan in CI; **critical = block** (not warn)
- [ ] All external input schema-validated at boundary
- [ ] No raw SQL string concatenation / command injection
- [ ] Authz enforced server-side, deny-by-default
- [ ] Secrets absent from code, images, history
- [ ] Security headers + CSP present
- [ ] No default credentials; least-privilege IAM/DB roles
- [ ] Audit logging on; PII/secrets never logged
