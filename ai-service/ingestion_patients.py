import pandas as pd
import os
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document

# 1. Încarcă noul fișier
# Schimbă cu numele real al fișierului tău .csv
FILE_PATH = "datasets/Personalized_Diet_Recommendations.csv" 
df = pd.read_csv(FILE_PATH)

# Curățare nume coloane
df.columns = [c.strip() for c in df.columns]

patient_docs = []

# 2. Crearea profilului narativ (Clinical Context)
for _, row in df.iterrows():
    # Construim o descriere clinică completă
    text_content = (
        f"Pacient ID: {row['Patient_ID']}. "
        f"Diagnostic: {row['Chronic_Disease']}. "
        f"Indicatori: BMI {row['BMI']}, Tensiune {row['Blood_Pressure_Systolic']}/{row['Blood_Pressure_Diastolic']}, "
        f"Colesterol {row['Cholesterol_Level']}, Glicemie {row['Blood_Sugar_Level']}. "
        f"Stil de viață: {row['Dietary_Habits']}, Pași zilnici: {row['Daily_Steps']}, Somn: {row['Sleep_Hours']}h. "
        f"Alergii: {row['Allergies']}. "
        f"Plan de succes anterior: {row['Recommended_Meal_Plan']} "
        f"({row['Recommended_Calories']} kcal, P:{row['Recommended_Protein']}g, "
        f"C:{row['Recommended_Carbs']}g, F:{row['Recommended_Fats']}g)."
    )
    
    doc = Document(
        page_content=text_content,
        metadata={"patient_id": str(row['Patient_ID'])}
    )
    patient_docs.append(doc)

# 3. Salvare în baza de date nouă
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
vector_db = Chroma.from_documents(
    documents=patient_docs,
    embedding=embeddings,
    persist_directory="./db_pacienti",
    collection_name="patient_history"
)

print(f"Succes! S-au vectorizat {len(patient_docs)} profile detaliate.")