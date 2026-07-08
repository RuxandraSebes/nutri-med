from __future__ import annotations

import logging

from portion_rules import apply_portion_rules_to_food, portion_max_for_name
from matrix_constants import DAYS, MEALS
from matrix_json import _normalize_food_item

logger = logging.getLogger(__name__)

MEAL_TARGET_PCT = {
    "Breakfast": 0.30,
    "Lunch": 0.30,
    "Dinner": 0.30,
    "Snack": 0.10,
}

def _meal_targets(tdee: dict) -> dict[str, dict[str, float]]:
    return {
        meal: {
            "kcal": float(tdee["kcal"]) * pct,
            "protein_g": float(tdee["protein_g"]) * pct,
            "carbs_g": float(tdee["carbs_g"]) * pct,
            "fat_g": float(tdee["fat_g"]) * pct,
        }
        for meal, pct in MEAL_TARGET_PCT.items()
    }

def _snap_meal_foods_to_target(foods: list[dict], target_kcal: float) -> float:
    items = []
    for f in foods:
        fi = _normalize_food_item(f)
        portion = float(fi.get("portion_g", 0) or 0)
        kcal = float(fi.get("kcal", 0) or 0)
        if portion <= 0 or kcal <= 0:
            continue
        kcal_per_g = kcal / portion
        max_kcal = portion_max_for_name(fi.get("name", "")) * kcal_per_g
        items.append({"food": f, "kcal_per_g": kcal_per_g, "cur_kcal": kcal, "max_kcal": max_kcal})

    if not items:
        return 0.0

    remaining_target = float(target_kcal)
    active = list(items)
    assigned: list[tuple[dict, float]] = []

    for _ in range(len(items)):
        if not active:
            break
        weight_total = sum(it["cur_kcal"] for it in active)
        newly_capped = []
        for it in active:
            share = (
                it["cur_kcal"] / weight_total * remaining_target
                if weight_total > 1e-9
                else remaining_target / len(active)
            )
            if share > it["max_kcal"]:
                assigned.append((it, it["max_kcal"]))
                remaining_target -= it["max_kcal"]
                newly_capped.append(it)
        if not newly_capped:
            weight_total = sum(it["cur_kcal"] for it in active)
            for it in active:
                share = (
                    it["cur_kcal"] / weight_total * remaining_target
                    if weight_total > 1e-9
                    else remaining_target / len(active)
                )
                assigned.append((it, max(share, 0.0)))
            active = []
            break
        active = [it for it in active if it not in newly_capped]

    for it in active:
        assigned.append((it, it["max_kcal"]))

    total_assigned = 0.0
    for it, kcal in assigned:
        f = it["food"]
        scale = kcal / it["cur_kcal"] if it["cur_kcal"] > 0 else 0.0
        f["kcal"] = round(kcal, 2)
        f["protein_g"] = round(float(f.get("protein_g", 0) or 0) * scale, 2)
        f["carbs_g"] = round(float(f.get("carbs_g", 0) or 0) * scale, 2)
        f["fat_g"] = round(float(f.get("fat_g", 0) or 0) * scale, 2)
        f["portion_g"] = round(kcal / it["kcal_per_g"], 2) if it["kcal_per_g"] > 0 else f.get("portion_g", 0)
        apply_portion_rules_to_food(f)
        total_assigned += float(f.get("kcal", 0) or 0)
    return total_assigned

def _snap_matrix_to_tdee(matrix: dict, tdee: dict, tol: float) -> set[str]:
    meal_targets = _meal_targets(tdee)
    capped_days: set[str] = set()
    for day in DAYS:
        day_o = matrix[day]
        for meal in MEALS:
            blk = day_o[meal]
            target = meal_targets[meal]["kcal"]
            foods = blk.get("foods") or []
            if not any(float(_normalize_food_item(f).get("kcal", 0) or 0) > 0 for f in foods):
                logger.warning(
                    "[matrix] %s/%s: cannot snap to target - no non-zero kcal in foods",
                    day,
                    meal,
                )
                continue

            assigned_kcal = _snap_meal_foods_to_target(foods, target)
            if assigned_kcal < target - 1.0:
                capped_days.add(day)
                logger.warning(
                    "[matrix] %s/%s: capped at %.0f kcal (target %.0f) - foods hit realistic portion limits",
                    day,
                    meal,
                    assigned_kcal,
                    target,
                )
            else:
                logger.info(
                    "[matrix] TDEE snap %s/%s: → target %.0f kcal",
                    day,
                    meal,
                    target,
                )
            blk["meal_kcal"] = round(
                sum(float(_normalize_food_item(x).get("kcal", 0) or 0) for x in foods),
                1,
            )
        day_o["day_total_kcal"] = round(
            sum(float(day_o[m]["meal_kcal"]) for m in MEALS),
            1,
        )
    return capped_days

def _normalize_matrix_in_place(matrix: dict) -> dict:
    for day in DAYS:
        day_o = matrix.get(day)
        if not isinstance(day_o, dict):
            raise ValueError(f"Matrix missing or invalid day '{day}'.")
        running = 0.0
        for meal in MEALS:
            blk = day_o.get(meal)
            if not isinstance(blk, dict):
                raise ValueError(f"Missing meal '{meal}' for '{day}'.")
            foods_raw = blk.get("foods")
            if foods_raw is None:
                blk["foods"] = []
                foods_raw = []
            if not isinstance(foods_raw, list):
                raise ValueError(f"foods must be a list for {day}/{meal}")
            blk["foods"] = [_normalize_food_item(x) for x in foods_raw]
            for f in blk["foods"]:
                apply_portion_rules_to_food(f)
            mk = blk.get("meal_kcal")
            if mk is None:
                mk = sum(float(x.get("kcal", 0) or 0) for x in blk["foods"])
                blk["meal_kcal"] = round(float(mk), 1)
            running += float(blk["meal_kcal"])
        day_o["day_total_kcal"] = round(running, 1)
    return matrix

def _require_target_macros_from_backend(target_macros: dict | None) -> dict:
    if not target_macros or not isinstance(target_macros, dict):
        raise ValueError(
            "targetMacros is required from recommendation-service "
            "(backend tdee.js); AI service does not compute TDEE.",
        )
    out: dict = {}
    for key in ("kcal", "protein_g", "carbs_g", "fat_g"):
        if target_macros.get(key) is None:
            raise ValueError(f"targetMacros.{key} is required from backend")
        out[key] = int(round(float(target_macros[key])))
    for optional in (
        "bmr",
        "activity_factor",
        "method",
        "goal",
        "maintenance_kcal",
        "target_source",
    ):
        if target_macros.get(optional) is not None:
            out[optional] = target_macros[optional]
    if not out.get("target_source"):
        out["target_source"] = str(
            target_macros.get("target_source") or "backend_tdee.js",
        )
    if not out.get("method"):
        out["method"] = str(
            target_macros.get("method")
            or "Mifflin-St Jeor × activity factor (backend tdee.js)",
        )
    return out
