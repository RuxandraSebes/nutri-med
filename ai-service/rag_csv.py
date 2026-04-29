import pandas as pd
import os

from llama_index.core import (
    VectorStoreIndex,
    Document,
    Settings,
    StorageContext,
    load_index_from_storage
)

from llama_index.llms.ollama import Ollama
from llama_index.embeddings.ollama import OllamaEmbedding

# 🔹 1. MODELE (prin Ollama)
embed_model = OllamaEmbedding(model_name="nomic-embed-text")

llm = Ollama(
    model="mistral",
    temperature=0.1
)

Settings.embed_model = embed_model
Settings.llm = llm

# 🔹 2. PATH pentru storage
PERSIST_DIR = "./storage"

# 🔹 3. Dacă există index → îl încărcăm
if os.path.exists(PERSIST_DIR):
    print("🔄 Se încarcă indexul existent...")

    storage_context = StorageContext.from_defaults(
        persist_dir=PERSIST_DIR
    )
    index = load_index_from_storage(storage_context)

# 🔹 4. Dacă NU există → îl creăm
else:
    print("⚙️ Se creează indexul (prima rulare, poate dura)...")

    df = pd.read_csv("datasets/Personalized_Diet_Recommendations.csv")

    docs = []

    for _, row in df.iterrows():
        text = f"""
        Pacient cu {row['Chronic_Disease']}.
        BMI: {row['BMI']}, Tensiune: {row['Blood_Pressure_Systolic']}/{row['Blood_Pressure_Diastolic']}.
        Dietă: {row['Dietary_Habits']}.
        Plan recomandat: {row['Recommended_Meal_Plan']}
        """

        docs.append(Document(text=text))

    index = VectorStoreIndex.from_documents(docs)

    # 🔥 salvare
    index.storage_context.persist(persist_dir=PERSIST_DIR)

    print("✅ Index creat și salvat!")

# 🔹 5. Query engine
query_engine = index.as_query_engine(similarity_top_k=3)

# 🔹 6. Interfață
while True:
    q = input("\nÎntrebare: ")

    if q.lower() in ["exit", "quit"]:
        break

    response = query_engine.query(q)

    print("\nRăspuns:", response)