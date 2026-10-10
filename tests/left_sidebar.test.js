// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { LEFT_SIDEBAR_ID, mountLeftSidebarPanel, removeLeftSidebarPanel } from "../src/left_sidebar.js";

const panel = (id) => Object.assign(document.createElement("section"), { id });

describe("left sidebar", () => {
  beforeEach(() => document.getElementById(LEFT_SIDEBAR_ID)?.remove());

  it("is created with its first panel and removed with its last", () => {
    mountLeftSidebarPanel(panel("a"));
    mountLeftSidebarPanel(panel("b"));
    const sidebar = document.getElementById(LEFT_SIDEBAR_ID);
    expect([...sidebar.children].map((el) => el.id)).toEqual(["a", "b"]);

    removeLeftSidebarPanel("a");
    expect(document.getElementById(LEFT_SIDEBAR_ID)).not.toBeNull();
    removeLeftSidebarPanel("b");
    expect(document.getElementById(LEFT_SIDEBAR_ID)).toBeNull();
  });

  it("mounting the same panel twice keeps one copy", () => {
    const p = panel("a");
    mountLeftSidebarPanel(p);
    mountLeftSidebarPanel(p);
    expect(document.getElementById(LEFT_SIDEBAR_ID).children).toHaveLength(1);
  });

  it("removing a missing panel is harmless", () => {
    expect(() => removeLeftSidebarPanel("nope")).not.toThrow();
  });
});
