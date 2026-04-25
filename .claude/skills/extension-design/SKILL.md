---
name: extension-design
description: is offers design guardrails helps with colors, typography alert styles, panels etc.
---

# Sim Companies Helper — Project Skill

You are working on **Sim Companies Helper**, a browser extension that adds quality-of-life features to [simcompanies.com](https://www.simcompanies.com/). Read this file before doing any work.

---

## Project structure

```
src/
  styles/
    foundations/tokens.css      ← design tokens (colors, spacing, type)
    components/primitives.css   ← buttons, chips, panels, alerts
    components/helpers.css      ← state banners, tone surfaces, badges, spinners
    components/utilities.css    ← layout & text utility classes (.scx-mono etc.)
    components/copy-button.css  ← .scx-copy-btn with tooltip
    components/toast.css        ← toast notification system
    layout/sidebar.css          ← fixed sidebar shell
    features/                   ← per-feature CSS (production, retail, etc.)
  page/                         ← page-specific JS adapters
  translations/                 ← i18n string files
  content.css                   ← root CSS import (imports all above)
  *.js                          ← feature UI modules
public/
  manifest.json
docs/
  index.html                    ← extension landing page
```

All CSS class names are prefixed with **`scx-`** to avoid collisions with the host page.

---

## Design system

### Typography
- **UI text:** `IBM Plex Sans` (400 / 500 / 600 / 700)
- **Numbers / prices / percentages:** `IBM Plex Mono` with `font-variant-numeric: tabular-nums`
- Use the utility class `.scx-mono` on any currency or numeric `<span>`
- Base size is **12px**; minimum is **10px** for readable text; 9px is acceptable only for dense metadata labels (column headers, skill sub-labels)
- Font size tokens: `--scx-font-size-xs` (10px) → `--scx-font-size-sm` (11px) → `--scx-font-size-base` (12px) → `--scx-font-size-md` (13px) → `--scx-font-size-lg` (14px) → `--scx-font-size-xl` (16px)

### Colors
- All tokens use **oklch** — do not introduce hex or hsl colors anywhere
- Brand green: `oklch(56% 0.17 145)` → `var(--scx-brand)`
- Success / error / warning / info all have `*-bg`, `*-text`, and border variants
- Dark mode is handled via `@media (prefers-color-scheme: dark)` overrides in `tokens.css` — never hardcode colors in feature CSS
- Sidebar section header is intentionally always dark (not theme-dependent); use `var(--scx-shell-section-header-bg)` and `var(--scx-shell-section-title)` for header elements

### Buttons
- Always use `.scx-btn` + a variant class
- Variants: `.scx-btn-primary` (brand green), `.scx-btn-success` (alias for primary), `.scx-btn-secondary` (muted), `.scx-btn-ghost` (outlined brand), `.scx-btn-error`, `.scx-btn-warning`, `.scx-btn-info`
- Sizes: `.scx-btn-sm` (11px / 4px 10px), `.scx-btn-lg` (13px / 10px 20px), `.scx-btn-full` (width 100%)
- Never style buttons inline

### Alerts
- Use `.scx-alert` + `.scx-alert-{success|error|warning|info}` for status messages
- Structure: `<div class="scx-alert scx-alert-warning"><span class="scx-alert-icon">…</span><div><div class="scx-alert-title">…</div><div class="scx-alert-desc">…</div></div></div>`

### Chips
- `.scx-chip` base class (pill shape, 11px, font-weight 900)
- Quality variants: `.scx-chip-excellent` (success tone), `.scx-chip-good` (info tone), `.scx-chip-meh` (warning tone), `.scx-chip-bad` (error tone), `.scx-chip-na` (muted/light)

### State banners (helpers.css)
- `.scx-state` + `.scx-state-{loading|error|success}` — inline status row with left accent border
- Pair with `.scx-loading-spinner` for in-progress states

### Tone surfaces (helpers.css)
- `.scx-tone-surface` base + `.scx-tone-{info|neutral|success|warning|error}` — applies `bg`, `fg`, and `border-color` from the tone token system
- Use these for any colored container that must adapt between light and dark mode

### Badges & status text (helpers.css)
- `.scx-badge` — small pill, neutral background
- `.scx-status` — muted italic status text (11px)
- `.scx-muted` — 72% opacity text at 12px

### Cards (utilities.css)
- `.scx-card` / `.scx-card-sm` — padded rounded containers (uses spacing/radius tokens)
- `.scx-card-value` (13px bold) / `.scx-card-value-lg` (16px bold) — metric display values

### Panels (primitives.css)
- `.scx-panel` — flex column with gap, rounded, `scx-bg-primary` background + light border
- `.scx-panel-head` — flex row with space-between for title + actions
- `.scx-panel-title` — 12px uppercase, font-weight 900, `scx-text-primary`

### Toast notifications (toast.css)
- `#scx-toast-container` — fixed top-center, z-index 100000
- `.scx-toast` → add `.scx-toast-visible` to show, `.scx-toast-exit` to dismiss
- Structure: `.scx-toast-icon` + `.scx-toast-body` (`.scx-toast-title` + `.scx-toast-message`) + `.scx-toast-close`

### Copy button (copy-button.css)
- `.scx-copy-btn` — 20×20 ghost icon button with CSS-only tooltip via `data-tooltip` attribute

### Sidebar / panels
- Sidebar sections use `.scx-section` > `.scx-section-header` > `.scx-section-content`
- Header background is always the dark shell color (`var(--scx-shell-section-header-bg)`) — never white, never a gradient
- Header title color uses `var(--scx-shell-section-title)` — always-light text for the always-dark header
- Content area uses `var(--scx-shell-section-content-bg)`

---

## Code conventions

- **CSS:** BEM-lite with `scx-` prefix. One file per feature in `src/styles/features/`. Never write styles inline in JS unless generating dynamic values.
- **JS:** Vanilla ES modules, no framework. DOM manipulation via `document.createElement` / `innerHTML`. Each feature has a `*_ui.js` (rendering) and optionally a `*_calc.js` (logic).
- **i18n:** All user-facing strings must go through `src/i18n.js`. Add new keys to all translation files in `src/translations/`.
- **No external dependencies** beyond what's already in the project.

---

## Naming conventions

| Thing | Pattern | Example |
|---|---|---|
| CSS class | `.scx-[component]-[modifier]` | `.scx-btn-primary` |
| JS function | camelCase | `renderProductionPanel()` |
| JS file | snake_case | `production_ui.js` |
| CSS file | kebab-case | `production.css` |
| Translation key | dot-path | `production.costPerUnit` |

---

## What to always do

- Check `src/styles/foundations/tokens.css` for existing tokens before inventing new values.
- When adding a new feature UI, create `src/styles/features/[feature].css` and add an `@import` to `src/content.css`.
- Wrap all monetary and percentage values in `<span class="scx-mono">`.
- Test dark mode: every new component must look correct under `@media (prefers-color-scheme: dark)`.
- Keep sidebar panels narrow (max `350px`) — they overlay the game UI.
- Use `var(--scx-border-light)` etc. as the **full border shorthand** (`border:` or `border-top:`) — never as a color inside another shorthand like `2px solid var(--scx-border-light)`.

## What to never do

- Do not add new colors outside the token system.
- Do not use `!important` except for `.scx-input-error` (existing exception) and `.scx-hidden`.
- Do not hardcode pixel sizes for spacing or radius — always use tokens.
- Do not hardcode oklch/hex/hsl color values in feature CSS — always reference a token.
- Do not introduce npm packages or build-step dependencies.
- Do not modify `public/manifest.json` permissions without flagging it explicitly.
- Do not add inline `style=""` attributes for anything the design system already covers.
- Do not use border tokens as a color value inside a custom shorthand; they already include `width style`.
