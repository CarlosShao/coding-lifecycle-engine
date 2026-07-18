# API Versioning Strategy

> Phase: Phase 1 (contract freeze) + Phase 2 (impl) + Phase 4 (deploy).
> Injected when the AI designs/changes a public or cross-service API.
> Authority: plan §8.3 #8; architecture Layer 2.7 (API styles) and Layer 4 (deploy).

## Why

A breaking change with no versioning silently breaks clients and other services. The lifecycle
freezes contracts (Phase 1) and requires backward-compatible evolution. This defines how.

## Versioning models

| Model | Form | When |
|---|---|---|
| **URI versioning** | `/v1/users`, `/v2/users` | REST public APIs (simplest, explicit) |
| **Header versioning** | `Accept: application/vnd.app.v2+json` | Cleaner URLs, harder to debug |
| **Semantic version in OpenAPI** | `info.version: 2.3.0` | Internal/contract clarity |

For REST (architecture Layer 2.7 recommends OpenAPI), **URI versioning is the default**.

## Backward-compatibility rules (hard)

1. **Additive changes are non-breaking**: new optional fields, new endpoints, new values in an
   open enum. Existing clients must keep working.
2. **Breaking changes require a new version**: removing/renaming a field, changing types,
   tightening validation, changing status codes, removing an endpoint.
3. **Never break `/vN` in place.** `/v1` stays stable until its sunset.
4. Support **both versions concurrently** during the deprecation window (run v1 + v2 side by side).

## Deprecation policy

- Mark deprecated with `deprecated: true` + `x-deprecated-date` in OpenAPI; respond with
  `Deprecation: true` + `Sunset: <date>` HTTP headers.
- Minimum notice window: **90 days** for external APIs, **30 days** for internal.
- Communicate via CHANGELOG (`changelog-release.md`) and a banner in docs.

## Breaking-change process

1. Freeze the new contract version (`freeze_contract` in the server). Do NOT silently edit.
2. Implement `/v2` alongside `/v1`; route by URI/header.
3. Migrate internal callers to `/v2` behind feature flags (`feature-flags.md`).
4. Monitor `/v1` traffic; when ~0 (or after notice), remove `/v1` in a later release.
5. Update OpenAPI spec version + changelog.

## OpenAPI versioning

- Keep one spec per major version, or a single spec with `paths` grouped by version.
- `info.version` follows semver; regenerate docs from code (don't hand-edit stale YAML).
- CI fails if `/v1` behavior changes without a version bump.

## Checklist

- [ ] New/changed public API carries an explicit version
- [ ] Additive-only changes kept non-breaking on existing version
- [ ] Breaking change → new version, old version still served
- [ ] Deprecation headers + 90/30-day notice applied
- [ ] OpenAPI spec updated and versioned; docs regenerated
- [ ] Internal callers migrated before old version sunset
