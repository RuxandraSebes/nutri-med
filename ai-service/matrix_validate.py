from __future__ import annotations

import re
import json

from matrix_constants import DAYS, MEALS, MAIN_MEALS, MAIN_MEAL_ROLES
from matrix_json import _normalize_food_item
from matrix_rag import _extract_allergen_terms
from matrix_pool import (
    _infer_meal_food_role,
    _count_weekly_foods,
    _weekly_cap_for_role,
    _norm_food_name,
)

_COMPOUND_FOOD_RE = re.compile(r"\+|&|\band\b|,|\bwith\b", re.IGNORECASE)

def _is_compound_food_name(name: str) -> bool:
    n = str(name or "").strip()
    if not n:
        return True
    return bool(_COMPOUND_FOOD_RE.search(n))

def _validate_day_kcal_tolerance(
    matrix: dict,
    target_kcal: float,
    tol: float,
    capped_days: set[str] | None = None,
) -> None:
    target_kcal = float(target_kcal)
    capped_days = capped_days or set()
    for day in DAYS:
        dt = matrix[day].get("day_total_kcal")
        if dt is None:
            raise ValueError(f"{day}: missing day_total_kcal")
        dt = float(dt)
        if dt > target_kcal + tol:
            raise ValueError(
                f"{day}: day_total_kcal={dt} exceeds TDEE target {target_kcal} + ±{tol}",
            )
        if dt < target_kcal - tol and day not in capped_days:
            raise ValueError(
                f"{day}: day_total_kcal={dt} is not within ±{tol} of TDEE "
                f"target {target_kcal}",
            )

def _validate_meal_structure(matrix: dict, pool_by_name: dict[str, dict] | None = None) -> None:
    for day in DAYS:
        if day not in matrix:
            continue
        for meal in MAIN_MEALS:
            foods = matrix[day][meal].get("foods") or []
            if len(foods) != len(MAIN_MEAL_ROLES):
                raise ValueError(
                    f"{day}/{meal}: exactly {len(MAIN_MEAL_ROLES)} foods required "
                    f"(protein + carb + vegetable + fat) - got {len(foods)}.",
                )
            roles: list[str] = []
            for f in foods:
                item = _normalize_food_item(f)
                name = item.get("name", "")
                if _is_compound_food_name(name):
                    raise ValueError(
                        f"{day}/{meal}: use single food names, not compound dishes: {name!r}",
                    )
                portion = float(item.get("portion_g", 0) or 0)
                if portion <= 0:
                    raise ValueError(
                        f"{day}/{meal}: portion_g must be positive for {name!r}.",
                    )
                roles.append(_infer_meal_food_role(item, pool_by_name))
            if set(roles) != set(MAIN_MEAL_ROLES):
                raise ValueError(
                    f"{day}/{meal}: must include one protein, one carb, one vegetable, "
                    f"and one fat - got roles {roles}.",
                )

        snack_foods = matrix[day]["Snack"].get("foods") or []
        if len(snack_foods) not in (1, 2):
            raise ValueError(
                f"{day}/Snack: 1 or 2 foods required - got {len(snack_foods)}.",
            )
        for snack_raw in snack_foods:
            snack = _normalize_food_item(snack_raw)
            if _is_compound_food_name(snack.get("name", "")):
                raise ValueError(
                    f"{day}/Snack: use a single food name, not compound dishes: {snack.get('name')!r}",
                )
            if float(snack.get("portion_g", 0) or 0) <= 0:
                raise ValueError(f"{day}/Snack: portion_g must be positive.")

def _validate_weekly_food_frequency(matrix: dict, pool_by_name: dict[str, dict] | None = None) -> None:
    counts = _count_weekly_foods(matrix)
    for name, n in counts.items():
        role = str((pool_by_name or {}).get(name, {}).get("macro_role") or "")
        cap = _weekly_cap_for_role(role)
        if n > cap:
            raise ValueError(
                f"Food {name!r} appears {n} times in the week (max {cap}).",
            )

def _validate_daily_food_uniqueness(matrix: dict) -> None:
    for day in DAYS:
        if day not in matrix:
            continue
        seen: set[str] = set()
        for meal in MEALS:
            for f in matrix[day][meal].get("foods") or []:
                name = _normalize_food_item(f).get("name", "").strip().lower()
                if not name:
                    continue
                if name in seen:
                    raise ValueError(
                        f"{day}: food {name!r} appears more than once on the same day.",
                    )
                seen.add(name)

def _validate_allergens_and_restrictions(patient_ctx: str, matrix: dict) -> None:
    blob = json.dumps(matrix, default=str).lower()
    for term in _extract_allergen_terms(patient_ctx):
        needle = term.lower()
        if len(needle) >= 3 and needle in blob:
            raise ValueError(
                f"Plan content may conflict with allergy/aversion: {term}",
            )

def _merge_foods_used(llm_list: list | None, matrix: dict) -> list[str]:
    names = []
    seen = set()
    if isinstance(llm_list, list):
        for x in llm_list:
            if isinstance(x, str) and x.strip():
                k = x.strip()
                if k.lower() not in seen:
                    seen.add(k.lower())
                    names.append(k)
    for day in DAYS:
        for meal in MEALS:
            for f in matrix[day][meal].get("foods") or []:
                n = _normalize_food_item(f).get("name", "")
                if n and n.lower() not in seen:
                    seen.add(n.lower())
                    names.append(n)
    return names
