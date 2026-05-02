"""
server.py — Flask AI service
Endpoints:
  GET  /health            → service + DB status
  POST /ask               → RAG question against db_nutritie or db_pacienti
  POST /analyze-journal   → food journal nutritional audit
  POST /generate-matrix   → full 7×4 RAG Nutrition Matrix
"""

from flask import Flask, request, jsonify
from langchain_ollama import ChatOllama
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain.chains import RetrievalQA
from langchain_core.prompts import PromptTemplate
import os
import logging

from nutrition_matrix import generate_nutrition_matrix_sync
from dotenv import load_dotenv
from flask import Flask, request, jsonify

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ── Embeddings ────────────────────────────────────────────────────────────────
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# ── Vector DBs ────────────────────────────────────────────────────────────────
if os.path.exists("./db_nutritie"):
    db_nutritie = Chroma(
        persist_directory="./db_nutritie",
        embedding_function=embeddings,
    )
    logger.info("✅ db_nutritie loaded.")
else:
    db_nutritie = None
    logger.warning("⚠️  db_nutritie not found — run ingestion.py first.")

if os.path.exists("./db_pacienti"):
    db_pacienti = Chroma(
        persist_directory="./db_pacienti",
        embedding_function=embeddings,
        collection_name="patient_history",
    )
    logger.info("✅ db_pacienti loaded.")
else:
    db_pacienti = None
    logger.warning("⚠️  db_pacienti not found — run ingestion_patients.py first.")

# ── LLM ───────────────────────────────────────────────────────────────────────
llm = ChatOllama(
    model=os.getenv("OLLAMA_MODEL", "mistral"),
    temperature=0.2,
    base_url=os.getenv("OLLAMA_HOST", "http://localhost:11434"),
)

# ── RAG prompt template ───────────────────────────────────────────────────────
# KEY CHANGE: LLM is allowed to supplement with general knowledge when the
# retrieved context is incomplete, instead of saying "I don't know".
QA_TEMPLATE = """Ești un asistent medical expert în nutriție.

INSTRUCȚIUNI:
- Folosește în primul rând contextul din baza de date de mai jos pentru a răspunde.
- Dacă contextul conține informații parțiale, completează cu cunoștințele tale medicale generale.
- Dacă contextul este irelevant pentru întrebare, răspunde din cunoștințele tale, dar menționează
  că nu ai date specifice din baza de date pentru această întrebare.
- Nu inventa valori nutriționale exacte dacă nu le ai — estimează și specifică că sunt estimări.
- Nu răspunde niciodată cu "nu știu" dacă poți oferi un răspuns medical general util.

Context din baza de date:
{context}

Întrebare: {question}

Răspuns profesional și complet în limba română:"""

QA_PROMPT = PromptTemplate(
    template=QA_TEMPLATE,
    input_variables=["context", "question"],
)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status":       "ok",
        "db_nutritie":  db_nutritie is not None,
        "db_pacienti":  db_pacienti is not None,
    })


@app.route("/ask", methods=["POST"])
def ask_ai():
    data       = request.json or {}
    user_query = data.get("query")
    target_db  = data.get("type", "nutritie")  # "nutritie" | "pacienti"

    if not user_query:
        return jsonify({"error": "Missing 'query'"}), 400

    db = db_nutritie if target_db == "nutritie" else db_pacienti
    if db is None:
        return jsonify({
            "error": f"Database '{target_db}' not loaded. "
                     f"Run {'ingestion.py' if target_db == 'nutritie' else 'ingestion_patients.py'} first."
        }), 503

    retriever = db.as_retriever(search_kwargs={"k": 5})

    # Debug: log what was retrieved
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
        # Extract clean string result
        result = response.get("result", str(response)) if isinstance(response, dict) else str(response)
        return jsonify({"result": result})
    except Exception as e:
        logger.error(f"[/ask] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/analyze-journal", methods=["POST"])
def analyze_journal():
    data       = request.json or {}
    food_entry = data.get("foodEntry")

    if not food_entry:
        return jsonify({"error": "Missing 'foodEntry'"}), 400

    system_prompt = (
        "You are a professional nutrition auditor. "
        "Analyze the provided food journal and return a response following this strict format:\n"
        "1. SCORE: Provide a rating from 1 to 10 based on nutritional density and glycemic index "
        "(10 being perfect).\n"
        "2. ANALYSIS: One short sentence explaining the score.\n"
        "3. IMPROVED VERSION: Provide a version for 3 main meals: breakfast, lunch and dinner "
        "and 2 snacks between the meals that fix the nutritional gaps found.\n\n"
        "Rules:\n"
        "- Do not use polite filler phrases or introductory sentences.\n"
        "- Be direct, clinical, and precise.\n"
        "- Respond only in English."
    )

    full_prompt = f"{system_prompt}\n\nJournal Entry: {food_entry}"

    try:
        response = llm.invoke(full_prompt)
        analysis = response.content if hasattr(response, "content") else str(response)
        return jsonify({"success": True, "analysis": analysis})
    except Exception as e:
        logger.error(f"[/analyze-journal] Error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/generate-matrix", methods=["POST"])
def generate_matrix():
    """
    POST /generate-matrix
    Body: { "patientId": <int> }
    Returns a full 7×4 RAG-generated nutrition matrix.
    """
    data       = request.json or {}
    patient_id = data.get("patientId")

    if patient_id is None:
        return jsonify({"error": "Missing 'patientId'"}), 400

    try:
        patient_id = int(patient_id)
    except (TypeError, ValueError):
        return jsonify({"error": "'patientId' must be an integer"}), 400

    if db_nutritie is None:
        return jsonify({
            "error": "ChromaDB nutrition database not loaded. Run ingestion.py first."
        }), 503

    logger.info(f"[/generate-matrix] Starting RAG pipeline for patientId={patient_id}")

    try:
        result = generate_nutrition_matrix_sync(patient_id)
        logger.info(f"[/generate-matrix] Success for patientId={patient_id}")
        return jsonify(result)
    except ValueError as e:
        logger.error(f"[/generate-matrix] ValueError: {e}")
        return jsonify({"error": str(e)}), 422
    except RuntimeError as e:
        logger.error(f"[/generate-matrix] RuntimeError: {e}")
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        logger.exception(f"[/generate-matrix] Unexpected error for patientId={patient_id}")
        return jsonify({"error": f"Internal error: {str(e)}"}), 500


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)