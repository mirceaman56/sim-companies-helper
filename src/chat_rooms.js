export const CHAT_ROOMS_ENDPOINT = "https://www.simcompanies.com/api/v2/contacts/";
export const DEFAULT_CHAT_ROOM_DB_LETTER = "S";
export const DEFAULT_CHAT_ROOM_NAME = "Sales";

export function buildChatApiBaseUrl(dbLetter = DEFAULT_CHAT_ROOM_DB_LETTER) {
  const normalized = String(dbLetter || DEFAULT_CHAT_ROOM_DB_LETTER).trim() || DEFAULT_CHAT_ROOM_DB_LETTER;
  return `https://www.simcompanies.com/api/v2/chatroom/${encodeURIComponent(normalized)}/`;
}

export function buildChatRoomMessagesUrl(room = createDefaultChatRoom()) {
  const roomName = String(room?.name || DEFAULT_CHAT_ROOM_NAME).trim() || DEFAULT_CHAT_ROOM_NAME;
  return `https://www.simcompanies.com/messages/chatroom_${encodeURIComponent(roomName)}`;
}

export function createDefaultChatRoom(name = DEFAULT_CHAT_ROOM_NAME) {
  return {
    dbLetter: DEFAULT_CHAT_ROOM_DB_LETTER,
    name: String(name || DEFAULT_CHAT_ROOM_NAME),
    language: "en",
    category: "sales",
  };
}

export function normalizeSalesChatRooms(payload, { defaultRoomName = DEFAULT_CHAT_ROOM_NAME } = {}) {
  const seen = new Set();
  const rooms = [];

  const appendRoom = (room) => {
    const dbLetter = String(room?.dbLetter || room?.db_letter || "").trim();
    const name = String(room?.name || "").trim();
    if (!dbLetter || !name || seen.has(dbLetter)) return;

    seen.add(dbLetter);
    rooms.push({
      dbLetter,
      name,
      language: String(room?.language || "").trim(),
      category: String(room?.category || "").trim(),
    });
  };

  appendRoom(createDefaultChatRoom(defaultRoomName));

  for (const room of Array.isArray(payload?.chatrooms) ? payload.chatrooms : []) {
    if (
      String(room?.category || "")
        .trim()
        .toLowerCase() !== "sales"
    )
      continue;
    appendRoom(room);
  }

  return rooms.sort((a, b) => {
    if (a.dbLetter === DEFAULT_CHAT_ROOM_DB_LETTER) return -1;
    if (b.dbLetter === DEFAULT_CHAT_ROOM_DB_LETTER) return 1;

    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.language.localeCompare(b.language);
  });
}

export function resolveChatRoomSelection(selectedDbLetter, rooms) {
  const normalized = String(selectedDbLetter || "").trim();
  if (!normalized) return DEFAULT_CHAT_ROOM_DB_LETTER;

  return Array.isArray(rooms) && rooms.some((room) => room?.dbLetter === normalized)
    ? normalized
    : DEFAULT_CHAT_ROOM_DB_LETTER;
}

export function shouldForceAnyFilterForRoom(dbLetter) {
  return String(dbLetter || "").trim() !== DEFAULT_CHAT_ROOM_DB_LETTER;
}
