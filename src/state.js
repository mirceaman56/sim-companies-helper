export const SIDEBAR_ID = "scx-sidebar";

export const STATE = {
  // selection
  selectedRow: null,
  selectedRowObserver: null,
  selectedInputs: null,

  auth: {
    companyId: null,
    realmId: null,
    productionModifier: null,
    salesModifier: null,
    loaded: false,
    loading: false,
    error: null,
  },

  // inventory (still used by Retail Helper)
  inventory: {
    loaded: false,
    loading: false,
    status: "idle", // idle | loading | ok | error
    error: null,
    items: [],
    byKind: new Map(),
  },

  cashflow: {
    loaded: false,
    loading: false,
    error: null,

    lastRefreshAt: 0, // ms epoch

    // Finance dashboard v2
    finance: {
      selectedPeriod: "current", // current | day | week
      uiMode: "compact", // compact | expanded

      coverage: {
        startMs: 0,
        endMs: 0,
        partial: false,
      },

      datasets: {
        transactions: [],
        pastFinances: [],
        outgoingContracts: [],
      },

      derived: {
        period: null,
        previousPeriod: null,
        kpis: null,
        pnl: null,
        cashMovement: null,
        balanceSheet: null,
        ratios: [],
        drivers: null,
        salesMix: [],
        inventoryProduction: null,
        workforce: null,
        alerts: [],
        recentTransactions: [],
      },

      meta: {
        loading: false,
        error: null,
        lastRefreshAt: 0,
        rateLimitedUntil: 0,
        partialReason: "",
        cashBalance: null,
      },

      cache: {
        oldestPulled: false,
        pagesLoaded: 0,
        transactionsFetchedUntilMs: 0,
        // Verified gap-free history range. Not the oldest stored transaction: older disjoint
        // data (from before a session gap) only counts once pagination reconnects it.
        coverageFloorMs: 0,
        coverageFloorId: null,
        coverageTopMs: 0,
        lastTxFetchAt: 0,
        lastPastFinancesAt: 0,
        lastOutgoingContractsAt: 0,
      },
    },
  },

  // executives (shared across executive widget and retail helper)
  executives: {
    loaded: false,
    loading: false,
    error: null,
    errorAt: 0,
    items: [],
    lastRefreshAt: 0,
    details: {}, // { [executiveId]: { loaded, loading, error, data, lastRefreshAt } }
  },

  // buildings (XP calculator)
  buildings: {
    loaded: false,
    loading: false,
    error: null,
    items: [],
    lastRefreshAt: 0, // ms epoch
  },

  // bonds (accounting widget, loaded once per page load)
  bonds: {
    loaded: false,
    loading: false,
    error: null,
    owned: [],
    sold: [],
  },

  levelInfo: {
    level: null,
    experience: null,
    experienceToNextLevel: null,
  },

  marketCache: new Map(), // `${realmId}:${productId}` -> { ts, data }
  marketDeltaCache: new Map(), // `${realmId}:${productId}` -> { ts, delta } for warehouse UI
  marketState: { status: "idle", productId: null, realmId: null, data: null, error: null },
};
