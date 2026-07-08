from __future__ import annotations

import os
import logging

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

LEGACY_SNACK_KEY = "Morning Snack"
