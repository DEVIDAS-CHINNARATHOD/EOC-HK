import os
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from dotenv import load_dotenv
import truststore
import numpy as np

truststore.inject_into_ssl()
load_dotenv()

# Hugging Face embeddings
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

# Groq LLM
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
llm = ChatGroq(api_key=GROQ_API_KEY, model="llama-3.1-8b-instant")

# Input texts
text1 = input("Enter text1: ")
text2 = input("Enter text2: ")

# Embedding similarity
vec1 = embeddings.embed_query(text1)
vec2 = embeddings.embed_query(text2)
similarity_score = np.dot(vec1, vec2)
print("Similarity score:", similarity_score)

# Groq summarization
response = llm.invoke(f"Summarize and compare:\n{text1}\n{text2}")
print("Groq response:", response)