// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  detectChatPage,
  findChatContainer,
  findChatMessageRowFromTarget,
  findChatMessageRows,
  findFirstChatMessageRow,
  readChatMessageRow,
} from "../src/page/chat_page.js";

function loadFixture(name) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "chat", name), "utf8");
}

describe("chat_page adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("detects a representative chat page layout", () => {
    document.body.innerHTML = loadFixture("chat-page.html");

    expect(detectChatPage(document)).toBe(true);
    expect(findChatContainer(document)).not.toBeNull();
    expect(findChatMessageRows(document)).toHaveLength(2);
  });

  it("finds a chat row from a nested target", () => {
    document.body.innerHTML = loadFixture("chat-page.html");

    const nestedTarget = document.querySelector('[data-role="chat-company"] span');
    const row = findChatMessageRowFromTarget(nestedTarget);

    expect(row?.getAttribute("data-message-id")).toBe("501");
  });

  it("reads company, datetime, and body from a chat row", () => {
    document.body.innerHTML = loadFixture("chat-page.html");

    const row = findFirstChatMessageRow(document);
    const message = readChatMessageRow(row);

    expect(message).toMatchObject({
      id: 501,
      companyName: "Acme Inc",
      companyHref: "/company/1/acme-inc/",
      datetime: "2026-04-12T10:15:00Z",
      body: "Buying :re-7: Q1",
    });
  });

  it("supports a fallback chat layout without data-role attributes", () => {
    document.body.innerHTML = loadFixture("fallback-chat-page.html");

    const row = findFirstChatMessageRow(document);
    const message = readChatMessageRow(row);

    expect(detectChatPage(document)).toBe(true);
    expect(message).toMatchObject({
      id: 301,
      companyName: "Fallback Traders",
      companyHref: "/company/1/fallback-traders/",
      datetime: "2026-04-12T11:30:00Z",
      body: "Selling :re-9: Q3",
    });
  });

  it("handles partial message rows without throwing", () => {
    const row = document.createElement("div");
    row.setAttribute("data-role", "chat-message");

    const message = readChatMessageRow(row);

    expect(message?.id).toBeNull();
    expect(message?.companyName).toBe("");
    expect(message?.datetime).toBeNull();
    expect(message?.body).toBe("");
  });
});