import json
import os
import re

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

suggest_bp = Blueprint("suggest", __name__, url_prefix="/api/suggest")

PROMPT = """\
You are a creative chef. Given these available ingredients: {ingredients}

Suggest exactly 3 recipes. Return ONLY a raw JSON array with no markdown or explanation.
Each object must have:
  "name": string (short recipe name)
  "description": string (one sentence, mouth-watering)
  "usedIngredients": string[] (subset of the provided ingredients actually used)
  "extraIngredients": string[] (up to 3 common pantry staples needed beyond what's provided)
  "steps": string[] (4-6 concise cooking steps)
  "youtubeQuery": string (best YouTube search query to find a tutorial for this exact recipe)
"""


@suggest_bp.post("/recipes")
@jwt_required()
def suggest_recipes():
    data = request.get_json(silent=True) or {}
    ingredients = [str(i).strip() for i in data.get("ingredients", []) if i]
    if not ingredients:
        return jsonify({"error": "ingredients required"}), 400

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return jsonify({"error": "GROQ_API_KEY not configured"}), 500

    try:
        from groq import Groq

        client = Groq(api_key=api_key)
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "user",
                    "content": PROMPT.format(ingredients=", ".join(ingredients)),
                }
            ],
            max_tokens=2048,
        )

        raw = completion.choices[0].message.content.strip()
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if not match:
            return jsonify({"recipes": []}), 200

        recipes = json.loads(match.group())
        return jsonify({"recipes": recipes}), 200

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
