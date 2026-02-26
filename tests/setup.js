import { vi, beforeAll, afterAll } from "vitest";

let originalFetch;

beforeAll(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(() => {
    throw new Error(
      "Real fetch called in test! Mock `global.fetch` or the module that calls it.",
    );
  });
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});
