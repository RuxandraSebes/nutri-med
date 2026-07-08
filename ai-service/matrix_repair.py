from __future__ import annotations

import logging

from matrix_constants import DAYS, MEALS, MAIN_MEALS, MAIN_MEAL_ROLES
from matrix_json import _normalize_food_item
from matrix_pool import (
    _weekly_cap_for_role,
    _norm_food_name,
    _food_is_resolvable,
    _infer_meal_food_role,
    _is_fruit_pool_item,
    _role_pools_for_meal,
    _pick_pool_food_for_role,
    _pick_under_cap_pool_food,
    _build_food_from_pool,
    _default_portion_for_role,
    _count_weekly_foods,
    _recompute_meal_kcal,
)

logger = logging.getLogger(__name__)

def _repair_meal_structure(
    matrix: dict,
    role_pools: dict[str, list[dict]],
    pool_by_name: dict[str, dict],
) -> None:
    weekly_counts = _count_weekly_foods(matrix)

    for day in DAYS:
        if day not in matrix:
            continue
        day_seen: set[str] = set()
        snack_blk0 = matrix[day].get("Snack")
        if isinstance(snack_blk0, dict):
            for f0 in snack_blk0.get("foods") or []:
                k0 = _norm_food_name(_normalize_food_item(f0).get("name", ""))
                if k0:
                    day_seen.add(k0)

        for meal in MAIN_MEALS:
            blk = matrix[day].get(meal)
            if not isinstance(blk, dict):
                continue
            meal_pools = _role_pools_for_meal(role_pools, meal)
            foods = [_normalize_food_item(f) for f in (blk.get("foods") or [])]
            by_role: dict[str, dict] = {}
            overflow: list[dict] = []

            def _acceptable_for_carb_slot(role: str, item: dict) -> bool:
                if role != "carb" or meal == "Breakfast":
                    return True
                return not _is_fruit_pool_item(item, pool_by_name)

            for item in foods:
                role = _infer_meal_food_role(item, pool_by_name)
                if (
                    role in MAIN_MEAL_ROLES
                    and role not in by_role
                    and _food_is_resolvable(item, pool_by_name)
                    and _acceptable_for_carb_slot(role, item)
                ):
                    item["macro_role"] = role
                    by_role[role] = item
                else:
                    overflow.append(item)

            for item in overflow:
                role = _infer_meal_food_role(item, pool_by_name)
                if (
                    role in MAIN_MEAL_ROLES
                    and role not in by_role
                    and _food_is_resolvable(item, pool_by_name)
                    and _acceptable_for_carb_slot(role, item)
                ):
                    item["macro_role"] = role
                    by_role[role] = item

            local_seen = day_seen | {
                _norm_food_name(x.get("name", ""))
                for x in by_role.values()
                if x.get("name")
            }

            for role in MAIN_MEAL_ROLES:
                if role in by_role:
                    continue
                replacement = _pick_pool_food_for_role(role, local_seen, weekly_counts, meal_pools)
                if not replacement:
                    logger.warning("%s/%s: no fallback food for role %s", day, meal, role)
                    continue
                portion = _default_portion_for_role(role)
                nf = _build_food_from_pool(replacement, portion, role, pool_by_name)
                by_role[role] = nf
                key = _norm_food_name(replacement)
                local_seen.add(key)
                weekly_counts[key] = weekly_counts.get(key, 0) + 1
                logger.warning(
                    "%s/%s: added missing %s source %r",
                    day,
                    meal,
                    role,
                    replacement,
                )

            blk["foods"] = [by_role[r] for r in MAIN_MEAL_ROLES if r in by_role]
            if len(blk["foods"]) > len(MAIN_MEAL_ROLES):
                blk["foods"] = blk["foods"][: len(MAIN_MEAL_ROLES)]
            _recompute_meal_kcal(blk)
            for item in blk["foods"]:
                key = _norm_food_name(item.get("name", ""))
                if key:
                    day_seen.add(key)

        snack_blk = matrix[day].get("Snack")
        if not isinstance(snack_blk, dict):
            continue
        snack_foods = [_normalize_food_item(f) for f in (snack_blk.get("foods") or [])]

        resolvable, unresolvable = [], []
        for sf in snack_foods:
            (resolvable if _food_is_resolvable(sf, pool_by_name) else unresolvable).append(sf)
        for sf in unresolvable:
            logger.warning("%s/Snack: dropping unresolvable food %r (no macros)", day, sf.get("name"))
        snack_foods = resolvable

        if len(snack_foods) > 2:
            logger.warning("%s/Snack: LLM returned %d foods - keeping first 2", day, len(snack_foods))
            snack_foods = snack_foods[:2]
        elif len(snack_foods) == 0:
            replacement = _pick_pool_food_for_role("snack", day_seen, weekly_counts, role_pools)
            if replacement:
                snack_foods = [_build_food_from_pool(replacement, _default_portion_for_role("snack"), None, pool_by_name)]
                logger.warning("%s/Snack: added fallback %r", day, replacement)
        for sf in snack_foods:
            sf.pop("macro_role", None)
        snack_blk["foods"] = snack_foods
        _recompute_meal_kcal(snack_blk)

def _repair_weekly_food_frequency(
    matrix: dict,
    role_pools: dict[str, list[dict]],
    pool_by_name: dict[str, dict],
) -> None:
    seen_total: dict[str, int] = {}

    for day in DAYS:
        if day not in matrix:
            continue
        day_seen: set[str] = set()
        for meal0 in MEALS:
            blk0 = matrix[day].get(meal0)
            if isinstance(blk0, dict):
                for f0 in blk0.get("foods") or []:
                    k0 = _norm_food_name(_normalize_food_item(f0).get("name", ""))
                    if k0:
                        day_seen.add(k0)

        for meal in MEALS:
            blk = matrix[day].get(meal)
            if not isinstance(blk, dict):
                continue
            new_foods = []
            for raw in blk.get("foods") or []:
                item = _normalize_food_item(raw)
                key = _norm_food_name(item.get("name", ""))
                if not key:
                    new_foods.append(item)
                    continue

                role = item.get("macro_role") or _infer_meal_food_role(item, pool_by_name)
                role = str(role) if meal in MAIN_MEALS else "snack"
                if seen_total.get(key, 0) >= _weekly_cap_for_role(role):
                    replacement = _pick_under_cap_pool_food(
                        role, day_seen, seen_total, _role_pools_for_meal(role_pools, meal),
                    )
                    if not replacement:
                        new_foods.append(item)
                        seen_total[key] = seen_total.get(key, 0) + 1
                        day_seen.add(key)
                        logger.warning(
                            "%s/%s: %r exceeds weekly cap and no fallback food is available",
                            day,
                            meal,
                            item.get("name"),
                        )
                        continue

                    portion = float(item.get("portion_g") or _default_portion_for_role(role))
                    nf = _build_food_from_pool(replacement, portion, role if meal in MAIN_MEALS else None, pool_by_name)
                    new_foods.append(nf)
                    rkey = _norm_food_name(replacement)
                    seen_total[rkey] = seen_total.get(rkey, 0) + 1
                    day_seen.add(rkey)
                    logger.warning(
                        "%s/%s: weekly cap - replaced %r with %r",
                        day,
                        meal,
                        item.get("name"),
                        replacement,
                    )
                    continue

                new_foods.append(item)
                seen_total[key] = seen_total.get(key, 0) + 1
                day_seen.add(key)
            blk["foods"] = new_foods
            _recompute_meal_kcal(blk)

def _repair_daily_food_uniqueness(
    matrix: dict,
    role_pools: dict[str, list[dict]],
    pool_by_name: dict[str, dict],
) -> None:
    weekly_counts = _count_weekly_foods(matrix)

    for day in DAYS:
        if day not in matrix:
            continue
        seen: set[str] = set()
        for meal in MEALS:
            blk = matrix[day].get(meal)
            if not isinstance(blk, dict):
                continue
            foods = blk.get("foods") or []
            new_foods = []
            for raw in foods:
                item = _normalize_food_item(raw)
                name = _norm_food_name(item.get("name", ""))
                if not name:
                    new_foods.append(item)
                    continue
                if name not in seen:
                    seen.add(name)
                    new_foods.append(item)
                    continue

                if meal in MAIN_MEALS:
                    role = item.get("macro_role") or _infer_meal_food_role(item, pool_by_name)
                    replacement = _pick_pool_food_for_role(
                        role, seen, weekly_counts, _role_pools_for_meal(role_pools, meal),
                    )
                else:
                    replacement = _pick_pool_food_for_role("snack", seen, weekly_counts, role_pools)

                if not replacement:
                    logger.warning(
                        "%s/%s: duplicate %r and no fallback food available",
                        day,
                        meal,
                        name,
                    )
                    new_foods.append(item)
                    continue

                portion = float(item.get("portion_g") or _default_portion_for_role(
                    str(item.get("macro_role") or _infer_meal_food_role(item, pool_by_name))
                ))
                role = item.get("macro_role") if meal in MAIN_MEALS else None
                nf = _build_food_from_pool(replacement, portion, role, pool_by_name)
                new_foods.append(nf)
                rkey = _norm_food_name(replacement)
                seen.add(rkey)
                weekly_counts[rkey] = weekly_counts.get(rkey, 0) + 1
                logger.warning(
                    "%s/%s: duplicate %r replaced with %r",
                    day,
                    meal,
                    item.get("name"),
                    replacement,
                )
            blk["foods"] = new_foods
            _recompute_meal_kcal(blk)

    _repair_meal_structure(matrix, role_pools, pool_by_name)
