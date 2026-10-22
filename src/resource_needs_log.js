// why: the building-detail payload shape is unconfirmed, so every request, raw response and
// calculation step is traced to the console while the planner is tested against the live game.
// All tracing lives here so it can be removed in one place once the mapping is verified.
import { request } from "./data/apiClient.js";

const PREFIX = "[SimHelper][ResourceNeeds]";

/** @param {string} label @param {unknown} [data] */
export function logStep(label, data) {
  console.log(PREFIX, label, data ?? "");
}

/** @param {string} label @param {unknown} [data] */
export function logWarn(label, data) {
  console.warn(PREFIX, label, data ?? "");
}

/** @param {string} label */
export function logGroupStart(label) {
  console.groupCollapsed(`${PREFIX} ${label}`);
}

export function logGroupEnd() {
  console.groupEnd();
}

/**
 * @param {string} domain
 * @param {import("./data/apiClient.js").ApiRequestSpec} spec
 */
export async function loggedRequest(domain, spec) {
  const startedAt = performance.now();
  try {
    const data = await request(domain, spec);
    logStep(`GET ${spec.url} ok in ${Math.round(performance.now() - startedAt)}ms`, data);
    return data;
  } catch (error) {
    const err = /** @type {any} */ (error);
    logWarn(`GET ${spec.url} failed in ${Math.round(performance.now() - startedAt)}ms`, {
      code: err?.code,
      status: err?.status,
      message: err?.message,
    });
    throw error;
  }
}
