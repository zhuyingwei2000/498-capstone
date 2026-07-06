from datetime import date

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.models import PantryItem
from app.normalization import normalize

pantry_bp = Blueprint("pantry", __name__, url_prefix="/api/pantry")


def _parse_expiry(value):
    """Return a date object or None; accepts YYYY-MM-DD or YYYY/M/D variants."""
    if not value:
        return None
    parts = value.replace("/", "-").replace(".", "-").split("-")
    if len(parts) != 3:
        raise ValueError(f"Invalid date '{value}'. Use YYYY-MM-DD format.")
    try:
        y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
    except ValueError:
        raise ValueError(f"Invalid date '{value}'. Use YYYY-MM-DD format.")
    return date(y, m, d)


def _resolve_unit(provided: str, canonical_name: str, suggested: str | None) -> str:
    """
    Apply the suggested default unit only when the caller sent "pcs" AND the
    item has a known non-pcs default — so intentional pcs items (eggs, apples)
    are never changed, and spices/liquids get a sensible unit automatically.
    """
    if suggested and suggested != "pcs" and provided == "pcs":
        return suggested
    return provided


@pantry_bp.get("")
@jwt_required()
def list_items():
    user_id = int(get_jwt_identity())
    items = PantryItem.query.filter_by(user_id=user_id).order_by(PantryItem.name).all()
    return jsonify([i.to_dict() for i in items])


@pantry_bp.post("")
@jwt_required()
def add_item():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    raw_name = (data.get("name") or "").strip()
    if not raw_name:
        return jsonify(error="name is required"), 400

    canonical, suggested_unit, exclude = normalize(raw_name)
    provided_unit = (data.get("unit") or "pcs").strip()
    unit = _resolve_unit(provided_unit, canonical, suggested_unit)

    try:
        quantity = float(data.get("quantity", 1))
        expiry = _parse_expiry(data.get("expiry_date"))
    except (ValueError, TypeError) as e:
        return jsonify(error=str(e)), 400

    # Auto-merge: if the user already has this canonical ingredient, add quantity.
    existing = PantryItem.query.filter_by(
        user_id=user_id, name=canonical
    ).first()
    if existing:
        existing.quantity += quantity
        db.session.commit()
        return jsonify(existing.to_dict()), 200

    # Allow caller to override exclude_from_recipes (e.g. clean-up script).
    if "exclude_from_recipes" in data:
        exclude = bool(data["exclude_from_recipes"])

    item = PantryItem(
        user_id=user_id,
        name=canonical,
        quantity=quantity,
        unit=unit,
        expiry_date=expiry,
        category=(data.get("category") or "").strip() or None,
        exclude_from_recipes=exclude,
    )
    db.session.add(item)
    db.session.commit()
    return jsonify(item.to_dict()), 201


@pantry_bp.put("/<int:item_id>")
@jwt_required()
def update_item(item_id):
    user_id = int(get_jwt_identity())
    item = PantryItem.query.filter_by(id=item_id, user_id=user_id).first_or_404()

    data = request.get_json(silent=True) or {}

    if "name" in data:
        raw_name = (data["name"] or "").strip()
        if not raw_name:
            return jsonify(error="name cannot be empty"), 400
        canonical, suggested_unit, exclude = normalize(raw_name)

        # If renaming to a name that already exists on another row → merge.
        duplicate = PantryItem.query.filter(
            PantryItem.user_id == user_id,
            PantryItem.name == canonical,
            PantryItem.id != item_id,
        ).first()
        if duplicate:
            duplicate.quantity += item.quantity
            db.session.delete(item)
            db.session.commit()
            return jsonify(duplicate.to_dict()), 200

        item.name = canonical
        # Update exclude flag only if it wasn't manually set.
        item.exclude_from_recipes = exclude

        if "unit" not in data:
            # Re-derive unit from new name if caller didn't specify.
            item.unit = _resolve_unit(item.unit, canonical, suggested_unit)

    if "quantity" in data:
        try:
            item.quantity = float(data["quantity"])
        except (ValueError, TypeError):
            return jsonify(error="quantity must be a number"), 400

    if "unit" in data:
        item.unit = (data["unit"] or "pcs").strip()

    if "expiry_date" in data:
        try:
            item.expiry_date = _parse_expiry(data["expiry_date"])
        except ValueError:
            return jsonify(error="expiry_date must be YYYY-MM-DD or null"), 400

    if "category" in data:
        item.category = (data["category"] or "").strip() or None

    if "exclude_from_recipes" in data:
        item.exclude_from_recipes = bool(data["exclude_from_recipes"])

    db.session.commit()
    return jsonify(item.to_dict())


@pantry_bp.delete("/<int:item_id>")
@jwt_required()
def delete_item(item_id):
    user_id = int(get_jwt_identity())
    item = PantryItem.query.filter_by(id=item_id, user_id=user_id).first_or_404()
    db.session.delete(item)
    db.session.commit()
    return "", 204
