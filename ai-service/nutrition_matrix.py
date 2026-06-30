"""
nutrition_matrix.py
───────────────────
POST /generate-matrix → generateNutritionMatrix(patientId)

Sequential pipeline:
  1. Patient context — MySQL (includes specialist-entered constraints when saved on the record).
  2. Nutritional context — Chroma db_nutritie unless MATRIX_SKIP_RAG=1 (testing without retrieval).
  3. Similar cases — Chroma db_pacienti unless MATRIX_SKIP_RAG=1.
  4. TDEE — Mifflin–St Jeor × activity (Python only).
  5. LLM — three parallel JSON meal-matrix batches (similar cases excluded from batches);
          one small parallel call for clinical_notes.
  6. _repair_truncated_json, normalize, validate.
"""

from __future__ import annotations

import json
import re
import os
import asyncio
import logging
import time
from typing import Optional

from langchain_ollama import ChatOllama
from pipeline_timing import timed_coro
from rag_service import getPatientContext, getNutritionalContext, getSimilarPatientsContext
from portion_rules import apply_portion_rules_to_food, apply_portion_rules_to_matrix

logger = logging.getLogger(__name__)

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")

BATCH_1 = ["Monday", "Tuesday", "Wednesday"]
BATCH_2 = ["Thursday", "Friday"]
BATCH_3 = ["Saturday", "Sunday"]

OLLAMA_BATCH_NUM_PREDICT = int(os.getenv("OLLAMA_BATCH_NUM_PREDICT", "1800"))
OLLAMA_BATCH_NUM_CTX = int(os.getenv("OLLAMA_BATCH_NUM_CTX", "6000"))
KCAL_TOLERANCE = float(os.getenv("MATRIX_KCAL_TOLERANCE", "150"))
MATRIX_AUTO_SCALE_TDEE = os.getenv("MATRIX_AUTO_SCALE_TDEE", "1").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
RAG_NUTRITION_TOP_K = int(os.getenv("RAG_NUTRITION_TOP_K", "6"))
OLLAMA_NOTES_NUM_PREDICT = int(os.getenv("OLLAMA_NOTES_NUM_PREDICT", "256"))

# When true: skip Chroma (foods + similar patients); matrix uses MySQL patient/clinical context only.
MATRIX_SKIP_RAG = os.getenv("MATRIX_SKIP_RAG", "0").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
MATRIX_SIMPLE_MODE = os.getenv("MATRIX_SIMPLE_MODE", "0").strip().lower() in (
    "1", "true", "yes", "on",
)
async def generateNutritionMatrixSimple(
    patientId: int, target_macros: dict | None = None
) -> dict:
    """
    Simplified pipeline — no Chroma, no batching, no RAG.
    Use with MATRIX_SIMPLE_MODE=1 for testing.
    """
    logger.info(f"[SIMPLE] Fetching patient context for id={patientId}")
    patient_ctx = await getPatientContext(patientId)

    tdee = _resolve_tdee(patient_ctx, target_macros)
    logger.info(
        "[SIMPLE] TDEE target: %s kcal (source=%s)",
        tdee["kcal"],
        tdee.get("target_source", "computed"),
    )

    kcal = tdee["kcal"]
    protein_g = tdee["protein_g"]
    carbs_g = tdee["carbs_g"]
    fat_g = tdee["fat_g"]
    tdee_label = (
        "SPECIALIST-SELECTED DAILY GOAL (from dashboard)"
        if tdee.get("target_source") == "specialist_dashboard"
        else "COMPUTED DAILY TARGETS"
    )

    prompt = f"""You are a clinical nutrition expert. Generate a 7-day, 4-meal-per-day diet plan.

PATIENT CLINICAL CONTEXT:
{patient_ctx}

{tdee_label}:
- Energy: {kcal} kcal/day (each day MUST total within ±{int(round(KCAL_TOLERANCE))} of this)
- Protein: {protein_g}g | Carbs: {carbs_g}g | Fat: {fat_g}g

RULES:
1. Generate all 7 days: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.
2. Each day has exactly 4 meals: Breakfast, Lunch, Dinner, Snack.
3. Each meal lists exactly ONE single whole food in foods[] — no recipes, no multi-ingredient dishes, no compound names (no "and", "+", commas in name).
4. Each food entry: name (single item), portion_g (grams), kcal, protein_g, carbs_g, fat_g — scale macros to portion_g.
4b. Use practical portion steps: eggs in 50g increments (≈1 egg), meats in 10g steps, grains/carbs in 5g steps — never fractional grams like 3.5g.
5. Within each day, all four food names must be different (no repeats on the same day).
6. meal_kcal = ingredient kcal; day_total_kcal = sum of four meals.
7. Respect ALL allergies and restrictions in patient context.
8. Do NOT write JavaScript comments (//) or ellipsis (...) placeholders.
9. Write every single day and meal in full. No shortcuts.
10. Output a single valid JSON object. No markdown. No text before or after.

JSON structure:
{{
  "tdee": {{"kcal": {kcal}, "protein_g": {protein_g}, "carbs_g": {carbs_g}, "fat_g": {fat_g}}},
  "matrix": {{
    "Monday":    {{"Breakfast": {{"foods": [{{"name":"Oats","portion_g":80,"kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0}}],"meal_kcal":0}}, "Lunch": {{"foods":[{{"name":"Chicken Breast","portion_g":150,"kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0}}],"meal_kcal":0}}, "Dinner": {{"foods":[],"meal_kcal":0}}, "Snack": {{"foods":[],"meal_kcal":0}}, "day_total_kcal":0}},
    "Tuesday":   {{"Breakfast": {{"foods":[],"meal_kcal":0}}, "Lunch": {{"foods":[],"meal_kcal":0}}, "Dinner": {{"foods":[],"meal_kcal":0}}, "Snack": {{"foods":[],"meal_kcal":0}}, "day_total_kcal":0}},
    "Wednesday": {{"Breakfast": {{"foods":[],"meal_kcal":0}}, "Lunch": {{"foods":[],"meal_kcal":0}}, "Dinner": {{"foods":[],"meal_kcal":0}}, "Snack": {{"foods":[],"meal_kcal":0}}, "day_total_kcal":0}},
    "Thursday":  {{"Breakfast": {{"foods":[],"meal_kcal":0}}, "Lunch": {{"foods":[],"meal_kcal":0}}, "Dinner": {{"foods":[],"meal_kcal":0}}, "Snack": {{"foods":[],"meal_kcal":0}}, "day_total_kcal":0}},
    "Friday":    {{"Breakfast": {{"foods":[],"meal_kcal":0}}, "Lunch": {{"foods":[],"meal_kcal":0}}, "Dinner": {{"foods":[],"meal_kcal":0}}, "Snack": {{"foods":[],"meal_kcal":0}}, "day_total_kcal":0}},
    "Saturday":  {{"Breakfast": {{"foods":[],"meal_kcal":0}}, "Lunch": {{"foods":[],"meal_kcal":0}}, "Dinner": {{"foods":[],"meal_kcal":0}}, "Snack": {{"foods":[],"meal_kcal":0}}, "day_total_kcal":0}},
    "Sunday":    {{"Breakfast": {{"foods":[],"meal_kcal":0}}, "Lunch": {{"foods":[],"meal_kcal":0}}, "Dinner": {{"foods":[],"meal_kcal":0}}, "Snack": {{"foods":[],"meal_kcal":0}}, "day_total_kcal":0}}
  }},
  "clinical_notes": "Brief dietary strategy explanation.",
  "foods_used": ["food name 1", "food name 2"]
}}
"""

    llm = ChatOllama(
        model=OLLAMA_MODEL,
        temperature=0.0,
        base_url=OLLAMA_HOST,
        num_predict=int(os.getenv("OLLAMA_SIMPLE_NUM_PREDICT", "6000")),
        num_ctx=int(os.getenv("OLLAMA_SIMPLE_NUM_CTX", "8000")),
        format="json",
    )

    logger.info(f"[SIMPLE] Calling {OLLAMA_MODEL}...")
    response = await llm.ainvoke(prompt)
    raw = response.content if hasattr(response, "content") else str(response)

    matrix_data = _repair_truncated_json(raw)

    try:
        validated = _validate_matrix_keys(matrix_data, tdee, patient_ctx)
    except ValueError as exc:
        logger.warning(f"[SIMPLE] Validation warning (returning anyway): {exc}")
        # In simple/test mode, return what we have even if validation fails
        return {
            "patient_id":          patientId,
            "tdee":                tdee,
            "matrix":              matrix_data.get("matrix", {}),
            "clinical_notes":      matrix_data.get("clinical_notes", ""),
            "foods_used":          matrix_data.get("foods_used", []),
            "raw_patient_context": patient_ctx,
            "validation_warning":  str(exc),
            "mode":                "simple_no_rag",
        }

    return {
        "patient_id":          patientId,
        "tdee":                tdee,
        "matrix":              validated["matrix"],
        "clinical_notes":      validated["clinical_notes"],
        "foods_used":          validated["foods_used"],
        "raw_patient_context": patient_ctx,
        "mode":                "simple_no_rag",
    }

# Log full LLM prompts (batch JSON + clinical notes). If unset: on when MATRIX_SKIP_RAG, else off.
_mlp = os.getenv("MATRIX_LOG_PROMPTS", "").strip()
if _mlp:
    MATRIX_LOG_PROMPTS = _mlp.lower() in ("1", "true", "yes", "on")
else:
    MATRIX_LOG_PROMPTS = MATRIX_SKIP_RAG
MATRIX_LOG_PROMPTS_MAX_CHARS = int(os.getenv("MATRIX_LOG_PROMPTS_MAX_CHARS", "0"))


def _log_matrix_prompt(label: str, prompt: str) -> None:
    if not MATRIX_LOG_PROMPTS:
        return
    n = len(prompt)
    cap = MATRIX_LOG_PROMPTS_MAX_CHARS
    body = (
        prompt
        if cap <= 0 or n <= cap
        else (prompt[:cap] + f"\n… [truncated, total {n} chars]")
    )
    logger.info("[matrix prompt] %s (%d chars)\n%s", label, n, body)


_NUTRITION_CTX_RAG_DISABLED = """=== NUTRITIONAL DATABASE CONTEXT (RAG OFF — TEST MODE) ===
No retrieved food list. Use clinical judgment, patient allergies/restrictions above, and TDEE targets.
Choose common whole foods; prefix foods_used with external: when not from a fixed catalog.
=== END OF NUTRITIONAL CONTEXT ==="""

LLM_PATIENT_CTX_MAX = int(os.getenv("LLM_PATIENT_CTX_MAX", "2200"))
LLM_NUTRITION_LINES_MAX = int(os.getenv("LLM_NUTRITION_LINES_MAX", "28"))


# ── Constants ─────────────────────────────────────────────────────────────────

ACTIVITY_FACTORS = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very active": 1.9,
    "very_active": 1.9,
    "low": 1.2,
    "high": 1.725,
}

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
LEGACY_SNACK_KEY = "Morning Snack"

_COMPOUND_FOOD_RE = re.compile(r"\+|&|\band\b|,|\bwith\b", re.IGNORECASE)

DISEASE_QUERY_MAP = {
    "diabetes": (
        "low glycemic index foods diabetes insulin blood sugar control high fiber",
        ["diabetes-friendly", "low glycemic index", "high fiber"],
    ),
    "type 2 diabetes": (
        "low gi foods diabetes blood sugar fiber lean protein",
        ["diabetes-friendly", "low glycemic index", "high fiber"],
    ),
    "pcos": (
        "low glycemic index high fiber anti-inflammatory foods pcos hormone balance",
        ["diabetes-friendly", "low glycemic index", "high fiber"],
    ),
    "hypertension": (
        "low sodium foods blood pressure heart healthy potassium",
        ["low sodium", "heart-healthy", "potassium-rich"],
    ),
    "cardiovascular": (
        "heart healthy low fat low cholesterol omega-3 fiber",
        ["low fat", "cardiovascular-friendly", "heart-healthy"],
    ),
    "obesity": (
        "low calorie high fiber satiety weight loss foods",
        ["low calorie", "high fiber", "weight loss friendly"],
    ),
    "chronic kidney": (
        "low potassium low phosphorus kidney friendly diet",
        ["low sodium"],
    ),
    "celiac": (
        "gluten free foods celiac disease safe grains",
        [],
    ),
    "hypercholesterolemia": (
        "low cholesterol low saturated fat heart healthy fiber",
        ["low fat", "cardiovascular-friendly", "high fiber"],
    ),
}


def _build_rag_query(patient_ctx: str, disease_str: str) -> tuple[str, list[str]]:
    disease_lower = disease_str.lower()
    for key, (query, tags) in DISEASE_QUERY_MAP.items():
        if key in disease_lower:
            return query, tags
    return (
        f"healthy balanced diet foods for {disease_str} high fiber lean protein low sugar",
        [],
    )


# ── TDEE calculator (Mifflin-St Jeor) — unchanged ─────────────────────────────

def _calculate_tdee(patient_context_str: str) -> dict:
    def _extract(label: str) -> Optional[str]:
        m = re.search(rf"{label}:\s*([^\n]+)", patient_context_str, re.IGNORECASE)
        return m.group(1).strip() if m else None

    try:
        weight = float(re.sub(r"[^\d.]", "", _extract("Weight") or "70") or 70)
    except Exception:
        weight = 70.0

    try:
        height = float(re.sub(r"[^\d.]", "", _extract("Height") or "170") or 170)
    except Exception:
        height = 170.0

    try:
        age = float(re.sub(r"[^\d.]", "", _extract("Age") or "30") or 30)
    except Exception:
        age = 30.0

    gender_raw = (_extract("Gender") or "female").lower()
    is_male = "male" in gender_raw and "female" not in gender_raw
    s = 5 if is_male else -161

    bmr = 10 * weight + 6.25 * height - 5 * age + s

    activity_raw = (_extract("Activity level") or "moderate").lower()
    activity_factor = 1.55
    for key, val in ACTIVITY_FACTORS.items():
        if key in activity_raw:
            activity_factor = val
            break

    kcal = round(bmr * activity_factor)

    protein_floor = round(weight * 1.6)
    protein_from_pct = round((kcal * 0.30) / 4)
    protein_g = max(protein_floor, protein_from_pct)
    fat_g = round((kcal * 0.28) / 9)
    carbs_g = max(80, round((kcal - protein_g * 4 - fat_g * 9) / 4))

    return {
        "kcal": kcal,
        "protein_g": protein_g,
        "carbs_g": carbs_g,
        "fat_g": fat_g,
        "bmr": round(bmr),
        "activity_factor": activity_factor,
        "method": "Mifflin-St Jeor × activity factor",
    }


def _resolve_tdee(patient_context_str: str, override: dict | None = None) -> dict:
    """Use specialist-approved targets when provided; else compute from patient context."""
    computed = _calculate_tdee(patient_context_str)
    if not override or not isinstance(override, dict):
        computed["target_source"] = "computed"
        return computed
    out = {**computed}
    used_specialist_kcal = False
    for key in ("kcal", "protein_g", "carbs_g", "fat_g", "bmr", "activity_factor"):
        if override.get(key) is not None:
            try:
                out[key] = int(round(float(override[key])))
                if key == "kcal":
                    used_specialist_kcal = True
            except (TypeError, ValueError):
                pass
    if override.get("goal"):
        out["goal"] = str(override["goal"])
    if override.get("maintenance_kcal") is not None:
        try:
            out["maintenance_kcal"] = int(round(float(override["maintenance_kcal"])))
        except (TypeError, ValueError):
            pass
    if override.get("method"):
        out["method"] = str(override["method"])
    elif used_specialist_kcal:
        out["method"] = "Specialist-selected goal (dashboard)"
    out["target_source"] = "specialist_dashboard" if used_specialist_kcal else "computed"
    return out


def _normalize_legacy_meal_keys(matrix: dict) -> dict:
    """Map legacy 'Morning Snack' slot to 'Snack'."""
    if not isinstance(matrix, dict):
        return matrix
    for day_obj in matrix.values():
        if not isinstance(day_obj, dict):
            continue
        if LEGACY_SNACK_KEY in day_obj:
            if "Snack" not in day_obj:
                day_obj["Snack"] = day_obj.pop(LEGACY_SNACK_KEY)
            else:
                del day_obj[LEGACY_SNACK_KEY]
    return matrix


def _is_compound_food_name(name: str) -> bool:
    n = str(name or "").strip()
    if not n:
        return True
    return bool(_COMPOUND_FOOD_RE.search(n))


def _compact_patient_context_for_llm(patient_ctx: str, max_chars: int) -> str:
    """Drop decorative === banners; keep section labels and clinical facts (smaller prompts)."""
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


def _build_batch_prompt(
    days: list[str],
    patient_ctx: str,
    nutrition_ctx: str,
    tdee: dict,
) -> str:
    kcal = tdee["kcal"]
    protein_g = tdee["protein_g"]
    carbs_g = tdee["carbs_g"]
    fat_g = tdee["fat_g"]
    days_csv = ", ".join(days)

    patient_compact = _compact_patient_context_for_llm(patient_ctx, LLM_PATIENT_CTX_MAX)
    nutrition_compact = _compact_nutrition_context_for_llm(
        nutrition_ctx,
        LLM_NUTRITION_LINES_MAX,
    )

    rule1 = (
        "1. PRIORITIZE foods listed in NUTRITIONAL DATABASE CONTEXT above."
        if not MATRIX_SKIP_RAG
        else "1. Choose whole foods appropriate to the patient's condition, allergies, and restrictions (no fixed food list in this run)."
    )

    tdee_label = (
        "SPECIALIST-SELECTED DAILY GOAL"
        if tdee.get("target_source") == "specialist_dashboard"
        else "COMPUTED DAILY TARGETS"
    )

    return f"""You are a clinical nutrition expert. Build a partial weekly diet matrix.

{patient_compact}

{nutrition_compact}

{tdee_label} (design each day to approximate these totals):
- Energy (TDEE): {kcal} kcal/day (acceptable band ±{int(round(KCAL_TOLERANCE))} kcal: {max(0, int(kcal - KCAL_TOLERANCE))}–{int(kcal + KCAL_TOLERANCE)})
- Protein: ~{protein_g} g/day | Carbs: ~{carbs_g} g/day | Fat: ~{fat_g} g/day
Distribute protein, carbs, and fat across the four meals in a balanced way; sum meal kcals to the TDEE band.

DAILY TARGETS: {kcal} kcal | Protein: {protein_g}g | Carbs: {carbs_g}g | Fat: {fat_g}g

HARD CONSTRAINT — CALORIES: TDEE for this patient is {kcal} kcal/day (tolerance ±{int(round(KCAL_TOLERANCE))}).
For EACH day you output, sum of all meal kcal MUST land in [{max(0, int(kcal - KCAL_TOLERANCE))}, {int(kcal + KCAL_TOLERANCE)}].
Set day_total_kcal to the sum of the four meals; do not invent a lower daily total.

Generate ONLY the following days: {days_csv}. No other days.
Do NOT write JavaScript comments (//) anywhere in the output.
Do NOT use ellipsis (...) as a placeholder for missing content.
Write every single meal in full. No shortcuts.
Output must be a single valid JSON object with no text before or after.

CRITICAL RULES:
{rule1}
2. Respect ALL allergies and restrictions in patient context.
3. Each listed day MUST have exactly 4 meals: Breakfast, Lunch, Dinner, Snack.
4. Each meal MUST list exactly ONE single food in foods[] — no recipes, no multi-ingredient names.
5. Each food MUST include portion_g (grams) and kcal, protein_g, carbs_g, fat_g scaled to that portion.
5b. Round portion_g: meats 10g, grains/carbs/vegetables 5g, eggs 50g minimum step.
6. Within each day, all four food names must be unique (no repeats on the same day).
7. Each day MUST include day_total_kcal (sum of meal_kcal).
8. Vary meals vs adjacent days in your batch where applicable.

Return JSON with this shape (only for the days you were assigned; fill those days completely):
{{
  "matrix": {{
    "{days[0]}": {{
      "Breakfast": {{"foods": [{{"name": "Oats", "portion_g": 80, "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}}], "meal_kcal": 0}},
      "Lunch": {{"foods": [{{"name": "Chicken Breast", "portion_g": 150, "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}}], "meal_kcal": 0}},
      "Dinner": {{"foods": [], "meal_kcal": 0}},
      "Snack": {{"foods": [], "meal_kcal": 0}},
      "day_total_kcal": 0
    }}
  }},
  "clinical_notes": "",
  "foods_used": ["food names used; prefix external: if not from database"]
}}
Include every assigned day as a key under "matrix" with full meal detail.
clinical_notes may be empty string (strategy text is produced separately).
"""


def _strip_json_like_noise(text: str) -> str:
    if not text:
        return text
    s = re.sub(r"/\*[\s\S]*?\*/", "", text)
    out = []
    for line in s.splitlines():
        st = line.lstrip()
        if st.startswith("//"):
            continue
        out.append(line)
    return "\n".join(out)


def _repair_truncated_json(raw_text: str) -> dict:
    """Parse JSON from model output; repair truncated/bracket-balanced payloads."""
    raw_text = (raw_text or "").strip()
    raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text, flags=re.IGNORECASE)
    raw_text = re.sub(r"\s*```$", "", raw_text)
    raw_text = _strip_json_like_noise(raw_text)

    def _try_parse(s: str) -> dict | None:
        s = s.strip()
        if not s:
            return None
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            return None

    parsed = _try_parse(raw_text)
    if parsed is not None:
        return parsed

    start = raw_text.find("{")
    if start == -1:
        raise ValueError("LLM returned invalid JSON — no JSON object found.")

    depth = 0
    for i in range(start, len(raw_text)):
        if raw_text[i] == "{":
            depth += 1
        elif raw_text[i] == "}":
            depth -= 1
            if depth == 0:
                chunk = _strip_json_like_noise(raw_text[start : i + 1])
                parsed = _try_parse(chunk)
                if parsed is not None:
                    return parsed
                for extra in ("", "}", '"}', "]", "]}", "}}", '}}"', "]}}"):
                    parsed = _try_parse(chunk + extra)
                    if parsed is not None:
                        return parsed
                raise ValueError(
                    "LLM returned invalid JSON — parse failed after repair attempts.",
                ) from None

    raise ValueError(
        "LLM returned truncated JSON — unbalanced braces. Try increasing "
        "OLLAMA_BATCH_NUM_PREDICT or reducing prompt size.",
    )


def _make_batch_llm() -> ChatOllama:
    candidates = [
        {
            "model": OLLAMA_MODEL,
            "temperature": 0.0,
            "base_url": OLLAMA_HOST,
            "num_predict": OLLAMA_BATCH_NUM_PREDICT,
            "num_ctx": OLLAMA_BATCH_NUM_CTX,
            "format": "json",
        },
        {
            "model": OLLAMA_MODEL,
            "temperature": 0.0,
            "base_url": OLLAMA_HOST,
            "num_predict": OLLAMA_BATCH_NUM_PREDICT,
            "format": "json",
        },
        {
            "model": OLLAMA_MODEL,
            "temperature": 0.0,
            "base_url": OLLAMA_HOST,
            "num_predict": OLLAMA_BATCH_NUM_PREDICT,
        },
        {
            "model": OLLAMA_MODEL,
            "temperature": 0.0,
            "base_url": OLLAMA_HOST,
        },
    ]
    for params in candidates:
        try:
            return ChatOllama(**params)
        except TypeError:
            continue
    return ChatOllama(
        model=OLLAMA_MODEL,
        temperature=0.0,
        base_url=OLLAMA_HOST,
    )


def _make_notes_llm() -> ChatOllama:
    """Small, fast model call for clinical strategy text (not JSON)."""
    n = OLLAMA_NOTES_NUM_PREDICT
    for params in (
        {
            "model": OLLAMA_MODEL,
            "temperature": 0.2,
            "base_url": OLLAMA_HOST,
            "num_predict": n,
        },
        {
            "model": OLLAMA_MODEL,
            "temperature": 0.2,
            "base_url": OLLAMA_HOST,
        },
    ):
        try:
            return ChatOllama(**params)
        except TypeError:
            continue
    return ChatOllama(
        model=OLLAMA_MODEL,
        temperature=0.2,
        base_url=OLLAMA_HOST,
    )


async def _generate_clinical_notes(
    patient_ctx: str,
    similar_ctx: str,
    disease_str: str,
) -> str:
    extra = ""
    if similar_ctx.strip():
        cap = int(os.getenv("RAG_SIMILAR_CTX_CAP", "4500"))
        extra = (
            "\n\nSIMILAR HISTORICAL CASES (reference only):\n"
            f"{similar_ctx[:cap]}"
        )
    prompt = f"""In 2–3 sentences, explain the dietary strategy for this patient.
Primary condition focus: {disease_str}. Mention allergies/restrictions and macro priorities when relevant.
Plain text only — no JSON, no markdown fences, no bullet list required.

{patient_ctx}{extra}
"""
    _log_matrix_prompt("clinical_notes", prompt)
    llm = _make_notes_llm()
    t0 = time.perf_counter()
    response = await llm.ainvoke(prompt)
    logger.info(
        "[timing] llm_clinical_notes: %.1f ms",
        (time.perf_counter() - t0) * 1000,
    )
    text = response.content if hasattr(response, "content") else str(response)
    out = (text or "").strip()
    return out or "Personalized nutrition plan aligned with clinical targets."


async def _generate_day_batch(
    days: list[str],
    patient_ctx: str,
    nutrition_ctx: str,
    tdee: dict,
) -> dict:
    prompt = _build_batch_prompt(days, patient_ctx, nutrition_ctx, tdee)
    label = ", ".join(days)
    _log_matrix_prompt(f"meal_batch_{label.replace(', ', '_')}", prompt)
    llm = _make_batch_llm()
    logger.info(
        f"[RAG] Batch LLM ({label}): model={OLLAMA_MODEL} temp=0 num_predict="
        f"{OLLAMA_BATCH_NUM_PREDICT} num_ctx={OLLAMA_BATCH_NUM_CTX} format=json",
    )
    t0 = time.perf_counter()
    response = await llm.ainvoke(prompt)
    logger.info(
        "[timing] llm_meal_batch_%s: %.1f ms",
        label.replace(", ", "_").replace(" ", "_"),
        (time.perf_counter() - t0) * 1000,
    )
    raw_text = response.content if hasattr(response, "content") else str(response)
    data = _repair_truncated_json(raw_text)
    if "matrix" not in data or not isinstance(data.get("matrix"), dict):
        raise ValueError(f"Batch [{label}] missing valid 'matrix' object in JSON.")
    return data


def _merge_batch_matrices(batch_payloads: list[dict], batch_day_sets: list[list[str]]) -> dict:
    merged_matrix: dict = {}
    foods_all: list[str] = []
    seen_food = set()

    for payload, expected_days in zip(batch_payloads, batch_day_sets):
        sub = payload.get("matrix") or {}
        for d in expected_days:
            if d not in sub:
                raise ValueError(
                    f"Merged matrix validation failed: missing day '{d}' in batch output.",
                )
            if d in merged_matrix:
                raise ValueError(f"Duplicate day key in merge: '{d}'.")
            merged_matrix[d] = sub[d]
        fu = payload.get("foods_used")
        if isinstance(fu, list):
            for item in fu:
                if isinstance(item, str) and item.strip():
                    k = item.strip().lower()
                    if k not in seen_food:
                        seen_food.add(k)
                        foods_all.append(item.strip())

    for day in DAYS:
        if day not in merged_matrix:
            raise ValueError(
                f"Merged matrix validation failed: missing calendar day '{day}'. "
                f"Present keys: {list(merged_matrix.keys())}",
            )
        day_o = merged_matrix[day]
        if not isinstance(day_o, dict):
            raise ValueError(f"Merged matrix validation failed: day '{day}' is not an object.")
        for meal in MEALS:
            if meal not in day_o:
                raise ValueError(
                    f"Merged matrix validation failed: missing meal '{meal}' for '{day}'.",
                )

    return {
        "matrix": merged_matrix,
        "foods_used": foods_all,
    }


def _normalize_food_item(f) -> dict:
    if not isinstance(f, dict):
        return {
            "name": str(f),
            "portion_g": 0.0,
            "kcal": 0.0,
            "protein_g": 0.0,
            "carbs_g": 0.0,
            "fat_g": 0.0,
        }
    return {
        "name": str(f.get("name", "unknown")),
        "portion_g": float(f.get("portion_g", 0) or 0),
        "kcal": float(f.get("kcal", 0) or 0),
        "protein_g": float(f.get("protein_g", 0) or 0),
        "carbs_g": float(f.get("carbs_g", 0) or 0),
        "fat_g": float(f.get("fat_g", 0) or 0),
    }


def _snap_matrix_to_tdee(matrix: dict, target_kcal: float, tol: float) -> None:
    """
    Scale each day's foods so daily kcal matches TDEE (smaller LLMs often undershoot).
    Preserves macro ratios and portion scaling per food item.
    """
    t = float(target_kcal)
    tol_f = float(tol)
    for day in DAYS:
        day_o = matrix[day]
        total_from_foods = 0.0
        for meal in MEALS:
            blk = day_o[meal]
            for f in blk.get("foods") or []:
                fi = _normalize_food_item(f)
                total_from_foods += float(fi.get("kcal", 0) or 0)
        if total_from_foods <= 1e-6:
            total_from_foods = sum(
                float(day_o[m].get("meal_kcal", 0) or 0)
                for m in MEALS
                if isinstance(day_o.get(m), dict)
            )
        if total_from_foods <= 1e-6:
            logger.warning(
                "[matrix] %s: cannot snap to TDEE — no non-zero kcal in foods",
                day,
            )
            continue
        dt = float(day_o.get("day_total_kcal", total_from_foods))
        if abs(dt - t) <= tol_f:
            continue
        factor = t / total_from_foods
        logger.info(
            "[matrix] TDEE snap %s: %.0f kcal → target %.0f (scale %.4f)",
            day,
            dt,
            t,
            factor,
        )
        for meal in MEALS:
            blk = day_o[meal]
            foods = blk.get("foods") or []
            for f in foods:
                fi = _normalize_food_item(f)
                f["kcal"] = round(float(fi.get("kcal", 0) or 0) * factor, 2)
                f["protein_g"] = round(float(fi.get("protein_g", 0) or 0) * factor, 2)
                f["carbs_g"] = round(float(fi.get("carbs_g", 0) or 0) * factor, 2)
                f["fat_g"] = round(float(fi.get("fat_g", 0) or 0) * factor, 2)
                f["portion_g"] = round(float(fi.get("portion_g", 0) or 0) * factor, 2)
                apply_portion_rules_to_food(f)
            mk = sum(
                float(_normalize_food_item(x).get("kcal", 0) or 0)
                for x in blk.get("foods") or []
            )
            blk["meal_kcal"] = round(mk, 1)
        day_o["day_total_kcal"] = round(
            sum(float(day_o[m]["meal_kcal"]) for m in MEALS),
            1,
        )


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


def _validate_day_kcal_tolerance(matrix: dict, target_kcal: float, tol: float) -> None:
    target_kcal = float(target_kcal)
    for day in DAYS:
        dt = matrix[day].get("day_total_kcal")
        if dt is None:
            raise ValueError(f"{day}: missing day_total_kcal")
        dt = float(dt)
        if abs(dt - target_kcal) > tol:
            raise ValueError(
                f"{day}: day_total_kcal={dt} is not within ±{tol} of TDEE "
                f"target {target_kcal}",
            )


def _validate_one_food_per_meal(matrix: dict) -> None:
    """Each meal slot: exactly one single, non-compound food."""
    for day in DAYS:
        if day not in matrix:
            continue
        for meal in MEALS:
            foods = matrix[day][meal].get("foods") or []
            if len(foods) != 1:
                raise ValueError(
                    f"{day}/{meal}: exactly one food item required — got {len(foods)}.",
                )
            name = _normalize_food_item(foods[0]).get("name", "")
            if _is_compound_food_name(name):
                raise ValueError(
                    f"{day}/{meal}: use a single food name, not a compound dish: {name!r}",
                )
            portion = float(_normalize_food_item(foods[0]).get("portion_g", 0) or 0)
            if portion <= 0:
                raise ValueError(
                    f"{day}/{meal}: portion_g must be positive grams for {name!r}.",
                )


def _validate_daily_food_uniqueness(matrix: dict) -> None:
    """No food name repeated within the same calendar day."""
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


def _extract_allergen_terms(patient_ctx: str) -> list[str]:
    terms: list[str] = []
    for pattern in (
        r"Allergies:\s*([^\n]+)",
        r"Food aversions:\s*([^\n]+)",
    ):
        m = re.search(pattern, patient_ctx, re.IGNORECASE)
        if not m:
            continue
        blob = m.group(1).strip()
        if blob.lower() in ("none", "n/a", ""):
            continue
        for part in re.split(r"[,;]", blob):
            t = part.strip()
            if len(t) >= 2:
                terms.append(t)
    out = []
    seen = set()
    for t in terms:
        k = t.lower()
        if k not in seen:
            seen.add(k)
            out.append(t)
    return out


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


def _validate_matrix_keys(
    matrix_data: dict,
    python_tdee: dict,
    patient_ctx: str,
) -> dict:
    if "matrix" not in matrix_data:
        raise ValueError("LLM response missing 'matrix' key.")
    matrix = matrix_data["matrix"]
    if not isinstance(matrix, dict):
        raise ValueError("'matrix' must be an object.")

    matrix = _normalize_legacy_meal_keys(matrix)

    for day in DAYS:
        if day not in matrix:
            raise ValueError(f"Missing calendar day '{day}' in matrix.")
        for meal in MEALS:
            if meal not in matrix[day]:
                raise ValueError(f"Missing meal '{meal}' for '{day}'.")

    matrix = _normalize_matrix_in_place(matrix)
    if MATRIX_AUTO_SCALE_TDEE:
        _snap_matrix_to_tdee(matrix, float(python_tdee["kcal"]), KCAL_TOLERANCE)
        matrix = _normalize_matrix_in_place(matrix)
    _validate_day_kcal_tolerance(matrix, python_tdee["kcal"], KCAL_TOLERANCE)
    _validate_one_food_per_meal(matrix)
    _validate_daily_food_uniqueness(matrix)
    _validate_allergens_and_restrictions(patient_ctx, matrix)

    apply_portion_rules_to_matrix(matrix, MEALS, DAYS)

    clinical_notes = matrix_data.get("clinical_notes") or ""
    foods_used = _merge_foods_used(matrix_data.get("foods_used"), matrix)
    if not foods_used:
        raise ValueError(
            "foods_used is empty — ensure each meal lists foods with names.",
        )

    return {
        "matrix": matrix,
        "clinical_notes": clinical_notes,
        "foods_used": foods_used,
    }


async def generateNutritionMatrix(
    patientId: int, target_macros: dict | None = None
) -> dict:
    logger.info(f"[RAG] Step 1: MySQL clinical summary for patient id={patientId}")
    patient_ctx = await timed_coro(
        "matrix_mysql_patient_context",
        getPatientContext(patientId),
    )

    disease_match = re.search(
        r"Primary disease:\s*([^\n]+)", patient_ctx, re.IGNORECASE
    )
    disease_str = disease_match.group(1).strip() if disease_match else "general health"

    rag_query, boost_tags = _build_rag_query(patient_ctx, disease_str)

    if MATRIX_SKIP_RAG:
        logger.warning(
            "[matrix] MATRIX_SKIP_RAG=1 — skipping Chroma (nutrition + similar patients); "
            "using MySQL patient/clinical context only.",
        )
        nutrition_ctx = _NUTRITION_CTX_RAG_DISABLED
        similar_ctx = ""
    else:
        logger.info(
            f"[RAG] Step 2: Chroma db_nutritie query={rag_query!r} tags={boost_tags}",
        )
        nutrition_ctx = await timed_coro(
            "matrix_chroma_nutrition_context",
            getNutritionalContext(
                rag_query,
                top_k=RAG_NUTRITION_TOP_K,
                disease_filter_tags=boost_tags,
            ),
        )

        logger.info(f"[RAG] Step 3: similar historical patients for '{disease_str}'")
        similar_ctx = await timed_coro(
            "matrix_chroma_similar_patients",
            getSimilarPatientsContext(patient_ctx),
        )
        if similar_ctx:
            logger.info("[RAG] Similar patient context loaded.")
        else:
            logger.info(
                "[RAG] No similar patient context available (db_pacienti may be empty).",
            )

    tdee = _resolve_tdee(patient_ctx, target_macros)
    logger.info(
        f"[RAG] Step 4 TDEE: {tdee['kcal']} kcal | P:{tdee['protein_g']}g "
        f"C:{tdee['carbs_g']}g F:{tdee['fat_g']}g | BMR {tdee.get('bmr')} | "
        f"source={tdee.get('target_source', 'computed')}",
    )

    logger.info(
        "[RAG] Step 5: parallel LLM — 3 meal batches + 1 clinical-notes call (similar cases only in notes)…",
    )
    t_parallel = time.perf_counter()
    b1, b2, b3, clinical_notes = await asyncio.gather(
        _generate_day_batch(BATCH_1, patient_ctx, nutrition_ctx, tdee),
        _generate_day_batch(BATCH_2, patient_ctx, nutrition_ctx, tdee),
        _generate_day_batch(BATCH_3, patient_ctx, nutrition_ctx, tdee),
        _generate_clinical_notes(patient_ctx, similar_ctx, disease_str),
    )
    logger.info(
        "[timing] matrix_parallel_llm_gather_wall_clock: %.1f ms",
        (time.perf_counter() - t_parallel) * 1000,
    )

    merged = _merge_batch_matrices(
        [b1, b2, b3],
        [BATCH_1, BATCH_2, BATCH_3],
    )

    out_tdee = {
        "kcal": tdee["kcal"],
        "protein_g": tdee["protein_g"],
        "carbs_g": tdee["carbs_g"],
        "fat_g": tdee["fat_g"],
    }
    matrix_data = {
        "tdee": out_tdee,
        "matrix": merged["matrix"],
        "clinical_notes": clinical_notes,
        "foods_used": merged["foods_used"],
    }

    try:
        validated = _validate_matrix_keys(matrix_data, tdee, patient_ctx)
    except ValueError as exc:
        logger.error(f"[RAG] Matrix validation failed: {exc}")
        raise

    return {
        "patient_id": patientId,
        "tdee": tdee,
        "matrix": validated["matrix"],
        "clinical_notes": validated["clinical_notes"],
        "foods_used": validated["foods_used"],
        "raw_patient_context": patient_ctx,
    }


# def generate_nutrition_matrix_sync(patient_id: int) -> dict:
#     loop = asyncio.new_event_loop()
#     try:
#         return loop.run_until_complete(generateNutritionMatrix(patient_id))
#     finally:
#         loop.close()

def generate_nutrition_matrix_sync(
    patient_id: int, target_macros: dict | None = None
) -> dict:
    loop = asyncio.new_event_loop()
    try:
        coro = (
            generateNutritionMatrixSimple(patient_id, target_macros=target_macros)
            if MATRIX_SIMPLE_MODE
            else generateNutritionMatrix(patient_id, target_macros=target_macros)
        )
        return loop.run_until_complete(coro)
    finally:
        loop.close()