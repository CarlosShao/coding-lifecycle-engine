# Changelog & Release Process

> Phase: Phase 4 (delivery). Injected at release time and when the AI bumps a version.
> Authority: plan §8.3 #11; pairs with `git-commit-convention.md` and `release-readiness.md`.

## Why

Without a changelog, users and on-call can't tell what changed; without semver discipline,
dependencies break. Releases must be reproducible and tagged.

## Semantic Versioning (semver.org)

`MAJOR.MINOR.PATCH`
- **MAJOR**: breaking changes (API/contract). See `api-versioning.md`.
- **MINOR**: backward-compatible new features.
- **PATCH**: backward-compatible bug fixes.

Pre-release: `1.2.0-rc.1`. Build metadata: `1.2.0+build.7`.

## Keep a Changelog format (`CHANGELOG.md`)

```markdown
# Changelog
All notable changes to this project are documented here.
Format: Keep a Changelog · Versions: SemVer.

## [Unreleased]

## [1.2.0] - 2026-07-15
### Added
- Pagination on GET /users (#123)
### Changed
- Checkout flow behind `new-checkout` flag (#119)
### Fixed
- Token refresh race (#131)
### Deprecated
- GET /v1/cart (sunset 2026-10-15)

## [1.1.1] - 2026-06-30
### Fixed
- Off-by-one in report export (#128)
```

Categories: `Added` · `Changed` · `Deprecated` · `Removed` · `Fixed` ·
`Security`. Keep `Unreleased` at top; move items into the new version on release.

## Release process (gate before handoff — see `release-readiness.md`)

1. Ensure `main` is green (build → lint → test → scan).
2. Move `Unreleased` items into a new `[x.y.z] - DATE` section; commit.
3. Bump version in code (package.json / Cargo.toml / pyproject) consistent with semver.
4. Tag: `git tag -a v1.2.0 -m "Release 1.2.0"`; push tags.
5. Build artifact; publish; announce in release notes.

## Tag discipline (hard)

- Tags are **immutable**; never re-tag over a shipped release.
- Tag format `vMAJOR.MINOR.PATCH` exactly; CI rejects malformed tags.
- A tag = a deployable, reproducible artifact (lockfile pinned — `dependency-management.md`).
- Hotfix → `PATCH` from the released tag's branch, not from `main` arbitrarily.

## Checklist

- [ ] Version bumped per semver (in code + tag)
- [ ] CHANGELOG updated: Unreleased → dated version section, categorized
- [ ] Commit messages conventional (drive the changelog)
- [ ] Git tag created, immutable, well-formed
- [ ] Release notes summarize user-facing changes + breaking/deprecation notices
- [ ] Artifact built from the exact tagged commit
