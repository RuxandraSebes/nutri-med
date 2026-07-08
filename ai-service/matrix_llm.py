from __future__ import annotations

import os
import time
import asyncio
import logging

from langchain_ollama import ChatOllama

from matrix_constants import (
    OLLAMA_HOST,
    OLLAMA_MODEL,
    OLLAMA_BATCH_NUM_PREDICT,
    OLLAMA_BATCH_NUM_CTX,
    OLLAMA_BATCH_TEMPERATURE,
    OLLAMA_NOTES_NUM_PREDICT,
    MATRIX_DAYS_PER_BATCH,
    DAYS,
    MEALS,
    _log_matrix_prompt,
)
from matrix_prompt import _build_batch_prompt
from matrix_json import _repair_truncated_json

logger = logging.getLogger(__name__)

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
    foods_used: list[str] | None = None,
) -> str:
    extra = ""
    if similar_ctx.strip():
        cap = int(os.getenv("RAG_SIMILAR_CTX_CAP", "4500"))
        extra = (
            "\n\nSIMILAR HISTORICAL CASES (reference only):\n"
            f"{similar_ctx[:cap]}"
        )
    foods_str = ", ".join(foods_used) if foods_used else "the foods listed in the plan"
    prompt = f"""Write clinical notes (3-4 sentences) for this patient's meal plan.
Primary condition focus: {disease_str}.

1. Mention which of these ingredients are used in the plan and why they suit this patient's condition: {foods_str}
2. Name 2-3 specific foods or food categories this patient should AVOID or ELIMINATE given their condition, allergies, and restrictions.

Do NOT mention calorie counts, macro grams, or percentages. Those are shown separately and are not your concern.
Plain text only - no JSON, no markdown fences, no bullet list required.

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
