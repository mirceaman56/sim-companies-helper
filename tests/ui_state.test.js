// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { renderStateBlock } from "../src/ui_state.js";

describe("renderStateBlock", () => {
  it("renders loading state with spinner", () => {
    const html = renderStateBlock({
      type: "loading",
      message: "Loading",
      showSpinner: true,
    });

    expect(html).toContain("scx-state-loading");
    expect(html).toContain("scx-loading-spinner");
    expect(html).toContain("Loading");
  });

  it("escapes message content", () => {
    const html = renderStateBlock({
      type: "error",
      message: `<script>alert("x")</script>`,
    });

    expect(html).toContain("scx-state-error");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });
});
