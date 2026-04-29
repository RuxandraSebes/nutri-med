from langchain_ollama import ChatOllama
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate

# 1. Configurare Embeddings (Trebuie să fie aceleași ca la ingestie)
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# 2. Încărcăm bazele de date deja create de tine
db_nutritie = Chroma(persist_directory="./db_nutritie", embedding_function=embeddings)
db_pacienti = Chroma(persist_directory="./db_pacienti", embedding_function=embeddings, collection_name="patient_history")

# 3. Configurăm Ollama (Asigură-te că ai Ollama pornit și modelul descărcat: ollama run llama3)
llm = ChatOllama(model="llama3", temperature=0)

# 4. Creăm un Prompt personalizat (foarte important pentru nutriție/medical)
template = """Folosește următoarele fragmente de context pentru a răspunde la întrebarea de la final. 
Dacă nu știi răspunsul, spune doar că nu știi, nu încerca să inventezi un răspuns.
Context: {context}
Întrebare: {question}
Răspuns în limba Română:"""

custom_prompt = PromptTemplate(template=template, input_variables=["context", "question"])

# 5. Funcție pentru a întreba despre ALIMENTE
def intreaba_alimente(query):
    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="stuff",
        retriever=db_nutritie.as_retriever(search_kwargs={"k": 3}),
        chain_type_kwargs={"prompt": custom_prompt}
    )
    return qa_chain.invoke(query)

# 6. Funcție pentru a întreba despre CAZURI SIMILARE de pacienți
def gaseste_cazuri_similare(query):
    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="stuff",
        retriever=db_pacienti.as_retriever(search_kwargs={"k": 2}),
        chain_type_kwargs={"prompt": custom_prompt}
    )
    return qa_chain.invoke(query)

# --- TEST ---
if __name__ == "__main__":
    print("\n--- Test RAG Alimente ---")
    res_aliment = intreaba_alimente("Ce îmi poți spune despre compoziția nutrițională a mărului?")
    print(res_aliment["result"])

    print("\n--- Test RAG Pacienți ---")
    res_pacient = gaseste_cazuri_similare("Am un pacient cu BMI 30 și Diabet. Ce plan s-a recomandat în trecut?")
    print(res_pacient["result"])