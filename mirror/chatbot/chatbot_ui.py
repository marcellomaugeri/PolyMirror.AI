import streamlit as st
import openai
import json
import time
import os
import base64
from eth_account import Account
from eth_account.messages import encode_typed_data # Changed import
from dotenv import load_dotenv

# Load environment variables from the root .env file
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../.env'))

# --- CONFIGURATION ---
# Point the OpenAI client to our local backend
client = openai.OpenAI(
    base_url="http://localhost:3001/v1", # Correct base URL
    api_key="not_needed", # Will be replaced by our voucher
)
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS")
USER_PRIVATE_KEY = os.getenv("USER_PRIVATE_KEY")
AMOY_CHAIN_ID = 80002

if not USER_PRIVATE_KEY or not CONTRACT_ADDRESS:
    st.error("USER_PRIVATE_KEY or CONTRACT_ADDRESS not found in .env file. Please add them.")
    st.stop()

# --- EIP-712 Domain and Type Definitions (must match contract) ---

# The EIP-712 domain separator
domain = {
    "name": "PolyMirrorChannel",
    "version": "1",
    "chainId": AMOY_CHAIN_ID,
    "verifyingContract": CONTRACT_ADDRESS,
}

# The complete type definition for the structured data, including the domain.
# This resolves the "EIP712Domain struct not found" error.
types = {
    "EIP712Domain": [
        {"name": "name", "type": "string"},
        {"name": "version", "type": "string"},
        {"name": "chainId", "type": "uint256"},
        {"name": "verifyingContract", "type": "address"},
    ],
    "Voucher": [
        {"name": "channel", "type": "address"},
        {"name": "nonce", "type": "uint256"},
        {"name": "deadline", "type": "uint256"},
        {"name": "model", "type": "string"},
        {"name": "inputTokenAmount", "type": "uint256"},
        {"name": "maxOutputTokenAmount", "type": "uint256"},
    ]
}


@st.cache_data(show_spinner=False)
def get_user_address():
    return Account.from_key(USER_PRIVATE_KEY).address

def get_voucher_api_key(model: str, input_tokens: int, output_tokens: int) -> str:
    """
    Generates a signed voucher and returns it as a JSON string to be used as the API key.
    """
    user_account = Account.from_key(USER_PRIVATE_KEY)
    nonce = int(time.time() * 1000) # Use milliseconds for more unique nonces
    deadline = int(time.time()) + 3600  # 1 hour from now

    voucher = {
        "channel": user_account.address,
        "nonce": nonce,
        "deadline": deadline,
        "model": model,
        "inputTokenAmount": input_tokens, # This is a pre-authorization, not the actual cost
        "maxOutputTokenAmount": output_tokens, # This is a pre-authorization, not the actual cost
    }

    # The full structured data to be signed
    structured_data = {
        "types": types, # Use the complete types dictionary
        "primaryType": "Voucher",
        "domain": domain,
        "message": voucher,
    }

    # Sign the structured data using the updated method
    signable_message = encode_typed_data(full_message=structured_data)
    signed_message = user_account.sign_message(signable_message)
    signature = signed_message.signature.hex()

    api_key_payload = {
        "voucher": voucher,
        "signature": signature
    }

    return base64.b64encode(json.dumps(api_key_payload).encode('utf-8')).decode('utf-8')

# --- Streamlit UI ---
st.title("PolyMirror.AI Chatbot")
st.write(f"Authenticated as: `{get_user_address()}`")
st.info("This chatbot uses the OpenAI API, but payments are handled on the Polygon blockchain via signed vouchers. Each message you send generates a new voucher, which is redeemed by the backend.")

# Initialize chat history
if "messages" not in st.session_state:
    st.session_state.messages = []

# Display chat messages from history on app rerun
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# React to user input
if prompt := st.chat_input("What is up?"):
    # Display user message in chat message container
    st.chat_message("user").markdown(prompt)
    # Add user message to chat history
    st.session_state.messages.append({"role": "user", "content": prompt})

    try:
        # --- 1. Generate Voucher as API Key ---
        # We pre-authorize a max cost. The backend calculates the actual cost.
        voucher_api_key = get_voucher_api_key("gpt-4o-mini", 30, 50)

        # --- 2. Call Backend via OpenAI Library ---
        with st.spinner("Waiting for response..."):
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=st.session_state.messages,
                # The hook: Override the api_key for this specific call
                extra_headers={
                    "Authorization": f"Bearer {voucher_api_key}"
                }
            )
            response_content = response.choices[0].message.content

        # --- 3. Display Assistant Response ---
        with st.chat_message("assistant"):
            st.markdown(response_content)
        
        # Add assistant response to chat history
        st.session_state.messages.append({"role": "assistant", "content": response_content})

    except openai.APIConnectionError as e:
        st.error(f"Error connecting to the backend: {e.__cause__}")
    except openai.APIStatusError as e:
        st.error(f"Error from backend: {e.status_code} - {e.response.text}")
    except Exception as e:
        st.error(f"An unexpected error occurred: {e}")
