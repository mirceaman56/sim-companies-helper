---
name: changelog
description: How the generated changelog / "What's New" pipeline works (build-changelog script, PR labels, credits, seeding, client rendering). Use when touching release notes, changelog.json, or the What's New panel.
---

## Changelog / "What's New"

Release notes are generated, never hand-written.

- `scripts/build-changelog.mjs` writes `src/resources/changelog.json` from merged PRs: the title becomes the entry text and PR **labels** pick the category (`feature` / `fix` / `other`, mirroring `.github/release.yml`).
- Changelog entries are **English only** on purpose — do not add translation to this pipeline. The panel's chrome (section title, category headings, credit labels) is localized through `t()` like any other UI string.
- Credits are collected automatically: PR authors are `contributor`, authors of the issues a PR closes are `reporter`. The repo owner and bots are excluded unless `--credit-owner` is passed.
- `--seed` backfills history from already-published GitHub release bodies; the default mode builds one version and is what CI runs.
- Pure helpers live in `scripts/lib/changelog-format.mjs` and are covered by `tests/changelog_build.test.js`.
- The client never fetches GitHub. `src/whats_new.js` reads the bundled JSON; `src/whats_new_ui.js` renders the summary toast plus the always-available `whats-new-section` sidebar panel.
- The changelog steps are `continue-on-error`: a GitHub API hiccup leaves the previous changelog bundled and must never block a release. Backfill afterwards with `npm run changelog:build -- --seed`.
