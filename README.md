# Sim Companies Helper

A Chrome extension that adds practical, in-game tools for Sim Companies players.

## What It Adds

- Retail helper with profit-per-minute and retail vs market comparison.
- Production and contract profit calculators.
- Warehouse market price comparison tools and copyable sales chat messages.
- Market alerts for target prices.
- Recipe extractor that collects recipe-page data into copyable JSON.
- Executive helper for chief and apprentice pages, plus a daily organic-growth timer with eligible executive names.
- Upgrade helper with discount-aware, copyable buy messages for upgrade dialogs.
- XP calculator widget with manual refresh (cache refreshes every 6 hours by default).
- Global sales chat filter/search helper with joined-room selection, compact quality filters, and free-text room-aware alerts.
- What's New notifications with recent release highlights inside the game UI.
- Financials Helper dashboard with Current/Day/Week views, KPI strip, P&L, cash movement, ratios, drivers, transactions, sales mix, inventory/production, workforce cost, and alerts.
- Unified loading/error/success state styling across helper widgets, including spinner-based loading indicators and visible error feedback.

## Install (Local / Unpacked)

1. Clone this repository.
2. Install dependencies: `npm install`
3. Build extension files: `npm run build`
4. Open `chrome://extensions`, enable Developer mode, click `Load unpacked`, and select the `dist` folder.
5. Open `https://www.simcompanies.com/` and the helper panels will appear in the right sidebar.

## Development

```bash
npm install
npm run build
npm test
```

Useful commands:

- `npm run test:watch` to run tests continuously.
- `npm run lint` / `npm run lint:fix` for linting.
- `npm run format` / `npm run format:check` for formatting.
- `npm run docs:sync-instructions` to sync `.github/copilot-instructions.md` from `AGENTS.md`.
- `npm run docs:check-instructions` to verify instruction files are in sync.
- `npm run hooks:install` to enable a local pre-commit warning for instruction-sync drift.
- `npm run translate:sync` to auto-translate missing or English-fallback keys from `src/translations/en.js` into all locale files.

## Project Docs

- Contributing guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Privacy policy: [`docs/privacy.html`](docs/privacy.html)

## Privacy & Permissions

- Data is processed locally in your browser for gameplay helpers.
- Uses extension storage for user preferences and saved helper settings.
- Manifest permissions are limited to extension storage plus required host access.

## License

MIT. See [`LICENSE`](LICENSE).

Not affiliated with Sim Companies. This is a fan-made project.
