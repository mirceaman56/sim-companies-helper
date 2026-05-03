import { describe, expect, it } from "vitest";
import { CHAT_ROOMS_REFRESH_INTERVAL_MS } from "../src/constants.js";

import {
  DEFAULT_CHAT_ROOM_DB_LETTER,
  buildChatRoomMessagesUrl,
  buildChatApiBaseUrl,
  normalizeSalesChatRooms,
  resolveChatRoomSelection,
  shouldForceAnyFilterForRoom,
} from "../src/chat_rooms.js";

describe("chat_rooms", () => {
  it("refreshes joined room list every 5 minutes", () => {
    expect(CHAT_ROOMS_REFRESH_INTERVAL_MS).toBe(300_000);
  });

  it("builds chat API base URL from room id", () => {
    expect(buildChatApiBaseUrl()).toBe("https://www.simcompanies.com/api/v2/chatroom/S/");
    expect(buildChatApiBaseUrl("DE")).toBe("https://www.simcompanies.com/api/v2/chatroom/DE/");
    expect(buildChatRoomMessagesUrl({ name: "Sales" })).toBe(
      "https://www.simcompanies.com/messages/chatroom_Sales",
    );
  });

  it("keeps only sales rooms and preserves default sales room", () => {
    const rooms = normalizeSalesChatRooms({
      chatrooms: [
        { db_letter: "H", name: "Help", category: "help", language: "en" },
        { db_letter: "DE", name: "German Trade", category: "sales", language: "de" },
        { db_letter: "S", name: "Sales", category: "sales", language: "en" },
      ],
    });

    expect(rooms).toEqual([
      { dbLetter: "S", name: "Sales", language: "en", category: "sales" },
      { dbLetter: "DE", name: "German Trade", language: "de", category: "sales" },
    ]);
  });

  it("falls back to default room when saved selection is missing", () => {
    const rooms = normalizeSalesChatRooms(null);

    expect(resolveChatRoomSelection("DE", rooms)).toBe(DEFAULT_CHAT_ROOM_DB_LETTER);
    expect(shouldForceAnyFilterForRoom("DE")).toBe(true);
    expect(shouldForceAnyFilterForRoom("S")).toBe(false);
  });
});
