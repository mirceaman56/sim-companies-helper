# Contributing

Thanks for contributing.

## Branching

1. Fork the repository or create a branch from `main`.
2. Use a focused branch name:
   - `fix/...` for bug fixes
   - `enhancement/...` for features or refactors
   - `docs/...` for documentation-only work
   - `chore/...` for maintenance work
3. Keep each branch scoped to one issue or one closely related set of changes.

## Local Setup

```bash
npm install
npm run verify
```

## Development Workflow

1. Build the extension with `npm run build`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Load the `dist` folder as an unpacked extension.
5. Open `https://www.simcompanies.com/` and verify the touched UI in-game.

## Debugging And HMR

- Use Chrome DevTools on the Sim Companies page to inspect content-script UI.
- Use the Extensions page service worker inspector to debug `background.js`.
- Vite is the bundler, but this repo does not currently support true in-browser HMR for the extension runtime.
- Treat `npm run build` plus Chrome extension reload as the hot loop while developing.

## Testing Expectations

- `npm run verify` must pass before opening a PR (lint, format, repo checks, tests, build). CI runs the same command.
- Repo checks (`npm run check`) enforce the rules in `AGENTS.md`: module layering, manifest permissions, i18n, styles, markup, instruction-file sync. Their messages say how to fix each problem.
- If you touch agent instructions or skills, run `npm run docs:sync-instructions`.
- If you change shipped UI or behavior, verify the built extension manually in Chrome.

## Repository Rules

See `AGENTS.md`: every rule there lists the check that enforces it.

## Pull Requests

1. Rebase or merge from `main` if needed and resolve conflicts locally.
2. Keep the PR description short and explicit about user-visible impact.
3. Reference issues with closing keywords such as `Fixes #123` when the PR should close them.
4. Include screenshots for UI changes.
5. Call out any manifest version bump, migration, or follow-up work in the PR body.