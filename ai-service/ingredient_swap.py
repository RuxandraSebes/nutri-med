from __future__ import annotations

import json
import logging
import os
import re

from langchain_ollama import ChatOllama

from food_catalog import all_catalog_names, macros_for_portion, resolve_food
from portion_rules import apply_portion_rules_to_food, round_portion_g
from rag_service import get_patient_context

logger = logging.getLogger(__name__)

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")

DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]
MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"]


def _norm_name(name: str) -> str:
    return re.sub(r"\s+", " ", str(name or "").strip().lower())


def _make_swap_llm() -> ChatOllama:
    return ChatOllama(
        model=OLLAMA_MODEL,
        temperature=0.2,
        base_url=OLLAMA_HOST,
        num_predict=int(os.getenv("OLLAMA_SWAP_NUM_PREDICT", "1200")),
        format="json",
    )


async def suggest_ingredient_swaps(patient_id: int, old_name: str) -> dict:
    old_name = str(old_name or "").strip()
    if not old_name:
        raise ValueError("oldName is required")

    patient_ctx = await get_patient_context(patient_id)
    catalog_sample = ", ".join(all_catalog_names()[:40])
    if len(all_catalog_names()) > 40:
        catalog_sample += ", …"

    prompt = f"""You are a clinical nutrition expert. Suggest exactly 3 substitute foods to replace "{old_name}" in a weekly meal plan.

PATIENT CONTEXT:
{patient_ctx[:3500]}

APPROVED FOODS (prefer exact names from this list when possible):
{catalog_sample}

RULES:
- Each alternative must be a single whole food (no recipes, no "X and Y").
- Respect all allergies and restrictions in patient context.
- Similar role in the diet (protein for protein, fruit for fruit, etc.).
- Provide realistic portion_g in grams using practical steps: meats 10g, grains/carbs 5g, eggs 50g.
- Include estimated kcal, protein_g, carbs_g, fat_g for that portion.
- Do not repeat "{old_name}" or near-identical items.

Return JSON only:
{{
  "alternatives": [
    {{
      "name": "Food name",
      "portion_g": 150,
      "kcal": 0,
      "protein_g": 0,
      "carbs_g": 0,
      "fat_g": 0,
      "reason": "One short sentence why this fits the patient"
    }}
  ]
}}
Exactly 3 items in alternatives."""

    llm = _make_swap_llm()
    response = await llm.ainvoke(prompt)
    raw = response.content if hasattr(response, "content") else str(response)
    data = json.loads(raw) if isinstance(raw, str) else raw
    alts = data.get("alternatives") if isinstance(data, dict) else None
    if not isinstance(alts, list) or len(alts) < 1:
        raise ValueError("LLM did not return swap alternatives")

    cleaned = []
    for item in alts[:3]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name or _norm_name(name) == _norm_name(old_name):
            continue
        food = {
            "name": name,
            "portion_g": float(item.get("portion_g") or 100),
            "kcal": float(item.get("kcal") or 0),
            "protein_g": float(item.get("protein_g") or 0),
            "carbs_g": float(item.get("carbs_g") or 0),
            "fat_g": float(item.get("fat_g") or 0),
            "reason": str(item.get("reason") or "").strip(),
        }
        apply_portion_rules_to_food(food)
        cleaned.append(food)

    if len(cleaned) < 1:
        raise ValueError("No valid swap alternatives after filtering")

    return {
        "old_name": old_name,
        "alternatives": cleaned[:3],
    }


def _food_matches(old_norm: str, food_name: str) -> bool:
    fn = _norm_name(food_name)
    if fn == old_norm:
        return True
    short = re.sub(r"\s*\([^)]*\)", "", fn).strip()
    old_short = re.sub(r"\s*\([^)]*\)", "", old_norm).strip()
    return short == old_short or fn == old_short or short == old_norm


def _replacement_for_slot(old_food: dict, replacement: dict) -> dict:
    old_kcal = float(old_food.get("kcal", 0) or 0)
    name = str(replacement.get("name") or "").strip()
    entry = resolve_food(name)
    if entry and old_kcal > 0 and float(entry.get("calories") or 0) > 0:
        cal_per_100 = float(entry["calories"])
        portion = round_portion_g(entry["name"], (old_kcal / cal_per_100) * 100.0)
        out = {"name": entry["name"], "portion_g": portion}
        out.update(macros_for_portion(entry, portion))
        return apply_portion_rules_to_food(out)

    out = {
        "name": name,
        "portion_g": float(replacement.get("portion_g") or old_food.get("portion_g") or 100),
        "kcal": float(replacement.get("kcal") or old_kcal or 0),
        "protein_g": float(replacement.get("protein_g") or 0),
        "carbs_g": float(replacement.get("carbs_g") or 0),
        "fat_g": float(replacement.get("fat_g") or 0),
    }
    return apply_portion_rules_to_food(out)


def apply_ingredient_swap_to_matrix(matrix: dict, old_name: str, replacement: dict) -> dict:
    if not isinstance(matrix, dict):
        raise ValueError("matrix must be an object")
    old_norm = _norm_name(old_name)
    new_norm = _norm_name(replacement.get("name", ""))
    if not old_norm or not new_norm:
        raise ValueError("old_name and replacement.name are required")
    if old_norm == new_norm:
        raise ValueError("Replacement must differ from the original ingredient")

    count = 0
    for day in DAYS:
        day_o = matrix.get(day)
        if not isinstance(day_o, dict):
            continue
        day_names_after: set[str] = set()
        for meal in MEALS:
            blk = day_o.get(meal)
            if not isinstance(blk, dict):
                continue
            for f in blk.get("foods") or []:
                if not isinstance(f, dict):
                    continue
                if _food_matches(old_norm, f.get("name", "")):
                    count += 1
                    continue
                day_names_after.add(_norm_name(f.get("name", "")))

        for meal in MEALS:
            blk = day_o.get(meal)
            if not isinstance(blk, dict):
                continue
            foods = blk.get("foods") or []
            new_foods = []
            for f in foods:
                if not isinstance(f, dict):
                    new_foods.append(f)
                    continue
                if _food_matches(old_norm, f.get("name", "")):
                    nf = _replacement_for_slot(f, replacement)
                    nn = _norm_name(nf.get("name", ""))
                    others = set(day_names_after)
                    if nn in others:
                        raise ValueError(
                            f"{day}: swap to {nf.get('name')!r} would duplicate a food on the same day.",
                        )
                    day_names_after.add(nn)
                    new_foods.append(nf)
                else:
                    new_foods.append(f)
            blk["foods"] = new_foods
            mk = sum(float(x.get("kcal", 0) or 0) for x in blk["foods"] if isinstance(x, dict))
            blk["meal_kcal"] = round(mk, 1)
        day_o["day_total_kcal"] = round(
            sum(float(day_o.get(m, {}).get("meal_kcal", 0) or 0) for m in MEALS if isinstance(day_o.get(m), dict)),
            1,
        )

    if count == 0:
        raise ValueError(f"Ingredient {old_name!r} not found in meal matrix")

    return matrix


def apply_swap_to_meal_matrix(meal_matrix: dict, old_name: str, replacement: dict) -> dict:
    if not meal_matrix or not isinstance(meal_matrix, dict):
        raise ValueError("meal_matrix is required")
    weekly = meal_matrix.get("weekly")
    if not isinstance(weekly, dict):
        raise ValueError("meal_matrix.weekly is required")

    apply_ingredient_swap_to_matrix(weekly, old_name, replacement)

    meal_times = {
        "Breakfast": "08:00",
        "Lunch": "13:00",
        "Dinner": "19:00",
        "Snack": "15:30",
        "Morning Snack": "15:30",
    }
    first_day = weekly.get(DAYS[0]) or {}
    meals = []
    for meal_name, meal_data in first_day.items():
        if meal_name == "day_total_kcal" or not isinstance(meal_data, dict):
            continue
        foods = meal_data.get("foods") or []
        meals.append(
            {
                "time": meal_times.get(meal_name, "00:00"),
                "name": (foods[0].get("name") if foods else "") or "",
                "notes": f"{meal_data.get('meal_kcal') or 0} kcal",
                "foods": foods,
            },
        )
    meal_matrix["meals"] = meals
    return meal_matrix
