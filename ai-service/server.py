import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_ollama import OllamaLLM

app = FastAPI(title="NutriMed AI Service")

# --- CONFIGURARE CORS ---
# Permite Frontend-ului tău (React) să apeleze acest API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- INIȚIALIZARE MODELE ȘI DB ---
print("Se încarcă resursele AI...")
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# Încărcăm cele două baze de date vectoriale
db_food = Chroma(
    persist_directory="./db_nutritie", 
    embedding_function=embeddings
)

db_patients = Chroma(
    persist_directory="./db_pacienti", 
    embedding_function=embeddings, 
    collection_name="patient_history"
)

# Modelul Mistral local prin Ollama
llm = OllamaLLM(model="mistral")

# --- MODELE DE DATE (Pydantic) ---
class PatientData(BaseModel):
    disease: str
    restriction: str
    age: int
    weight: float
    height: float
    bmi: float
    systolic: int
    diastolic: int
    cholesterol: float
    sugar: float
    allergies: str

# --- RUTE API ---

@app.get("/")
async def health_check():
    return {"status": "online", "service": "NutriMed AI"}

@app.post("/ai/recommend")
async def generate_recommendation(data: PatientData):
    """
    Endpoint principal care folosește Advanced RAG pentru a genera 
    recomandări bazate pe istoric și baza de date nutrițională.
    """
    try:
        # 1. RETRIEVAL - Căutăm în ambele surse de date
        # Căutăm pacienți similari (experiență anterioară)
        patient_query = f"Pacient cu {data.disease} și restricție {data.restriction}"
        similar_patients = db_patients.similarity_search(patient_query, k=2)
        history_context = "\n".join([p.page_content for p in similar_patients])

        # Căutăm alimente potrivite (baza de cunoștințe brută)
        food_query = f"Alimente bogate în nutrienți pentru {data.disease} {data.restriction}"
        relevant_foods = db_food.similarity_search(food_query, k=5)
        food_context = "\n".join([f.page_content for f in relevant_foods])

        # 2. AUGMENTATION - Construim prompt-ul complex
        prompt = f"""
        Ești un sistem expert de suport decizional medical nutrițional.
        
        PROFIL PACIENT ACTUAL:
        - Afecțiune: {data.disease}
        - Restricții: {data.restriction}
        
        ISTORIC MEDICAL SIMILAR (Cazuri rezolvate anterior):
        {history_context}
        
        BAZĂ DE DATE ALIMENTE RELEVANTE:
        {food_context}
        
        SARCINA TA:
        1. Analizează istoricul similar pentru a vedea ce tip de dietă a funcționat.
        2. Selectează cele mai potrivite alimente din lista de mai sus.
        3. Generază un plan alimentar scurt (3-4 recomandări) în limba ROMÂNĂ.
        4. Explică beneficiul medical pentru fiecare aliment ales în contextul bolii {data.disease}.

        Răspunde profesional, ca un nutriționist.
        """

        # 3. GENERATION - Apelăm Mistral
        response = llm.invoke(prompt)

        return {
            "recommendation": response,
            "metadata": {
                "similar_cases_found": len(similar_patients),
                "foods_analyzed": len(relevant_foods)
            }
        }
    except Exception as e:
        return {"error": str(e)}

# --- PORNIRE SERVER ---
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)