from __future__ import annotations

"""
rag_service.py
──────────────
Three RAG context sources:
  1. getPatientContext()         → MySQL join (current patient demographics + biomarkers)
  2. getNutritionalContext()     → ChromaDB db_nutritie (TOP-K foods, compact lines)
  3. getSimilarPatientsContext() → ChromaDB db_pacienti (similar historical patients)
"""

import functools
import logging
import os
import re
import json
import time
import mysql.connector
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma

from pipeline_timing import timed_sync
from rag_cache import CachedQueryEmbeddings, normalize_query_text

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
MYSQL_HOST = os.getenv("MYSQL_HOST", "mysql")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", 3306))
MYSQL_DB = os.getenv("MYSQL_DB", "nutrimed")
MYSQL_USER = os.getenv("MYSQL_USER", "nutrimed")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "nutrimed_pw")

CHROMA_NUTRITION_DIR = os.getenv("CHROMA_NUTRITION_DIR", "./db_nutritie")
CHROMA_PATIENTS_DIR = os.getenv("CHROMA_PATIENTS_DIR", "./db_pacienti")

# RAG retrieval / context sizing (Step 2 + 4)
DEFAULT_RAG_NUTRITION_TOP_K = int(os.getenv("RAG_NUTRITION_TOP_K", "6"))
RAG_CONTEXT_MAX_CHARS = int(os.getenv("RAG_CONTEXT_MAX_CHARS", "12000"))
RAG_MIN_DOCS = int(os.getenv("RAG_MIN_DOCS", "3"))
RAG_USE_METADATA_FILTER = os.getenv("RAG_USE_METADATA_FILTER", "1").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
RAG_RESPONSE_CACHE = os.getenv("RAG_RESPONSE_CACHE", "0").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
RAG_RESPONSE_CACHE_SIZE = int(os.getenv("RAG_RESPONSE_CACHE_SIZE", "512"))

RAG_SIMILAR_TOP_K = int(os.getenv("RAG_SIMILAR_TOP_K", "3"))
RAG_SIMILAR_CTX_STRING_CAP = int(os.getenv("RAG_SIMILAR_CTX_STRING_CAP", "6000"))

# ── Singletons ────────────────────────────────────────────────────────────────
_embeddings = None
_db_nutritie = None
_db_pacienti = None


def _get_embeddings():
    """MiniLM embeddings with LRU embed_query cache (Step 4)."""
    global _embeddings
    if _embeddings is None:
        _embeddings = CachedQueryEmbeddings(
            HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2"),
        )
    return _embeddings


def _get_nutrition_db() -> Chroma:
    global _db_nutritie
    if _db_nutritie is None:
        if not os.path.exists(CHROMA_NUTRITION_DIR):
            raise RuntimeError(
                f"ChromaDB nutrition directory not found: {CHROMA_NUTRITION_DIR}. "
                "Run ingestion.py first."
            )
        # Chroma persistent collections use HNSW ANN by default (not brute-force linear scan).
        logger.info(
            "[rag] Opening Chroma nutrition index at %s (default ANN / HNSW)",
            CHROMA_NUTRITION_DIR,
        )
        _db_nutritie = Chroma(
            persist_directory=CHROMA_NUTRITION_DIR,
            embedding_function=_get_embeddings(),
        )
    return _db_nutritie


def _get_patients_db() -> Chroma:
    global _db_pacienti
    if _db_pacienti is None:
        if not os.path.exists(CHROMA_PATIENTS_DIR):
            raise RuntimeError(
                f"ChromaDB patients directory not found: {CHROMA_PATIENTS_DIR}. "
                "Run ingestion_patients.py first."
            )
        logger.info(
            "[rag] Opening Chroma patients index at %s (default ANN / HNSW)",
            CHROMA_PATIENTS_DIR,
        )
        _db_pacienti = Chroma(
            persist_directory=CHROMA_PATIENTS_DIR,
            embedding_function=_get_embeddings(),
            collection_name="patient_history",
        )
    return _db_pacienti


def _get_mysql_connection():
    return mysql.connector.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        database=MYSQL_DB,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        connection_timeout=10,
    )


# ── 1. Patient context from MySQL ─────────────────────────────────────────────

async def getPatientContext(patientId: int) -> str:
    """
    Join patients + medical_records + body_composition + clinical_constraints
    and return a structured summary string for RAG prompt injection.
    """
    t0 = time.perf_counter()
    conn = None
    try:
        conn = _get_mysql_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT age, gender, height_cm, weight_kg, activity_level,
                   preferred_cuisine, profile_data
            FROM patients
            WHERE id = %s
            LIMIT 1
            """,
            (patientId,),
        )
        patient = cursor.fetchone()
        if not patient:
            raise ValueError(f"Patient with id={patientId} not found in DB.")

        cursor.execute(
            """
            SELECT id, primary_disease, severity,
                   systolic_bp, diastolic_bp, glucose, cholesterol,
                   specialist_form_json
            FROM medical_records
            WHERE patient_id = %s
            ORDER BY recorded_at DESC
            LIMIT 1
            """,
            (patientId,),
        )
        medical = cursor.fetchone()

        body_comp = None
        constraints = []
        form_allergies: list = []
        form_restrictions: list = []
        form_notes = None

        if medical:
            record_id = medical["id"]
            sfj = medical.get("specialist_form_json")
            if sfj:
                if isinstance(sfj, str):
                    try:
                        sfj = json.loads(sfj)
                    except json.JSONDecodeError:
                        sfj = None
                if isinstance(sfj, dict):
                    sc = sfj.get("strict_constraints") or {}
                    form_allergies = list(sc.get("allergies") or [])
                    form_restrictions = list(sc.get("dietary_restrictions") or [])
                    form_notes = sc.get("mandatory_clinical_notes")

            cursor.execute(
                """
                SELECT fat_pct, water_pct, muscle_mass_kg,
                       visceral_fat_level, metabolic_age
                FROM body_composition
                WHERE record_id = %s
                LIMIT 1
                """,
                (record_id,),
            )
            body_comp = cursor.fetchone()

            cursor.execute(
                """
                SELECT type, value
                FROM clinical_constraints
                WHERE record_id = %s
                """,
                (record_id,),
            )
            constraints = cursor.fetchall()

        cursor.close()

        lines = ["=== PATIENT CLINICAL CONTEXT ==="]

        lines.append("\n[DEMOGRAPHICS]")
        lines.append(f"  Age: {patient.get('age') or 'N/A'}")
        lines.append(f"  Gender: {patient.get('gender') or 'N/A'}")
        lines.append(f"  Height: {patient.get('height_cm') or 'N/A'} cm")
        lines.append(f"  Weight: {patient.get('weight_kg') or 'N/A'} kg")
        lines.append(f"  Activity level: {patient.get('activity_level') or 'N/A'}")
        lines.append(f"  Preferred cuisine: {patient.get('preferred_cuisine') or 'N/A'}")

        h = patient.get("height_cm")
        w = patient.get("weight_kg")
        if h and w and float(h) > 0:
            bmi = round(float(w) / ((float(h) / 100) ** 2), 1)
            lines.append(f"  BMI: {bmi}")

        pd_raw = patient.get("profile_data")
        if pd_raw:
            if isinstance(pd_raw, str):
                pd_raw = json.loads(pd_raw)
            lifestyle = pd_raw.get("lifestyle", {})
            if lifestyle:
                lines.append(
                    f"  Sleep quality: {lifestyle.get('sleep_quality_subjective', 'N/A')}"
                )
                lines.append(f"  Alcohol: {lifestyle.get('alcohol_consumption', 'N/A')}")
                lines.append(f"  Smoking: {lifestyle.get('smoking_habit', 'N/A')}")
            prefs = pd_raw.get("preferences", {})
            if prefs:
                aversions = prefs.get("food_aversions", [])
                if aversions:
                    lines.append(f"  Food aversions: {', '.join(aversions)}")
                lines.append(f"  Goal: {prefs.get('goal', 'N/A')}")

        lines.append("\n[CLINICAL DIAGNOSIS]")
        if medical:
            lines.append(f"Primary disease: {medical.get('primary_disease') or 'N/A'}")
            lines.append(f"  Severity: {medical.get('severity') or 'N/A'}")
        else:
            lines.append("  No medical record found.")

        lines.append("\n[BIOMARKERS]")
        if medical:
            lines.append(
                f"  Blood pressure: {medical.get('systolic_bp') or 'N/A'}/"
                f"{medical.get('diastolic_bp') or 'N/A'} mmHg"
            )
            lines.append(f"  Fasting glucose: {medical.get('glucose') or 'N/A'} mg/dL")
            lines.append(
                f"  Total cholesterol: {medical.get('cholesterol') or 'N/A'} mg/dL"
            )
        else:
            lines.append("  No biomarkers available.")

        lines.append("\n[BODY COMPOSITION]")
        if body_comp:
            lines.append(f"  Body fat: {body_comp.get('fat_pct') or 'N/A'} %")
            lines.append(f"  Body water: {body_comp.get('water_pct') or 'N/A'} %")
            lines.append(f"  Muscle mass: {body_comp.get('muscle_mass_kg') or 'N/A'} kg")
            lines.append(
                f"  Visceral fat level: {body_comp.get('visceral_fat_level') or 'N/A'}"
            )
            lines.append(f"  Metabolic age: {body_comp.get('metabolic_age') or 'N/A'}")
        else:
            lines.append("  No body composition data.")

        lines.append("\n[ALLERGIES & RESTRICTIONS]")
        allergies = [c["value"] for c in constraints if c["type"] == "allergy"]
        restrictions = [c["value"] for c in constraints if c["type"] == "restriction"]
        for a in form_allergies:
            if a and str(a) not in allergies:
                allergies.append(str(a))
        for r in form_restrictions:
            if r and str(r) not in restrictions:
                restrictions.append(str(r))
        lines.append(f"  Allergies: {', '.join(allergies) if allergies else 'None'}")
        lines.append(
            f"  Dietary restrictions: {', '.join(restrictions) if restrictions else 'None'}"
        )
        if form_notes:
            lines.append(f"  Mandatory clinical notes: {form_notes}")

        lines.append("\n=== END OF PATIENT CONTEXT ===")
        return "\n".join(lines)

    finally:
        elapsed_ms = (time.perf_counter() - t0) * 1000
        logger.info("[timing] mysql_patient_context: %.1f ms", elapsed_ms)
        if conn and conn.is_connected():
            conn.close()


def _compact_food_line(index: int, doc) -> str:
    """One compact line from metadata; fall back to page_content if needed."""
    md = doc.metadata or {}
    name = md.get("name")
    raw_tags = md.get("tags", "") or ""
    if hasattr(raw_tags, "tolist"):
        raw_tags = str(raw_tags)
    tags = str(raw_tags).strip() if raw_tags is not None else ""
    if len(tags) > 60:
        tags = tags[:60] + "…"

    kcal = md.get("kcal")
    protein_g = md.get("protein_g")
    carbs_g = md.get("carbs_g")
    fat_g = md.get("fat_g")
    fiber_g = md.get("fiber_g")

    def fmt(v):
        if v is None or v == "":
            return "n/a"
        return v

    if name is None or str(name).strip() == "":
        name = "Unknown"
    name = str(name)

    missing_macro = (
        kcal is None
        and protein_g is None
        and carbs_g is None
        and fat_g is None
    )

    if missing_macro:
        pc = (doc.page_content or "").replace("\n", " ").strip()
        if not pc:
            pc = "n/a"
        return f"[{index}] {name}: (no metadata) {pc[:400]}"
    return (
        f"[{index}] {name}: {fmt(kcal)}kcal P:{fmt(protein_g)}g C:{fmt(carbs_g)}g "
        f"F:{fmt(fat_g)}g Fiber:{fmt(fiber_g)}g | tags: {tags}"
    )


def _dedupe_docs_by_food_name(docs: list) -> list:
    """Drop redundant chunks that share the same food name (metadata)."""
    seen = set()
    out = []
    for d in docs:
        md = d.metadata or {}
        name = str(md.get("name") or "").strip().lower()
        key = name if name else id(d)
        if key in seen:
            continue
        seen.add(key)
        out.append(d)
    return out


def _tags_key_from_list(tags: list | None) -> str:
    if not tags:
        return ""
    parts = sorted({str(t).strip().lower() for t in tags if str(t).strip()})
    return "|".join(parts)


def _nutrition_similarity_search(db: Chroma, query: str, k: int, disease_filter_tags: list | None):
    """Embed + ANN search; optional where_document on ingested tag text (Step 3)."""
    tags = [str(t).strip() for t in (disease_filter_tags or []) if str(t).strip()]

    def global_search():
        return db.similarity_search(query, k=k)

    if RAG_USE_METADATA_FILTER and tags:
        needle = tags[0].lower()

        def filtered_search():
            try:
                return db.similarity_search(
                    query,
                    k=k,
                    where_document={"$contains": needle},
                )
            except Exception as exc:
                logger.warning(
                    "[rag] nutrition where_document filter failed (%s); retrying global ANN",
                    exc,
                )
                return []

        docs = timed_sync("chroma_nutrition_embed_search_filtered", filtered_search)
        if len(docs) < RAG_MIN_DOCS:
            docs = timed_sync(
                "chroma_nutrition_embed_search_fallback",
                global_search,
            )
    else:
        docs = timed_sync("chroma_nutrition_embed_search", global_search)

    return docs


def _sort_docs_by_tag_overlap(docs: list, disease_filter_tags: list | None) -> list:
    if not disease_filter_tags:
        return docs

    def relevance_score(doc):
        doc_tags = str(doc.metadata.get("tags", "") or "").lower()
        return sum(1 for tag in disease_filter_tags if tag.lower() in doc_tags)

    return sorted(docs, key=relevance_score, reverse=True)


def _build_nutrition_lines_block(docs: list) -> str:
    lines = [
        f"=== NUTRITIONAL DATABASE CONTEXT (TOP {len(docs)} FOODS) ===",
        "PRIORITY: Use foods from this list first. "
        "If a necessary food is absent, use a well-known whole food and prefix "
        "'external:' in foods_used.",
        "",
    ]
    for i, doc in enumerate(docs, 1):
        lines.append(_compact_food_line(i, doc))
    lines.append("")
    lines.append("=== END OF NUTRITIONAL CONTEXT ===")
    return "\n".join(lines)


def _cap_context_chars(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 80] + "\n… [nutrition context truncated]\n"


def _nutrition_context_sync_impl(query: str, top_k: int, disease_filter_tags: list | None) -> str:
    db = _get_nutrition_db()
    docs = _nutrition_similarity_search(db, query, top_k, disease_filter_tags)

    if not docs:
        raise RuntimeError(
            "ChromaDB returned 0 results. "
            "Ensure ingestion.py has been run and db_nutritie exists."
        )

    docs = timed_sync(
        "nutrition_tag_boost_sort",
        lambda: _sort_docs_by_tag_overlap(docs, disease_filter_tags),
    )
    docs = timed_sync(
        "nutrition_dedupe_by_food_name",
        lambda: _dedupe_docs_by_food_name(docs),
    )

    text = timed_sync(
        "nutrition_build_context_string",
        lambda: _build_nutrition_lines_block(docs),
    )
    text = _cap_context_chars(text, RAG_CONTEXT_MAX_CHARS)

    if len(docs) < RAG_MIN_DOCS:
        raise RuntimeError(
            f"Insufficient nutritional data: only {len(docs)} foods after retrieve/dedupe. "
            "Run ingestion.py with complete datasets."
        )

    return text


@functools.lru_cache(maxsize=max(32, RAG_RESPONSE_CACHE_SIZE))
def _nutrition_context_cached(norm_q: str, top_k: int, tags_key: str) -> str:
    tags_list = [t for t in tags_key.split("|") if t] if tags_key else None
    return _nutrition_context_sync_impl(norm_q, top_k, tags_list)


# ── 2. Nutritional context from ChromaDB db_nutritie ─────────────────────────

async def getNutritionalContext(
    query: str,
    top_k: int | None = None,
    disease_filter_tags: list | None = None,
) -> str:
    """
    Query ChromaDB (db_nutritie) for the TOP-K most relevant foods.
    If disease_filter_tags is provided, boost matching documents to the top.
    """
    tk = top_k if top_k is not None else DEFAULT_RAG_NUTRITION_TOP_K
    tk = max(1, tk)

    if RAG_RESPONSE_CACHE:
        nk = normalize_query_text(query)
        tkey = _tags_key_from_list(disease_filter_tags)
        return _nutrition_context_cached(nk, tk, tkey)

    return _nutrition_context_sync_impl(query, tk, disease_filter_tags)


# ── 3. Similar patients context from ChromaDB db_pacienti ────────────────────

async def getSimilarPatientsContext(patient_ctx: str, top_k: int | None = None) -> str:
    """
    Query db_pacienti for historically similar patients.
    Uses the current patient's disease, BMI, and activity level as the search query.
    Returns their previously successful meal plans as few-shot examples for the LLM.
    Non-fatal: returns empty string if db_pacienti is unavailable.
    """
    k = top_k if top_k is not None else RAG_SIMILAR_TOP_K
    k = max(1, k)

    try:
        db = _get_patients_db()
    except RuntimeError:
        return ""

    def _extract(label: str) -> str:
        m = re.search(rf"{label}:\s*([^\n]+)", patient_ctx, re.IGNORECASE)
        return m.group(1).strip() if m else ""

    disease = _extract("Primary disease") or "general health"
    bmi = _extract("BMI")
    glucose = _extract("Fasting glucose")
    activity = _extract("Activity level")

    query = (
        f"Patient with {disease}. "
        f"BMI {bmi}. Glucose {glucose}. "
        f"Activity: {activity}. Recommended meal plan diet nutrition."
    )

    try:

        def patient_case_search():
            return db.similarity_search(query, k=k)

        docs = timed_sync("chroma_similar_patients_embed_search", patient_case_search)
    except Exception:
        return ""

    if not docs:
        return ""

    lines = [
        f"=== SIMILAR HISTORICAL PATIENT CASES (TOP {len(docs)} MATCHES) ===",
        "These are real past cases with known successful meal plans.",
        "Use their dietary patterns and caloric targets as inspiration.",
        "Adapt all portions, foods, and macros to the CURRENT patient's targets.",
        "",
    ]

    for i, doc in enumerate(docs, 1):
        lines.append(f"[CASE {i}]")
        lines.append(f"  {doc.page_content}")
        lines.append("")

    lines.append("=== END OF SIMILAR CASES ===")
    out = "\n".join(lines)
    if len(out) > RAG_SIMILAR_CTX_STRING_CAP:
        out = (
            out[: RAG_SIMILAR_CTX_STRING_CAP - 80]
            + "\n… [similar cases truncated]\n"
        )
    return out


# ── Sync wrappers (for Flask / non-async code) ────────────────────────────────

def get_patient_context_sync(patient_id: int) -> str:
    import asyncio

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(getPatientContext(patient_id))
    finally:
        loop.close()


def get_nutritional_context_sync(
    query: str,
    top_k: int | None = None,
    disease_filter_tags: list | None = None,
) -> str:
    import asyncio

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(
            getNutritionalContext(query, top_k, disease_filter_tags)
        )
    finally:
        loop.close()


def get_similar_patients_context_sync(
    patient_ctx: str,
    top_k: int | None = None,
) -> str:
    import asyncio

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(getSimilarPatientsContext(patient_ctx, top_k))
    finally:
        loop.close()
