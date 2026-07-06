"""
Ingredient normalization for PantryPilot.

Three lookup tables — edit these freely as your pantry grows:

  ALIAS_MAP         alias (lowercase) → canonical Title-Case name
  DEFAULT_UNITS     canonical name (lowercase) → preferred unit
  NON_RECIPE_ITEMS  canonical names (lowercase) that should not be sent to
                    recipe APIs (e.g. plain water)

How to add a new alias:
  Add one line to ALIAS_MAP:  "my weird name": "Canonical Name"

How to add a new default unit:
  Add one line to DEFAULT_UNITS:  "canonical name": "g"  (or ml / tsp / pcs)

How to mark something as non-recipe:
  Add its lowercase canonical name to NON_RECIPE_ITEMS.
"""

# ---------------------------------------------------------------------------
# Alias map  (all keys must be lowercase)
# ---------------------------------------------------------------------------

ALIAS_MAP: dict[str, str] = {
    # ── Water variants ──────────────────────────────────────────────────────
    "purified water":         "Water",
    "purified drinking water":"Water",
    "drinking water":         "Water",
    "mineral water":          "Water",
    "spring water":           "Water",
    "sparkling water":        "Water",
    "distilled water":        "Water",
    "tap water":              "Water",
    "bottled water":          "Water",
    "filtered water":         "Water",

    # ── Pepper ──────────────────────────────────────────────────────────────
    "black pepper ground":    "Black Pepper",
    "ground black pepper":    "Black Pepper",
    "ground pepper":          "Black Pepper",
    "pepper, ground":         "Black Pepper",

    # ── Eggs ────────────────────────────────────────────────────────────────
    "egg":                    "Eggs",
    "large egg":              "Eggs",
    "large eggs":             "Eggs",
    "egg, large":             "Eggs",

    # ── Butter ──────────────────────────────────────────────────────────────
    "unsalted butter":        "Butter",
    "salted butter":          "Butter",
    "sweet cream butter":     "Butter",

    # ── Garlic ──────────────────────────────────────────────────────────────
    "garlic clove":           "Garlic",
    "garlic cloves":          "Garlic",
    "garlic, minced":         "Garlic",
    "minced garlic":          "Garlic",

    # ── Onion ───────────────────────────────────────────────────────────────
    "yellow onion":           "Onion",
    "white onion":            "Onion",
    "brown onion":            "Onion",

    # ── Chicken ─────────────────────────────────────────────────────────────
    "chicken, breast":                    "Chicken Breast",
    "boneless chicken breast":            "Chicken Breast",
    "boneless skinless chicken breast":   "Chicken Breast",
    "chicken breast, boneless":           "Chicken Breast",

    # ── Steak ───────────────────────────────────────────────────────────────
    "beef steak":             "Steak",
    "sirloin":                "Steak",
    "sirloin steak":          "Steak",
    "ribeye":                 "Steak",
    "ribeye steak":           "Steak",

    # ── Milk ────────────────────────────────────────────────────────────────
    "whole milk":             "Milk",
    "skim milk":              "Milk",
    "2% milk":                "Milk",
    "low fat milk":           "Milk",
    "fat free milk":          "Milk",
    "low-fat milk":           "Milk",
}

# ---------------------------------------------------------------------------
# Default units  (keys must be lowercase canonical names)
# ---------------------------------------------------------------------------

DEFAULT_UNITS: dict[str, str] = {
    # Liquids → ml
    "water":          "ml",
    "milk":           "ml",
    "cream":          "ml",
    "heavy cream":    "ml",
    "olive oil":      "ml",
    "vegetable oil":  "ml",
    "oil":            "ml",
    "orange juice":   "ml",
    "soy sauce":      "ml",
    "vinegar":        "ml",
    "fish sauce":     "ml",
    "coconut milk":   "ml",
    "broth":          "ml",
    "stock":          "ml",
    "chicken broth":  "ml",
    "beef broth":     "ml",

    # Weight → g
    "cheese":          "g",
    "butter":          "g",
    "flour":           "g",
    "sugar":           "g",
    "salt":            "g",
    "rice":            "g",
    "pasta":           "g",
    "chicken breast":  "g",
    "chicken thigh":   "g",
    "ground beef":     "g",
    "beef":            "g",
    "pork":            "g",
    "salmon":          "g",
    "shrimp":          "g",
    "yogurt":          "g",
    "steak":           "g",

    # Spices → tsp
    "black pepper":    "tsp",
    "cinnamon":        "tsp",
    "cumin":           "tsp",
    "paprika":         "tsp",
    "garlic powder":   "tsp",
    "onion powder":    "tsp",
    "oregano":         "tsp",
    "basil":           "tsp",
    "thyme":           "tsp",
    "rosemary":        "tsp",
    "turmeric":        "tsp",
    "chili powder":    "tsp",
    "baking powder":   "tsp",
    "baking soda":     "tsp",

    # Countable → pcs (explicit, avoids ambiguity)
    "eggs":            "pcs",
    "apple":           "pcs",
    "banana":          "pcs",
    "orange":          "pcs",
    "lemon":           "pcs",
    "lime":            "pcs",
    "tomato":          "pcs",
    "potato":          "pcs",
    "onion":           "pcs",
    "garlic":          "pcs",
    "avocado":         "pcs",
    "bell pepper":     "pcs",
    "carrot":          "pcs",
    "strawberry":      "pcs",
    "raspberry":       "pcs",
    "blueberry":       "pcs",
    "cherry":          "pcs",
    "mango":           "pcs",
    "pear":            "pcs",
    "peach":           "pcs",
    "watermelon":      "pcs",
}

# ---------------------------------------------------------------------------
# Items whose canonical name (lowercase) should NOT be sent to recipe APIs.
# They are valid pantry items (you do store water at home) but meaningless
# for recipe matching — every recipe "uses" water.
# ---------------------------------------------------------------------------

NON_RECIPE_ITEMS: set[str] = {
    "water",
}

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def normalize(raw_name: str) -> tuple[str, str | None, bool]:
    """
    Given a raw ingredient name, return:
      (canonical_name, suggested_unit | None, exclude_from_recipes)

    suggested_unit is None when no default is defined; the caller should
    keep whatever unit the user provided.

    Rules applied in order:
      1. Strip whitespace + lower-case for lookup.
      2. Resolve alias → canonical name.
         If no alias exists, Title-Case the stripped input.
      3. Look up suggested unit from DEFAULT_UNITS (uses canonical lower-case).
      4. Check NON_RECIPE_ITEMS (uses canonical lower-case).
    """
    if not raw_name:
        return "", None, False

    key = raw_name.strip().lower()
    canonical = ALIAS_MAP.get(key) or _title_case(raw_name.strip())
    suggested_unit = DEFAULT_UNITS.get(canonical.lower())
    exclude = canonical.lower() in NON_RECIPE_ITEMS
    return canonical, suggested_unit, exclude


def _title_case(s: str) -> str:
    """Title-case but preserve ALL-CAPS abbreviations (e.g. 'BBQ')."""
    return " ".join(
        word if word.isupper() and len(word) > 1 else word.capitalize()
        for word in s.split()
    )
