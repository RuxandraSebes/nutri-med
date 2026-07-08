import pandas as pd
import glob
import os
import re
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document

PATH_DATASETS = "datasets/"
PATH_DB = "db_nutritie"

_VEGETABLE_NAMES = {
    "tomato", "cucumber", "carrot", "broccoli", "cauliflower", "spinach", "kale",
    "lettuce", "cabbage", "brussels sprouts", "green beans", "peas", "asparagus",
    "eggplant", "zucchini", "bell pepper red", "bell pepper green", "onion",
    "garlic", "sweet potato", "potato", "beetroot", "radish", "celery",
    "mushroom white", "shiitake mushroom", "artichoke", "okra", "turnip",
    "parsnip", "leek", "chard", "arugula", "bok choy", "sauerkraut",
    "olive green", "olive black", "pumpkin", "butternut squash", "corn",
    "cassava", "yam", "jicama", "fennel", "endive", "rhubarb", "broccolini",
    "snap peas",
}
_FAT_DENSE_PRODUCE_NAMES = {"avocado", "coconut meat"}
_LEGUME_RE = re.compile(
    r"lentil|chickpea|black bean|kidney bean|pinto bean|navy bean|cannellini|"
    r"lima bean|soybean|edamame|split pea|fava bean|mung bean|adzuki|"
    r"black eyed pea|white bean|cranberry bean|lupini|soy flour|\bpeas?\b",
    re.IGNORECASE,
)


def _dataset_group(source: str) -> str | None:
    m = re.search(r"GROUP(\d)", os.path.basename(source).upper())
    return f"GROUP{m.group(1)}" if m else None


def classify_macro_role(source: str, name: str, protein: float, carbs: float, fat: float) -> str:
    group = _dataset_group(source)
    n = str(name or "").strip().lower()

    if group == "GROUP4":
        return "protein"
    if group == "GROUP6":
        return "carb"
    if group == "GROUP2":
        return "fat"
    if group == "GROUP1":
        return "protein" if protein >= 8 else "fat"
    if group == "GROUP3":
        if n in _VEGETABLE_NAMES:
            return "vegetable"
        if n in _FAT_DENSE_PRODUCE_NAMES:
            return "fat"
        return "fruit"
    if group == "GROUP5":
        return "protein" if _LEGUME_RE.search(n) else "fat"

    p_cal, c_cal, f_cal = protein * 4, carbs * 4, fat * 9
    best = max((("protein", p_cal), ("carb", c_cal), ("fat", f_cal)), key=lambda kv: kv[1])
    return best[0]


def tag_food(row: dict) -> list[str]:
    tags = []

    sugar = float(row.get("sugars", 0) or 0)
    fiber = float(row.get("dietary fiber", 0) or 0)
    fat = float(row.get("fat", 0) or 0)
    protein = float(row.get("protein", 0) or 0)
    kcal = float(row.get("caloric value", 0) or 0)
    sodium = float(row.get("sodium", 0) or 0)

    if sugar < 5 and fiber > 2:
        tags += ["diabetes-friendly", "low glycemic index", "suitable for diabetes",
                 "suitable for insulin resistance", "suitable for metabolic syndrome"]

    if sodium < 120:
        tags += ["low sodium", "heart-healthy", "suitable for hypertension",
                 "suitable for cardiovascular disease"]

    if fiber > 4:
        tags += ["high fiber", "good for digestion", "suitable for obesity",
                 "suitable for weight management", "gut health"]

    if fat < 3:
        tags += ["low fat", "cardiovascular-friendly", "suitable for cardiovascular disease"]

    if protein > 15:
        tags += ["high protein", "muscle support", "suitable for sarcopenia",
                 "suitable for post-surgery recovery"]

    if kcal < 50:
        tags += ["low calorie", "weight loss friendly"]

    if fiber > 3 and kcal < 80:
        tags += ["potassium-rich", "suitable for hypertension", "suitable for kidney stones"]

    return tags


def build_enriched_document(row: dict, source: str) -> Document:
    name = row.get("food", "Unknown")
    kcal = row.get("caloric value", 0)
    protein = row.get("protein", 0)
    carbs = row.get("carbohydrates", 0)
    fat = row.get("fat", 0)
    sugar = row.get("sugars", 0)
    fiber = row.get("dietary fiber", 0)
    sodium = row.get("sodium", "N/A")

    tags = tag_food(row)
    tag_str = ", ".join(tags) if tags else "general use"
    macro_role = classify_macro_role(
        source, name, float(protein or 0), float(carbs or 0), float(fat or 0),
    )

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
            "source": source,
            "name": str(name),
            "kcal": float(kcal or 0),
            "protein_g": float(protein or 0),
            "carbs_g": float(carbs or 0),
            "fat_g": float(fat or 0),
            "fiber_g": float(fiber or 0),
            "sugar_g": float(sugar or 0),
            "tags": ",".join(tags),
            "macro_role": macro_role,
        }
    )


def main():
    csv_files = glob.glob(os.path.join(PATH_DATASETS, "*.csv"))

    if not csv_files:
        print(f"Eroare: Nu am găsit fișiere CSV în {PATH_DATASETS}")
        return

    all_docs = []

    for f in csv_files:
        print(f"Se procesează: {f}...")
        df = pd.read_csv(f)

        df.columns = [c.strip().lower() for c in df.columns]

        if "patient_id" in df.columns or "chronic_disease" in df.columns:
            print(f"  Skipping patient dataset: {f}")
            continue

        if "food" not in df.columns:
            print(f"  Skipping - no 'food' column found in: {f}")
            continue

        for _, row in df.iterrows():
            doc = build_enriched_document(row.to_dict(), f)
            all_docs.append(doc)

        print(f"  {len(df)} foods loaded from {f}")

    if not all_docs:
        print("No documents to ingest. Check your datasets folder.")
        return

    print(f"\nAm încărcat {len(all_docs)} alimente total. Se generează vectorii...")

    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

    Chroma.from_documents(
        documents=all_docs,
        embedding=embeddings,
        persist_directory=PATH_DB,
    )

    print(f"Succes! Baza de date salvată în: {PATH_DB} ({len(all_docs)} documente)")


if __name__ == "__main__":
    main()
