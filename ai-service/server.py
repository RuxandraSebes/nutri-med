import asyncio
import json as json_lib
import logging
import os
import threading
import uuid
from datetime import datetime, timezone

from flask import Flask, request, jsonify
from langchain_ollama import ChatOllama
from langchain_community.vectorstores import Chroma
from langchain.chains import RetrievalQA
from langchain_core.prompts import PromptTemplate
from dotenv import load_dotenv

from nutrition_matrix import generate_nutrition_matrix_sync
from rag_service import _get_embeddings

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

JOBS: dict = {}

embeddings = _get_embeddings()
db_nutritie = None
db_pacienti = None

if os.path.exists("./db_nutritie"):
    db_nutritie = Chroma(
        persist_directory="./db_nutritie",
        embedding_function=embeddings,
    )
    logger.info("db_nutritie loaded.")
else:
    logger.warning("db_nutritie not found - run ingestion.py first.")

if os.path.exists("./db_pacienti"):
    db_pacienti = Chroma(
        persist_directory="./db_pacienti",
        embedding_function=embeddings,
        collection_name="patient_history",
    )
    logger.info("db_pacienti loaded.")
else:
    logger.warning(" db_pacienti not found - run ingestion_patients.py first.")

try:
    embeddings.embed_query("nutrition warm-up")
    logger.info("Embedding model warmed up (embed_query).")
except Exception as exc:
    logger.warning("Embedding warm-up failed: %s", exc)

llm = ChatOllama(
    model=os.getenv("OLLAMA_MODEL", "llama3.2:3b"),
    temperature=0.2,
    base_url=os.getenv("OLLAMA_HOST", "http://localhost:11434"),
)

_journal_llm = None


def _get_journal_llm():
    global _journal_llm
    if _journal_llm is None:
        _journal_llm = ChatOllama(
            model=os.getenv("OLLAMA_MODEL", "llama3.2:3b"),
            temperature=0.2,
            base_url=os.getenv("OLLAMA_HOST", "http://localhost:11434"),
            format="json",
        )
    return _journal_llm

QA_TEMPLATE = """Ești un asistent medical expert în nutriție.

INSTRUCȚIUNI:
- Folosește în primul rând contextul din baza de date de mai jos pentru a răspunde.
- Dacă contextul conține informații parțiale, completează cu cunoștințele tale medicale generale.
- Dacă contextul este irelevant pentru întrebare, răspunde din cunoștințele tale, dar menționează
  că nu ai date specifice din baza de date pentru această întrebare.
- Nu inventa valori nutriționale exacte dacă nu le ai - estimează și specifică că sunt estimări.
- Nu răspunde niciodată cu "nu știu" dacă poți oferi un răspuns medical general util.

Context din baza de date:
{context}

Întrebare: {question}

Răspuns profesional și complet în limba română:"""

QA_PROMPT = PromptTemplate(
    template=QA_TEMPLATE,
    input_variables=["context", "question"],
)


def _run_matrix_job(job_id: str, patient_id: int, target_macros: dict | None = None) -> None:
    JOBS[job_id]["status"] = "running"
    JOBS[job_id]["error"] = None
    try:
        result = generate_nutrition_matrix_sync(patient_id, target_macros=target_macros)
        JOBS[job_id]["status"] = "done"
        JOBS[job_id]["result"] = result
    except Exception as e:
        logger.exception(f"[/generate-matrix job {job_id}] failed: {e}")
        JOBS[job_id]["status"] = "error"
        JOBS[job_id]["error"] = str(e)
        JOBS[job_id]["result"] = None


@app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "db_nutritie": db_nutritie is not None,
            "db_pacienti": db_pacienti is not None,
            "rag_ask_available": db_nutritie is not None,
        }
    )


@app.route("/ask", methods=["POST"])
def ask_ai():
    data = request.json or {}
    user_query = data.get("query")
    target_db = data.get("type", "nutritie")

    if not user_query:
        return jsonify({"error": "Missing 'query'"}), 400

    db = db_nutritie if target_db == "nutritie" else db_pacienti
    if db is None:
        return (
            jsonify(
                {
                    "error": f"Database '{target_db}' not loaded. "
                    f"Run {'ingestion.py' if target_db == 'nutritie' else 'ingestion_patients.py'} first."
                }
            ),
            503,
        )

    retriever = db.as_retriever(search_kwargs={"k": 5})

    docs = retriever.invoke(user_query)
    logger.info(f"[/ask] Retrieved {len(docs)} docs for query: '{user_query[:80]}'")
    for d in docs[:2]:
        logger.debug(f"  DOC: {d.page_content[:200]}")

    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="stuff",
        retriever=retriever,
        chain_type_kwargs={"prompt": QA_PROMPT},
    )

    try:
        response = qa_chain.invoke({"query": user_query})
        result = (
            response.get("result", str(response))
            if isinstance(response, dict)
            else str(response)
        )
        return jsonify({"result": result})
    except Exception as e:
        logger.error(f"[/ask] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/analyze-journal", methods=["POST"])
def analyze_journal():
    data = request.json or {}
    food_entry = data.get("foodEntry") or data.get("food_entry")
    if not food_entry and data.get("journalEntries"):
        food_entry = data.get("journalEntries")
    if not food_entry:
        return (
            jsonify(
                {"error": "Missing food journal text (foodEntry or journalEntries)"}
            ),
            400,
        )

    patient_ctx = data.get("patientDetails") or data.get("patient_context")
    specialist_ctx = data.get("specialistDetails") or data.get("specialist_context")

    context_block = ""
    if patient_ctx is not None:
        try:
            context_block += "\n\n### Patient context (use for personalization)\n" + json_lib.dumps(
                patient_ctx, ensure_ascii=False, default=str
            )[:6000]
        except Exception:
            context_block += "\n\n### Patient context\n" + str(patient_ctx)[:4000]
    if specialist_ctx is not None:
        try:
            context_block += "\n\n### Specialist / clinical context\n" + json_lib.dumps(
                specialist_ctx, ensure_ascii=False, default=str
            )[:4000]
        except Exception:
            context_block += "\n\n### Specialist / clinical context\n" + str(
                specialist_ctx
            )[:2000]

    system_prompt = (
        "You are a clinical nutrition auditor. "
        "Use PATIENT and SPECIALIST context to tailor sodium/sugar emphasis, calories, and allergens. "
        "Analyze the food journal entry and respond with STRICT JSON only, no prose, no markdown fences, "
        "matching exactly this shape:\n"
        '{"score": <integer 1-10>, "food_notes": [{"food": "<food or meal item as written in the journal>", '
        '"note": "<one short clinical sentence>"}]}\n\n'
        "Rules:\n"
        "- score reflects nutritional density and glycemic appropriateness for this patient.\n"
        "- Include one food_notes entry per distinct food or meal item mentioned in the journal entry.\n"
        "- Each note must be a short, direct, clinical sentence: no filler, no encouragement.\n"
        "- If context mentions hypertension or diabetes, call out sodium/sugar explicitly where relevant.\n"
        "- Do not propose replacement meals, menus, or recipes. Only comment on what was actually logged.\n"
        "- English only.\n"
        "- Output must be valid JSON and nothing else."
    )

    full_prompt = f"{system_prompt}{context_block}\n\n### Journal Entry\n{food_entry}"

    try:
        response = _get_journal_llm().invoke(full_prompt)
        raw = response.content if hasattr(response, "content") else str(response)
        parsed = json_lib.loads(raw)
        score = parsed.get("score")
        food_notes = parsed.get("food_notes")
        if not isinstance(food_notes, list):
            food_notes = []
        food_notes = [
            {"food": str(n.get("food", "")).strip(), "note": str(n.get("note", "")).strip()}
            for n in food_notes
            if isinstance(n, dict) and str(n.get("food", "")).strip()
        ]
        return jsonify({"success": True, "score": score, "food_notes": food_notes})
    except Exception as e:
        logger.error(f"[/analyze-journal] Error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/generate-matrix", methods=["POST"])
def generate_matrix():
    data = request.json or {}
    patient_id = data.get("patientId")

    if patient_id is None:
        return jsonify({"error": "Missing 'patientId'"}), 400

    try:
        patient_id = int(patient_id)
    except (TypeError, ValueError):
        return jsonify({"error": "'patientId' must be an integer"}), 400

    target_macros = data.get("targetMacros") or data.get("target_macros")
    if not isinstance(target_macros, dict):
        return jsonify({"error": "Missing 'targetMacros' object from backend"}), 400
    for key in ("kcal", "protein_g", "carbs_g", "fat_g"):
        if target_macros.get(key) is None:
            return (
                jsonify(
                    {
                        "error": f"targetMacros.{key} is required - "
                        "TDEE must be computed by recommendation-service (tdee.js)",
                    }
                ),
                400,
            )

    if db_nutritie is None:
        return (
            jsonify(
                {
                    "error": "ChromaDB nutrition database not loaded. Run ingestion.py first."
                }
            ),
            503,
        )

    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    JOBS[job_id] = {
        "status": "pending",
        "result": None,
        "error": None,
        "patient_id": patient_id,
        "created_at": now,
    }

    t = threading.Thread(
        target=_run_matrix_job,
        args=(job_id, patient_id, target_macros),
        daemon=True,
    )
    t.start()

    return jsonify({"jobId": job_id, "status": "pending"}), 202


def _no_store_json(payload, status=200):
    r = jsonify(payload)
    r.status_code = status
    r.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
    r.headers["Pragma"] = "no-cache"
    return r


@app.route("/matrix-status/<job_id>", methods=["GET"])
def matrix_status(job_id: str):
    if job_id not in JOBS:
        return _no_store_json({"error": "Unknown job_id"}, 404)

    job = JOBS[job_id]
    st = job["status"]
    out = {
        "jobId": job_id,
        "status": st,
    }
    if st == "done":
        out["result"] = job.get("result")
    if st == "error":
        out["error"] = job.get("error") or "Unknown error"
    return _no_store_json(out)


@app.route("/suggest-ingredient-swaps", methods=["POST"])
def suggest_ingredient_swaps_route():
    data = request.json or {}
    patient_id = data.get("patientId")
    old_name = data.get("oldName") or data.get("old_name")

    if patient_id is None:
        return jsonify({"error": "Missing 'patientId'"}), 400
    if not old_name or not str(old_name).strip():
        return jsonify({"error": "Missing 'oldName'"}), 400

    try:
        patient_id = int(patient_id)
    except (TypeError, ValueError):
        return jsonify({"error": "'patientId' must be an integer"}), 400

    try:
        from ingredient_swap import suggest_ingredient_swaps

        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(
                suggest_ingredient_swaps(patient_id, str(old_name).strip()),
            )
        finally:
            loop.close()
        return jsonify(result)
    except Exception as e:
        logger.exception("[/suggest-ingredient-swaps] failed: %s", e)
        return jsonify({"error": str(e)}), 422


@app.route("/apply-ingredient-swap", methods=["POST"])
def apply_ingredient_swap_route():
    data = request.json or {}
    meal_matrix = data.get("mealMatrix") or data.get("meal_matrix")
    old_name = data.get("oldName") or data.get("old_name")
    replacement = data.get("replacement") or data.get("newFood")

    if not meal_matrix or not isinstance(meal_matrix, dict):
        return jsonify({"error": "Missing 'mealMatrix'"}), 400
    if not old_name:
        return jsonify({"error": "Missing 'oldName'"}), 400
    if not replacement or not isinstance(replacement, dict):
        return jsonify({"error": "Missing 'replacement' object"}), 400

    try:
        from ingredient_swap import apply_swap_to_meal_matrix

        updated = apply_swap_to_meal_matrix(
            meal_matrix, str(old_name).strip(), replacement,
        )
        return jsonify({"success": True, "meal_matrix": updated})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.exception("[/apply-ingredient-swap] failed: %s", e)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)
