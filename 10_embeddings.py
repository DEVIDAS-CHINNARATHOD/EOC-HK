from langchain_huggingface import HuggingFaceEmbeddings

embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

# Example: embed text
text = input("Enter a text: ")
vector = embeddings.embed_query(text)
print("Embedding vector:", vector)

