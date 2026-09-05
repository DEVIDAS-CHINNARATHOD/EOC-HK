import os
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from langchain_classic.chains.retrieval import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
load_dotenv()

# Hugging Face embeddings (instead of OpenAI)
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

# Groq LLM (instead of ChatOpenAI)
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
llm = ChatGroq(api_key=GROQ_API_KEY, model="llama-3.1-8b-instant")

# Load and split documents
document = TextLoader("product-data.txt").load()
text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks = text_splitter.split_documents(document)

# Create Chroma vector store
vector_db = Chroma.from_documents(chunks, embeddings)
retriever = vector_db.as_retriever()

# Prompt template
prompt_template = ChatPromptTemplate.from_messages(
    [
        ("system", """You are an assistant for answering questions.
Use the provided context to respond. If the answer
isn't clear, acknowledge that you don't know.
Limit your response to three concise sentences.
{context}
"""),
        ("human", "{input}")
    ]
)

# Build chains
qa_chain = create_stuff_documents_chain(llm, prompt_template)
rag_chain = create_retrieval_chain(retriever, qa_chain)

print("Chat with Document (type 'exit' to quit)")

# ---------- SIMPLE CHAT LOOP ----------
while True:
    question = input("\nYour Question: ")

    if question.lower() in ["exit", "quit", "bye"]:
        print("Ending chat…")
        break

    response = rag_chain.invoke({"input": question})
    print("\nAnswer:", response['answer'])