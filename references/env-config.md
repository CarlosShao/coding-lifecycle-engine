# Environment Configuration Standard

> Phase: Phase 1 (skeleton) + Phase 2 (impl). Injected when the AI defines how an app
> receives config or when it hardcodes a URL/port/secret.
> Authority: 8-layer architecture reference, Layer 1.6 (12-Factor config) and Layer 1.7
> (secrets management). Cite: `project-architecture.zh.md` §1.6, §1.7.

## Why this matters

Hardcoded config (DB URLs, ports, feature toggles, secrets) is the #1 cause of "works on
my machine" and secret leakage into git. The AI Coding lifecycle forbids committing real
secrets (see `security-baseline.md`). This file defines the contract.

## Core rules (hard constraints)

1. **Store config in the environment.** Anything that varies between deploys (dev/staging/prod)
   is an environment variable — never in code, never in source control. (12-Factor §III.)
2. **`.env` is for local dev only.** It must be in `.gitignore`. Real `.env` files are never committed.
3. **Always ship `.env.example`.** It documents every variable with placeholder values and no
   real secrets. This is a Definition-of-Done item.
4. **Secrets are injected at runtime** from a secret manager (Vault / AWS Secrets Manager /
   GCP Secret Manager / CI encrypted vars). The AI never sees the real secret — only the
   reference pattern. (architecture Layer 1.7.)
5. **One build, many environments.** The same compiled artifact must run in dev/staging/prod
   with only env differences. No `if (env === 'prod')` branching on values baked into code.
6. **Dev/prod parity.** Keep dev, staging, prod as similar as practical (architecture Layer 1.6,
   "dev-prod parity").

## `.env.example` template

```dotenv
# ---- Service ----
APP_NAME=my-service
APP_ENV=development            # development | staging | production
APP_PORT=3000
LOG_LEVEL=info                 # trace|debug|info|warn|error

# ---- Database (value is a reference, never a real credential) ----
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME   # injected at runtime
DB_POOL_SIZE=10

# ---- External services (use secret-reference pattern) ----
REDIS_URL=redis://HOST:6379
STRIPE_API_KEY=__SECRET:stripe/api_key__     # resolved from vault at runtime
JWT_SECRET=__SECRET:auth/jwt_signing__        # never hardcode

# ---- Feature flags (see feature-flags.md) ----
FEATURE_NEW_CHECKOUT=false
```

## Multi-environment layout

| Env | Source of config | Secrets |
|---|---|---|
| local | `.env` (gitignored) | local dev only, throwaway |
| CI/test | CI encrypted vars | CI secret store |
| staging | platform env injection | secret manager (staging scope) |
| prod | platform env injection | secret manager (prod scope) |

Load order (lowest → highest precedence): defaults < `.env` < process env. At runtime,
process env always wins.

## Secret-reference pattern (runtime injection)

Do NOT inline secrets. Express them as a reference the runtime resolves:

- **Vault**: `VAULT_ADDR` + `VAULT_ROLE` → app fetches `secret/data/prod/stripe`.
- **Cloud**: use workload identity (IRSA/GCP WIF) so the app reads
  `secretmanager.googleapis.com/...` without static keys.
- **CI**: `${{ secrets.STRIPE_API_KEY }}` (GitHub Actions), never `STRIPE_API_KEY=sk_live_...`.

Code side (illustrative, TS):

```ts
// resolve a __SECRET:path__ reference from the vault; never log the resolved value
const dbUrl = await resolveSecret(process.env.DATABASE_URL!);
```

## Checklist

- [ ] `.env.example` committed, documents every var, contains zero real secrets
- [ ] `.env` present in `.gitignore` (and ideally `.env*.local`)
- [ ] No secret, host, port, or toggle hardcoded in source
- [ ] Same artifact runs in all envs via env vars only
- [ ] Secret manager / CI secret store wired; app reads refs, not literals
- [ ] `LOG_LEVEL` / `APP_ENV` switch behavior without code changes
- [ ] A fresh clone + `cp .env.example .env` + one setup command runs locally
