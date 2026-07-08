from __future__ import annotations

import re
import time
import asyncio
import logging

from pipeline_timing import timed_coro
from rag_service import (
    get_patient_context,
    get_nutritional_candidates,
    get_similar_patients_context,
)
from portion_rules import apply_portion_rules_to_matrix

from matrix_constants import (
    DAYS,
    MEALS,
    MATRIX_AUTO_SCALE_TDEE,
    KCAL_TOLERANCE,
    MATRIX_CANDIDATE_TOP_K,
    MATRIX_PROTEIN_CANDIDATE_TOP_K,
    MATRIX_FAT_CANDIDATE_TOP_K,
    MATRIX_VEGETABLE_CANDIDATE_TOP_K,
    MATRIX_CARB_CANDIDATE_TOP_K,
    MATRIX_LLM_PARALLEL,
)
from matrix_rag import (
    _build_rag_query,
    _build_protein_rag_query,
    _build_fat_rag_query,
    _build_vegetable_rag_query,
    _build_carb_rag_query,
    _fetch_role_focused_candidates,
    _filter_allergen_candidates,
)
from matrix_pool import _build_food_pool, _norm_food_name, _apply_pool_macros_to_matrix
from matrix_json import _normalize_legacy_meal_keys, _repair_truncated_json
from matrix_prompt import _build_batch_prompt
from matrix_llm import (
    _generate_clinical_notes,
    _generate_day_batch,
    _matrix_day_batches,
    _merge_batch_matrices,
)
from matrix_kcal import (
    _require_target_macros_from_backend,
    _snap_matrix_to_tdee,
    _normalize_matrix_in_place,
)
from matrix_repair import (
    _repair_meal_structure,
    _repair_daily_food_uniqueness,
    _repair_weekly_food_frequency,
)
from matrix_validate import (
    _validate_day_kcal_tolerance,
    _validate_meal_structure,
    _validate_daily_food_uniqueness,
    _validate_weekly_food_frequency,
    _validate_allergens_and_restrictions,
    _merge_foods_used,
)
from matrix_pool import _build_indexed_candidate_pool
from matrix_pool import _resolve_ids_to_foods

logger = logging.getLogger(__name__)


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
            "foods_used is empty - ensure each meal lists foods with names.",
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
        "[RAG] Step 5: parallel LLM - %d meal batch(es) (≤%d concurrent)…",
        len(day_batches),
        MATRIX_LLM_PARALLEL,
    )
    t_parallel = time.perf_counter()
    llm_sem = asyncio.Semaphore(MATRIX_LLM_PARALLEL)
    batch_tasks = [
        _generate_day_batch(batch, patient_ctx, nutrition_ctx, tdee, llm_sem)
        for batch in day_batches
    ]
    batch_results = await asyncio.gather(*batch_tasks)
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
        "clinical_notes": "",
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

    logger.info("[RAG] Step 6: clinical notes from the resolved food list…")
    clinical_notes = await _generate_clinical_notes(
        patient_ctx, similar_ctx, disease_str, validated["foods_used"],
    )

    return {
        "patient_id": patient_id,
        "tdee": tdee,
        "matrix": validated["matrix"],
        "clinical_notes": clinical_notes,
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
