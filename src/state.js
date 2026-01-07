// state.js
export const SIDEBAR_ID = "scx-sidebar";

export const STATE = {
  rafPending: false,

  // selection
  selectedRow: null,
  selectedRowObserver: null,
  selectedInputs: null,

  // auth
  auth: {
    companyId: null,
    realmId: null,
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

  // cashflow
  cashflow: {
    loaded: false,
    loading: false,
    error: null,
    items: [],        // all "today" entries (raw)
    lastRefreshAt: 0, // ms epoch
    summary: {
        salesCount: 0,
        salesMoney: 0,  // sum of money for category "s"
    },
  },

  // market
  marketCache: new Map(), // `${realmId}:${productId}` -> { ts, data }
  marketState: { status: "idle", productId: null, realmId: null, data: null, error: null },
};
