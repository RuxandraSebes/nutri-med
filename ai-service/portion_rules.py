from __future__ import annotations

import re
from typing import Any

try:
    from food_catalog import macros_for_portion, resolve_food
except ImportError:
    resolve_food = None
    macros_for_portion = None

_PORTION_RULES: list[tuple[re.Pattern[str], int, int]] = [
    (re.compile(r"\begg\b|\beggs\b", re.I), 50, 50),
    (
        re.compile(
            r"chicken|turkey|beef|pork|salmon|tuna|cod|shrimp|lamb|sardine|mackerel|crab|fish|meat",
            re.I,
        ),
        10,
        10,
    ),
    (re.compile(r"\boil\b|butter(?! bean)|ghee|margarine|\blard\b|tallow", re.I), 5, 5),
    (
        re.compile(
            r"oat|rice|bread|pasta|potato|quinoa|grain|banana|apple|berry|fruit|yogurt|milk|cheese|bean|lentil|chickpea|tofu|nut|seed",
            re.I,
        ),
        5,
        5,
    ),
    (re.compile(r"broccoli|spinach|kale|carrot|pepper|vegetable|salad|lettuce|tomato|cucumber", re.I), 5, 5),
]

DEFAULT_STEP_G = 5
DEFAULT_MIN_G = 5

_PORTION_MAX_RULES: list[tuple[re.Pattern[str], float]] = [
    (re.compile(r"\begg\b|\beggs\b", re.I), 200),
    (re.compile(r"\boil\b|ghee|margarine|\blard\b|tallow|butter(?! bean)", re.I), 30),
    (re.compile(r"avocado", re.I), 150),
    (re.compile(r"\bnut|seed|tahini|almond butter|peanut butter", re.I), 60),
    (
        re.compile(
            r"chicken|turkey|beef|pork|salmon|tuna|cod|shrimp|lamb|sardine|mackerel|crab|fish|meat|"
            r"lobster|scallop|squid|octopus|bison|venison|duck|goose|quail|rabbit|steak",
            re.I,
        ),
        350,
    ),
    (re.compile(r"bean|lentil|chickpea|\bpeas?\b|edamame", re.I), 350),
    (
        re.compile(
            r"oat|\brice\b|bread|pasta|potato|quinoa|\bgrain|noodle|couscous|barley|bulgur|farro|"
            r"millet|buckwheat|cereal|granola|bagel|muffin|pancake|waffle",
            re.I,
        ),
        450,
    ),
    (re.compile(r"yogurt|\bmilk\b|cheese", re.I), 350),
    (
        re.compile(
            r"banana|apple|berry|berries|fruit|orange|mango|melon|grape|pear|peach|plum|kiwi|"
            r"pineapple|cherry|apricot|\bfig|date fruit|guava|papaya|pomegranate|lemon|lime|"
            r"tangerine|nectarine|persimmon|lychee|starfruit",
            re.I,
        ),
        300,
    ),
    (
        re.compile(
            r"broccoli|spinach|kale|carrot|pepper|vegetable|salad|lettuce|tomato|cucumber|cabbage|"
            r"cauliflower|zucchini|asparagus|celery|onion|garlic|beet|eggplant|mushroom|squash|"
            r"pumpkin|\bcorn\b|artichoke|leek|chard|arugula|okra|turnip|parsnip|fennel|endive",
            re.I,
        ),
        400,
    ),
]
DEFAULT_MAX_G = 350.0


def portion_step_for_name(name: str) -> tuple[int, int]:
    n = str(name or "").strip()
    for pattern, step, min_g in _PORTION_RULES:
        if pattern.search(n):
            return step, min_g
    return DEFAULT_STEP_G, DEFAULT_MIN_G


def portion_max_for_name(name: str) -> float:
    n = str(name or "").strip()
    for pattern, max_g in _PORTION_MAX_RULES:
        if pattern.search(n):
            return max_g
    return DEFAULT_MAX_G


def round_portion_g(name: str, portion_g: float | int | None) -> float:
    try:
        p = float(portion_g or 0)
    except (TypeError, ValueError):
        p = 0.0
    if p <= 0:
        return 0.0
    step, min_g = portion_step_for_name(name)
    p = max(float(min_g), p)
    rounded = round(p / step) * step
    if rounded < min_g:
        rounded = float(min_g)
    return float(int(rounded) if step >= 1 else round(rounded, 1))


def _recalc_food_macros_from_catalog(food: dict[str, Any]) -> None:
    if not resolve_food or not macros_for_portion:
        return
    entry = resolve_food(food.get("name", ""))
    if not entry:
        return
    portion = float(food.get("portion_g", 0) or 0)
    if portion <= 0:
        return
    food["name"] = entry["name"]
    food.update(macros_for_portion(entry, portion))


def apply_portion_rules_to_food(food: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(food, dict):
        return food
    name = str(food.get("name") or "")
    old_kcal = float(food.get("kcal", 0) or 0)
    portion = round_portion_g(name, food.get("portion_g"))

    entry = resolve_food(name) if resolve_food else None
    if entry and old_kcal > 0 and entry.get("calories"):
        cal_per_100 = float(entry["calories"])
        if cal_per_100 > 0:
            portion = round_portion_g(name, (old_kcal / cal_per_100) * 100.0)

    food["portion_g"] = portion
    if entry:
        _recalc_food_macros_from_catalog(food)
    return food


def apply_portion_rules_to_matrix(matrix: dict, meals: list[str], days: list[str]) -> dict:
    for day in days:
        day_o = matrix.get(day)
        if not isinstance(day_o, dict):
            continue
        running = 0.0
        for meal in meals:
            blk = day_o.get(meal)
            if not isinstance(blk, dict):
                continue
            foods = blk.get("foods") or []
            blk["foods"] = [apply_portion_rules_to_food(dict(f) if isinstance(f, dict) else {}) for f in foods]
            mk = sum(float(x.get("kcal", 0) or 0) for x in blk["foods"])
            blk["meal_kcal"] = round(mk, 1)
            running += mk
        day_o["day_total_kcal"] = round(running, 1)
    return matrix
