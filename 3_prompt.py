import os
import streamlit as st
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from dotenv import load_dotenv
load_dotenv()
llm = ChatGroq(
    groq_api_key=os.environ.get("GROQ_API_KEY"),
    model="llama-3.1-8b-instant"   # Example Groq-supported model
)
# Define the prompt template
prompt_temp = PromptTemplate(
    input_variables=["country"],
    template="""You are an expert in traditional cuisines. 
    You provide information about a specific dish from a specific country. 
    Answer the question: what is the traditional cuisine of {country}? 
    """
)
# Streamlit UI
st.title("Cuisine Info")
country = st.text_input("Enter the country?")
if country :

    # Invoke Groq LLM
    response = llm.invoke(prompt_temp.format(country=country ))
    st.write(response.content)