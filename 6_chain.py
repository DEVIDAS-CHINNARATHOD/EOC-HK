import os
import streamlit as st
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate

# Load environment variables from .env file
load_dotenv()

# Initialize Groq LLM
llm = ChatGroq(
    groq_api_key=os.environ.get("GROQ_API_KEY"),
    model="llama-3.1-8b-instant"   # Example Groq-supported model
)

# Define the prompt template
prompt_temp = PromptTemplate(
    input_variables=["country", "month", "language", "budget"],
    template="""Welcome to the {country} travel guide!
    If you're visiting in {month}, here's what you can do:
    1. Must-visit attractions.
    2. Local cuisine you must try.
    3. Useful phrases in {language}.
    4. Tips for traveling on a {budget} budget.
    Enjoy your trip!
    """
)

# Streamlit UI
st.title("Cuisine Info")
country = st.text_input("Enter the country?")
month = st.text_input("Enter the month?")
language = st.text_input("Enter the language?")
budget = st.selectbox("Travel budget", ["low", "medium", "high"])

# Create chain (prompt → llm)
chain = prompt_temp | llm

if country and month and language and budget:
    response = chain.invoke({
        "country": country,
        "month": month,
        "language": language,
        "budget": budget
    })
    st.write(response.content)