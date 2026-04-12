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
npm run build
npm test
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

- Run `npm test` before opening a PR.
- Run targeted tests for touched areas when the suite has focused coverage.
- If you touch the data platform, run `npm test -- tests/data_scope.test.js tests/data_storage.test.js`.
- If you touch agent instructions, run `npm run docs:sync-instructions` and `npm run docs:check-instructions`.
- If you change shipped UI or behavior, verify the built extension manually in Chrome.

## Repository Rules

- Follow the existing patterns used by nearby files before making structural or UI changes.
- Keep DOM detection in `src/page/*_page.js` adapters when possible.
- Keep styling in `src/styles/**`; do not add inline CSS in JavaScript.
- Reuse shared helpers from `src/utils.js` and the data platform in `src/data/` instead of reimplementing them.

## Pull Requests

1. Rebase or merge from `main` if needed and resolve conflicts locally.
2. Keep the PR description short and explicit about user-visible impact.
3. Reference issues with closing keywords such as `Fixes #123` when the PR should close them.
4. Include screenshots for UI changes.
5. Call out any manifest version bump, migration, or follow-up work in the PR body.