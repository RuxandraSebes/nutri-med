import pandas as pd
import glob
import os
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document

# 1. Configurări căi
PATH_DATASETS = "datasets/"  # folderul unde ai cele 5 csv-uri
PATH_DB = "db_nutritie"

csv_files = glob.glob(os.path.join(PATH_DATASETS, "*.csv"))

if not csv_files:
    print(f"Eroare: Nu am găsit fișiere CSV în {PATH_DATASETS}")
    exit()

all_docs = []

# 2. Procesare fișiere
for f in csv_files:
    print(f"Se procesează: {f}...")
    # Citim CSV-ul, ignorând prima coloană index dacă e goală
    df = pd.read_csv(f)
    
    # Curățăm numele coloanelor (eliminăm spații și transformăm în lowercase pentru siguranță)
    df.columns = [c.strip().lower() for c in df.columns]

    for _, row in df.iterrows():
        # Extragem datele folosind noile nume de coloane (mici)
        nume_aliment = row.get('food', 'Necunoscut')
        calorii = row.get('caloric value', 0)
        proteine = row.get('protein', 0)
        carbo = row.get('carbohydrates', 0)
        grasimi = row.get('fat', 0)
        zahar = row.get('sugars', 0)
        fibre = row.get('dietary fiber', 0)

        # Construim descrierea textuală pentru RAG
        text_content = (
            f"Aliment: {nume_aliment}. "
            f"Valori nutriționale per 100g: {calorii} kcal, "
            f"Proteine: {proteine}g, Carbohidrați: {carbo}g (din care zaharuri: {zahar}g), "
            f"Grăsimi: {grasimi}g, Fibre: {fibre}g."
        )
        
        # Creăm obiectul Document
        doc = Document(
            page_content=text_content,
            metadata={"source": f, "name": nume_aliment}
        )
        all_docs.append(doc)

# 3. Crearea bazei de date vectoriale
print(f"Am încărcat {len(all_docs)} alimente. Se generează vectorii...")

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

vector_db = Chroma.from_documents(
    documents=all_docs,
    embedding=embeddings,
    persist_directory=PATH_DB
)

print(f"Succes! Baza de date a fost salvată în folderul {PATH_DB}.")