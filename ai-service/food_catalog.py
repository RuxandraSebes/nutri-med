from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

_CATALOG_PATH = Path(__file__).resolve().parent / "data" / "food_catalog_per_100g.json"

_CATEGORY_TO_ROLE = {
    "animal_proteins": "protein",
    "grains": "carb",
    "fruits": "fruit",
    "vegetables": "vegetable",
    "fats": "fat",
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


def food_category(name: str) -> str | None:
    entry = resolve_food(name)
    if not entry:
        return None
    return str(entry.get("category") or "")


def catalog_food_records() -> list[dict]:
    records: list[dict] = []
    for category, items in load_catalog().items():
        for item in items:
            if category == "dairy":
                role = "protein" if float(item.get("protein_g", 0) or 0) >= 8 else "fat"
            else:
                role = _CATEGORY_TO_ROLE.get(category, "carb")
            records.append(
                {
                    "name": item["name"],
                    "kcal": float(item.get("calories", 0) or 0),
                    "protein_g": float(item.get("protein_g", 0) or 0),
                    "carbs_g": float(item.get("carbs_g", 0) or 0),
                    "fat_g": float(item.get("fat_g", 0) or 0),
                    "macro_role": role,
                    "source": "catalog",
                }
            )
    return records


def macros_for_portion(entry: dict, portion_g: float) -> dict[str, float]:
    ratio = float(portion_g) / 100.0
    return {
        "kcal": round(float(entry["calories"]) * ratio, 2),
        "protein_g": round(float(entry.get("protein_g", 0) or 0) * ratio, 2),
        "carbs_g": round(float(entry.get("carbs_g", 0) or 0) * ratio, 2),
        "fat_g": round(float(entry.get("fat_g", 0) or 0) * ratio, 2),
    }
