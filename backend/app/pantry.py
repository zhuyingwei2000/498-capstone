from datetime import date

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.models import PantryItem

pantry_bp = Blueprint("pantry", __name__, url_prefix="/api/pantry")


def _parse_expiry(value):
    """Return a date object or None; raise ValueError on bad format."""
    if not value:
        return None
    return date.fromisoformat(value)  # expects "YYYY-MM-DD"


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

    name = (data.get("name") or "").strip()
    if not name:
        return jsonify(error="name is required"), 400

    try:
        quantity = float(data.get("quantity", 1))
        expiry = _parse_expiry(data.get("expiry_date"))
    except (ValueError, TypeError) as e:
        return jsonify(error=str(e)), 400

    item = PantryItem(
        user_id=user_id,
        name=name,
        quantity=quantity,
        unit=(data.get("unit") or "pcs").strip(),
        expiry_date=expiry,
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
        name = (data["name"] or "").strip()
        if not name:
            return jsonify(error="name cannot be empty"), 400
        item.name = name
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
