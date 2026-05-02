"""
ingestion.py
────────────
Ingests food CSV datasets into ChromaDB (db_nutritie).
Each food document is enriched with medical use-case tags
so that disease-based queries (e.g. "diabetes-friendly foods")
hit the right documents at retrieval time.
"""

import pandas as pd
import glob
import os
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document

# ── Config ────────────────────────────────────────────────────────────────────
PATH_DATASETS = "datasets/"
PATH_DB       = "db_nutritie"

# ── Medical tag rules ─────────────────────────────────────────────────────────
# These tags are embedded into the document text so ChromaDB can match
# disease-based queries to nutritional data via semantic similarity.

def tag_food(row: dict) -> list[str]:
    tags = []

    sugar   = float(row.get("sugars",         0) or 0)
    fiber   = float(row.get("dietary fiber",  0) or 0)
    fat     = float(row.get("fat",            0) or 0)
    protein = float(row.get("protein",        0) or 0)
    kcal    = float(row.get("caloric value",  0) or 0)
    sodium  = float(row.get("sodium",         0) or 0)   # present in some datasets

    # Diabetes / blood sugar
    if sugar < 5 and fiber > 2:
        tags += ["diabetes-friendly", "low glycemic index", "suitable for diabetes",
                 "suitable for insulin resistance", "suitable for metabolic syndrome"]

    # Heart / hypertension
    if sodium < 120:
        tags += ["low sodium", "heart-healthy", "suitable for hypertension",
                 "suitable for cardiovascular disease"]

    # Digestion / obesity
    if fiber > 4:
        tags += ["high fiber", "good for digestion", "suitable for obesity",
                 "suitable for weight management", "gut health"]

    # Cardiovascular / weight
    if fat < 3:
        tags += ["low fat", "cardiovascular-friendly", "suitable for cardiovascular disease"]

    # Muscle / recovery
    if protein > 15:
        tags += ["high protein", "muscle support", "suitable for sarcopenia",
                 "suitable for post-surgery recovery"]

    # Weight loss
    if kcal < 50:
        tags += ["low calorie", "weight loss friendly"]

    # Potassium proxy: high fiber + low kcal fruits/veg are usually potassium-rich
    if fiber > 3 and kcal < 80:
        tags += ["potassium-rich", "suitable for hypertension", "suitable for kidney stones"]

    return tags


def build_enriched_document(row: dict, source: str) -> Document:
    name    = row.get("food",           "Unknown")
    kcal    = row.get("caloric value",  0)
    protein = row.get("protein",        0)
    carbs   = row.get("carbohydrates",  0)
    fat     = row.get("fat",            0)
    sugar   = row.get("sugars",         0)
    fiber   = row.get("dietary fiber",  0)
    sodium  = row.get("sodium",         "N/A")

    tags    = tag_food(row)
    tag_str = ", ".join(tags) if tags else "general use"

    # The medical use-case text is what makes disease-based retrieval work.
    # ChromaDB matches the query "foods for diabetes" against this text.
    text = (
        f"Food: {name}. "
        f"Nutritional values per 100g: {kcal} kcal, "
        f"Protein: {protein}g, Carbohydrates: {carbs}g (sugars: {sugar}g), "
        f"Fat: {fat}g, Fiber: {fiber}g, Sodium: {sodium}mg. "
        f"Medical use cases: {tag_str}. "
        f"Recommended for patients with: "
        f"{', '.join(t.replace('suitable for ', '') for t in tags if 'suitable for' in t) or 'general diet'}."
    )

    return Document(
        page_content=text,
        metadata={
            "source":    source,
            "name":      str(name),
            "kcal":      float(kcal    or 0),
            "protein_g": float(protein or 0),
            "carbs_g":   float(carbs   or 0),
            "fat_g":     float(fat     or 0),
            "fiber_g":   float(fiber   or 0),
            "sugar_g":   float(sugar   or 0),
            "tags":      ",".join(tags),
        }
    )


# ── Main ingestion ────────────────────────────────────────────────────────────

def main():
    csv_files = glob.glob(os.path.join(PATH_DATASETS, "*.csv"))

    if not csv_files:
        print(f"Eroare: Nu am găsit fișiere CSV în {PATH_DATASETS}")
        return

    all_docs = []

    for f in csv_files:
        print(f"Se procesează: {f}...")
        df = pd.read_csv(f)

        # Normalise column names: strip whitespace + lowercase
        df.columns = [c.strip().lower() for c in df.columns]

        # Skip patient datasets accidentally placed here
        if "patient_id" in df.columns or "chronic_disease" in df.columns:
            print(f"  ⚠️  Skipping patient dataset: {f}")
            continue

        # Skip files without the expected food column
        if "food" not in df.columns:
            print(f"  ⚠️  Skipping — no 'food' column found in: {f}")
            continue

        for _, row in df.iterrows():
            doc = build_enriched_document(row.to_dict(), f)
            all_docs.append(doc)

        print(f"  ✅ {len(df)} foods loaded from {f}")

    if not all_docs:
        print("No documents to ingest. Check your datasets folder.")
        return

    print(f"\nAm încărcat {len(all_docs)} alimente total. Se generează vectorii...")

    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

    vector_db = Chroma.from_documents(
        documents=all_docs,
        embedding=embeddings,
        persist_directory=PATH_DB,
    )

    print(f"✅ Succes! Baza de date salvată în: {PATH_DB} ({len(all_docs)} documente)")


if __name__ == "__main__":
    main()