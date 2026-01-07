import { STATE } from "./state.js";

/**
 * Loads inventory data once per session
 */

export async function loadInventoryOnce() {
  if (!STATE.inventory) return; // safety
  if (STATE.inventory.loaded || STATE.inventory.loading) return;

  const companyId = STATE.auth?.companyId;
  if (!companyId) return;

  STATE.inventory.loading = true;
  STATE.inventory.status = "loading";
  STATE.inventory.error = null;

  try {
    const url = `https://www.simcompanies.com/api/v3/resources/${companyId}/`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const items = await res.json();
    STATE.inventory.items = Array.isArray(items) ? items : [];
    rebuildInventoryIndex(STATE.inventory.items);

    STATE.inventory.loaded = true;
    STATE.inventory.status = "ok";
  } catch (e) {
    STATE.inventory.status = "error";
    STATE.inventory.error = String(e?.message || e);
  } finally {
    STATE.inventory.loading = false;
  }
}

export function rebuildInventoryIndex(items) {
  const byKind = new Map();

  for (const it of items || []) {
    const kind = it?.kind;
    if (!Number.isFinite(kind)) continue;

    const amount = Number(it.amount || 0);
    const totalCost = (Number.isFinite(sumCost(it.cost)) ? sumCost(it.cost) : 0);

    const existing =
      byKind.get(kind) || {
        kind,
        amount: 0,
        totalCost: 0,
        marketCost: 0,
        workers: 0,
        admin: 0,
        materials: 0,
      };

    existing.amount += amount;
    existing.totalCost += totalCost;

    const c = it.cost || {};
    existing.marketCost += c.market || 0;
    existing.workers += c.workers || 0;
    existing.admin += c.admin || 0;
    existing.materials +=
      (c.material1 || 0) +
      (c.material2 || 0) +
      (c.material3 || 0) +
      (c.material4 || 0) +
      (c.material5 || 0);

    byKind.set(kind, existing);
  }

  STATE.inventory.byKind = byKind;
}

export function sumCost(cost) {
  if (!cost) return 0;
  return (
    (cost.workers || 0) +
    (cost.admin || 0) +
    (cost.material1 || 0) +
    (cost.material2 || 0) +
    (cost.material3 || 0) +
    (cost.material4 || 0) +
    (cost.material5 || 0) +
    (cost.market || 0)
  );
}