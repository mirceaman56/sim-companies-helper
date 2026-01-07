// recipe_extractor.js
// Extracts recipe data on encyclopedia pages and displays in a floating panel

const EXTRACTOR_PANEL_ID = "scx-recipe-extractor";

/**
 * Parse quantity from text like "3x", "1/2x", "0.1x"
 */
function parseQty(txt) {
  if (!txt) return null;
  const t = txt.trim().replace(/x$/i, "");

  // fraction like "1/2"
  const frac = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    return den ? num / den : null;
  }

  // number like "3" or "0.1"
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Get unique items from array by key function
 */
function uniqueBy(arr, keyFn) {
  const seen = new Set();
  return arr.filter(x => {
    const k = keyFn(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Extract recipe data from encyclopedia page
 */
function extractRecipe() {
  // Get ID from URL
  const m = location.pathname.match(/\/encyclopedia\/\d+\/resource\/(\d+)\//);
  const id = m ? Number(m[1]) : null;

  // Get name from product card
  // structure: <div class="col-xs-4 text-center"> ... <div>Seeds</div> ...
  // take the first child <div> after the image container that is not empty and not a price/label
  let name = null;
  const card = document.querySelector('.col-xs-4.text-center');
  if (card) {
    const divs = [...card.querySelectorAll(':scope > div')];
    // divs often look like: [imgWrap, nameDiv, priceDiv, ...]
    // choose the one that is plain text and not containing <a> or <img>
    const nameDiv =
      divs.find(d => d && d.textContent && !d.querySelector('a, img') && d.textContent.trim().length > 0) ||
      divs[1]; // fallback: common position
    name = nameDiv?.textContent?.trim() ?? null;
  }

  // Get materials: each ingredient span block
  const materialSpans = [...document.querySelectorAll('span.css-1jhg4e6.e1d2gsfs3')];

  const materials = materialSpans
    .map(span => {
      const a = span.querySelector('a[href^="/encyclopedia/0/resource/"]');
      const href = a?.getAttribute('href') || "";
      const mMatch = href.match(/\/resource\/(\d+)\//);
      const mid = mMatch ? Number(mMatch[1]) : null;

      const qtyText = span.querySelector('span.css-1kqm584')?.textContent ?? "";
      const quantity = parseQty(qtyText);

      if (!mid || quantity == null) return null;
      return { id: mid, quantity };
    })
    .filter(Boolean);

  const result = {
    id,
    name,
    materials: uniqueBy(materials, x => x.id)
  };

  return result;
}

/**
 * Create and show the extractor panel
 */
export function initRecipeExtractor() {
  // Only run on encyclopedia resource pages
  if (!location.pathname.includes('/encyclopedia/') || !location.pathname.includes('/resource/')) {
    return;
  }

  let currentResourceId = null;
  let recipesArray = []; // Store all recipes

  const showExtractor = () => {
    // Extract recipe data
    const recipe = extractRecipe();
    if (!recipe) {
      return;
    }

    // Check if this recipe is already in the array
    const alreadyExists = recipesArray.some(r => r.id === recipe.id);
    if (alreadyExists && currentResourceId === recipe.id) {
      return;
    }

    // Add to array if new
    if (!alreadyExists) {
      recipesArray.push(recipe);
    }
    currentResourceId = recipe.id;

    // Remove old panel if it exists
    const oldPanel = document.getElementById(EXTRACTOR_PANEL_ID);
    if (oldPanel) {
      oldPanel.remove();
    }

    // Create panel
    const panel = document.createElement('div');
    panel.id = EXTRACTOR_PANEL_ID;
    panel.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 350px;
      background: white;
      border: 2px solid #1976d2;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 10000;
    `;

    // Format recipes as JSON
    const recipesJson = JSON.stringify(recipesArray, null, 4);

    panel.innerHTML = `
      <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <strong style="color: #1976d2; font-size: 14px;">📋 Recipes (${recipesArray.length})</strong>
        <button id="scx-extractor-close" style="
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">×</button>
      </div>
      
      <textarea id="scx-recipe-output" readonly style="
        width: 100%;
        height: 200px;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        line-height: 1.4;
        resize: vertical;
        box-sizing: border-box;
      ">${recipesJson}</textarea>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px;">
        <button id="scx-copy-recipe" style="
          padding: 8px 12px;
          background: #1976d2;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          transition: background 0.2s;
        ">📋 Copy</button>
        <button id="scx-clear-recipe" style="
          padding: 8px 12px;
          background: #d32f2f;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          transition: background 0.2s;
        ">🗑️ Clear</button>
      </div>
      
      <div id="scx-copy-feedback" style="
        margin-top: 8px;
        padding: 8px;
        text-align: center;
        font-size: 12px;
        color: #4caf50;
        font-weight: 500;
        display: none;
        background: #f1f8e9;
        border-radius: 4px;
      ">Copied to clipboard!</div>
    `;

    document.body.appendChild(panel);

    // Setup event listeners
    const closeBtn = document.getElementById("scx-extractor-close");
    const copyBtn = document.getElementById("scx-copy-recipe");
    const clearBtn = document.getElementById("scx-clear-recipe");
    const textarea = document.getElementById("scx-recipe-output");
    const feedback = document.getElementById("scx-copy-feedback");

    closeBtn.addEventListener("click", () => {
      panel.remove();
    });

    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(recipesJson);
        feedback.style.display = "block";
        setTimeout(() => {
          feedback.style.display = "none";
        }, 2000);
      } catch (e) {
        // Fallback: select text
        textarea.select();
        document.execCommand("copy");
      }
    });

    clearBtn.addEventListener("click", () => {
      recipesArray = [];
      currentResourceId = null;
      panel.remove();
    });
  };

  // Show extractor on initial load
  showExtractor();

  // Watch for page changes using MutationObserver on the main content area
  const observer = new MutationObserver(() => {
    // Re-check if we're still on an encyclopedia page and show extractor for current resource
    if (location.pathname.includes('/encyclopedia/') && location.pathname.includes('/resource/')) {
      showExtractor();
    }
  });

  // Observe the body for significant changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false
  });

  // Also listen for history changes (back/forward navigation)
  window.addEventListener('popstate', () => {
    if (location.pathname.includes('/encyclopedia/') && location.pathname.includes('/resource/')) {
      showExtractor();
    }
  });
}
