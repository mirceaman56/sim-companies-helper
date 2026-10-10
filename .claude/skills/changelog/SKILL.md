---
name: changelog
description: Write player-facing "What's New" entries in src/resources/changelog.json, for the current manifest version or retrospectively from git history. Use after any user-visible change (ask the user first), when the user asks to update/backfill the changelog, or when touching the What's New panel.
---

## Changelog / "What's New"

`src/resources/changelog.json` is written by agents, committed with the change, and bundled into the extension. CI does not generate it. Players see it as a toast after an update and in the `whats-new-section` sidebar panel.

### When to run

- After a user-visible change (new feature, visible fix, changed behavior): **ask the user** "Add this to the changelog?" with your proposed entry text. Write only on yes.
- Skip asking for invisible work: refactors, tests, CI, docs, lint, dependency bumps, instruction files.
- When the user asks to update or backfill the changelog: run **Retrospective mode** below.

### Version

- Always use `version` from `public/manifest.json`. Never invent or bump a version here; bumping is the `version-update` skill.
- If an entry for that version exists, append to its `entries`. Otherwise add a new version object at the **top** (newest first).
- If that version is already released (`git tag --list v<version>` prints it), stop and tell the user to bump the version first. A released version's changes never reach players.

### Shape

```json
{
  "version": "1.0.1",
  "date": "2026-10-10",
  "entries": [{ "cat": "feature", "text": "See your accounting overhead at a glance" }],
  "credits": [{ "handle": "someone", "role": "reporter", "url": "https://github.com/someone" }]
}
```

- `date`: today, `YYYY-MM-DD`. Update it when you append to an unreleased version.
- `cat`: `feature` (new thing a player can use), `fix` (something broken now works), `other` (visible tweak that is neither).
- `pr` (number) is optional; leave it out when unknown.
- `credits`: optional. Credit people outside the repo owner who reported an issue the change closes (`reporter`) or authored the PR (`contributor`). Find reporters from `Fixes #N` in commit messages: `curl -s https://api.github.com/repos/mirceaman56/sim-companies-helper/issues/N` → `user.login`. Skip the owner `mirceaman56` and bots.
- Bump `generatedAt` at the top to the current ISO time.

### Writing for players

Readers are players, not developers. Entries are **English only** on purpose; panel labels go through `t()`.

- One short sentence per change, ≤ 100 characters, plain words. Say what the player gets or what now works, not how.
- Name the game screen or widget the player knows (Contracts, Production, Market alerts, Financials).
- One entry per player-visible change. Merge related small fixes into one entry. 1–5 entries per version is typical.
- No PR titles, branch names, issue numbers, file names, code, version numbers, or words like refactor, chore, API, cache, race condition, lint, CI.
- Fix entries describe the fixed behavior: "Market alerts now work when you switch realms", not "Fixed bug in alert scope key".

| Bad                                         | Good                                                   |
| ------------------------------------------- | ------------------------------------------------------ |
| `feature/cleanup for v1.0.0`                | Faster sidebar that loads each section as data arrives |
| Fix tab freeze when API is rate limited     | Game tab no longer freezes after switching realms      |
| Small performance optimisation and race fix | Sidebar loads faster and more reliably                 |

### Retrospective mode

Backfill entries for changes already merged.

1. Find the range. Default: last released tag to `HEAD`: `git describe --tags --abbrev=0` then `git log --oneline <tag>..HEAD`. If the user names versions, use `v<from>..v<to>` tags.
2. For each commit, read the subject and, when unclear, `git show --stat <sha>` (and the diff of `src/` files) to learn what the player actually sees. Ignore commits that only touch tests, scripts, `.github/`, docs, dev tooling, or instruction files.
3. Group by released version: commits between `v<a>` and `v<b>` belong to version `b`. Commits after the last tag belong to the current manifest version (see Version rules).
4. Draft entries with the writing rules, show them to the user as a short list per version, and write only after the user agrees.
5. Existing entries for a version are rewritten only if the user asks.

### Guardrail

`npm run check:changelog` (part of `check` / `verify`) validates the shape, version order, that no entry is newer than the manifest, the 100-character limit, and banned developer wording. Fix the entry; do not loosen the check.

### Client

The client never fetches GitHub. `src/whats_new.js` reads the bundled JSON; `src/whats_new_ui.js` renders the toast for versions between the previous and current install, plus the sidebar panel.
