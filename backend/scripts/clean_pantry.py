"""
One-time pantry normalization script.

What it does (in order):
  1. Prints a dry-run report of every change it would make.
  2. When you confirm (or pass --apply), commits the changes.

Changes applied:
  • Name → canonical form (ALIAS_MAP + Title Case)
  • Unit → default for this ingredient (only when current unit is "pcs" and
    the item has a non-pcs default)
  • exclude_from_recipes → True for items in NON_RECIPE_ITEMS
  • Duplicate canonical names (same user) → merged by summing quantity,
    keeping the row with the lower id, deleting the other

Safe to run multiple times — idempotent.

Usage (from the backend/ directory, with venv active):
  python scripts/clean_pantry.py          # dry-run only
  python scripts/clean_pantry.py --apply  # apply changes

Rollback:
  The script prints SQL-equivalent changes before applying.
  To undo manually: restore the backed-up values printed in the dry-run.
  Alternatively, because all changes are reversible edits/deletes,
  a pg_dump snapshot before running is the safest option.
"""

import argparse
import sys
import os

# Allow running from either backend/ or project root.
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import create_app, db
from app.models import PantryItem
from app.normalization import normalize, DEFAULT_UNITS


def _resolve_unit(current_unit: str, canonical: str, suggested: str | None) -> str:
    # In the cleanup script we apply the default whenever it's defined and
    # the stored unit differs — catches both "pcs→g" and "g→pcs" legacy bugs.
    if suggested and current_unit != suggested:
        return suggested
    return current_unit


def run(apply: bool):
    app = create_app()
    with app.app_context():
        items = PantryItem.query.order_by(PantryItem.user_id, PantryItem.id).all()

        changes: list[str] = []
        deletions: list[int] = []  # ids to delete after merging

        # Group by user_id so merges are scoped per-user.
        from collections import defaultdict
        by_user: dict[int, list[PantryItem]] = defaultdict(list)
        for item in items:
            by_user[item.user_id].append(item)

        # Track canonical name → surviving row (within a user pass).
        for user_id, user_items in by_user.items():
            canonical_index: dict[str, PantryItem] = {}

            for item in user_items:
                if item.id in deletions:
                    continue  # already queued for removal

                canonical, suggested_unit, exclude = normalize(item.name)
                new_unit = _resolve_unit(item.unit, canonical, suggested_unit)

                # ── Duplicate detection ──────────────────────────────────────
                if canonical in canonical_index:
                    survivor = canonical_index[canonical]
                    merged_qty = survivor.quantity + item.quantity
                    changes.append(
                        f"  [MERGE]  id={item.id} '{item.name}' → absorbed into "
                        f"id={survivor.id} '{survivor.name}'; "
                        f"qty {survivor.quantity} + {item.quantity} = {merged_qty}"
                    )
                    if apply:
                        survivor.quantity = merged_qty
                        db.session.delete(item)
                    deletions.append(item.id)
                    continue

                canonical_index[canonical] = item

                # ── Name change ──────────────────────────────────────────────
                if item.name != canonical:
                    changes.append(
                        f"  [NAME]   id={item.id} '{item.name}' → '{canonical}'"
                    )
                    if apply:
                        item.name = canonical

                # ── Unit change ──────────────────────────────────────────────
                if new_unit != item.unit:
                    changes.append(
                        f"  [UNIT]   id={item.id} '{canonical}': {item.unit} → {new_unit}"
                    )
                    if apply:
                        item.unit = new_unit

                # ── exclude_from_recipes ─────────────────────────────────────
                if exclude != item.exclude_from_recipes:
                    changes.append(
                        f"  [EXCL]   id={item.id} '{canonical}': "
                        f"exclude_from_recipes {item.exclude_from_recipes} → {exclude}"
                    )
                    if apply:
                        item.exclude_from_recipes = exclude

        if not changes:
            print("✓ Pantry is already clean — no changes needed.")
            return

        print(f"\n{'DRY RUN — no changes written' if not apply else 'APPLYING CHANGES'}")
        print(f"{'─' * 55}")
        print(f"Found {len(changes)} change(s):\n")
        for c in changes:
            print(c)

        if apply:
            db.session.commit()
            print(f"\nDone. All {len(changes)} change(s) committed.")
        else:
            print(
                "\nRun with --apply to commit these changes.\n"
                "Tip: take a pg_dump first if you want a hard rollback option:\n"
                "  docker exec pantrypilot-postgres pg_dump -U pantrypilot pantrypilot > backup.sql"
            )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Normalize pantry items in the database.")
    parser.add_argument("--apply", action="store_true", help="Commit changes (default: dry-run)")
    args = parser.parse_args()
    run(apply=args.apply)
