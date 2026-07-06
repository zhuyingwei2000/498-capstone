from datetime import datetime, timezone

from app import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    # Only the hash is stored -- never the plaintext password.
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    pantry_items = db.relationship("PantryItem", backref="owner", lazy=True, cascade="all, delete-orphan")


class PantryItem(db.Model):
    __tablename__ = "pantry_items"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    quantity = db.Column(db.Float, nullable=False, default=1.0)
    unit = db.Column(db.String(50), nullable=False, default="pcs")
    # Optional — not all items have a known expiry date.
    expiry_date = db.Column(db.Date, nullable=True)
    category = db.Column(db.String(100), nullable=True)
    # When True this item is stored in the pantry but excluded from recipe
    # matching (e.g. plain drinking water — every recipe "uses" it).
    # Set automatically by normalization; user can flip it via the UI.
    exclude_from_recipes = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "quantity": self.quantity,
            "unit": self.unit,
            "expiry_date": self.expiry_date.isoformat() if self.expiry_date else None,
            "category": self.category,
            "exclude_from_recipes": self.exclude_from_recipes,
        }
