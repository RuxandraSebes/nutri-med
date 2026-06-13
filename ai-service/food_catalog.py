"""
Approved food catalog for meal-matrix generation.
Values are per 100 g; matrix code scales by portion_g / 100.
"""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path

_CATALOG_PATH = Path(__file__).resolve().parent / "data" / "food_catalog_per_100g.json"
_CATEGORY_LABELS = {
    "animal_proteins": "ANIMAL PROTEINS",
    "vegetables": "VEGETABLES",
    "fruits": "FRUITS",
    "dairy": "DAIRY",
    "grains": "GRAINS",
}


def _norm_key(name: str) -> str:
    return re.sub(r"\s+", " ", str(name or "").strip().lower())


@lru_cache(maxsize=1)
def load_catalog() -> dict:
    with open(_CATALOG_PATH, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def build_lookup() -> dict[str, dict]:
    lookup: dict[str, dict] = {}
    for category, items in load_catalog().items():
        for item in items:
            entry = {**item, "category": category}
            lookup[_norm_key(item["name"])] = entry
            short = re.sub(r"\s*\([^)]*\)", "", item["name"]).strip()
            if short:
                lookup.setdefault(_norm_key(short), entry)
    return lookup


def resolve_food(name: str) -> dict | None:
    return build_lookup().get(_norm_key(name))


def all_catalog_names() -> list[str]:
    names: list[str] = []
    for items in load_catalog().values():
        for item in items:
            names.append(item["name"])
    return names


def macros_for_portion(entry: dict, portion_g: float) -> dict[str, float]:
    ratio = float(portion_g) / 100.0
    return {
        "kcal": round(float(entry["calories"]) * ratio, 2),
        "protein_g": round(float(entry.get("protein_g", 0) or 0) * ratio, 2),
        "carbs_g": round(float(entry.get("carbs_g", 0) or 0) * ratio, 2),
        "fat_g": round(float(entry.get("fat_g", 0) or 0) * ratio, 2),
    }


def catalog_rules_prompt_block() -> str:
    return """FOOD CATALOG RULES (mandatory):
- Use ONLY ingredients listed in the APPROVED FOOD CATALOG below.
- Copy each food "name" EXACTLY as shown in the catalog (same spelling and capitalization).
- For each ingredient: kcal = catalog.calories × (portion_g / 100); scale protein_g, carbs_g, fat_g the same way.
- Do not invent foods outside the catalog. Combine 2–3 catalog items per meal to reach the patient's daily goal."""


def catalog_rules_compact_block() -> str:
    return """FOOD CATALOG (mandatory):
- Use ONLY exact catalog names below.
- Each meal: exactly 2 catalog foods with portion_g (grams). Do NOT output kcal/macros — the server computes them.
- Each catalog food may appear at most once in the entire 7-day plan."""


def format_catalog_compact() -> str:
    """One line per category — smaller/faster LLM prompts."""
    lines = ["APPROVED FOODS (kcal per 100g):"]
    for category, label in _CATEGORY_LABELS.items():
        items = load_catalog().get(category) or []
        if not items:
            continue
        parts = [f"{i['name']} ({int(i['calories'])})" for i in items]
        lines.append(f"{label}: " + ", ".join(parts))
    return "\n".join(lines)


def format_catalog_for_prompt(max_chars: int = 14000) -> str:
    lines = [
        "APPROVED FOOD CATALOG (nutrition per 100 g — kcal | protein_g | carbs_g | fat_g):",
    ]
    for category, label in _CATEGORY_LABELS.items():
        items = load_catalog().get(category) or []
        if not items:
            continue
        lines.append(f"\n{label}:")
        for item in items:
            fat = item.get("fat_g", 0) or 0
            lines.append(
                f"  · {item['name']}: {item['calories']} kcal | "
                f"P {item.get('protein_g', 0)}g | C {item.get('carbs_g', 0)}g | F {fat}g"
            )
    text = "\n".join(lines)
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 40] + "\n… [food catalog truncated]\n"


def apply_catalog_macros_to_matrix(matrix: dict, meals: list[str]) -> None:
    """Recalculate kcal/macros from catalog using portion_g; normalize food names."""
    for day_obj in matrix.values():
        if not isinstance(day_obj, dict):
            continue
        for meal in meals:
            blk = day_obj.get(meal)
            if not isinstance(blk, dict):
                continue
            for f in blk.get("foods") or []:
                if not isinstance(f, dict):
                    continue
                entry = resolve_food(f.get("name", ""))
                if not entry:
                    continue
                portion = float(f.get("portion_g", 0) or 0)
                f["name"] = entry["name"]
                if portion > 0:
                    f.update(macros_for_portion(entry, portion))


def validate_matrix_foods_in_catalog(matrix: dict, meals: list[str], days: list[str]) -> None:
    for day in days:
        if day not in matrix:
            continue
        for meal in meals:
            for f in matrix[day][meal].get("foods") or []:
                name = str(f.get("name", "") or "").strip()
                if not name:
                    raise ValueError(f"{day}/{meal}: missing food name.")
                if resolve_food(name) is None:
                    raise ValueError(
                        f"{day}/{meal}: {name!r} is not in the approved food catalog — "
                        "use an exact catalog name.",
                    )
