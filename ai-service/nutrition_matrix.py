"""
nutrition_matrix.py
───────────────────
Core RAG function: generateNutritionMatrix(patientId)

Pipeline:
  1. getPatientContext(patientId)         → MySQL join (patients, medical_records, …)
  2. getNutritionalContext(query)         → ChromaDB db_nutritie TOP-50 foods (enriched)
  3. getSimilarPatientsContext(ctx)       → ChromaDB db_pacienti TOP-5 similar cases
  4. Build TDEE (Mifflin-St Jeor)        → kcal / macros
  5. Call Mistral via Ollama             → 7×4 JSON meal matrix
  6. Validate + return structured dict
"""

from __future__ import annotations

import json
import re
import os
import asyncio
import logging
from typing import Optional

from langchain_ollama import ChatOllama
from rag_service import getPatientContext, getNutritionalContext, getSimilarPatientsContext

logger = logging.getLogger(__name__)

OLLAMA_HOST  = os.getenv("OLLAMA_HOST",  "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")

# ── Constants ─────────────────────────────────────────────────────────────────

ACTIVITY_FACTORS = {
    "sedentary":   1.2,
    "light":       1.375,
    "moderate":    1.55,
    "active":      1.725,
    "very active": 1.9,
    "very_active": 1.9,
    "low":         1.2,
    "high":        1.725,
}

DAYS  = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MEALS = ["Breakfast", "Morning Snack", "Lunch", "Dinner"]

# Maps disease keywords → focused RAG queries + tags for boosting
DISEASE_QUERY_MAP = {
    "diabetes":             (
        "low glycemic index foods diabetes insulin blood sugar control high fiber",
        ["diabetes-friendly", "low glycemic index", "high fiber"],
    ),
    "type 2 diabetes":      (
        "low gi foods diabetes blood sugar fiber lean protein",
        ["diabetes-friendly", "low glycemic index", "high fiber"],
    ),
    "hypertension":         (
        "low sodium foods blood pressure heart healthy potassium",
        ["low sodium", "heart-healthy", "potassium-rich"],
    ),
    "cardiovascular":       (
        "heart healthy low fat low cholesterol omega-3 fiber",
        ["low fat", "cardiovascular-friendly", "heart-healthy"],
    ),
    "obesity":              (
        "low calorie high fiber satiety weight loss foods",
        ["low calorie", "high fiber", "weight loss friendly"],
    ),
    "chronic kidney":       (
        "low potassium low phosphorus kidney friendly diet",
        ["low sodium"],
    ),
    "celiac":               (
        "gluten free foods celiac disease safe grains",
        [],
    ),
    "hypercholesterolemia": (
        "low cholesterol low saturated fat heart healthy fiber",
        ["low fat", "cardiovascular-friendly", "high fiber"],
    ),
}


def _build_rag_query(patient_ctx: str, disease_str: str) -> tuple[str, list[str]]:
    """
    Returns (query_string, boost_tags) for a given disease.
    """
    disease_lower = disease_str.lower()
    for key, (query, tags) in DISEASE_QUERY_MAP.items():
        if key in disease_lower:
            return query, tags
    # Fallback
    return (
        f"healthy balanced diet foods for {disease_str} high fiber lean protein low sugar",
        [],
    )


# ── TDEE calculator (Mifflin-St Jeor) ────────────────────────────────────────

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
    is_male    = "male" in gender_raw and "female" not in gender_raw
    s          = 5 if is_male else -161

    bmr = 10 * weight + 6.25 * height - 5 * age + s

    activity_raw    = (_extract("Activity level") or "moderate").lower()
    activity_factor = 1.55  # default: moderate
    for key, val in ACTIVITY_FACTORS.items():
        if key in activity_raw:
            activity_factor = val
            break

    kcal = round(bmr * activity_factor)

    protein_floor    = round(weight * 1.6)
    protein_from_pct = round((kcal * 0.30) / 4)
    protein_g        = max(protein_floor, protein_from_pct)
    fat_g            = round((kcal * 0.28) / 9)
    carbs_g          = max(80, round((kcal - protein_g * 4 - fat_g * 9) / 4))

    return {
        "kcal":            kcal,
        "protein_g":       protein_g,
        "carbs_g":         carbs_g,
        "fat_g":           fat_g,
        "bmr":             round(bmr),
        "activity_factor": activity_factor,
        "method":          "Mifflin-St Jeor × activity factor",
    }


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_prompt(
    patient_ctx:  str,
    nutrition_ctx: str,
    tdee:         dict,
    similar_ctx:  str = "",
) -> str:
    protein_g = tdee["protein_g"]
    carbs_g   = tdee["carbs_g"]
    fat_g     = tdee["fat_g"]
    kcal      = tdee["kcal"]

    similar_section = ""
    if similar_ctx.strip():
        similar_section = f"""
{similar_ctx}

GUIDANCE FROM SIMILAR CASES:
Study the cases above. Use their meal plan structures and dietary patterns as
inspiration. Adapt ALL portions, specific foods, and macros to match the CURRENT
patient's daily targets and restrictions listed below.
"""

    return f"""You are a clinical nutrition expert. Generate a 7-day, 4-meal-per-day personalized diet plan.

{patient_ctx}
{similar_section}
{nutrition_ctx}

DAILY TARGETS (MUST be respected):
  - Total:          {kcal} kcal
  - Protein:        {protein_g} g
  - Carbohydrates:  {carbs_g} g
  - Fat:            {fat_g} g

CRITICAL RULES:
1. PRIORITIZE foods listed in the NUTRITIONAL DATABASE CONTEXT above.
2. If a retrieved food fits the patient's condition and macro targets, use it.
3. If you cannot find enough variety in the list, you MAY use well-known whole foods
   (e.g., chicken breast, oats, broccoli) BUT prefix their name with "external:" in
   the foods_used list to distinguish them from database foods.
4. Respect ALL allergies and dietary restrictions in the patient context — these are
   absolute constraints, never violate them.
5. Each day MUST have exactly 4 meals: Breakfast, Morning Snack, Lunch, Dinner.
6. Vary meals across days — do NOT repeat the same meal on consecutive days.
7. Each meal entry MUST include: food name, portion in grams, estimated kcal,
   protein_g, carbs_g, fat_g.
8. Day totals MUST be within ±150 kcal of the daily target of {kcal} kcal.
9. If a specific food is unavailable, substitute with the nearest equivalent.
10. NEVER say "I don't know" — always generate the full 7-day matrix.

OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown, no explanation,
no text before or after the JSON.

{{
  "tdee": {{
    "kcal": {kcal},
    "protein_g": {protein_g},
    "carbs_g": {carbs_g},
    "fat_g": {fat_g}
  }},
  "matrix": {{
    "Monday": {{
      "Breakfast":     {{"foods": [{{"name": "...", "portion_g": 0, "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}}], "meal_kcal": 0}},
      "Morning Snack": {{"foods": [...], "meal_kcal": 0}},
      "Lunch":         {{"foods": [...], "meal_kcal": 0}},
      "Dinner":        {{"foods": [...], "meal_kcal": 0}},
      "day_total_kcal": 0
    }},
    "Tuesday":   {{}},
    "Wednesday": {{}},
    "Thursday":  {{}},
    "Friday":    {{}},
    "Saturday":  {{}},
    "Sunday":    {{}}
  }},
  "clinical_notes": "Brief explanation of dietary strategy for this patient's condition.",
  "foods_used": ["list of food names used; prefix external: if not from the database"]
}}
"""


# ── Main async function ───────────────────────────────────────────────────────

async def generateNutritionMatrix(patientId: int) -> dict:
    """
    Full RAG pipeline → 7×4 Nutrition Matrix.

    Returns:
        {
          "patient_id":          int,
          "tdee":                { kcal, protein_g, carbs_g, fat_g, bmr, … },
          "matrix":              { "Monday": { "Breakfast": {…}, … }, … },
          "clinical_notes":      str,
          "foods_used":          [str],
          "raw_patient_context": str,
        }
    """
    # Step 1: Current patient context (MySQL)
    logger.info(f"[RAG] Fetching patient context for id={patientId}")
    patient_ctx = await getPatientContext(patientId)

    # Step 2: Disease-aware nutritional context (ChromaDB db_nutritie)
    disease_match = re.search(r"Primary disease:\s*([^\n]+)", patient_ctx, re.IGNORECASE)
    disease_str   = disease_match.group(1).strip() if disease_match else "general health"

    rag_query, boost_tags = _build_rag_query(patient_ctx, disease_str)
    logger.info(f"[RAG] ChromaDB query: '{rag_query}'")

    nutrition_ctx = await getNutritionalContext(
        rag_query,
        top_k=50,
        disease_filter_tags=boost_tags,
    )

    # Step 3: Similar historical patients (ChromaDB db_pacienti)
    logger.info(f"[RAG] Fetching similar patient cases for disease='{disease_str}'")
    similar_ctx = await getSimilarPatientsContext(patient_ctx, top_k=5)
    if similar_ctx:
        logger.info("[RAG] Similar patient context loaded.")
    else:
        logger.info("[RAG] No similar patient context available (db_pacienti may be empty).")

    # Step 4: TDEE
    tdee = _calculate_tdee(patient_ctx)
    logger.info(f"[RAG] TDEE: {tdee['kcal']} kcal | P:{tdee['protein_g']}g C:{tdee['carbs_g']}g F:{tdee['fat_g']}g")

    # Step 5: Build prompt + call LLM
    prompt = _build_prompt(patient_ctx, nutrition_ctx, tdee, similar_ctx)

    llm = ChatOllama(
        model=OLLAMA_MODEL,
        temperature=0.1,
        base_url=OLLAMA_HOST,
    )

    logger.info(f"[RAG] Calling {OLLAMA_MODEL} via Ollama…")
    response = await llm.ainvoke(prompt)
    raw_text = response.content if hasattr(response, "content") else str(response)

    # Step 6: Strip markdown fences if present
    raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text.strip())
    raw_text = re.sub(r"\s*```$",          "", raw_text.strip())

    # Step 7: Parse JSON
    try:
        matrix_data = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        logger.error(f"[RAG] JSON parse error: {exc}\nRaw output (first 2000 chars):\n{raw_text[:2000]}")
        raise ValueError(
            f"LLM returned invalid JSON. Parse error: {exc}. "
            "Verify Ollama is running and the model is available."
        )

    # Step 8: Structural validation
    if "matrix" not in matrix_data:
        raise ValueError("LLM response missing 'matrix' key.")

    for day in DAYS:
        if day not in matrix_data["matrix"]:
            raise ValueError(f"LLM response missing day '{day}' in matrix.")
        for meal in MEALS:
            if meal not in matrix_data["matrix"][day]:
                raise ValueError(f"LLM response missing meal '{meal}' for '{day}'.")

    return {
        "patient_id":           patientId,
        "tdee":                 matrix_data.get("tdee", tdee),
        "matrix":               matrix_data["matrix"],
        "clinical_notes":       matrix_data.get("clinical_notes", ""),
        "foods_used":           matrix_data.get("foods_used", []),
        "raw_patient_context":  patient_ctx,
    }


# ── Sync wrapper (for Flask) ──────────────────────────────────────────────────

def generate_nutrition_matrix_sync(patient_id: int) -> dict:
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(generateNutritionMatrix(patient_id))
    finally:
        loop.close()