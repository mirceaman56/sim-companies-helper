import { STATE } from "./state.js";

export function formatMoney(x) {
  if (!isFinite(x)) return "—";
  const sign = x < 0 ? "-" : "";
  return `${sign}$${Math.abs(x).toFixed(2)}`;
}

export function scheduleUpdate(callback) {
  if (STATE.rafPending) return;
  STATE.rafPending = true;
  requestAnimationFrame(() => {
    STATE.rafPending = false;
    if (callback) callback();
  });
}



