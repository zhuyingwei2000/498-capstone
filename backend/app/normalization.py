"""
Ingredient normalization for PantryPilot.

Two lookup tables — edit these freely as your pantry grows:

  ALIAS_MAP         alias (lowercase) → canonical Title-Case name
  NON_RECIPE_ITEMS  canonical names (lowercase) excluded from recipe APIs

How to add a new alias:
  "my weird name": "Canonical Name"

How to mark something as non-recipe:
  Add its lowercase canonical name to NON_RECIPE_ITEMS.
"""

# ---------------------------------------------------------------------------
# Alias map  (all keys must be lowercase)
# ---------------------------------------------------------------------------

ALIAS_MAP: dict[str, str] = {
    # ── Water variants ──────────────────────────────────────────────────────
    "purified water":                   "Water",
    "purified drinking water":          "Water",
    "drinking water":                   "Water",
    "mineral water":                    "Water",
    "spring water":                     "Water",
    "sparkling water":                  "Water",
    "distilled water":                  "Water",
    "tap water":                        "Water",
    "bottled water":                    "Water",
    "filtered water":                   "Water",

    # ── Pepper ──────────────────────────────────────────────────────────────
    "black pepper ground":              "Black Pepper",
    "ground black pepper":              "Black Pepper",
    "ground pepper":                    "Black Pepper",
    "pepper, ground":                   "Black Pepper",

    # ── Eggs ────────────────────────────────────────────────────────────────
    "egg":                              "Eggs",
    "large egg":                        "Eggs",
    "large eggs":                       "Eggs",
    "egg, large":                       "Eggs",

    # ── Butter ──────────────────────────────────────────────────────────────
    "unsalted butter":                  "Butter",
    "salted butter":                    "Butter",
    "sweet cream butter":               "Butter",

    # ── Garlic ──────────────────────────────────────────────────────────────
    "garlic clove":                     "Garlic",
    "garlic cloves":                    "Garlic",
    "garlic, minced":                   "Garlic",
    "minced garlic":                    "Garlic",

    # ── Onion ───────────────────────────────────────────────────────────────
    "yellow onion":                     "Onion",
    "white onion":                      "Onion",
    "brown onion":                      "Onion",

    # ── Chicken ─────────────────────────────────────────────────────────────
    "chicken, breast":                  "Chicken Breast",
    "boneless chicken breast":          "Chicken Breast",
    "boneless skinless chicken breast": "Chicken Breast",
    "chicken breast, boneless":         "Chicken Breast",

    # ── Steak ───────────────────────────────────────────────────────────────
    "beef steak":                       "Steak",
    "sirloin":                          "Steak",
    "sirloin steak":                    "Steak",
    "ribeye":                           "Steak",
    "ribeye steak":                     "Steak",

    # ── Milk ────────────────────────────────────────────────────────────────
    "whole milk":                       "Milk",
    "skim milk":                        "Milk",
    "2% milk":                          "Milk",
    "low fat milk":                     "Milk",
    "fat free milk":                    "Milk",
    "low-fat milk":                     "Milk",
}

# ---------------------------------------------------------------------------
# Items whose canonical name (lowercase) should NOT be sent to recipe APIs.
# ---------------------------------------------------------------------------

NON_RECIPE_ITEMS: set[str] = {
    "water",
}

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def normalize(raw_name: str) -> tuple[str, bool]:
    """
    Given a raw ingredient name, return (canonical_name, exclude_from_recipes).

    Rules:
      1. Strip whitespace + lowercase for lookup.
      2. Resolve alias → canonical name.
         If no alias exists, Title-Case the stripped input.
      3. Check NON_RECIPE_ITEMS.
    """
    if not raw_name:
        return "", False

    key = raw_name.strip().lower()
    canonical = ALIAS_MAP.get(key) or _title_case(raw_name.strip())
    exclude = canonical.lower() in NON_RECIPE_ITEMS
    return canonical, exclude


def _title_case(s: str) -> str:
    """Title-case but preserve ALL-CAPS abbreviations (e.g. 'BBQ')."""
    return " ".join(
        word if word.isupper() and len(word) > 1 else word.capitalize()
        for word in s.split()
    )
