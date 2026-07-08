from __future__ import annotations

import re

from food_catalog import catalog_food_records, food_category
from portion_rules import apply_portion_rules_to_food
from matrix_constants import (
    DAYS,
    MEALS,
    MAIN_MEAL_ROLES,
    WEEKLY_FOOD_MAX_APPEARANCES,
    FAT_WEEKLY_FOOD_MAX_APPEARANCES,
)
from matrix_json import _normalize_food_item

SNACK_MAX_KCAL_PER_100G = 150.0

def _weekly_cap_for_role(role: str) -> int:
    return FAT_WEEKLY_FOOD_MAX_APPEARANCES if role == "fat" else WEEKLY_FOOD_MAX_APPEARANCES

def _build_food_pool(rag_records: list[dict] | None) -> tuple[dict[str, dict], dict[str, list[dict]]]:
    records = list(rag_records) if rag_records else catalog_food_records()

    pool_by_name: dict[str, dict] = {}
    for rec in records:
        key = _norm_food_name(rec.get("name", ""))
        if key and key not in pool_by_name:
            pool_by_name[key] = rec

    all_records = list(pool_by_name.values())
    by_role: dict[str, list[dict]] = {"protein": [], "carb": [], "vegetable": [], "fruit": [], "fat": []}
    for rec in all_records:
        role = rec.get("macro_role")
        if role in by_role:
            by_role[role].append(rec)

    role_pools: dict[str, list[dict]] = {
        "protein": by_role["protein"],
        "carb": by_role["carb"],
        "vegetable": by_role["vegetable"],
        "fat": by_role["fat"],
        "fruit": by_role["fruit"],
        "snack": (
            by_role["fruit"]
            + [r for r in by_role["protein"] if float(r.get("kcal", 0) or 0) <= SNACK_MAX_KCAL_PER_100G]
            + by_role["vegetable"]
        ),
    }

    return pool_by_name, role_pools

_BREAKFAST_FOOD_RE = re.compile(
    r"\begg|cheese|yogurt|yoghurt|cottage|ricotta|feta|mozzarella|paneer|quark|skyr|"
    r"\bmilk\b|kefir|\boat|granola|muesli|cereal|cornflake|bran\b|"
    r"tomato|cucumber|\bpepper\b|bell pepper|mushroom|spinach|avocado|"
    r"toast|bagel|english muffin|pancake|waffle",
    re.IGNORECASE,
)

def _is_breakfast_food(name: str) -> bool:
    return bool(_BREAKFAST_FOOD_RE.search(str(name or "")))

def _role_pools_for_meal(role_pools: dict[str, list[dict]], meal: str) -> dict[str, list[dict]]:
    if meal != "Breakfast":
        return role_pools
    reordered: dict[str, list[dict]] = {}
    for role, pool in role_pools.items():
        preferred = [r for r in pool if _is_breakfast_food(r["name"])]
        rest = [r for r in pool if not _is_breakfast_food(r["name"])]
        reordered[role] = preferred + rest
    carb_with_fruit = reordered.get("carb", []) + role_pools.get("fruit", [])
    preferred = [r for r in carb_with_fruit if _is_breakfast_food(r["name"])]
    rest = [r for r in carb_with_fruit if not _is_breakfast_food(r["name"])]
    reordered["carb"] = preferred + rest
    return reordered

def _build_indexed_candidate_pool(rag_records: list[dict]) -> tuple[dict[int, dict], str]:
    by_role: dict[str, list[dict]] = {"protein": [], "carb": [], "vegetable": [], "fruit": [], "fat": []}
    seen_names: set[str] = set()
    unique_records: list[dict] = []
    for rec in rag_records:
        key = _norm_food_name(rec.get("name", ""))
        role = rec.get("macro_role")
        if not key or role not in by_role or key in seen_names:
            continue
        seen_names.add(key)
        unique_records.append(rec)
        by_role[role].append(rec)

    name_to_id: dict[str, int] = {}
    id_to_record: dict[int, dict] = {}
    for i, rec in enumerate(unique_records, start=1):
        id_to_record[i] = rec
        name_to_id[_norm_food_name(rec["name"])] = i

    def fmt(records: list[dict]) -> str:
        if not records:
            return "none retrieved"
        return ", ".join(
            f"[{name_to_id[_norm_food_name(r['name'])]}] {r['name']}"
            + (" (breakfast-friendly)" if _is_breakfast_food(r["name"]) else "")
            for r in records
        )

    carb_and_fruit = by_role["carb"] + by_role["fruit"]
    snack_candidates = (by_role["fruit"] + by_role["vegetable"])[:12]

    lines = [
        "=== AVAILABLE FOODS (pick by ID number only, e.g. 7 - never write a food name) ===",
        "PROTEIN SOURCES: " + fmt(by_role["protein"]),
        "CARB SOURCES (grains/fruit): " + fmt(carb_and_fruit),
        "VEGETABLES: " + fmt(by_role["vegetable"]),
        "FATS (small amounts - oils, nuts, seeds, avocado): " + fmt(by_role["fat"]),
        "SNACK OPTIONS (1-2 items): " + fmt(snack_candidates),
        "=== END OF AVAILABLE FOODS ===",
    ]
    return id_to_record, "\n".join(lines)

def _extract_food_id(entry) -> int | None:
    if isinstance(entry, bool):
        return None
    if isinstance(entry, (int, float)):
        return int(entry)
    if isinstance(entry, str) and entry.strip().lstrip("-").isdigit():
        return int(entry.strip())
    if isinstance(entry, dict):
        for key in ("id", "food_id", "ID"):
            if key in entry:
                return _extract_food_id(entry[key])
    return None

def _resolve_ids_to_foods(matrix: dict, id_to_record: dict[int, dict]) -> None:
    for day_obj in matrix.values():
        if not isinstance(day_obj, dict):
            continue
        for meal, blk in day_obj.items():
            if meal == "day_total_kcal" or not isinstance(blk, dict):
                continue
            raw_foods = blk.get("foods")
            if not isinstance(raw_foods, list):
                blk["foods"] = []
                continue
            resolved = []
            for entry in raw_foods:
                food_id = _extract_food_id(entry)
                record = id_to_record.get(food_id) if food_id is not None else None
                if record:
                    resolved.append(
                        {
                            "name": record["name"],
                            "macro_role": record.get("macro_role"),
                            "portion_g": _default_portion_for_role(str(record.get("macro_role") or "")),
                        },
                    )
                else:
                    resolved.append(
                        {
                            "name": f"unresolved-id-{food_id}",
                            "portion_g": _default_portion_for_role("carb"),
                            "kcal": 0.0,
                            "protein_g": 0.0,
                            "carbs_g": 0.0,
                            "fat_g": 0.0,
                        },
                    )
            blk["foods"] = resolved

def _norm_food_name(name: str) -> str:
    return re.sub(r"\s+", " ", str(name or "").strip().lower())

def _food_is_resolvable(item: dict, pool_by_name: dict[str, dict] | None) -> bool:
    if not pool_by_name:
        return True
    if _norm_food_name(item.get("name", "")) in pool_by_name:
        return True
    return float(item.get("kcal", 0) or 0) > 0

def _default_portion_for_role(role: str) -> float:
    return {
        "protein": 120.0,
        "carb": 80.0,
        "vegetable": 150.0,
        "fat": 15.0,
        "snack": 100.0,
    }.get(role, 100.0)

def _macros_for_portion_from_record(record: dict, portion_g: float) -> dict:
    ratio = float(portion_g) / 100.0
    return {
        "kcal": round(float(record.get("kcal", 0) or 0) * ratio, 2),
        "protein_g": round(float(record.get("protein_g", 0) or 0) * ratio, 2),
        "carbs_g": round(float(record.get("carbs_g", 0) or 0) * ratio, 2),
        "fat_g": round(float(record.get("fat_g", 0) or 0) * ratio, 2),
    }

def _build_food_from_pool(
    name: str,
    portion_g: float,
    role: str | None,
    pool_by_name: dict[str, dict],
) -> dict:
    record = pool_by_name.get(_norm_food_name(name))
    display = record["name"] if record else str(name).strip()
    nf: dict = {"name": display, "portion_g": float(portion_g)}
    if role:
        nf["macro_role"] = role
    if record:
        nf.update(_macros_for_portion_from_record(record, float(portion_g)))
    apply_portion_rules_to_food(nf)
    return nf

def _apply_pool_macros_to_matrix(matrix: dict, meals: list[str], pool_by_name: dict[str, dict]) -> None:
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
                record = pool_by_name.get(_norm_food_name(f.get("name", "")))
                if not record:
                    continue
                f["name"] = record["name"]
                portion = float(f.get("portion_g", 0) or 0)
                if portion > 0:
                    f.update(_macros_for_portion_from_record(record, portion))

def _count_weekly_foods(matrix: dict) -> dict[str, int]:
    counts: dict[str, int] = {}
    for day in DAYS:
        if day not in matrix:
            continue
        for meal in MEALS:
            for raw in matrix[day][meal].get("foods") or []:
                name = _norm_food_name(_normalize_food_item(raw).get("name", ""))
                if name:
                    counts[name] = counts.get(name, 0) + 1
    return counts

def _pick_pool_food_for_role(
    role: str,
    day_seen: set[str],
    weekly_counts: dict[str, int],
    role_pools: dict[str, list[dict]],
) -> str | None:
    pool = role_pools.get(role) or []
    if not pool:
        return None
    cap = _weekly_cap_for_role(role)

    for record in pool:
        key = _norm_food_name(record["name"])
        if key not in day_seen and weekly_counts.get(key, 0) < cap:
            return record["name"]

    for record in pool:
        key = _norm_food_name(record["name"])
        if key not in day_seen:
            return record["name"]

    for record in pool:
        key = _norm_food_name(record["name"])
        if weekly_counts.get(key, 0) < cap:
            return record["name"]

    return min(pool, key=lambda r: weekly_counts.get(_norm_food_name(r["name"]), 0))["name"]

def _pick_under_cap_pool_food(
    role: str,
    day_seen: set[str],
    weekly_counts: dict[str, int],
    role_pools: dict[str, list[dict]],
) -> str | None:
    pool = role_pools.get(role) or []
    if not pool:
        return None
    cap = _weekly_cap_for_role(role)

    for record in pool:
        key = _norm_food_name(record["name"])
        if key not in day_seen and weekly_counts.get(key, 0) < cap:
            return record["name"]

    for record in pool:
        key = _norm_food_name(record["name"])
        if weekly_counts.get(key, 0) < cap:
            return record["name"]

    return None

def _infer_meal_food_role(food: dict, pool_by_name: dict[str, dict] | None = None) -> str:
    explicit = str(food.get("macro_role") or "").strip().lower()
    if explicit in ("protein", "protein_source"):
        return "protein"
    if explicit in ("carb", "carbs", "carbohydrate", "carb_source"):
        return "carb"
    if explicit in ("vegetable", "veg", "vegetables"):
        return "vegetable"
    if explicit in ("fat", "fats", "fat_source"):
        return "fat"

    name = str(food.get("name", "") or "")

    if pool_by_name:
        record = pool_by_name.get(_norm_food_name(name))
        pool_role = str((record or {}).get("macro_role") or "").strip().lower()
        if pool_role in ("protein", "carb", "vegetable", "fat"):
            return pool_role
        if pool_role == "fruit":
            return "carb"

    cat = food_category(name)
    if cat == "vegetables":
        return "vegetable"
    if cat == "animal_proteins":
        return "protein"
    if cat in ("grains", "fruits"):
        return "carb"
    if cat == "fats":
        return "fat"
    if cat == "dairy":
        protein = float(food.get("protein_g") or 0)
        return "protein" if protein >= 8 else "snack"

    lowered = name.lower()
    if any(
        token in lowered
        for token in (
            "broccoli",
            "spinach",
            "kale",
            "carrot",
            "pepper",
            "cucumber",
            "tomato",
            "cauliflower",
            "zucchini",
            "cabbage",
            "asparagus",
            "lettuce",
            "celery",
            "beet",
            "onion",
            "eggplant",
            "mushroom",
            "green bean",
        )
    ):
        return "vegetable"

    p = float(food.get("protein_g") or 0)
    c = float(food.get("carbs_g") or 0)
    f = float(food.get("fat_g") or 0)
    if f * 9 > max(p * 4, c * 4) and c < 10:
        return "fat"
    scores = {"protein": p * 4, "carb": c * 4, "vegetable": max(c, p) * 2}
    best = max(scores, key=scores.get)
    if scores[best] < 1:
        return "carb"
    if best == "protein" and p >= 5:
        return "protein"
    return best if best != "vegetable" else "carb"

def _recompute_meal_kcal(blk: dict) -> None:
    mk = sum(
        float(x.get("kcal", 0) or 0)
        for x in blk.get("foods") or []
        if isinstance(x, dict)
    )
    blk["meal_kcal"] = round(mk, 1)

def _is_fruit_pool_item(item: dict, pool_by_name: dict[str, dict]) -> bool:
    record = pool_by_name.get(_norm_food_name(item.get("name", "")))
    return str((record or {}).get("macro_role") or "").strip().lower() == "fruit"
