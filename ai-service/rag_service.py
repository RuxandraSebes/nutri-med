"""
rag_service.py
──────────────
Three RAG context sources:
  1. getPatientContext()         → MySQL join (current patient demographics + biomarkers)
  2. getNutritionalContext()     → ChromaDB db_nutritie (TOP-K foods, enriched with tags)
  3. getSimilarPatientsContext() → ChromaDB db_pacienti (similar historical patients)
"""

import os
import re
import json
import mysql.connector
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma

# ── Config ────────────────────────────────────────────────────────────────────
MYSQL_HOST     = os.getenv("MYSQL_HOST",     "mysql")
MYSQL_PORT     = int(os.getenv("MYSQL_PORT", 3306))
MYSQL_DB       = os.getenv("MYSQL_DB",       "nutrimed")
MYSQL_USER     = os.getenv("MYSQL_USER",     "nutrimed")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "nutrimed_pw")

CHROMA_NUTRITION_DIR = os.getenv("CHROMA_NUTRITION_DIR", "./db_nutritie")
CHROMA_PATIENTS_DIR  = os.getenv("CHROMA_PATIENTS_DIR",  "./db_pacienti")

# ── Singletons ────────────────────────────────────────────────────────────────
_embeddings  = None
_db_nutritie = None
_db_pacienti = None


def _get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings
    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    return _embeddings


def _get_nutrition_db() -> Chroma:
    global _db_nutritie
    if _db_nutritie is None:
        if not os.path.exists(CHROMA_NUTRITION_DIR):
            raise RuntimeError(
                f"ChromaDB nutrition directory not found: {CHROMA_NUTRITION_DIR}. "
                "Run ingestion.py first."
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
    conn = None
    try:
        conn = _get_mysql_connection()
        cursor = conn.cursor(dictionary=True)

        # Patient demographics
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

        # Latest medical record
        cursor.execute(
            """
            SELECT id, primary_disease, severity,
                   systolic_bp, diastolic_bp, glucose, cholesterol
            FROM medical_records
            WHERE patient_id = %s
            ORDER BY recorded_at DESC
            LIMIT 1
            """,
            (patientId,),
        )
        medical = cursor.fetchone()

        body_comp   = None
        constraints = []

        if medical:
            record_id = medical["id"]

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

        # ── Build structured summary ──────────────────────────────────────
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
                lines.append(f"  Sleep quality: {lifestyle.get('sleep_quality_subjective', 'N/A')}")
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
            lines.append(f"  Primary disease: {medical.get('primary_disease') or 'N/A'}")
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
            lines.append(f"  Total cholesterol: {medical.get('cholesterol') or 'N/A'} mg/dL")
        else:
            lines.append("  No biomarkers available.")

        lines.append("\n[BODY COMPOSITION]")
        if body_comp:
            lines.append(f"  Body fat: {body_comp.get('fat_pct') or 'N/A'} %")
            lines.append(f"  Body water: {body_comp.get('water_pct') or 'N/A'} %")
            lines.append(f"  Muscle mass: {body_comp.get('muscle_mass_kg') or 'N/A'} kg")
            lines.append(f"  Visceral fat level: {body_comp.get('visceral_fat_level') or 'N/A'}")
            lines.append(f"  Metabolic age: {body_comp.get('metabolic_age') or 'N/A'}")
        else:
            lines.append("  No body composition data.")

        lines.append("\n[ALLERGIES & RESTRICTIONS]")
        allergies    = [c["value"] for c in constraints if c["type"] == "allergy"]
        restrictions = [c["value"] for c in constraints if c["type"] == "restriction"]
        lines.append(f"  Allergies: {', '.join(allergies) if allergies else 'None'}")
        lines.append(f"  Dietary restrictions: {', '.join(restrictions) if restrictions else 'None'}")

        lines.append("\n=== END OF PATIENT CONTEXT ===")
        return "\n".join(lines)

    finally:
        if conn and conn.is_connected():
            conn.close()


# ── 2. Nutritional context from ChromaDB db_nutritie ─────────────────────────

async def getNutritionalContext(
    query: str,
    top_k: int = 50,
    disease_filter_tags: list | None = None,
) -> str:
    """
    Query ChromaDB (db_nutritie) for the TOP-K most relevant foods.
    If disease_filter_tags is provided, boost matching documents to the top.
    """
    db   = _get_nutrition_db()
    docs = db.similarity_search(query, k=top_k)

    if not docs:
        raise RuntimeError(
            "ChromaDB returned 0 results. "
            "Ensure ingestion.py has been run and db_nutritie exists."
        )

    # Boost disease-relevant documents to the front
    if disease_filter_tags:
        def relevance_score(doc):
            doc_tags = doc.metadata.get("tags", "").lower()
            return sum(1 for tag in disease_filter_tags if tag.lower() in doc_tags)

        docs = sorted(docs, key=relevance_score, reverse=True)

    lines = [
        f"=== NUTRITIONAL DATABASE CONTEXT (TOP {len(docs)} FOODS) ===",
        "PRIORITY: Use foods from this list first. "
        "If a necessary food is absent, you may use a well-known whole food equivalent "
        "and prefix its name with 'external:' in foods_used.",
        "",
    ]

    for i, doc in enumerate(docs, 1):
        food_name = doc.metadata.get("name", "Unknown")
        lines.append(f"[FOOD {i}] {food_name}")
        lines.append(f"  {doc.page_content}")
        lines.append("")

    lines.append("=== END OF NUTRITIONAL CONTEXT ===")

    if len(docs) < 10:
        raise RuntimeError(
            f"Insufficient nutritional data: only {len(docs)} foods returned. "
            "Run ingestion.py with complete datasets."
        )

    return "\n".join(lines)


# ── 3. Similar patients context from ChromaDB db_pacienti ────────────────────

async def getSimilarPatientsContext(patient_ctx: str, top_k: int = 5) -> str:
    """
    Query db_pacienti for historically similar patients.
    Uses the current patient's disease, BMI, and activity level as the search query.
    Returns their previously successful meal plans as few-shot examples for the LLM.
    Non-fatal: returns empty string if db_pacienti is unavailable.
    """
    try:
        db = _get_patients_db()
    except RuntimeError:
        # db_pacienti is optional — matrix generation continues without it
        return ""

    def _extract(label: str) -> str:
        m = re.search(rf"{label}:\s*([^\n]+)", patient_ctx, re.IGNORECASE)
        return m.group(1).strip() if m else ""

    disease  = _extract("Primary disease") or "general health"
    bmi      = _extract("BMI")
    glucose  = _extract("Fasting glucose")
    activity = _extract("Activity level")

    query = (
        f"Patient with {disease}. "
        f"BMI {bmi}. Glucose {glucose}. "
        f"Activity: {activity}. Recommended meal plan diet nutrition."
    )

    try:
        docs = db.similarity_search(query, k=top_k)
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
    return "\n".join(lines)


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
    top_k: int = 50,
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


def get_similar_patients_context_sync(patient_ctx: str, top_k: int = 5) -> str:
    import asyncio
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(getSimilarPatientsContext(patient_ctx, top_k))
    finally:
        loop.close()