from flask import Flask, request, jsonify
from langchain_ollama import ChatOllama
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain.chains.retrieval_qa.base import RetrievalQAfrom langchain.prompts import PromptTemplate
import os

app = Flask(__name__)

# 1. Configurare Embeddings (Trebuie să fie IDENTICI cu cei de la ingestie)
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# 2. Încărcăm bazele de date create de tine
# Verifică dacă folderele există înainte de încărcare
if os.path.exists("./db_nutritie"):
    db_nutritie = Chroma(persist_directory="./db_nutritie", embedding_function=embeddings)
    print("✅ Baza de date Nutriție încărcată.")
else:
    print("❌ Eroare: Folderul db_nutritie nu a fost găsit!")

if os.path.exists("./db_pacienti"):
    db_pacienti = Chroma(
        persist_directory="./db_pacienti", 
        embedding_function=embeddings, 
        collection_name="patient_history"
    )
    print("✅ Baza de date Pacienți încărcată.")

# 3. Configurăm modelul Mistral prin Ollama
llm = ChatOllama(model="mistral", temperature=0.2)

# 4. Definim formatul răspunsului (Prompt)
template = """Ești un asistent medical expert în nutriție. Folosește contextul de mai jos pentru a răspunde la întrebare.
Dacă nu găsești informația în context, spune că nu știi, nu încerca să ghicești.

Context: {context}
Întrebare: {question}

Răspuns profesional în limba română:"""

QA_PROMPT = PromptTemplate(template=template, input_variables=["context", "question"])

# 5. Endpoint pentru interogare RAG
@app.route('/ask', methods=['POST'])
def ask_ai():
    data = request.json
    user_query = data.get("query")
    target_db = data.get("type", "nutritie") # Poate fi 'nutritie' sau 'pacienti'

    if not user_query:
        return jsonify({"error": "Lipsește query-ul"}), 400

    # Alegem retriever-ul în funcție de baza de date dorită
    retriever = db_nutritie.as_retriever() if target_db == "nutritie" else db_pacienti.as_retriever()

    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="stuff",
        retriever=retriever,
        chain_type_kwargs={"prompt": QA_PROMPT}
    )

    try:
        response = qa_chain.invoke(user_query)
        return jsonify({"result": response["result"]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)