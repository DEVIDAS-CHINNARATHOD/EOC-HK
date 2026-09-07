import os
from langchain_groq import ChatGroq
import streamlit as st
from langchain_core.prompts import PromptTemplate
from dotenv import load_dotenv
load_dotenv()
from langchain_core.output_parsers import StrOutputParser

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
llm = ChatGroq(model="llama-3.1-8b-instant", api_key=GROQ_API_KEY)

title_prompt = PromptTemplate(
    input_variables=["topic"],
    template="""You are an experienced speech writer.
   You need to craft an impactful title for a speech 
   on the following topic: {topic}
   Answer exactly with one title.	
   """
)

speech_prompt = PromptTemplate(
    input_variables=["title"],
    template="""You need to write a powerful speech of 350 words
     for the following title: {title}
    """
)

first_chain = title_prompt | llm | StrOutputParser()
second_chain = speech_prompt | llm | StrOutputParser()
final_chain = first_chain | second_chain

st.title("Speech generator")
topic = st.text_input("Enter the Topic:")
if topic:
    title = first_chain.invoke({"topic": topic})
    st.write(title)

    response = final_chain.invoke({"topic": topic})
    st.write(response)