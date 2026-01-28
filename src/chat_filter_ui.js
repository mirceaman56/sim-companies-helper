// chat_filter_ui.js
// Tool to fetch and filter chat messages for buy/sell orders

import { STATE } from "./state.js";
import { registerSection, setSectionUpdateFn, getSectionContent } from "./sidebar.js";

const SECTION_ID = "chat-filter-section";
const CHATROOM_API = "https://www.simcompanies.com/api/v2/chatroom";

// Cache for recipes to map product IDs to names
let recipesCache = null;

/**
 * Load recipes from recipes.json
 */
async function loadRecipes() {
  if (recipesCache) return recipesCache;
  try {
    const response = await fetch(chrome.runtime.getURL("recipes.json"));
    recipesCache = await response.json();
    return recipesCache;
  } catch (error) {
    console.error("Failed to load recipes:", error);
    return [];
  }
}

/**
 * Get product name from recipe ID
 */
function getProductName(productId) {
  if (!recipesCache) return `Product #${productId}`;
  const recipe = recipesCache.find((r) => r.id === productId);
  return recipe ? recipe.name : `Product #${productId}`;
}

/**
 * Extract product IDs from chat message body (format: :re-<id>:)
 */
function extractProductIds(body) {
  const matches = body.match(/:re-(\d+):/g) || [];
  return matches.map((m) => parseInt(m.match(/\d+/)[0]));
}

/**
 * Classify message as BUY, SELL, or UNKNOWN
 */
function classifyMessage(body) {
  const lowerBody = body.toLowerCase();
  if (/\b(buy|buying|buys|buing|b\s+)\b/.test(lowerBody)) return "BUY";
  if (/\b(sell|selling|sells|selling|s\s+)\b/.test(lowerBody)) return "SELL";
  return null;
}

/**
 * Parse a single chat message
 */
function parseMessage(msg) {
  const type = classifyMessage(msg.body);
  if (!type) return null;

  const productIds = extractProductIds(msg.body);
  if (productIds.length === 0) return null;

  return {
    id: msg.id,
    type,
    company: msg.sender.company,
    companyId: msg.sender.id,
    realmId: msg.sender.realmId,
    datetime: msg.datetime,
    body: msg.body,
    productIds,
    productNames: productIds.map(getProductName),
    logo: msg.sender.logo || "",
  };
}

/**
 * Fetch chat messages from API with pagination
 */
async function fetchChatMessages(chatroom = "S", beforeId = null, limit = 10) {
  try {
    let url = `${CHATROOM_API}/${chatroom}/`;
    if (beforeId) {
      url += `?before_id=${beforeId}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      console.error("Failed to fetch chat messages:", response.status);
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching chat messages:", error);
    return [];
  }
}

/**
 * Fetch multiple pages of chat messages
 */
async function fetchMultiplePages(chatroom = "S", pageCount = 10) {
  let allMessages = [];
  let beforeId = null;
  const seenIds = new Set();

  for (let i = 0; i < pageCount; i++) {
    const messages = await fetchChatMessages(chatroom, beforeId);
    if (!messages || messages.length === 0) break;

    // Only add messages we haven't seen before (deduplication)
    for (const msg of messages) {
      if (!seenIds.has(msg.id)) {
        allMessages.push(msg);
        seenIds.add(msg.id);
      }
    }

    // Use the last ID from allMessages (the actual last unique message) for next pagination
    if (allMessages.length > 0) {
      beforeId = allMessages[allMessages.length - 1].id;
    }

    // Random delay between 20-100ms to avoid spamming the server
    const randomDelay = Math.random() * (100 - 20) + 20;
    await new Promise((r) => setTimeout(r, randomDelay));
  }

  return allMessages;
}

/**
 * Filter messages by type and product
 */
export const ChatFilterHelper = (() => {
  let cachedMessages = [];
  let filteredMessages = [];

  async function loadMessages(chatroom = "S", pageCount = 10) {
    const rawMessages = await fetchMultiplePages(chatroom, pageCount);
    cachedMessages = rawMessages
      .map(parseMessage)
      .filter((m) => m !== null);
    filteredMessages = cachedMessages;
    return cachedMessages;
  }

  function filterByType(type) {
    filteredMessages = type
      ? cachedMessages.filter((m) => m.type === type)
      : cachedMessages;
    return filteredMessages;
  }

  function filterByProduct(productId) {
    filteredMessages = productId
      ? cachedMessages.filter((m) =>
          m.productIds.includes(parseInt(productId))
        )
      : cachedMessages;
    return filteredMessages;
  }

  function filterByTypeAndProduct(type, productId) {
    let result = cachedMessages;
    if (type) {
      result = result.filter((m) => m.type === type);
    }
    if (productId) {
      result = result.filter((m) =>
        m.productIds.includes(parseInt(productId))
      );
    }
    filteredMessages = result;
    return filteredMessages;
  }

  function getFiltered() {
    return filteredMessages;
  }

  function getCached() {
    return cachedMessages;
  }

  return {
    loadMessages,
    filterByType,
    filterByProduct,
    filterByTypeAndProduct,
    getFiltered,
    getCached,
  };
})();

/**
 * Initialize chat filter section in the sidebar
 */
export function ensureSidebar() {
  if (!registerSection(SECTION_ID, "Chat Filter", "💬")) return;
  setSectionUpdateFn(SECTION_ID, updatePanel);
}

/**
 * Render the chat filter UI panel
 */
async function updatePanel() {
  const content = getSectionContent(SECTION_ID);
  if (!content) return;

  // Load recipes if not already loaded
  await loadRecipes();

  // Generate product options
  const productOptions = recipesCache
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((recipe) => `<option value="${recipe.id}">${recipe.name} (#${recipe.id})</option>`)
    .join("");

  // Create UI structure
  content.innerHTML = `
    <div style="padding: 12px; font-size: 13px; color: #333;">
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 5px; font-weight: bold; color: #1a1a1a;">
          Filter by Type:
        </label>
        <select id="scx-chat-type-filter" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #ccc; background: white; color: #333; font-size: 12px;">
          <option value="">All Types</option>
          <option value="BUY">Buy Orders</option>
          <option value="SELL">Sell Orders</option>
        </select>
      </div>

      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 5px; font-weight: bold; color: #1a1a1a;">
          Filter by Product:
        </label>
        <select 
          id="scx-chat-product-filter" 
          style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #ccc; background: white; color: #333; font-size: 12px;"
        >
          <option value="">All Products</option>
          ${productOptions}
        </select>
      </div>

      <button 
        id="scx-chat-load-btn" 
        style="width: 100%; padding: 8px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-bottom: 10px; font-size: 12px;"
      >
        Load Latest Messages (10 pages)
      </button>

      <div id="scx-chat-results" style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 8px; background: #f5f5f5;">
        <div style="text-align: center; color: #888;">Click "Load Latest Messages" to start</div>
      </div>
    </div>
  `;

  // Attach event listeners
  const loadBtn = content.querySelector("#scx-chat-load-btn");
  const typeFilter = content.querySelector("#scx-chat-type-filter");
  const productFilter = content.querySelector("#scx-chat-product-filter");
  const resultsDiv = content.querySelector("#scx-chat-results");

  loadBtn.addEventListener("click", async () => {
    loadBtn.disabled = true;
    loadBtn.textContent = "Loading...";
    resultsDiv.innerHTML = '<div style="color: #666;">Loading messages...</div>';

    try {
      await ChatFilterHelper.loadMessages("S", 10);
      applyFiltersAndRender(resultsDiv, typeFilter, productFilter);
    } catch (error) {
      console.error("Error loading messages:", error);
      resultsDiv.innerHTML = `<div style="color: red;">Error loading messages</div>`;
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = "Load Latest Messages (10 pages)";
    }
  });

  typeFilter.addEventListener("change", () => {
    applyFiltersAndRender(resultsDiv, typeFilter, productFilter);
  });

  productFilter.addEventListener("change", () => {
    applyFiltersAndRender(resultsDiv, typeFilter, productFilter);
  });

  productFilter.addEventListener("input", () => {
    applyFiltersAndRender(resultsDiv, typeFilter, productFilter);
  });
}

/**
 * Apply filters and render results
 */
function applyFiltersAndRender(resultsDiv, typeFilter, productFilter) {
  const type = typeFilter.value || null;
  const productId = productFilter.value ? parseInt(productFilter.value) : null;

  const filtered = type || productId
    ? ChatFilterHelper.filterByTypeAndProduct(type, productId)
    : ChatFilterHelper.getCached();

  if (filtered.length === 0) {
    resultsDiv.innerHTML =
      '<div style="text-align: center; color: #999; padding: 20px;">No messages found</div>';
    return;
  }

  const html = filtered
    .map(
      (msg) => {
        const isBuy = msg.type === "BUY";
        const borderColor = isBuy ? "#2563eb" : "#10b981";
        const bgColor = isBuy ? "#eff6ff" : "#f0fdf4";
        const textColor = isBuy ? "#1e40af" : "#065f46";
        
        // Create company profile URL with realm ID
        const companySlug = msg.company
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
        const companyUrl = `https://www.simcompanies.com/company/${msg.realmId}/${companySlug}/`;
        
        return `
    <div style="margin-bottom: 8px; padding: 8px; background: ${bgColor}; border-radius: 4px; border-left: 4px solid ${borderColor};">
      <div style="font-weight: bold; font-size: 12px; color: ${textColor};">
        ${isBuy ? "🛒 BUYING" : "📦 SELLING"}
      </div>
      <div style="font-size: 11px; color: #333; margin-top: 3px;">
        <a href="${companyUrl}" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: bold; cursor: pointer;">
          ${msg.company}
        </a>
      </div>
      <div style="font-size: 11px; color: #555; margin-top: 2px;">
        ${msg.productNames.join(", ")}
      </div>
      <div style="font-size: 10px; color: #888; margin-top: 3px;">
        ${new Date(msg.datetime).toLocaleTimeString()}
      </div>
      <div style="font-size: 10px; color: #666; margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(0,0,0,0.1);">
        <em>"${msg.body.substring(0, 80)}${msg.body.length > 80 ? "..." : ""}"</em>
      </div>
    </div>
  `;
      }
    )
    .join("");

  resultsDiv.innerHTML = html;
}
