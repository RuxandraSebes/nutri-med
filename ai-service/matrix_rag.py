from __future__ import annotations

import re
import asyncio

from pipeline_timing import timed_coro
from rag_service import get_nutritional_candidates
from matrix_pool import _norm_food_name

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
