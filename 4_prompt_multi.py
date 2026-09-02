import os
import streamlit as st
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


# Initialize Groq LLM
llm = ChatGroq(
    groq_api_key=os.environ.get("GROQ_API_KEY"),
    model="llama-3.1-8b-instant"   # Example Groq-supported model
)

# Define the prompt template
prompt_temp = PromptTemplate(
    input_variables=["country", "no_of_paras", "language"],
    template="""You are an expert in traditional cuisines. 
    You provide information about a specific dish from a specific country. 
    Answer the question: what is the traditional cuisine of {country}? 
    Answer in {no_of_paras} short paragraphs in {language} language."""
)

# Streamlit UI
st.title("Cuisine Info")
country = st.text_input("Enter the country?")
no_of_paras = st.number_input("Enter the number of paras?", min_value=1, max_value=5)
language = st.text_input("Enter the language?")

if country and language:
    # Format the prompt with user inputs
    formatted_prompt = prompt_temp.format(
        country=country,
        no_of_paras=no_of_paras,
        language=language
    )
    # Invoke Groq LLM
    response = llm.invoke(formatted_prompt)
    st.write(response.content)