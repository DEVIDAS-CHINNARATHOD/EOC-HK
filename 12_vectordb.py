import os
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
import truststore
from dotenv import load_dotenv

truststore.inject_into_ssl()
load_dotenv()

# Hugging Face embeddings (instead of OpenAI)
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

# Groq LLM for fast inference
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
llm = ChatGroq(api_key=GROQ_API_KEY, model="llama-3.1-8b-instant")

# Load and split documents
document = TextLoader("job_listings.txt").load()
text_splitter = RecursiveCharacterTextSplitter(chunk_size=300, chunk_overlap=30)
chunks = text_splitter.split_documents(document)

# Create Chroma vector store
db = Chroma.from_documents(chunks, embeddings)
retriever = db.as_retriever()

# Query
text = input("Enter a query: ")
docs = retriever.invoke(text)

#print(docs)

print("\n🔎 Retrieved Chunks:")
for d in docs:
    print(d.page_content)

