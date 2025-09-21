# chatbot.py  — replace the existing file with this
import os
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

# small system prompt (you can tweak)
SYSTEM_PROMPT = """be polite and answer questions only related to marine life, marine organisms, oceans health, zooplanktons, phytoplanktons, bacteria, fungi
in brief and short around 50 words"""

# lazy-initialize the client so importing doesn't absolutely require the key at import-time
_chat_client = None
def _get_chat_client():
    global _chat_client
    if _chat_client is None:
        api_key = os.environ.get("AIzaSyAuyeqBdLavLGcA3LIZPsPDy8NzaxiiFuM")
        if not api_key:
            # explicit error so the server logs show what's missing
            raise RuntimeError("GOOGLE_API_KEY environment variable is not set. Export it before running the server.")
        _chat_client = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=0.7,
            google_api_key=api_key
        )
    return _chat_client

def chat_reply(user_text: str) -> str:
    """
    Given user_text, returns the assistant's reply as a plain string.
    Raises exceptions on errors (Flask route will catch & convert to JSON).
    """
    if not user_text or not str(user_text).strip():
        return "Please send a non-empty message."
    client = _get_chat_client()
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=str(user_text))
    ]
    response = client.invoke(messages)
    # response.content is expected; fallback to str(response)
    return getattr(response, "content", str(response))

if __name__ == "__main__":
    # keep a small interactive CLI for local testing if you want
    print("Chat CLI (type exit to quit). Make sure GOOGLE_API_KEY is exported.")
    while True:
        txt = input("YOU: ").strip()
        if txt.lower() == "exit":
            break
        try:
            print("BOT:", chat_reply(txt), "\n")
        except Exception as e:
            print("ERROR:", e)
