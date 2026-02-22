
import { getSectionContent } from "./sidebar.js";
import { STATE } from "./state.js";
import { escapeHtml } from "./utils.js";
import recipes from "./recipes.json";
import { t } from "./i18n.js";

const SECTION_ID = "chat-section";

// State
let isSearching = false;
let searchController = null; // AbortController
let foundCount = 0;
let lastSmallestId = null;

/**
 * Initializes the chat filter sidebar content
 */
export function initChatFilter() {
  const content = getSectionContent(SECTION_ID);
  
  if (content && !content.querySelector(".scx-chat-filter")) {
    content.appendChild(createFilterContent());
  }
}

function createFilterContent() {
  const container = document.createElement("div");
  container.className = "scx-chat-filter";
  container.innerHTML = `
    <style>
      .scx-chat-filter {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .scx-chat-controls {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .scx-chat-row {
        display: flex;
        gap: 8px;
      }
      .scx-chat-select {
        flex: 1;
        padding: 4px;
        border: 1px solid #ddd;
        border-radius: 4px;
      }
      .scx-quality-container {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 4px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: white;
      }
      .scx-quality-label {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        user-select: none;
      }
      .scx-quality-label input {
        cursor: pointer;
      }
      .scx-chat-btn {
        padding: 6px 12px;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
      }
      .scx-chat-btn:disabled {
        background: #ccc;
        cursor: not-allowed;
      }
      .scx-chat-btn.stop {
        background: #f44336;
      }
      .scx-chat-results {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 400px;
        overflow-y: auto;
        border-top: 1px solid #eee;
        padding-top: 8px;
      }
      .scx-chat-message {
        padding: 8px;
        border: 1px solid #eee;
        border-radius: 4px;
        font-size: 11px;
        background: #f9f9f9;
      }
      .scx-chat-message-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 4px;
        color: #333;
      }
      .scx-chat-message-company {
        font-weight: bold;
        color: #155724;
        text-decoration: none;
      }
      .scx-chat-message-company:hover {
        text-decoration: underline;
        color: #1976d2;
      }
      .scx-chat-message-body {
        white-space: pre-wrap;
        color: #1565c0;
      }
      .scx-status {
        font-size: 11px;
        color: #333;
        font-style: italic;
      }
    </style>
    
    <div class="scx-chat-controls">
      <div class="scx-chat-row">
        <select id="scx-filter-type" class="scx-chat-select">
          <option value="buy">${t("buying")}</option>
          <option value="sell">${t("selling")}</option>
        </select>
      </div>
      <div class="scx-chat-row">
        <select id="scx-filter-product" class="scx-chat-select">
          <!-- Populated by JS -->
        </select>
      </div>
      <div class="scx-chat-row">
        <label style="font-size: 12px; font-weight: bold;">Quality (Optional):</label>
      </div>
      <div class="scx-quality-container" id="scx-filter-quality">
        <!-- Populated by JS -->
      </div>
      <button id="scx-filter-action" class="scx-chat-btn">${t("startSearch")}</button>
    </div>
    <div id="scx-filter-status" class="scx-status"></div>
    <div id="scx-filter-results" class="scx-chat-results"></div>
  `;

  // Populate products
  const productSelect = container.querySelector("#scx-filter-product");
  
  // Sort recipes by name
  const sortedRecipes = [...recipes].sort((a, b) => a.name.localeCompare(b.name));
  
  sortedRecipes.forEach(recipe => {
    const option = document.createElement("option");
    option.value = recipe.id;
    option.textContent = recipe.name;
    productSelect.appendChild(option);
  });

  // Populate quality checkboxes
  const qualityContainer = container.querySelector("#scx-filter-quality");
  for (let q = 1; q <= 10; q++) {
    const label = document.createElement("label");
    label.className = "scx-quality-label";
    label.innerHTML = `<input type="checkbox" value="Q${q}" id="scx-quality-${q}"> Q${q}`;
    qualityContainer.appendChild(label);
  }

  // Event Listeners
  const actionBtn = container.querySelector("#scx-filter-action");
  actionBtn.addEventListener("click", () => {
    if (isSearching) {
      stopSearch();
    } else {
      startSearch(container);
    }
  });

  return container;
}

function updateStatus(container, text) {
  const el = container.querySelector("#scx-filter-status");
  if (el) el.textContent = text;
}

function addResult(container, msg) {
  const list = container.querySelector("#scx-filter-results");
  const div = document.createElement("div");
  div.className = "scx-chat-message";
  
  // Parse date
  const date = new Date(msg.datetime);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  // Create link
  const companyName = msg.sender.company;
  const slug = encodeURIComponent(companyName.toLowerCase().replace(/\s+/g, '-'));
  // Use current user's realmId from state, defaulting to 0 if not set
  const realmId = STATE.auth.realmId || 0;
  const linkUrl = `https://www.simcompanies.com/company/${realmId}/${slug}/`;

  div.innerHTML = `
    <div class="scx-chat-message-header">
      <a href="${linkUrl}" class="scx-chat-message-company" target="_blank">${escapeHtml(companyName)}</a>
      <span>${timeStr}</span>
    </div>
    <div class="scx-chat-message-body">${formatMessageBody(msg.body)}</div>
  `;
  
  list.appendChild(div);
}

function formatMessageBody(body) {
  // Simple formatting, maybe replace :re-ID: with names?
  // For now just escape
  let text = escapeHtml(body);
  
  // Replace resource tags with icons or names if possible
  // Pattern: :re-ID: or :pr-ID:
  text = text.replace(/:(re|pr)-(\d+):/g, (match, type, id) => {
    const r = recipes.find(x => x.id === parseInt(id));
    return r ? `[${r.name}]` : match;
  });
  
  return text;
}

async function startSearch(container) {
  const typeSelect = container.querySelector("#scx-filter-type");
  const productSelect = container.querySelector("#scx-filter-product");
  const actionBtn = container.querySelector("#scx-filter-action");
  const resultsDiv = container.querySelector("#scx-filter-results");
  
  const filterType = typeSelect.value;
  const productId = parseInt(productSelect.value);
  const productName = productSelect.options[productSelect.selectedIndex].text;
  
  // Get selected quality values
  const selectedQualities = [];
  for (let q = 1; q <= 10; q++) {
    const checkbox = container.querySelector(`#scx-quality-${q}`);
    if (checkbox && checkbox.checked) {
      selectedQualities.push(`Q${q}`);
    }
  }
  
  if (!productId) return;

  isSearching = true;
  searchController = new AbortController();
  foundCount = 0;
  lastSmallestId = null;
  resultsDiv.innerHTML = "";
  
  actionBtn.textContent = t("stop");
  actionBtn.classList.add("stop");
  updateStatus(container, `${t("searchingFor")} ${filterType} ${productName}...`);

  try {
    await fetchMessages(container, filterType, productId, selectedQualities, searchController.signal);
  } catch (err) {
    if (err.name === 'AbortError') {
      updateStatus(container, t("searchStopped"));
    } else {
      console.error(err);
      updateStatus(container, "Error: " + err.message);
    }
  } finally {
    isSearching = false;
    actionBtn.textContent = t("startSearch");
    actionBtn.classList.remove("stop");
    searchController = null;
  }
}

function stopSearch() {
  if (searchController) {
    searchController.abort();
  }
}

async function fetchMessages(container, filterType, productId, selectedQualities, signal) {
  const baseUrl = "https://www.simcompanies.com/api/v2/chatroom/S/";
  let currentUrl = baseUrl;
  let pageCount = 0;
  const maxPages = 50; // Safety limit
  const targetCount = 500; // As requested

  // Regex compilation
  // Buy: buy, buying, bought? usually people say "buying" or "buy"
  const buyRegex = /\b(buy|buying)\b/i;
  const sellRegex = /\b(sell|selling)\b/i;
  
  const productTagRegex = new RegExp(`:(re)-${productId}:`, "i");

  // Build quality regex pattern if qualities are selected
  let qualityRegex = null;
  if (selectedQualities.length > 0) {
    // Create pattern like: Q0|Q1|Q2|Q3 (case-insensitive)
    const qualityPattern = selectedQualities.join("|");
    qualityRegex = new RegExp(`\\b(${qualityPattern})\\b`, "i");
  }

  // Calculate cutoff time (8 hours ago)
  const cutoffTime = Date.now() - (8 * 60 * 60 * 1000);

  while (foundCount < targetCount && pageCount < maxPages) {
    if (signal.aborted) return;

    updateStatus(container, `Scanning page ${pageCount + 1}... Found: ${foundCount}`);

    const response = await fetch(currentUrl, { signal });
    if (!response.ok) throw new Error("API call failed");
    
    const messages = await response.json();
    if (!messages || messages.length === 0) break;

    // Filter messages
    for (const msg of messages) {
      if (foundCount >= targetCount) break;

      // Check message age
      const msgTime = new Date(msg.datetime).getTime();
      if (msgTime < cutoffTime) {
         updateStatus(container, `Done. Reached limit of 8 hours history. Found ${foundCount} messages.`);
         return;
      }
      
      const body = msg.body || "";
      const matchesType = filterType === "buy" ? buyRegex.test(body) : sellRegex.test(body);
      const matchesProduct = productTagRegex.test(body);
      
      // Check quality match: if qualities are selected, message must match one of them
      // If no qualities are selected, this check passes (no filtering)
      const matchesQuality = qualityRegex === null || qualityRegex.test(body);

      if (matchesType && matchesProduct && matchesQuality) {
        addResult(container, msg);
        foundCount++;
      }

      // Update smallest ID for pagination
      if (lastSmallestId === null || msg.id < lastSmallestId) {
        lastSmallestId = msg.id;
      }
    }

    // Prepare next URL
    if (lastSmallestId) {
      currentUrl = `${baseUrl}from-id/${lastSmallestId}/`;
    } else {
      break; 
    }
    
    pageCount++;
    
    // Small delay to be nice to the API
    await new Promise(r => setTimeout(r, 500));
  }

  updateStatus(container, `Done. Found ${foundCount} messages.`);
}
