import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../AuthContext";
import {
  getAISuggestions, getPantryItems, getRecipeDetails,
  searchRecipes, updatePantryItem, deletePantryItem,
} from "../api/client";

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

/* ── Achievements ─────────────────────────────────────────── */
const ACH = {
  FIRST_RECIPE:  { id: "first_recipe",  emoji: "🍳", title: "Recipe Explorer",   desc: "Found your first recipe!"          },
  FIRST_AI:      { id: "first_ai",      emoji: "✨", title: "AI Sous Chef",       desc: "Generated your first AI recipe!"   },
  COOKED_IT:     { id: "cooked_it",     emoji: "👨‍🍳", title: "Home Cook",          desc: "Cooked a recipe from your pantry!" },
  SAVED_RECIPE:  { id: "saved_recipe",  emoji: "❤️",  title: "Recipe Collector",  desc: "Saved your first recipe!"          },
  PANTRY_MASTER: { id: "pantry_master", emoji: "🧺", title: "Well Stocked",       desc: "10+ items in your pantry!"         },
};

function useAchievements() {
  const [toast, setToast] = useState(null);
  function unlock(ach) {
    const key = `pp_ach_${ach.id}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    setToast(ach);
    setTimeout(() => setToast(null), 3500);
  }
  return { toast, unlock };
}

/* ── Saved recipes (localStorage) ────────────────────────── */
function useSavedRecipes() {
  const [saved, setSaved] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pp_saved") || "[]"); }
    catch { return []; }
  });
  function toggle(recipe) {
    setSaved(prev => {
      const next = prev.some(r => r._key === recipe._key)
        ? prev.filter(r => r._key !== recipe._key)
        : [...prev, { ...recipe, savedAt: new Date().toISOString() }];
      try { localStorage.setItem("pp_saved", JSON.stringify(next)); } catch {}
      return next;
    });
  }
  return { saved, toggle, isSaved: k => saved.some(r => r._key === k) };
}

/* ── Main Recipes component ───────────────────────────────── */
export default function Recipes({ shoppingList }) {
  const { token } = useAuth();
  const [pantryItems, setPantryItems] = useState([]);
  const [pantryLoading, setPantryLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [status, setStatus] = useState("idle");
  const [exactMeals, setExactMeals] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState("");
  const [aiRecipes, setAiRecipes] = useState([]);
  const [aiStatus, setAiStatus] = useState("idle");
  const [aiError, setAiError] = useState("");

  const potRef = useRef(null);
  const [flyingChips, setFlyingChips] = useState([]);
  const [potJiggle, setPotJiggle] = useState(false);
  const [potBounce, setPotBounce] = useState(false);

  const { toast, unlock } = useAchievements();
  const { saved, toggle: toggleSave, isSaved } = useSavedRecipes();

  async function loadPantry() {
    setPantryLoading(true);
    try {
      const items = await getPantryItems(token);
      const seen = new Set();
      const filtered = items.filter(it => {
        if (it.exclude_from_recipes) return false;
        return seen.has(it.name) ? false : seen.add(it.name);
      });
      setPantryItems(filtered);
      if (filtered.length >= 10) unlock(ACH.PANTRY_MASTER);
    } catch {}
    finally { setPantryLoading(false); }
  }

  useEffect(() => { loadPantry(); }, []);

  function handleChipClick(name, event) {
    const isAdding = !selected.has(name);
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
    if (isAdding && potRef.current) {
      const chipRect = event.currentTarget.getBoundingClientRect();
      const potRect = potRef.current.getBoundingClientRect();
      const startX = chipRect.left + chipRect.width / 2;
      const startY = chipRect.top + chipRect.height / 2;
      const dx = (potRect.left + potRect.width / 2) - startX;
      const dy = (potRect.top + potRect.height / 2) - startY;
      const id = Date.now() + Math.random();
      setFlyingChips(prev => [...prev, { id, text: name, startX, startY, dx, dy }]);
      setTimeout(() => {
        setFlyingChips(prev => prev.filter(c => c.id !== id));
        setPotJiggle(true);
        setTimeout(() => setPotJiggle(false), 500);
      }, 750);
    }
  }

  async function handleFind() {
    if (selected.size === 0) return;
    setPotBounce(true);
    setTimeout(() => setPotBounce(false), 600);
    setStatus("loading"); setError(""); setExactMeals([]); setSuggestions([]); setExpandedId(null);
    try {
      const result = await searchRecipes(token, [...selected]);
      setExactMeals(result.exact || []);
      setSuggestions(result.suggestions || []);
      setStatus("done");
      if ((result.exact || []).length + (result.suggestions || []).length > 0)
        unlock(ACH.FIRST_RECIPE);
    } catch (err) {
      setError(err.message); setStatus("idle");
    }
  }

  async function handleAIIdeas() {
    if (selected.size === 0) return;
    setAiStatus("loading"); setAiError(""); setAiRecipes([]);
    try {
      const { recipes } = await getAISuggestions(token, [...selected]);
      setAiRecipes(recipes || []);
      setAiStatus("done");
      unlock(ACH.FIRST_AI);
    } catch (err) {
      setAiError(err.message); setAiStatus("idle");
    }
  }

  /* Deduct used ingredients from pantry */
  async function handleCookIt(ingredientNames) {
    const matched = [];
    for (const name of ingredientNames) {
      const nl = name.toLowerCase();
      const match = pantryItems.find(p =>
        nl.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(nl)
      );
      if (match && !matched.find(m => m.id === match.id)) matched.push(match);
    }
    for (const item of matched) {
      try {
        if (item.quantity - 1 <= 0) await deletePantryItem(token, item.id);
        else await updatePantryItem(token, item.id, { quantity: item.quantity - 1 });
      } catch {}
    }
    await loadPantry();
    unlock(ACH.COOKED_IT);
    return matched.length;
  }

  function handleSaveRecipe(recipe) {
    const wasSaved = isSaved(recipe._key);
    toggleSave(recipe);
    if (!wasSaved) unlock(ACH.SAVED_RECIPE);
  }

  function toggleExpand(key) {
    setExpandedId(prev => prev === key ? null : key);
  }

  const pantryNamesLower = pantryItems.map(i => i.name.toLowerCase());
  function isOwned(ingName) {
    const m = ingName.toLowerCase();
    return pantryNamesLower.some(p => m.includes(p) || p.includes(m));
  }

  function addMealToList(detail, title) {
    const missing = (detail.extendedIngredients || []).filter(ing => !isOwned(ing.name));
    shoppingList.addItems(missing.map(ing => ({ id: `${title}-${ing.name}`, name: ing.name, recipe: title })));
  }

  function addAIRecipeToList(recipe) {
    shoppingList.addItems(
      (recipe.extraIngredients || []).map(name => ({ id: `${recipe.name}-${name}`, name, recipe: recipe.name }))
    );
  }

  const sharedProps = { expandedId, onToggle: toggleExpand, onCookIt: handleCookIt, onSave: handleSaveRecipe, isSaved };

  return (
    <div className="recipes-page">
      <h2 className="section-heading">Recipe Finder</h2>

      {/* ── Saved Recipes ──────────────────────────────────── */}
      {saved.length > 0 && (
        <section className="recipe-section">
          <h3 className="recipe-section-title">
            ❤️ Saved <span className="recipe-count">{saved.length}</span>
          </h3>
          {saved.map(recipe =>
            recipe.type === "ai" ? (
              <AIRecipeCard
                key={recipe._key} recipe={recipe}
                onAddToList={() => addAIRecipeToList(recipe)}
                {...sharedProps}
              />
            ) : (
              <SavedSpoonacularCard
                key={recipe._key} recipe={recipe}
                onRemove={() => toggleSave(recipe)}
              />
            )
          )}
        </section>
      )}

      {/* ── Ingredient Picker ──────────────────────────────── */}
      <div className="ingredient-picker">
        <p className="picker-hint">Tap ingredients to toss them into the pot:</p>

        {pantryLoading ? (
          <div className="ingredient-skeleton">
            {[72,95,60,82,68,88,75,58,90,65].map((w, i) => (
              <div key={i} className="skeleton" style={{ width: w, height: 28, borderRadius: 20, display: "inline-block" }} />
            ))}
          </div>
        ) : pantryItems.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">🧺</span>
            <p className="empty-state-title">Your pantry is empty</p>
            <p className="empty-state-desc">Add items to your pantry first</p>
          </div>
        ) : (
          <div className="ingredient-groups">
            {groupByCategory(pantryItems).map(([category, items]) => (
              <div key={category} className="ingredient-group">
                <span className="ingredient-group-label">{category}</span>
                <div className="ingredient-chips">
                  {items.map(item => (
                    <button
                      key={item.id}
                      className={`ingredient-chip${selected.has(item.name) ? " ingredient-chip--active" : ""}`}
                      onClick={e => handleChipClick(item.name, e)}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {pantryItems.length > 0 && (
          <div className="pot-zone">
            <div className="pot-selected-chips">
              {[...selected].map(name => (
                <span key={name} className="pot-chip">
                  {name}
                  <button
                    className="pot-chip-remove"
                    onClick={() => setSelected(prev => { const n = new Set(prev); n.delete(name); return n; })}
                  >×</button>
                </span>
              ))}
            </div>
            <div className="pot-actions">
              <button
                ref={potRef}
                className={`pot-btn${potJiggle ? " pot-btn--jiggle" : ""}${potBounce ? " pot-btn--bounce" : ""}`}
                onClick={handleFind}
                disabled={selected.size === 0 || status === "loading"}
                title={selected.size === 0 ? "Add ingredients first" : "Find recipes!"}
              >
                <span className="pot-emoji">🫕</span>
                {selected.size > 0 && <span className="pot-count">{selected.size}</span>}
              </button>
              <div className="pot-labels">
                <span className="pot-label-main">
                  {status === "loading" ? "Searching…" : selected.size === 0 ? "Toss in some ingredients!" : "Tap the pot to find recipes!"}
                </span>
                <button
                  className="btn-ai-ideas"
                  onClick={handleAIIdeas}
                  disabled={selected.size === 0 || aiStatus === "loading"}
                  style={{ marginTop: 6 }}
                >
                  {aiStatus === "loading" ? "Thinking…" : "✨ AI Ideas"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Flying chips — portal to body to avoid transform containing-block issues */}
      {createPortal(
        flyingChips.map(chip => (
          <div
            key={chip.id}
            className="flying-chip"
            style={{ left: chip.startX, top: chip.startY, "--dx": `${chip.dx}px`, "--dy": `${chip.dy}px` }}
          >
            {chip.text}
          </div>
        )),
        document.body
      )}

      {error && <p className="form-error">{error}</p>}

      {/* ── Spoonacular Results ─────────────────────────────── */}
      {status === "done" && (
        <>
          {exactMeals.length === 0 && suggestions.length === 0 && (
            <div className="empty-state" style={{ paddingTop: 20 }}>
              <span className="empty-state-icon">🔍</span>
              <p className="empty-state-title">No recipes found</p>
              <p className="empty-state-desc">Try selecting different ingredients</p>
            </div>
          )}
          {exactMeals.length > 0 && (
            <section className="recipe-section">
              <h3 className="recipe-section-title">
                Best Matches <span className="recipe-count">{exactMeals.length}</span>
              </h3>
              {exactMeals.map(meal => (
                <SpoonacularCard
                  key={meal.id} expandKey={String(meal.id)} meal={meal}
                  isOwned={isOwned} onAddToList={addMealToList}
                  {...sharedProps}
                />
              ))}
            </section>
          )}
          {suggestions.length > 0 && (
            <section className="recipe-section">
              <h3 className="recipe-section-title">Add One More Ingredient</h3>
              {suggestions.map(({ meal, missing }) => (
                <SpoonacularCard
                  key={meal.id + "-s"} expandKey={meal.id + "-s"} meal={meal}
                  isOwned={isOwned} onAddToList={addMealToList} missingIngredient={missing}
                  {...sharedProps}
                />
              ))}
            </section>
          )}
        </>
      )}

      {/* ── AI Results ─────────────────────────────────────── */}
      {aiError && <p className="form-error">{aiError}</p>}
      {aiStatus === "done" && aiRecipes.length > 0 && (
        <section className="recipe-section">
          <h3 className="recipe-section-title">
            ✨ AI Ideas <span className="recipe-count">{aiRecipes.length}</span>
          </h3>
          {aiRecipes.map((recipe, i) => (
            <AIRecipeCard
              key={i} recipe={recipe}
              onAddToList={() => addAIRecipeToList(recipe)}
              {...sharedProps}
            />
          ))}
        </section>
      )}

      {/* Achievement toast */}
      {toast && createPortal(
        <div className="achievement-toast">
          <span className="achievement-toast-icon">{toast.emoji}</span>
          <div className="achievement-toast-body">
            <div className="achievement-toast-label">Achievement Unlocked!</div>
            <div className="achievement-toast-title">{toast.title}</div>
            <div className="achievement-toast-desc">{toast.desc}</div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ── Saved Spoonacular Card (minimal) ─────────────────────── */
function SavedSpoonacularCard({ recipe, onRemove }) {
  const ytQuery = encodeURIComponent(recipe.title + " recipe cooking");
  return (
    <div className="recipe-card">
      <div className="recipe-card-header" style={{ cursor: "default" }}>
        {recipe.image && <img src={recipe.image} alt={recipe.title} className="recipe-thumb" loading="lazy" />}
        <div className="recipe-info">
          <span className="recipe-name">{recipe.title}</span>
          <span className="recipe-meta">Saved recipe</span>
        </div>
        <button className="btn-save-recipe" onClick={onRemove} title="Remove from saved">❤️</button>
      </div>
      <div className="recipe-card-footer" style={{ padding: "8px 14px 12px" }}>
        <a href={`https://www.youtube.com/results?search_query=${ytQuery}`} target="_blank" rel="noopener noreferrer" className="btn-youtube">▶ Watch on YouTube</a>
        {recipe.sourceUrl && <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">View Recipe</a>}
      </div>
    </div>
  );
}

/* ── SpoonacularCard ──────────────────────────────────────── */
function SpoonacularCard({ expandKey, meal, expandedId, onToggle, isOwned, onAddToList, missingIngredient, onCookIt, onSave, isSaved }) {
  const { token } = useAuth();
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const expanded = expandedId === expandKey;
  const fetchedRef = useRef(false);
  const recipeKey = `sp-${meal.id}`;

  useEffect(() => {
    if (!expanded || fetchedRef.current) return;
    fetchedRef.current = true;
    setDetailLoading(true);
    getRecipeDetails(token, meal.id).then(setDetail).catch(() => {}).finally(() => setDetailLoading(false));
  }, [expanded]);

  function handleSave() {
    onSave({ _key: recipeKey, type: "spoonacular", id: meal.id, title: meal.title, image: meal.image, sourceUrl: detail?.sourceUrl });
  }

  async function handleCook() {
    if (!detail) return 0;
    return await onCookIt((detail.extendedIngredients || []).map(i => i.name));
  }

  const steps = detail?.analyzedInstructions?.[0]?.steps || [];
  const ingredients = detail?.extendedIngredients || [];
  const ytQuery = encodeURIComponent(meal.title + " recipe cooking");
  const saved = isSaved(recipeKey);

  return (
    <div className={`recipe-card${missingIngredient ? " recipe-card--suggestion" : ""}`}>
      <button className="recipe-card-header" onClick={() => onToggle(expandKey)}>
        <img src={meal.image} alt={meal.title} className="recipe-thumb" loading="lazy" />
        <div className="recipe-info">
          <span className="recipe-name">{meal.title}</span>
          {missingIngredient
            ? <span className="recipe-add-hint">+ {missingIngredient}</span>
            : <span className="recipe-meta">Uses {meal.usedIngredientCount} of your ingredients</span>}
        </div>
        <button className="btn-save-recipe" onClick={e => { e.stopPropagation(); handleSave(); }} title={saved ? "Unsave" : "Save"}>
          {saved ? "❤️" : "🤍"}
        </button>
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
                  const isMissing = missingIngredient && ing.name.toLowerCase().includes(missingIngredient.toLowerCase());
                  return (
                    <li key={i} className={`recipe-ingredient${owned ? " recipe-ingredient--owned" : isMissing ? " recipe-ingredient--missing" : ""}`}>
                      <span className="recipe-ing-marker">{owned ? "✓" : isMissing ? "+" : "·"}</span>
                      <span>{ing.original}</span>
                    </li>
                  );
                })}
              </ul>
              {steps.length > 0 && (
                <>
                  <h4 className="recipe-detail-heading">Instructions</h4>
                  <ol className="ai-recipe-steps">{steps.map(s => <li key={s.number}>{s.step}</li>)}</ol>
                </>
              )}
              <div className="recipe-card-footer">
                <a href={`https://www.youtube.com/results?search_query=${ytQuery}`} target="_blank" rel="noopener noreferrer" className="btn-youtube">▶ Watch on YouTube</a>
                {detail.sourceUrl && <a href={detail.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">View Recipe</a>}
                <AddToListButton onAdd={() => onAddToList(detail, meal.title)} />
                <CookItButton onCook={handleCook} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── AIRecipeCard ─────────────────────────────────────────── */
function AIRecipeCard({ recipe, expandedId, onToggle, onAddToList, onCookIt, onSave, isSaved }) {
  const key = "ai-" + recipe.name;
  const expanded = expandedId === key;
  const recipeKey = `ai-${recipe.name}`;
  const saved = isSaved(recipeKey);
  const ytUrl = "https://www.youtube.com/results?search_query=" + encodeURIComponent(recipe.youtubeQuery || recipe.name + " recipe");

  function handleSave() { onSave({ _key: recipeKey, type: "ai", ...recipe }); }
  async function handleCook() { return await onCookIt(recipe.usedIngredients || []); }

  return (
    <div className="recipe-card recipe-card--ai">
      <button className="recipe-card-header" onClick={() => onToggle(key)}>
        <div className="ai-recipe-icon">✨</div>
        <div className="recipe-info">
          <span className="recipe-name">{recipe.name}</span>
          <span className="recipe-meta">{recipe.description}</span>
        </div>
        <button className="btn-save-recipe" onClick={e => { e.stopPropagation(); handleSave(); }} title={saved ? "Unsave" : "Save"}>
          {saved ? "❤️" : "🤍"}
        </button>
        <span className="recipe-chevron">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="recipe-details">
          <h4 className="recipe-detail-heading">Ingredients You Have</h4>
          <ul className="recipe-ingredients">
            {(recipe.usedIngredients || []).map((ing, i) => (
              <li key={i} className="recipe-ingredient recipe-ingredient--owned">
                <span className="recipe-ing-marker">✓</span><span>{ing}</span>
              </li>
            ))}
          </ul>
          {recipe.extraIngredients?.length > 0 && (
            <>
              <h4 className="recipe-detail-heading">Also Needed</h4>
              <ul className="recipe-ingredients">
                {recipe.extraIngredients.map((ing, i) => (
                  <li key={i} className="recipe-ingredient recipe-ingredient--missing">
                    <span className="recipe-ing-marker">+</span><span>{ing}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h4 className="recipe-detail-heading">Steps</h4>
          <ol className="ai-recipe-steps">{(recipe.steps || []).map((step, i) => <li key={i}>{step}</li>)}</ol>
          <div className="recipe-card-footer">
            <a href={ytUrl} target="_blank" rel="noopener noreferrer" className="btn-youtube">▶ Watch on YouTube</a>
            {recipe.extraIngredients?.length > 0 && <AddToListButton onAdd={onAddToList} />}
            <CookItButton onCook={handleCook} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shared sub-components ────────────────────────────────── */
function AddToListButton({ onAdd }) {
  const [added, setAdded] = useState(false);
  function handle() { onAdd(); setAdded(true); setTimeout(() => setAdded(false), 1500); }
  return (
    <button className={`btn-add-to-list${added ? " btn-add-to-list--done" : ""}`} onClick={handle}>
      {added ? "✓ Added!" : "+ Shopping List"}
    </button>
  );
}

function CookItButton({ onCook }) {
  const [state, setState] = useState("idle");
  const [count, setCount] = useState(0);
  async function handle() {
    setState("loading");
    try {
      const c = await onCook();
      setCount(c || 0);
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("idle");
    }
  }
  return (
    <button
      className={`btn-cooked${state === "done" ? " btn-cooked--done" : ""}`}
      onClick={handle}
      disabled={state === "loading"}
    >
      {state === "idle"    && "👨‍🍳 I cooked this!"}
      {state === "loading" && "Updating…"}
      {state === "done"    && `✓ Updated ${count} item${count !== 1 ? "s" : ""}!`}
    </button>
  );
}
