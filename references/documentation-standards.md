# Documentation Standards

> Phase: Phase 2 (impl) + Phase 4 (delivery). Injected when the AI writes code comments, API docs,
> or architecture docs. Authority: plan §8.3 #16 and §16.12 (auto-gen vs human-written ownership).

## Why

Undocumented public APIs and "what the code does" comments waste every future reader. Docs must
be split into **auto-generated** (machine-owned) and **human-written** (intent/decisions) — and
the split must be explicit so neither rots.

## Code comments

- Comment **why**, not **what**. The code already says what.
- No noise comments (`// increment i`). No commented-out dead code (delete it).
- Public functions/types: doc comment required (plan §9 G10; `missing_docs` lint).
- Complex invariants / non-obvious math: explain the reasoning.
- Keep comments in sync; a wrong comment is worse than none — prefer self-explanatory names.

## API documentation (auto-generated from code)

| Surface | Tool | Owned by |
|---|---|---|
| REST | **OpenAPI** (from FastAPI/route decorators) | generated, committed spec |
| Rust | **rustdoc** (`cargo doc`) | generated from doc comments |
| TS/JS | **JSDoc** + typedoc | generated from doc comments |
| Python | **docstrings** + pdoc/mkdoc | generated from docstrings |
| Go | **godoc** | generated from comments |

Rule: generate API docs in CI; never hand-edit the generated artifact. A mismatch fails the build.

## Architecture & decision docs (human-written)

- **ADR** (`docs/adr/NNN-title.md`): Status / Context / Decision / Consequences
  (architecture Layer 1.3; Nygard format). One per significant, hard-to-reverse choice.
- **README / CONTRIBUTING**: human-owned, kept current (`onboarding-template.md`).
- **Runbooks**: for known incidents/ops procedures (architecture Layer 5.7).
- **Diagrams**: keep source (mermaid/dot) in repo, render in docs.

## Auto-generated vs human-written (ownership matrix)

| Artifact | Owner | Regenerate |
|---|---|---|
| OpenAPI / rustdoc / JSDoc | machine (from code) | CI on every build |
| CHANGELOG | semi-auto from commits | `changelog-release.md` |
| ADR / README / runbook | human | edited on change |
| Architecture overview | human | reviewed per phase |

## Doc-rot guard

- CI checks: missing doc comments on public API (lint), OpenAPI in sync, dead links in docs.
- "Docs updated" is a PR checklist item when public behavior changes (`pr-review-checklist.md`).

## Checklist

- [ ] Public API/types carry doc comments (lint `missing_docs` passes)
- [ ] Comments explain why; no noise/dead-code comments
- [ ] API docs auto-generated and committed; CI verifies in-sync
- [ ] Significant decisions captured as ADRs (human-written)
- [ ] README/CONTRIBUTING/runbooks current after behavior change
- [ ] Generated vs human-owned docs clearly separated; no hand-edited generated files
