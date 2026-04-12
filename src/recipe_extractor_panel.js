import { escapeHtml } from "./utils.js";

export const EXTRACTOR_PANEL_ID = "scx-recipe-extractor";
const CLOSE_BUTTON_ID = "scx-extractor-close";
const COPY_BUTTON_ID = "scx-copy-recipe";
const CLEAR_BUTTON_ID = "scx-clear-recipe";
const OUTPUT_ID = "scx-recipe-output";
const COPY_FEEDBACK_ID = "scx-copy-feedback";

function createPanelMarkup(recipesJson, count) {
  return `
    <div class="scx-recipe-extractor-head">
      <strong class="scx-recipe-extractor-title">📋 Recipes (${count})</strong>
      <button id="${CLOSE_BUTTON_ID}" class="scx-recipe-extractor-close" type="button">×</button>
    </div>

    <textarea id="${OUTPUT_ID}" class="scx-recipe-extractor-output" readonly>${escapeHtml(recipesJson)}</textarea>

    <div class="scx-recipe-extractor-actions">
      <button id="${COPY_BUTTON_ID}" class="scx-btn scx-btn-info scx-recipe-extractor-copy" type="button">📋 Copy</button>
      <button id="${CLEAR_BUTTON_ID}" class="scx-btn scx-btn-error scx-recipe-extractor-clear" type="button">🗑️ Clear</button>
    </div>

    <div id="${COPY_FEEDBACK_ID}" class="scx-recipe-extractor-feedback">Copied to clipboard!</div>
  `;
}

function dedupeById(recipes) {
  const seen = new Set();
  return recipes.filter((recipe) => {
    if (!recipe?.id || seen.has(recipe.id)) return false;
    seen.add(recipe.id);
    return true;
  });
}

export function createRecipeExtractorPanelController(input = {}) {
  const {
    root = document,
    writeClipboard = (text) => navigator.clipboard.writeText(text),
    execCopy = () => document.execCommand("copy"),
    timeoutFn = setTimeout,
  } = input;

  let currentResourceId = null;
  let recipes = [];

  function removePanel() {
    root.getElementById?.(EXTRACTOR_PANEL_ID)?.remove();
  }

  function clearState() {
    recipes = [];
    currentResourceId = null;
  }

  function getRecipesJson() {
    return JSON.stringify(recipes, null, 4);
  }

  async function copyRecipes() {
    const recipesJson = getRecipesJson();
    const panel = root.getElementById(EXTRACTOR_PANEL_ID);
    if (!panel) return;

    const textarea = panel.querySelector(`#${OUTPUT_ID}`);
    const feedback = panel.querySelector(`#${COPY_FEEDBACK_ID}`);

    try {
      await writeClipboard(recipesJson);
      if (feedback) {
        feedback.style.display = "block";
        timeoutFn(() => {
          feedback.style.display = "none";
        }, 2000);
      }
    } catch {
      textarea?.select?.();
      execCopy();
    }
  }

  function renderPanel() {
    removePanel();
    const panel = root.createElement("div");
    panel.id = EXTRACTOR_PANEL_ID;
    panel.className = "scx-recipe-extractor-panel";

    panel.innerHTML = createPanelMarkup(getRecipesJson(), recipes.length);
    root.body.appendChild(panel);

    panel.querySelector(`#${CLOSE_BUTTON_ID}`)?.addEventListener("click", () => {
      panel.remove();
    });

    panel.querySelector(`#${COPY_BUTTON_ID}`)?.addEventListener("click", () => {
      void copyRecipes();
    });

    panel.querySelector(`#${CLEAR_BUTTON_ID}`)?.addEventListener("click", () => {
      clearState();
      panel.remove();
    });
  }

  function showRecipe(recipe) {
    if (!recipe || !recipe.id) return;

    const alreadyExists = recipes.some((entry) => entry.id === recipe.id);
    if (alreadyExists && currentResourceId === recipe.id) return;

    if (!alreadyExists) {
      recipes = dedupeById([...recipes, recipe]);
    }
    currentResourceId = recipe.id;

    renderPanel();
  }

  return {
    showRecipe,
    removePanel,
    clearState,
    getCurrentResourceId: () => currentResourceId,
    getRecipes: () => [...recipes],
    getRecipesJson,
  };
}

export const _testUtils = {
  dedupeById,
  createPanelMarkup,
};
