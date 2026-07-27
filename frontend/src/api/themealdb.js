const BASE = "https://www.themealdb.com/api/json/v1/1";

// Normalize pantry name for TheMealDB search.
// "Chicken Breast (frozen)" → "Chicken Breast", "Purified Water" → "Purified Water"
function toSearchName(pantryName) {
  let name = pantryName.replace(/\(.*?\)/g, "").trim();   // drop parenthetical notes
  name = name.replace(/,.*$/, "").trim();                  // drop ", Purified" suffixes
  name = name.replace(/\s+\d[\d.%]*\s*\w*$/, "").trim(); // drop trailing "2%" "500g"
  return name.split(/\s+/).slice(0, 2).join(" ");          // keep first 2 words
}

// Query TheMealDB, trying multiple strategies until we get results:
// 1. filter by full ingredient name  (e.g. "Chicken Breast")
// 2. filter by first word only       (e.g. "Chicken")
// 3. search by meal name             (e.g. meals whose name contains "steak")
async function filterByIngredient(pantryName) {
  const normalized = toSearchName(pantryName);
  const firstWord = normalized.split(" ")[0];

  // Strategy 1 & 2: ingredient filter
  const variants = firstWord !== normalized ? [normalized, firstWord] : [normalized];
  for (const variant of variants) {
    try {
      const res = await fetch(`${BASE}/filter.php?i=${encodeURIComponent(variant)}`);
      const data = await res.json();
      const ids = (data.meals || []).map((m) => m.idMeal);
      if (ids.length > 0) return ids;
    } catch {}
  }

  // Strategy 3: fall back to searching by meal name.
  // containsAll() will later verify the meal actually uses this ingredient.
  try {
    const res = await fetch(`${BASE}/search.php?s=${encodeURIComponent(normalized)}`);
    const data = await res.json();
    const ids = (data.meals || []).map((m) => m.idMeal);
    if (ids.length > 0) return ids;
  } catch {}

  return [];
}

async function getMealById(id) {
  try {
    const res = await fetch(`${BASE}/lookup.php?i=${id}`);
    const data = await res.json();
    return data.meals?.[0] || null;
  } catch {
    return null;
  }
}

export function getMealIngredients(meal) {
  const list = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];
    if (name && name.trim()) {
      list.push({ name: name.trim(), measure: (measure || "").trim() });
    }
  }
  return list;
}

// Checks whether a meal's ingredient list overlaps with a selected term.
function overlaps(mealIng, term) {
  const a = mealIng.toLowerCase();
  const b = term.toLowerCase();
  return a.includes(b) || b.includes(a);
}

// Verify a fully-fetched meal actually contains every selected ingredient.
// Necessary because TheMealDB filter IDs can be slightly off after fallback name changes.
function containsAll(meal, searchNames) {
  const mealIngs = getMealIngredients(meal).map((i) => i.name);
  return searchNames.every((sel) =>
    mealIngs.some((ing) => overlaps(ing, sel))
  );
}

/**
 * Main entry point.
 * selectedNames: pantry item display names the user picked.
 * Returns { exactMeals, suggestions }
 */
export async function findRecipes(selectedNames) {
  const searchNames = selectedNames.map(toSearchName);

  // Parallel queries — one per ingredient, with first-word fallback built in.
  const idLists = await Promise.all(selectedNames.map(filterByIngredient));

  // Skip ingredients TheMealDB has no data for (e.g. very specific product names).
  const validLists = idLists.filter((list) => list.length > 0);
  if (validLists.length === 0) return { exactMeals: [], suggestions: [] };

  // Count how many ingredient queries each meal ID satisfies.
  const counts = {};
  validLists.forEach((ids) => {
    ids.forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
  });

  const n = validLists.length;

  // Exact candidates: appear in ALL valid ingredient queries.
  const exactCandidateIds = Object.entries(counts)
    .filter(([, c]) => c === n)
    .map(([id]) => id)
    .slice(0, 16); // fetch extras so we still have plenty after the detail-verify step

  // Near-miss candidates: appear in n-1 queries.
  const nearCandidateIds = n >= 2
    ? Object.entries(counts)
        .filter(([id, c]) => c === n - 1 && !exactCandidateIds.includes(id))
        .map(([id]) => id)
        .slice(0, 8)
    : [];

  // Fetch full details in parallel.
  const [exactDetails, nearDetails] = await Promise.all([
    Promise.all(exactCandidateIds.map(getMealById)),
    Promise.all(nearCandidateIds.map(getMealById)),
  ]);

  // Strict verification: the meal detail must actually list all selected ingredients.
  const exactMeals = exactDetails
    .filter(Boolean)
    .filter((meal) => containsAll(meal, searchNames))
    .slice(0, 10);

  // For near-miss, find what single ingredient is missing from the selected set.
  const suggestions = nearDetails
    .filter(Boolean)
    .map((meal) => {
      const ings = getMealIngredients(meal);
      const missing = ings.find(
        (ing) => !searchNames.some((sel) => overlaps(ing.name, sel))
      );
      return missing ? { meal, missing: missing.name } : null;
    })
    .filter(Boolean)
    .slice(0, 3);

  return { exactMeals, suggestions };
}
