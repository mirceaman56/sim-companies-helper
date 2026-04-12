import { readRecipePage, isRecipeResourcePath } from "./page/recipe_page.js";
import { createRecipeExtractorPanelController } from "./recipe_extractor_panel.js";
import { observeRecipeExtractorRoute } from "./recipe_extractor_observer.js";

/**
 * Initialize recipe extractor feature.
 * Keeps page reads, panel rendering, and route observation in separate modules.
 */
export function initRecipeExtractor() {
  if (!isRecipeResourcePath(window.location.pathname)) return;

  const panelController = createRecipeExtractorPanelController();

  const syncFromPage = () => {
    if (!isRecipeResourcePath(window.location.pathname)) return;

    const recipe = readRecipePage(document, window.location.pathname);
    if (!recipe) return;

    panelController.showRecipe(recipe);
  };

  syncFromPage();
  observeRecipeExtractorRoute(syncFromPage, { root: document, win: window });
}
