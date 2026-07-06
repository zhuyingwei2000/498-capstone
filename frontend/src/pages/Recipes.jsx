import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { getAISuggestions, getPantryItems, getRecipeDetails, searchRecipes } from "../api/client";

const CATEGORY_ORDER = [
  "Vegetables", "Fruits", "Meat & Seafood", "Dairy & Eggs",
  "Grains & Bread", "Condiments & Spices", "Beverages", "Snacks", "Other", "Uncategorized",
];

function groupByCategory(items) {
  const groups = {};
  for (const item of items) {
    const key = item.category || "Uncategorized";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return Object.entries(groups).sort(
    ([a], [b]) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)
  );
}

export default function Recipes({ shoppingList }) {
  const { token } = useAuth();
  const [pantryItems, setPantryItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [status, setStatus] = useState("idle");
  const [exactMeals, setExactMeals] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState("");

  const [aiRecipes, setAiRecipes] = useState([]);
  const [aiStatus, setAiStatus] = useState("idle");
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    getPantryItems(token)
      .then((items) => {
        // Deduplicate by name; exclude items marked as non-recipe.
        const seen = new Set();
        setPantryItems(
          items.filter((it) => {
            if (it.exclude_from_recipes) return false;
            return seen.has(it.name) ? false : seen.add(it.name);
          })
        );
      })
      .catch(() => {});
  }, []);

  function toggleSelect(name) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  async function handleFind() {
    if (selected.size === 0) return;
    setStatus("loading");
    setError("");
    setExactMeals([]);
    setSuggestions([]);
    setExpandedId(null);
    try {
      const result = await searchRecipes(token, [...selected]);
      setExactMeals(result.exact || []);
      setSuggestions(result.suggestions || []);
      setStatus("done");
    } catch (err) {
      setError(err.message);
      setStatus("idle");
    }
  }

  async function handleAIIdeas() {
    if (selected.size === 0) return;
    setAiStatus("loading");
    setAiError("");
    setAiRecipes([]);
    try {
      const { recipes } = await getAISuggestions(token, [...selected]);
      setAiRecipes(recipes || []);
      setAiStatus("done");
    } catch (err) {
      setAiError(err.message);
      setAiStatus("idle");
    }
  }

  function toggleExpand(key) {
    setExpandedId((prev) => (prev === key ? null : key));
  }

  const pantryNamesLower = pantryItems.map((i) => i.name.toLowerCase());

  function isOwned(ingName) {
    const m = ingName.toLowerCase();
    return pantryNamesLower.some((p) => m.includes(p) || p.includes(m));
  }

  function addMealToList(detail, title) {
    const missing = (detail.extendedIngredients || []).filter(
      (ing) => !isOwned(ing.name)
    );
    shoppingList.addItems(
      missing.map((ing) => ({
        id: `${title}-${ing.name}`,
        name: ing.name,
        recipe: title,
      }))
    );
  }

  function addAIRecipeToList(recipe) {
    shoppingList.addItems(
      (recipe.extraIngredients || []).map((name) => ({
        id: `${recipe.name}-${name}`,
        name,
        recipe: recipe.name,
      }))
    );
  }

  return (
    <div className="recipes-page">
      <h2 className="section-heading">Recipe Finder</h2>

      <div className="ingredient-picker">
        <p className="picker-hint">Select ingredients from your pantry to find matching recipes:</p>
        {pantryItems.length === 0 ? (
          <p className="status-msg">Add items to your pantry first.</p>
        ) : (
          <div className="ingredient-groups">
            {groupByCategory(pantryItems).map(([category, items]) => (
              <div key={category} className="ingredient-group">
                <span className="ingredient-group-label">{category}</span>
                <div className="ingredient-chips">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      className={`ingredient-chip${selected.has(item.name) ? " ingredient-chip--active" : ""}`}
                      onClick={() => toggleSelect(item.name)}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {pantryItems.length > 0 && (
        <div className="recipe-action-row">
          <button
            className="btn-primary find-recipes-btn"
            onClick={handleFind}
            disabled={selected.size === 0 || status === "loading"}
          >
            {status === "loading" ? "Searching…" : `Find Recipes${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </button>
          <button
            className="btn-ai-ideas"
            onClick={handleAIIdeas}
            disabled={selected.size === 0 || aiStatus === "loading"}
          >
            {aiStatus === "loading" ? "Thinking…" : "✨ AI Ideas"}
          </button>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      {status === "done" && (
        <>
          {exactMeals.length === 0 && suggestions.length === 0 && (
            <p className="status-msg">No recipes found — try different ingredients.</p>
          )}

          {exactMeals.length > 0 && (
            <section className="recipe-section">
              <h3 className="recipe-section-title">
                Best Matches
                <span className="recipe-count">{exactMeals.length}</span>
              </h3>
              {exactMeals.map((meal) => (
                <SpoonacularCard
                  key={meal.id}
                  expandKey={String(meal.id)}
                  meal={meal}
                  expandedId={expandedId}
                  onToggle={toggleExpand}
                  isOwned={isOwned}
                  onAddToList={addMealToList}
                />
              ))}
            </section>
          )}

          {suggestions.length > 0 && (
            <section className="recipe-section">
              <h3 className="recipe-section-title">Add One More Ingredient</h3>
              {suggestions.map(({ meal, missing }) => (
                <SpoonacularCard
                  key={meal.id + "-s"}
                  expandKey={meal.id + "-s"}
                  meal={meal}
                  expandedId={expandedId}
                  onToggle={toggleExpand}
                  isOwned={isOwned}
                  onAddToList={addMealToList}
                  missingIngredient={missing}
                />
              ))}
            </section>
          )}
        </>
      )}

      {aiError && <p className="form-error">{aiError}</p>}
      {aiStatus === "done" && aiRecipes.length > 0 && (
        <section className="recipe-section">
          <h3 className="recipe-section-title">
            ✨ AI Ideas
            <span className="recipe-count">{aiRecipes.length}</span>
          </h3>
          {aiRecipes.map((recipe, i) => (
            <AIRecipeCard
              key={i}
              recipe={recipe}
              expandedId={expandedId}
              onToggle={toggleExpand}
              onAddToList={() => addAIRecipeToList(recipe)}
            />
          ))}
        </section>
      )}
    </div>
  );
}

// ── Spoonacular recipe card (lazy-loads details on expand) ──

function SpoonacularCard({ expandKey, meal, expandedId, onToggle, isOwned, onAddToList, missingIngredient }) {
  const { token } = useAuth();
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const expanded = expandedId === expandKey;
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!expanded || fetchedRef.current) return;
    fetchedRef.current = true;
    setDetailLoading(true);
    getRecipeDetails(token, meal.id)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, [expanded]);

  const steps = detail?.analyzedInstructions?.[0]?.steps || [];
  const ingredients = detail?.extendedIngredients || [];
  const ytQuery = encodeURIComponent((meal.title) + " recipe cooking");

  return (
    <div className={`recipe-card${missingIngredient ? " recipe-card--suggestion" : ""}`}>
      <button className="recipe-card-header" onClick={() => onToggle(expandKey)}>
        <img src={meal.image} alt={meal.title} className="recipe-thumb" loading="lazy" />
        <div className="recipe-info">
          <span className="recipe-name">{meal.title}</span>
          {missingIngredient ? (
            <span className="recipe-add-hint">+ {missingIngredient}</span>
          ) : (
            <span className="recipe-meta">
              Uses {meal.usedIngredientCount} of your ingredients
            </span>
          )}
        </div>
        <span className="recipe-chevron">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="recipe-details">
          {detailLoading && <p className="status-msg">Loading…</p>}

          {detail && (
            <>
              <h4 className="recipe-detail-heading">Ingredients</h4>
              <ul className="recipe-ingredients">
                {ingredients.map((ing, i) => {
                  const owned = isOwned(ing.name);
                  const isMissing = missingIngredient &&
                    ing.name.toLowerCase().includes(missingIngredient.toLowerCase());
                  return (
                    <li
                      key={i}
                      className={`recipe-ingredient${owned ? " recipe-ingredient--owned" : isMissing ? " recipe-ingredient--missing" : ""}`}
                    >
                      <span className="recipe-ing-marker">
                        {owned ? "✓" : isMissing ? "+" : "·"}
                      </span>
                      <span>{ing.original}</span>
                    </li>
                  );
                })}
              </ul>

              {steps.length > 0 && (
                <>
                  <h4 className="recipe-detail-heading">Instructions</h4>
                  <ol className="ai-recipe-steps">
                    {steps.map((s) => <li key={s.number}>{s.step}</li>)}
                  </ol>
                </>
              )}

              <div className="recipe-card-footer">
                <a
                  href={`https://www.youtube.com/results?search_query=${ytQuery}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-youtube"
                >
                  ▶ Watch on YouTube
                </a>
                {detail.sourceUrl && (
                  <a href={detail.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                    View Recipe
                  </a>
                )}
                <AddToListButton onAdd={() => onAddToList(detail, meal.title)} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── AI recipe card ──

function AddToListButton({ onAdd }) {
  const [added, setAdded] = useState(false);
  function handle() {
    onAdd();
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }
  return (
    <button className={`btn-add-to-list${added ? " btn-add-to-list--done" : ""}`} onClick={handle}>
      {added ? "✓ Added!" : "+ Shopping List"}
    </button>
  );
}

function AIRecipeCard({ recipe, expandedId, onToggle, onAddToList }) {
  const key = "ai-" + recipe.name;
  const expanded = expandedId === key;
  const ytUrl =
    "https://www.youtube.com/results?search_query=" +
    encodeURIComponent(recipe.youtubeQuery || recipe.name + " recipe");

  return (
    <div className="recipe-card recipe-card--ai">
      <button className="recipe-card-header" onClick={() => onToggle(key)}>
        <div className="ai-recipe-icon">✨</div>
        <div className="recipe-info">
          <span className="recipe-name">{recipe.name}</span>
          <span className="recipe-meta">{recipe.description}</span>
        </div>
        <span className="recipe-chevron">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="recipe-details">
          <h4 className="recipe-detail-heading">Ingredients You Have</h4>
          <ul className="recipe-ingredients">
            {(recipe.usedIngredients || []).map((ing, i) => (
              <li key={i} className="recipe-ingredient recipe-ingredient--owned">
                <span className="recipe-ing-marker">✓</span>
                <span>{ing}</span>
              </li>
            ))}
          </ul>

          {recipe.extraIngredients?.length > 0 && (
            <>
              <h4 className="recipe-detail-heading">Also Needed</h4>
              <ul className="recipe-ingredients">
                {recipe.extraIngredients.map((ing, i) => (
                  <li key={i} className="recipe-ingredient recipe-ingredient--missing">
                    <span className="recipe-ing-marker">+</span>
                    <span>{ing}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h4 className="recipe-detail-heading">Steps</h4>
          <ol className="ai-recipe-steps">
            {(recipe.steps || []).map((step, i) => <li key={i}>{step}</li>)}
          </ol>

          <div className="recipe-card-footer">
            <a href={ytUrl} target="_blank" rel="noopener noreferrer" className="btn-youtube">
              ▶ Watch on YouTube
            </a>
            {recipe.extraIngredients?.length > 0 && (
              <AddToListButton onAdd={onAddToList} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
