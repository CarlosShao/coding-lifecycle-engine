# Dependency Management

> Phase: Phase 1 (stack freeze) + Phase 2 (impl) + Phase 4 (deploy).
> Injected when the AI adds/updates a dependency. Authority: plan §8.3 #17 and §12.3 (supply chain);
> architecture Layer 2 (frameworks), Layer 5.5 (security maintenance).

## Why

Dependency drift and supply-chain attacks are top breach vectors (architecture Layer 5.5).
Lockfiles + a version policy + scanning make builds reproducible and tamper-evident.

## Lockfiles (non-negotiable)

- Every project commits a lockfile: `package-lock.json` / `pnpm-lock.yaml` / `Cargo.lock` /
  `poetry.lock` / `go.sum` / `uv.lock`. It is a **Definition-of-Done** item (plan §16.12).
- Lockfile = reproducible build. Never `--no-lock` in CI. `Cargo.lock` committed even for libs.
- Verify integrity: npm `npm ci` (fails if lock out of sync), `cargo verify`, `pip-audit`.

## Version policy

| Strategy | Syntax | Use for |
|---|---|---|
| **Exact pin** | `1.2.3` | security-critical / native deps |
| **Caret** | `^1.2.3` | app deps (allow minor/patch) |
| **Tilde** | `~1.2.3` | allow patch only |
| **Range avoid** | `*` / `latest` | **forbidden** in committed manifests |

For libraries, prefer caret; for binaries/services, lean toward tighter pins for predictability.

## Update cadence

- **Patch/minor**: automated PRs (Dependabot/Renovate) on a schedule (weekly).
- **Major**: human-reviewed PR, with changelog + migration notes; paired with tests.
- **Security advisories**: immediate, high-priority PR; CI blocks release on unpatched criticals.

## Supply-chain security

- **Audit in CI**: `npm audit` / `pip-audit` / `cargo audit` / `govulncheck`; critical = block.
- **Provenance**: prefer signed/published packages; enable npm `provenance`, Sigstore where available.
- **Lockfile integrity**: commit + verify hashes; fail build on mismatch.
- **Minimize**: add a dep only with justification; avoid "left-pad" micro-deps; prefer stdlib.
- **License check**: block GPL/AGPL in closed-source via a license linter (architecture Layer 1.5).

## Checklist

- [ ] Lockfile committed and used in CI (`npm ci` / `cargo build` from lock)
- [ ] No `*`/`latest` ranges in committed manifests
- [ ] Automated dependency PRs on a schedule; majors human-reviewed
- [ ] Vulnerability audit in CI; critical findings block release
- [ ] Provenance/integrity verified; lockfile hashes checked
- [ ] License compatibility enforced (no GPL/AGPL in proprietary)
- [ ] Each new dependency has a stated justification
