import os

import requests as http
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

recipes_bp = Blueprint("recipes", __name__, url_prefix="/api/recipes")

BASE = "https://api.spoonacular.com"


def _key():
    return os.environ.get("SPOONACULAR_API_KEY", "")


@recipes_bp.post("/search")
@jwt_required()
def search_recipes():
    data = request.get_json(silent=True) or {}
    ingredients = [i.strip() for i in data.get("ingredients", []) if i]
    if not ingredients:
        return jsonify({"error": "ingredients required"}), 400

    try:
        resp = http.get(
            f"{BASE}/recipes/findByIngredients",
            params={
                "apiKey": _key(),
                "ingredients": ",+".join(ingredients),
                "number": 12,
                "ranking": 1,       # maximise used ingredients
                "ignorePantry": True,
            },
            timeout=10,
        )
        resp.raise_for_status()
        meals = resp.json()

        # Sort by most ingredients used, then fewest missing.
        meals.sort(key=lambda m: (-m.get("usedIngredientCount", 0), m.get("missedIngredientCount", 99)))

        matches = meals[:8]

        # "Add one more" = exactly 1 missing ingredient, not already in main list.
        match_ids = {m["id"] for m in matches}
        suggestions = [
            {"meal": m, "missing": m["missedIngredients"][0]["name"]}
            for m in meals
            if m.get("missedIngredientCount") == 1
            and m.get("missedIngredients")
            and m["id"] not in match_ids
        ][:3]

        return jsonify({"exact": matches, "suggestions": suggestions}), 200

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@recipes_bp.get("/<int:recipe_id>")
@jwt_required()
def get_recipe(recipe_id):
    try:
        resp = http.get(
            f"{BASE}/recipes/{recipe_id}/information",
            params={"apiKey": _key(), "includeNutrition": False},
            timeout=10,
        )
        resp.raise_for_status()
        return jsonify(resp.json()), 200

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
