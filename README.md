# Sim Companies Helper

A Chrome extension that adds practical, in-game tools for Sim Companies players.

## What It Adds

- Retail helper with profit-per-minute and retail vs market comparison.
- Production and contract profit calculators.
- Warehouse market price comparison tools.
- Market alerts for target prices.
- Executive helper for chief and apprentice pages.
- XP calculator widget with manual refresh (cache refreshes every 6 hours by default).
- Sales chat filter/search helper.
- Financials Helper dashboard with Current/Day/Week views, KPI strip, P&L, cash movement, ratios, drivers, transactions, sales mix, inventory/production, workforce cost, and alerts.

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

## Privacy & Permissions

- Data is processed locally in your browser for gameplay helpers.
- Uses extension storage for user preferences and saved helper settings.
- Manifest permissions are limited to extension storage plus required host access.
- Privacy policy: [`docs/privacy.html`](docs/privacy.html)

## License

MIT. See [`LICENSE`](LICENSE).

Not affiliated with Sim Companies. This is a fan-made project.
