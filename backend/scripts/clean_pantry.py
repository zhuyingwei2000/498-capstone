"""
Pantry normalization script.

Changes applied:
  - Name → canonical form (ALIAS_MAP + Title Case)
  - exclude_from_recipes → set from NON_RECIPE_ITEMS
  - Duplicate canonical names (same user) → merged by summing quantity,
    keeping the row with the lower id

Safe to run multiple times — idempotent.

Usage (from the backend/ directory, with venv active):
  python scripts/clean_pantry.py          # dry-run
  python scripts/clean_pantry.py --apply  # commit changes

Rollback:
  docker exec pantrypilot-postgres pg_dump -U pantrypilot pantrypilot > backup.sql
  (take a snapshot before --apply if you need a hard rollback option)
"""

import argparse
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import create_app, db
from app.models import PantryItem
from app.normalization import normalize


def run(apply: bool):
    app = create_app()
    with app.app_context():
        items = PantryItem.query.order_by(PantryItem.user_id, PantryItem.id).all()

        changes: list[str] = []
        deletion_ids: set[int] = set()

        by_user: dict[int, list[PantryItem]] = defaultdict(list)
        for item in items:
            by_user[item.user_id].append(item)

        for user_id, user_items in by_user.items():
            canonical_index: dict[str, PantryItem] = {}

            for item in user_items:
                if item.id in deletion_ids:
                    continue

                canonical, exclude = normalize(item.name)

                # ── Duplicate detection ──────────────────────────────────────
                if canonical in canonical_index:
                    survivor = canonical_index[canonical]
                    merged_qty = survivor.quantity + item.quantity
                    changes.append(
                        f"  [MERGE]  id={item.id} '{item.name}' → "
                        f"absorbed into id={survivor.id} '{survivor.name}'; "
                        f"qty {survivor.quantity} + {item.quantity} = {merged_qty}"
                    )
                    if apply:
                        survivor.quantity = merged_qty
                        db.session.delete(item)
                    deletion_ids.add(item.id)
                    continue

                canonical_index[canonical] = item

                # ── Name change ──────────────────────────────────────────────
                if item.name != canonical:
                    changes.append(f"  [NAME]   id={item.id} '{item.name}' -> '{canonical}'")
                    if apply:
                        item.name = canonical

                # ── exclude_from_recipes ─────────────────────────────────────
                if exclude != item.exclude_from_recipes:
                    changes.append(
                        f"  [EXCL]   id={item.id} '{canonical}': "
                        f"exclude_from_recipes {item.exclude_from_recipes} -> {exclude}"
                    )
                    if apply:
                        item.exclude_from_recipes = exclude

        if not changes:
            print("Pantry is already clean - no changes needed.")
            return

        label = "APPLYING CHANGES" if apply else "DRY RUN - no changes written"
        print(f"\n{label}")
        print("-" * 55)
        print(f"Found {len(changes)} change(s):\n")
        for c in changes:
            print(c)

        if apply:
            db.session.commit()
            print(f"\nDone. {len(changes)} change(s) committed.")
        else:
            print(
                "\nRun with --apply to commit these changes.\n"
                "Tip: take a snapshot first:\n"
                "  docker exec pantrypilot-postgres pg_dump -U pantrypilot pantrypilot > backup.sql"
            )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    run(apply=args.apply)
