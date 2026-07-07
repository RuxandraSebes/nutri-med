from __future__ import annotations

import json
import re
import os
import asyncio
import logging
import time

from langchain_ollama import ChatOllama
from pipeline_timing import timed_coro
from rag_service import (
    get_patient_context,
    get_nutritional_candidates,
    get_similar_patients_context,
)
from portion_rules import apply_portion_rules_to_food, apply_portion_rules_to_matrix, portion_max_for_name
from food_catalog import (
    catalog_food_records,
    food_category,
)

logger = logging.getLogger(__name__)

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")

BATCH_1 = ["Monday", "Tuesday", "Wednesday"]
BATCH_2 = ["Thursday", "Friday"]
BATCH_3 = ["Saturday", "Sunday"]

OLLAMA_BATCH_NUM_PREDICT = int(os.getenv("OLLAMA_BATCH_NUM_PREDICT", "2800"))
OLLAMA_BATCH_NUM_CTX = int(os.getenv("OLLAMA_BATCH_NUM_CTX", "8192"))
OLLAMA_BATCH_TEMPERATURE = float(os.getenv("OLLAMA_BATCH_TEMPERATURE", "0.6"))
MATRIX_DAYS_PER_BATCH = max(1, min(7, int(os.getenv("MATRIX_DAYS_PER_BATCH", "1"))))
MATRIX_LLM_PARALLEL = max(1, int(os.getenv("MATRIX_LLM_PARALLEL", "3")))
KCAL_TOLERANCE = float(os.getenv("MATRIX_KCAL_TOLERANCE", "150"))
MATRIX_AUTO_SCALE_TDEE = os.getenv("MATRIX_AUTO_SCALE_TDEE", "1").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
RAG_NUTRITION_TOP_K = int(os.getenv("RAG_NUTRITION_TOP_K", "6"))
MATRIX_CANDIDATE_TOP_K = int(os.getenv("MATRIX_CANDIDATE_TOP_K", "45"))
MATRIX_PROTEIN_CANDIDATE_TOP_K = int(os.getenv("MATRIX_PROTEIN_CANDIDATE_TOP_K", "20"))
MATRIX_FAT_CANDIDATE_TOP_K = int(os.getenv("MATRIX_FAT_CANDIDATE_TOP_K", "15"))
MATRIX_VEGETABLE_CANDIDATE_TOP_K = int(os.getenv("MATRIX_VEGETABLE_CANDIDATE_TOP_K", "20"))
MATRIX_CARB_CANDIDATE_TOP_K = int(os.getenv("MATRIX_CARB_CANDIDATE_TOP_K", "20"))
OLLAMA_NOTES_NUM_PREDICT = int(os.getenv("OLLAMA_NOTES_NUM_PREDICT", "256"))

MATRIX_LOG_PROMPTS = os.getenv("MATRIX_LOG_PROMPTS", "0").strip().lower() in (
    "1", "true", "yes", "on",
)
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


LLM_PATIENT_CTX_MAX = int(os.getenv("LLM_PATIENT_CTX_MAX", "2200"))
LLM_NUTRITION_LINES_MAX = int(os.getenv("LLM_NUTRITION_LINES_MAX", "28"))


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
MAIN_MEALS = ("Breakfast", "Lunch", "Dinner")
MAIN_MEAL_ROLES = ("protein", "carb", "vegetable", "fat")
WEEKLY_FOOD_MAX_APPEARANCES = 2
FAT_WEEKLY_FOOD_MAX_APPEARANCES = 5


def _weekly_cap_for_role(role: str) -> int:
    return FAT_WEEKLY_FOOD_MAX_APPEARANCES if role == "fat" else WEEKLY_FOOD_MAX_APPEARANCES


LEGACY_SNACK_KEY = "Morning Snack"

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


def _build_protein_rag_query(disease_str: str) -> tuple[str, list[str]]:
    return (
        f"lean protein sources chicken turkey fish eggs seafood high protein "
        f"muscle support suitable for {disease_str}",
        ["high protein"],
    )


def _build_fat_rag_query(disease_str: str) -> tuple[str, list[str]]:
    return (
        f"healthy fats olive oil nuts seeds avocado unsaturated fat sources "
        f"suitable for {disease_str}",
        [],
    )


def _build_vegetable_rag_query(disease_str: str) -> tuple[str, list[str]]:
    return (
        f"fresh vegetables leafy greens peppers broccoli spinach fiber "
        f"vitamins minerals suitable for {disease_str}",
        [],
    )


def _build_carb_rag_query(disease_str: str) -> tuple[str, list[str]]:
    return (
        f"whole grains bread rice oats quinoa pasta potatoes starchy carbohydrate "
        f"sources fruit suitable for {disease_str}",
        [],
    )


async def _fetch_role_focused_candidates(
    queries: list[tuple[str, str, list[str], int]],
) -> list[dict]:
    results = await asyncio.gather(
        *[
            timed_coro(
                f"matrix_chroma_{label}_context",
                get_nutritional_candidates(query, top_k=top_k, disease_filter_tags=tags),
            )
            for label, query, tags, top_k in queries
        ],
    )
    merged: list[dict] = []
    seen: set[str] = set()
    for group in results:
        for record in group:
            key = _norm_food_name(record.get("name", ""))
            if key and key not in seen:
                seen.add(key)
                merged.append(record)
    return merged


SNACK_MAX_KCAL_PER_100G = 150.0


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
        "=== AVAILABLE FOODS (pick by ID number only, e.g. 7 — never write a food name) ===",
        "PROTEIN SOURCES: " + fmt(by_role["protein"]),
        "CARB SOURCES (grains/fruit): " + fmt(carb_and_fruit),
        "VEGETABLES: " + fmt(by_role["vegetable"]),
        "FATS (small amounts — oils, nuts, seeds, avocado): " + fmt(by_role["fat"]),
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


def _normalize_legacy_meal_keys(matrix: dict) -> dict:
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
        f"Carbs {tdee['carbs_g']}g, Fat {tdee['fat_g']}g) — for context only. Exact portions and "
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
Anchor on protein: for every main meal, pick the protein ID first, then choose a carb, vegetable, and fat ID that would realistically appear on the same plate as that protein — think of real dishes matching the {preferred_cuisine} flavor profile, not random category matches.
Good: salmon + quinoa + asparagus + olive oil (Mediterranean). Good: eggs + oats + spinach + walnuts.
Avoid: tuna + oats + broccoli + peanut butter — a technically-valid combination with no real dish behind it.

CRITICAL RULES:
1. Use ONLY the IDs listed in AVAILABLE FOODS above. Output each food as its bare ID number — never write a food name.
2. Respect ALL allergies and restrictions in patient context.
3. Each listed day MUST have exactly 4 meals: Breakfast, Lunch, Dinner, Snack.
4. Breakfast, Lunch, and Dinner MUST each list exactly FOUR IDs, in this exact order: 1st the protein ID, 2nd the carb ID, 3rd the vegetable ID, 4th the fat ID — chosen as a coherent, appetizing combination per the guidance above.
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
Include every assigned day as a key under "matrix". Every entry in every "foods" array must be a bare integer ID — no names, no objects.
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


def _close_truncated_json_suffix(text: str) -> str:
    stack: list[str] = []
    in_string = False
    escape = False
    for ch in text:
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            stack.append("}")
        elif ch == "[":
            stack.append("]")
        elif ch in ("}", "]") and stack and stack[-1] == ch:
            stack.pop()
    suffix = ('"' if in_string else "") + "".join(reversed(stack))
    return text + suffix


def _repair_truncated_json(raw_text: str) -> dict:
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

    tail = _strip_json_like_noise(raw_text[start:])
    closed = _close_truncated_json_suffix(tail)
    for candidate in (closed, closed + "}", closed + "]}"):
        parsed = _try_parse(candidate)
        if parsed is not None:
            logger.warning(
                "Repaired truncated JSON by closing %d open bracket(s)/brace(s)",
                closed.count("}") + closed.count("]") - tail.count("}") - tail.count("]"),
            )
            return parsed

    raise ValueError(
        "LLM returned truncated JSON — unbalanced braces. Try increasing "
        "OLLAMA_BATCH_NUM_PREDICT, set MATRIX_DAYS_PER_BATCH=1, or use a larger model.",
    )


def _make_batch_llm() -> ChatOllama:
    candidates = [
        {
            "model": OLLAMA_MODEL,
            "temperature": OLLAMA_BATCH_TEMPERATURE,
            "base_url": OLLAMA_HOST,
            "num_predict": OLLAMA_BATCH_NUM_PREDICT,
            "num_ctx": OLLAMA_BATCH_NUM_CTX,
            "format": "json",
        },
        {
            "model": OLLAMA_MODEL,
            "temperature": OLLAMA_BATCH_TEMPERATURE,
            "base_url": OLLAMA_HOST,
            "num_predict": OLLAMA_BATCH_NUM_PREDICT,
            "format": "json",
        },
        {
            "model": OLLAMA_MODEL,
            "temperature": OLLAMA_BATCH_TEMPERATURE,
            "base_url": OLLAMA_HOST,
            "num_predict": OLLAMA_BATCH_NUM_PREDICT,
        },
        {
            "model": OLLAMA_MODEL,
            "temperature": OLLAMA_BATCH_TEMPERATURE,
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
    llm_semaphore: asyncio.Semaphore | None = None,
) -> dict:
    prompt = _build_batch_prompt(days, patient_ctx, nutrition_ctx, tdee)
    label = ", ".join(days)
    _log_matrix_prompt(f"meal_batch_{label.replace(', ', '_')}", prompt)
    llm = _make_batch_llm()
    logger.info(
        f"[RAG] Batch LLM ({label}): model={OLLAMA_MODEL} temp={OLLAMA_BATCH_TEMPERATURE} num_predict="
        f"{OLLAMA_BATCH_NUM_PREDICT} num_ctx={OLLAMA_BATCH_NUM_CTX} format=json",
    )
    t0 = time.perf_counter()

    async def _invoke() -> dict:
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

    if llm_semaphore is not None:
        async with llm_semaphore:
            return await _invoke()
    return await _invoke()


def _matrix_day_batches() -> list[list[str]]:
    batches: list[list[str]] = []
    step = MATRIX_DAYS_PER_BATCH
    for i in range(0, len(DAYS), step):
        batches.append(DAYS[i : i + step])
    return batches


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
    out = {
        "name": str(f.get("name", "unknown")),
        "portion_g": float(f.get("portion_g", 0) or 0),
        "kcal": float(f.get("kcal", 0) or 0),
        "protein_g": float(f.get("protein_g", 0) or 0),
        "carbs_g": float(f.get("carbs_g", 0) or 0),
        "fat_g": float(f.get("fat_g", 0) or 0),
    }
    if f.get("macro_role"):
        out["macro_role"] = str(f.get("macro_role"))
    return out


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
                    "[matrix] %s/%s: cannot snap to target — no non-zero kcal in foods",
                    day,
                    meal,
                )
                continue

            assigned_kcal = _snap_meal_foods_to_target(foods, target)
            if assigned_kcal < target - 1.0:
                capped_days.add(day)
                logger.warning(
                    "[matrix] %s/%s: capped at %.0f kcal (target %.0f) — foods hit realistic portion limits",
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
            logger.warning("%s/Snack: LLM returned %d foods — keeping first 2", day, len(snack_foods))
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
                        "%s/%s: weekly cap — replaced %r with %r",
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


def _validate_meal_structure(matrix: dict, pool_by_name: dict[str, dict] | None = None) -> None:
    for day in DAYS:
        if day not in matrix:
            continue
        for meal in MAIN_MEALS:
            foods = matrix[day][meal].get("foods") or []
            if len(foods) != len(MAIN_MEAL_ROLES):
                raise ValueError(
                    f"{day}/{meal}: exactly {len(MAIN_MEAL_ROLES)} foods required "
                    f"(protein + carb + vegetable + fat) — got {len(foods)}.",
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
                    f"and one fat — got roles {roles}.",
                )

        snack_foods = matrix[day]["Snack"].get("foods") or []
        if len(snack_foods) not in (1, 2):
            raise ValueError(
                f"{day}/Snack: 1 or 2 foods required — got {len(snack_foods)}.",
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


def _filter_allergen_candidates(rag_candidates: list[dict], patient_ctx: str) -> list[dict]:
    terms = [t.lower() for t in _extract_allergen_terms(patient_ctx) if len(t) >= 3]
    if not terms:
        return rag_candidates
    kept = []
    for rec in rag_candidates:
        name = str(rec.get("name") or "").lower()
        if any(term in name for term in terms):
            continue
        kept.append(rec)
    return kept


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
    rag_candidates: list[dict] | None = None,
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

    pool_by_name, role_pools = _build_food_pool(rag_candidates)

    matrix = _normalize_matrix_in_place(matrix)
    _apply_pool_macros_to_matrix(matrix, MEALS, pool_by_name)
    matrix = _normalize_matrix_in_place(matrix)
    _repair_meal_structure(matrix, role_pools, pool_by_name)
    for _ in range(3):
        _repair_daily_food_uniqueness(matrix, role_pools, pool_by_name)
        _repair_weekly_food_frequency(matrix, role_pools, pool_by_name)
    matrix = _normalize_matrix_in_place(matrix)
    capped_days: set[str] = set()
    if MATRIX_AUTO_SCALE_TDEE:
        capped_days = _snap_matrix_to_tdee(matrix, python_tdee, KCAL_TOLERANCE)
        matrix = _normalize_matrix_in_place(matrix)

    validation_warnings: list[str] = []

    def _soft_validate(fn, *args) -> None:
        try:
            fn(*args)
        except ValueError as exc:
            validation_warnings.append(str(exc))
            logger.warning("[matrix] validation issue (plan still returned): %s", exc)

    _soft_validate(_validate_day_kcal_tolerance, matrix, python_tdee["kcal"], KCAL_TOLERANCE, capped_days)
    _soft_validate(_validate_meal_structure, matrix, pool_by_name)
    _soft_validate(_validate_daily_food_uniqueness, matrix)
    _soft_validate(_validate_weekly_food_frequency, matrix, pool_by_name)
    _soft_validate(_validate_allergens_and_restrictions, patient_ctx, matrix)

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
        "validation_warnings": validation_warnings,
    }


async def generate_nutrition_matrix(
    patient_id: int, target_macros: dict | None = None
) -> dict:
    logger.info(f"[RAG] Step 1: MySQL clinical summary for patient id={patient_id}")
    patient_ctx = await timed_coro(
        "matrix_mysql_patient_context",
        get_patient_context(patient_id),
    )

    disease_match = re.search(
        r"Primary disease:\s*([^\n]+)", patient_ctx, re.IGNORECASE
    )
    disease_str = disease_match.group(1).strip() if disease_match else "general health"

    rag_query, boost_tags = _build_rag_query(patient_ctx, disease_str)

    logger.info(
        f"[RAG] Step 2: Chroma db_nutritie query={rag_query!r} tags={boost_tags}",
    )
    protein_query, protein_tags = _build_protein_rag_query(disease_str)
    fat_query, fat_tags = _build_fat_rag_query(disease_str)
    vegetable_query, vegetable_tags = _build_vegetable_rag_query(disease_str)
    carb_query, carb_tags = _build_carb_rag_query(disease_str)
    rag_candidates = await _fetch_role_focused_candidates([
        ("protein", protein_query, protein_tags, MATRIX_PROTEIN_CANDIDATE_TOP_K),
        ("fat", fat_query, fat_tags, MATRIX_FAT_CANDIDATE_TOP_K),
        ("vegetable", vegetable_query, vegetable_tags, MATRIX_VEGETABLE_CANDIDATE_TOP_K),
        ("carb", carb_query, carb_tags, MATRIX_CARB_CANDIDATE_TOP_K),
        ("nutrition", rag_query, boost_tags, MATRIX_CANDIDATE_TOP_K),
    ])
    pre_filter_count = len(rag_candidates)
    rag_candidates = _filter_allergen_candidates(rag_candidates, patient_ctx)
    if len(rag_candidates) != pre_filter_count:
        logger.info(
            "[RAG] Filtered %d allergen/aversion-matching candidates out of the pool",
            pre_filter_count - len(rag_candidates),
        )
    id_to_record, nutrition_ctx = _build_indexed_candidate_pool(rag_candidates)
    logger.info(
        "[RAG] Retrieved %d candidate foods (protein=%d carb=%d veg=%d fruit=%d fat=%d)",
        len(rag_candidates),
        sum(1 for r in rag_candidates if r.get("macro_role") == "protein"),
        sum(1 for r in rag_candidates if r.get("macro_role") == "carb"),
        sum(1 for r in rag_candidates if r.get("macro_role") == "vegetable"),
        sum(1 for r in rag_candidates if r.get("macro_role") == "fruit"),
        sum(1 for r in rag_candidates if r.get("macro_role") == "fat"),
    )

    logger.info(f"[RAG] Step 3: similar historical patients for '{disease_str}'")
    similar_ctx = await timed_coro(
        "matrix_chroma_similar_patients",
        get_similar_patients_context(patient_ctx),
    )
    if similar_ctx:
        logger.info("[RAG] Similar patient context loaded.")
    else:
        logger.info(
            "[RAG] No similar patient context available (db_pacienti may be empty).",
        )

    tdee = _require_target_macros_from_backend(target_macros)
    logger.info(
        f"[RAG] Step 4 TDEE (from backend): {tdee['kcal']} kcal | P:{tdee['protein_g']}g "
        f"C:{tdee['carbs_g']}g F:{tdee['fat_g']}g | source={tdee.get('target_source', 'backend')}",
    )

    day_batches = _matrix_day_batches()
    logger.info(
        "[RAG] Step 5: parallel LLM — %d meal batch(es) (≤%d concurrent) + clinical notes…",
        len(day_batches),
        MATRIX_LLM_PARALLEL,
    )
    t_parallel = time.perf_counter()
    llm_sem = asyncio.Semaphore(MATRIX_LLM_PARALLEL)
    batch_tasks = [
        _generate_day_batch(batch, patient_ctx, nutrition_ctx, tdee, llm_sem)
        for batch in day_batches
    ]
    batch_results, clinical_notes = await asyncio.gather(
        asyncio.gather(*batch_tasks),
        _generate_clinical_notes(patient_ctx, similar_ctx, disease_str),
    )
    logger.info(
        "[timing] matrix_parallel_llm_gather_wall_clock: %.1f ms",
        (time.perf_counter() - t_parallel) * 1000,
    )

    merged = _merge_batch_matrices(batch_results, day_batches)
    if id_to_record:
        _resolve_ids_to_foods(merged["matrix"], id_to_record)

    matrix_data = {
        "tdee": dict(tdee),
        "matrix": merged["matrix"],
        "clinical_notes": clinical_notes,
        "foods_used": merged["foods_used"],
    }

    try:
        validated = _validate_matrix_keys(matrix_data, tdee, patient_ctx, rag_candidates)
    except ValueError as exc:
        logger.error(f"[RAG] Matrix validation failed: {exc}")
        raise

    if validated["validation_warnings"]:
        logger.warning(
            "[RAG] Matrix returned with %d validation warning(s): %s",
            len(validated["validation_warnings"]),
            validated["validation_warnings"],
        )

    return {
        "patient_id": patient_id,
        "tdee": tdee,
        "matrix": validated["matrix"],
        "clinical_notes": validated["clinical_notes"],
        "foods_used": validated["foods_used"],
        "validation_warnings": validated["validation_warnings"],
        "raw_patient_context": patient_ctx,
    }


def generate_nutrition_matrix_sync(
    patient_id: int, target_macros: dict | None = None
) -> dict:
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(
            generate_nutrition_matrix(patient_id, target_macros=target_macros),
        )
    finally:
        loop.close()