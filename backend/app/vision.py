import base64
import json
import os
import re

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

vision_bp = Blueprint("vision", __name__, url_prefix="/api/vision")

VALID_CATEGORIES = {
    "Vegetables", "Fruits", "Meat & Seafood", "Dairy & Eggs",
    "Grains & Bread", "Condiments & Spices", "Beverages", "Snacks", "Other",
}

FOOD_PHOTO_PROMPT = (
    "You are a pantry tracker assistant. Look carefully at this photo and identify "
    "every visible food item or ingredient — fresh produce, packaged goods, drinks, "
    "condiments, etc. Do NOT include non-food items (utensils, packaging material, etc.). "
    "Return ONLY a raw JSON array with no markdown, code fences, or explanation. "
    "Each element must have: "
    '"name" (string, short common name e.g. "Eggs", "Milk", "Broccoli"), '
    '"quantity" (number, estimate visible quantity, default 1), '
    '"unit" (string: "pcs", "L", "kg", "g", "oz", "lb", "pack" — pick the most natural), '
    '"category" (one of: Vegetables, Fruits, Meat & Seafood, Dairy & Eggs, Grains & Bread, '
    "Condiments & Spices, Beverages, Snacks, Other). "
    "If you cannot identify any food items, return []."
)


@vision_bp.post("/scan")
@jwt_required()
def scan_food_photo():
    data = request.get_json(silent=True) or {}
    image_b64 = data.get("image")
    if not image_b64:
        return jsonify({"error": "image is required"}), 400

    # Strip data-URL prefix if present (e.g. "data:image/jpeg;base64,...")
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "GEMINI_API_KEY not configured on server"}), 500

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        image_bytes = base64.b64decode(image_b64)
        image_part = types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")

        response = client.models.generate_content(
            model="gemini-flash-latest",
            contents=[FOOD_PHOTO_PROMPT, image_part],
        )
        raw = response.text.strip()

        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if not match:
            return jsonify({"items": []}), 200

        parsed = json.loads(match.group())
        items = []
        for item in parsed:
            if not isinstance(item, dict) or not item.get("name"):
                continue
            category = item.get("category")
            unit = item.get("unit", "pcs")
            items.append({
                "name": str(item["name"]).strip(),
                "quantity": float(item["quantity"]) if item.get("quantity") else 1.0,
                "unit": unit if unit in ("pcs", "L", "kg", "g", "oz", "lb", "pack") else "pcs",
                "category": category if category in VALID_CATEGORIES else "Other",
            })

        return jsonify({"items": items}), 200

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
