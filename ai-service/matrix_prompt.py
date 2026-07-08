from __future__ import annotations

import re

from matrix_constants import LLM_PATIENT_CTX_MAX, LLM_NUTRITION_LINES_MAX

def _compact_patient_context_for_llm(patient_ctx: str, max_chars: int) -> str:
    lines_out: list[str] = []
    for line in patient_ctx.splitlines():
        s = line.strip()
        if not s or s.startswith("==="):
            continue
        lines_out.append(s)
    text = "\n".join(lines_out)
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 40] + "\n… [patient context truncated]\n"

def _compact_nutrition_context_for_llm(nutrition_ctx: str, max_lines: int) -> str:
    lines = [ln for ln in nutrition_ctx.splitlines() if ln.strip()]
    return "\n".join(lines[:max_lines])

def _extract_preferred_cuisine(patient_ctx: str) -> str:
    m = re.search(r"\[PREFERRED CUISINE\]\n\s*(.+)", patient_ctx)
    cuisine = m.group(1).strip() if m else ""
    return cuisine if cuisine and cuisine.upper() != "N/A" else "no preference specified"

def _build_batch_prompt(
    days: list[str],
    patient_ctx: str,
    nutrition_ctx: str,
    tdee: dict,
) -> str:
    days_csv = ", ".join(days)

    patient_compact = _compact_patient_context_for_llm(patient_ctx, LLM_PATIENT_CTX_MAX)
    nutrition_compact = _compact_nutrition_context_for_llm(
        nutrition_ctx,
        LLM_NUTRITION_LINES_MAX,
    )
    preferred_cuisine = _extract_preferred_cuisine(patient_ctx)

    context_line = (
        f"This patient's daily target is roughly {tdee['kcal']} kcal (Protein {tdee['protein_g']}g, "
        f"Carbs {tdee['carbs_g']}g, Fat {tdee['fat_g']}g) - for context only. Exact portions and "
        "calories are computed separately; you only decide WHICH foods go together."
    )

    return f"""You are a clinical nutrition expert. Build a partial weekly diet matrix.

{patient_compact}

{nutrition_compact}

{context_line}

Generate ONLY the following days: {days_csv}. No other days.
Output must be a single valid JSON object with no text before or after.

CULINARY PAIRING GUIDANCE:
Patient's preferred cuisine: {preferred_cuisine}
Anchor on protein: for every main meal, pick the protein ID first, then choose a carb, vegetable, and fat ID that would realistically appear on the same plate as that protein - think of real dishes matching the {preferred_cuisine} flavor profile, not random category matches.
Good: salmon + quinoa + asparagus + olive oil (Mediterranean). Good: eggs + oats + spinach + walnuts.
Avoid: tuna + oats + broccoli + peanut butter - a technically-valid combination with no real dish behind it.

CRITICAL RULES:
1. Use ONLY the IDs listed in AVAILABLE FOODS above. Output each food as its bare ID number - never write a food name.
2. Respect ALL allergies and restrictions in patient context.
3. Each listed day MUST have exactly 4 meals: Breakfast, Lunch, Dinner, Snack.
4. Breakfast, Lunch, and Dinner MUST each list exactly FOUR IDs, in this exact order: 1st the protein ID, 2nd the carb ID, 3rd the vegetable ID, 4th the fat ID - chosen as a coherent, appetizing combination per the guidance above.
4b. For BREAKFAST, prefer IDs marked "(breakfast-friendly)" when available.
5. Snack MUST list ONE or TWO IDs from SNACK OPTIONS.
6. Within a single day, no ID may repeat across its four meals.

Return JSON with this shape (only for the days you were assigned; fill those days completely):
{{
  "matrix": {{
    "{days[0]}": {{
      "Breakfast": {{"foods": [12, 4, 20, 31]}},
      "Lunch": {{"foods": [2, 10, 21, 30]}},
      "Dinner": {{"foods": [3, 11, 22, 30]}},
      "Snack": {{"foods": [15]}}
    }}
  }}
}}
Include every assigned day as a key under "matrix". Every entry in every "foods" array must be a bare integer ID - no names, no objects.
"""
