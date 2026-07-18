# Accessibility & Internationalization

> Phase: Phase 2 (UI impl) + Phase 3 (review). Injected for any frontend/UI task.
> Authority: plan §8.3 #14 and §16.6 (a11y as a mandatory UI checklist); architecture Layer 2.2/2.6.

## Why

Accessibility and i18n are expensive to retrofit. WCAG AA is the floor; hardcoded UI strings
make localization impossible. The lifecycle treats a11y as a per-UI-task gate, not a later polish.

## Accessibility — WCAG 2.1 AA minimum

| Concern | Rule |
|---|---|
| **Semantic HTML** | use `<button>`, `<nav>`, `<main>`, `<label for>`; no `<div onClick>` as a button |
| **Keyboard nav** | full operability without mouse; visible focus ring; logical tab order |
| **Contrast** | text ≥ 4.5:1 (AA); large text ≥ 3:1; UI components ≥ 3:1 |
| **Alt text** | images convey meaning → `alt`; decorative → empty `alt=""` |
| **Forms** | every input has a `<label>`; errors linked via `aria-describedby` |
| **ARIA** | only when native semantics insufficient; no `role` misuse |
| **Motion** | respect `prefers-reduced-motion`; no autoplaying seizures risk |
| **Targets** | touch targets ≥ 24×24px; not overlapping |

Test: axe / Lighthouse CI (architecture Layer 3.6 security/quality tooling fits here).

## Internationalization (i18n) basics

- **No hardcoded user-facing strings.** All copy goes through an i18n framework:
  - JS/TS: `i18next` / `react-intl` / framework native (`next-intl`).
  - Python: `gettext` / `babel`.
  - Go: `golang.org/x/text/message`.
- Use **message keys + locale files** (`en.json`, `zh.json`), never inline text.
- Support **pluralization & interpolation** via the framework, not string concat.
- **Dates/numbers/currency**: format with `Intl` / locale APIs, not manual formatting.
- **RTL**: layout must not hardcode left/right assumptions if target locales include RTL.
- Extract new strings to locale files; missing translations fall back to default, logged.

```ts
// good
t('cart.items_count', { count });      // "1 item" / "3 items"
// bad
`<span>${n} item${n>1?'s':''}</span>`   // not translatable, wrong for many languages
```

## Checklist (UI task gate)

- [ ] Semantic HTML; no div-as-button without role + keyboard handler
- [ ] Full keyboard operability + visible focus
- [ ] Contrast ≥ AA; alt text present; labels on all inputs
- [ ] No `role`/ARIA misuse; respects reduced-motion
- [ ] axe/Lighthouse a11y check passes (CI)
- [ ] Zero hardcoded user-facing strings; all via i18n keys
- [ ] Pluralization/interpolation via framework; dates/numbers localized
- [ ] Missing-translation fallback handled
