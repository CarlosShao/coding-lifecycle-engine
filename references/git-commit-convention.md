# Git Commit Convention

> Phase: Phase 2 (impl) + Phase 3 (review). Injected when the AI writes a commit or PR title.
> Authority: plan §8.3 #3 (Conventional Commits + commitlint). Ties to `changelog-release.md`
> (semver) and `pr-review-checklist.md` (PR titles).

## Why

Inconsistent or empty commit messages make history unreadable, break changelog generation,
and defeat `git bisect`. The lifecycle requires a machine-parseable format.

## Conventional Commits (spec summary)

Format: `<type>(<optional scope>): <description>`

```
fix(auth): prevent token refresh race on concurrent requests
feat(api): add pagination to /users endpoint
docs(readme): document env setup
refactor(db): extract query builder into dao module
chore(deps): bump axios to 1.7.0
```

**Types:** `feat` · `fix` · `docs` · `style` · `refactor` · `perf` · `test` ·
`build` · `ci` · `chore` · `revert`.

**Rules:**
- `feat:` → maps to a **MINOR** semver bump; `fix:` → **PATCH**; `BREAKING CHANGE:` → **MAJOR**.
- Description: imperative mood, lowercase start, no trailing period, ≤ 72 chars.
- Body (optional, after blank line): *why*, not *what*. Wrap at 72 cols.
- Footer: `BREAKING CHANGE: <desc>` and/or `Refs #123`, `Closes #45`.
- One logical change per commit. Never `git add -A` a kitchen sink.

## commitlint config (`.commitlintrc.json`)

```json
{
  "extends": ["@commitlint/config-conventional"],
  "rules": {
    "type-enum": [2, "always", ["feat","fix","docs","style","refactor","perf","test","build","ci","chore","revert"]],
    "scope-case": [2, "always", "lower-case"],
    "subject-empty": [2, "never"],
    "subject-max-length": [2, "always", 72],
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [0, "always", 100]
  }
}
```

Wire it as a `commit-msg` hook (husky / lefthook / pre-commit) so bad messages are blocked
locally — a mechanical gate, not a suggestion.

## Good vs bad

| Good | Bad |
|---|---|
| `fix(api): validate page param is positive` | `fix bug` |
| `feat(ui): add dark mode toggle` | `more stuff` |
| `refactor(auth): split token service` | `cleanup` |
| `chore(deps): upgrade pg to 8.11` | `update packages` |

## PR-title discipline

PR title follows the same convention (it becomes the squash commit). Enforce with a
branch-protection status check (e.g. `amannn/action-semantic-pull-request`). A PR titled
"WIP" or "updates" must not be merged.

## Checklist

- [ ] Every commit message follows Conventional Commits
- [ ] `commitlint` passes in the `commit-msg` hook (CI re-checks)
- [ ] One cohesive change per commit (no `add -A` dumps)
- [ ] `feat`/`fix`/`BREAKING CHANGE` correctly signal semver impact
- [ ] PR title is conventional and describes the user-facing change
- [ ] Breaking changes carry `BREAKING CHANGE:` footer + migration note
