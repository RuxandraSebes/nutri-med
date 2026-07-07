import pandas as pd
import os
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document

FILE_PATH = "datasets/Personalized_Diet_Recommendations.csv"
PATH_DB = "./db_pacienti"
COLLECTION = "patient_history"


def build_patient_document(row: dict) -> Document:
    text = (
        f"Patient ID: {row.get('Patient_ID', 'N/A')}. "
        f"Diagnosis: {row.get('Chronic_Disease', 'N/A')}. "
        f"Biomarkers: BMI {row.get('BMI', 'N/A')}, "
        f"Blood pressure {row.get('Blood_Pressure_Systolic', 'N/A')}/"
        f"{row.get('Blood_Pressure_Diastolic', 'N/A')}, "
        f"Cholesterol {row.get('Cholesterol_Level', 'N/A')}, "
        f"Blood sugar {row.get('Blood_Sugar_Level', 'N/A')}. "
        f"Lifestyle: {row.get('Dietary_Habits', 'N/A')}, "
        f"Daily steps: {row.get('Daily_Steps', 'N/A')}, "
        f"Sleep: {row.get('Sleep_Hours', 'N/A')}h. "
        f"Allergies: {row.get('Allergies', 'None')}. "
        f"Successful meal plan: {row.get('Recommended_Meal_Plan', 'N/A')} "
        f"({row.get('Recommended_Calories', 'N/A')} kcal, "
        f"Protein: {row.get('Recommended_Protein', 'N/A')}g, "
        f"Carbs: {row.get('Recommended_Carbs', 'N/A')}g, "
        f"Fats: {row.get('Recommended_Fats', 'N/A')}g)."
    )

    return Document(
        page_content=text,
        metadata={
            "patient_id": str(row.get("Patient_ID", "")),
            "disease": str(row.get("Chronic_Disease", "")),
            "bmi": str(row.get("BMI", "")),
            "meal_plan": str(row.get("Recommended_Meal_Plan", "")),
            "kcal_target": str(row.get("Recommended_Calories", "")),
        }
    )


def main():
    if not os.path.exists(FILE_PATH):
        print(f"Eroare: Fișierul nu a fost găsit: {FILE_PATH}")
        return

    df = pd.read_csv(FILE_PATH)
    df.columns = [c.strip() for c in df.columns]

    print(f"Se procesează {len(df)} înregistrări din {FILE_PATH}...")

    patient_docs = [build_patient_document(row.to_dict()) for _, row in df.iterrows()]

    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

    Chroma.from_documents(
        documents=patient_docs,
        embedding=embeddings,
        persist_directory=PATH_DB,
        collection_name=COLLECTION,
    )

    print(f"✅ Succes! S-au vectorizat {len(patient_docs)} profile în {PATH_DB} (colecție: {COLLECTION})")


if __name__ == "__main__":
    main()
