import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const recipesFile = path.join(repoRoot, "src", "resources", "recipes.json");
const outFile = path.join(repoRoot, "src", "resources", "building_products.json");
const ENCYCLOPEDIA_URL = (id) => `https://www.simcompanies.com/api/v4/en/0/encyclopedia/resources/0/${id}/`;

// why: the game serves the same building ↔ product mapping to every company, so it ships as a
// static file instead of costing rate limit at runtime. Rerun when the game adds a product.
// Requests are spaced out so the run looks like a player browsing the encyclopedia.
const DELAY_MS = 150;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const recipes = JSON.parse(fs.readFileSync(recipesFile, "utf8"));
  /** @type {Record<string, number[]>} */
  const byBuilding = {};

  for (const [index, recipe] of recipes.entries()) {
    if (index > 0) await wait(DELAY_MS);
    const response = await fetch(ENCYCLOPEDIA_URL(recipe.id));
    if (!response.ok) throw new Error(`${recipe.id} (${recipe.name}): HTTP ${response.status}`);
    const { producedAt } = await response.json();
    if (!producedAt) {
      console.warn(`${recipe.id} (${recipe.name}): no producedAt, skipped`);
      continue;
    }
    (byBuilding[producedAt] ??= []).push(recipe.id);
  }

  const sorted = Object.fromEntries(
    Object.keys(byBuilding)
      .sort()
      .map((kind) => [kind, byBuilding[kind].sort((a, b) => a - b)]),
  );
  fs.writeFileSync(outFile, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(sorted).length} buildings to ${path.relative(repoRoot, outFile)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
