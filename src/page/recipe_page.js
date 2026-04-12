const RECIPE_RESOURCE_PATH_PATTERN = /\/encyclopedia\/\d+\/resource\/(\d+)\/?$/;
const PRODUCT_CARD_SELECTOR = ".col-xs-4.text-center";
const MATERIAL_SPAN_SELECTOR = "span.css-1jhg4e6.e1d2gsfs3";
const MATERIAL_LINK_SELECTOR = 'a[href*="/encyclopedia/"][href*="/resource/"]';
const MATERIAL_QTY_SELECTOR = "span.css-1kqm584";

function parseQty(rawText) {
  if (!rawText) return null;
  const text = rawText.trim().replace(/x$/i, "");

  const fractionMatch = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    return denominator ? numerator / denominator : null;
  }

  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function uniqueBy(arr, keyFn) {
  const seen = new Set();
  return arr.filter((entry) => {
    const key = keyFn(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isRecipeResourcePath(pathname) {
  if (typeof pathname !== "string") return false;
  return RECIPE_RESOURCE_PATH_PATTERN.test(pathname);
}

export function readRecipeResourceId(pathname) {
  if (typeof pathname !== "string") return null;
  const match = pathname.match(RECIPE_RESOURCE_PATH_PATTERN);
  return match ? Number(match[1]) : null;
}

export function readRecipeName(root = document) {
  const card = root?.querySelector?.(PRODUCT_CARD_SELECTOR);
  if (!card) return null;

  const directDivs = [...card.querySelectorAll(":scope > div")];
  if (directDivs.length === 0) return null;

  const nameDiv =
    directDivs.find(
      (div) => div && div.textContent && !div.querySelector("a, img") && div.textContent.trim(),
    ) || directDivs[1];

  const name = nameDiv?.textContent?.trim();
  return name || null;
}

export function readRecipeMaterials(root = document) {
  const spans = [...(root?.querySelectorAll?.(MATERIAL_SPAN_SELECTOR) || [])];

  const materials = spans
    .map((span) => {
      const link = span.querySelector(MATERIAL_LINK_SELECTOR);
      const href = link?.getAttribute("href") || "";
      const resourceMatch = href.match(/\/resource\/(\d+)\//);
      const resourceId = resourceMatch ? Number(resourceMatch[1]) : null;

      const quantityText = span.querySelector(MATERIAL_QTY_SELECTOR)?.textContent || "";
      const quantity = parseQty(quantityText);

      if (!resourceId || quantity == null) return null;
      return { id: resourceId, quantity };
    })
    .filter(Boolean);

  return uniqueBy(materials, (entry) => entry.id);
}

export function readRecipePage(root = document, pathname = window.location.pathname) {
  const resourceId = readRecipeResourceId(pathname);
  if (!resourceId) return null;

  return {
    id: resourceId,
    name: readRecipeName(root),
    materials: readRecipeMaterials(root),
  };
}

export const _testUtils = {
  parseQty,
  uniqueBy,
  RECIPE_RESOURCE_PATH_PATTERN,
};
