import os
from langchain_groq import ChatGroq
from dotenv import load_dotenv
load_dotenv()

llm = ChatGroq(
    groq_api_key=os.environ.get("GROQ_API_KEY"),
    model="llama-3.1-8b-instant"   # Example model
)
question = input("What's your question? ")
if question:
    response = llm.invoke(question)
    print(response)