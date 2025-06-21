
import requests
import json
from eth_account import Account
from eth_account.messages import encode_structured_data
from dotenv import load_dotenv
import os
import time

# Load environment variables from .env file
load_dotenv()

# --- CONFIGURATION ---
BACKEND_URL = "http://localhost:3001/api/chat"
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS")
# Use a different private key for the user than the contract owner
USER_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" # Hardhat account #2

# --- EIP-712 Domain Definition ---
domain = {
    "name": "PolyMirrorChannel",
    "version": "1",
    "chainId": 31337, # Hardhat default
    "verifyingContract": CONTRACT_ADDRESS,
}

# --- Voucher Struct Definition ---
voucher_type = {
    "Voucher": [
        {"name": "channel", "type": "address"},
        {"name": "nonce", "type": "uint256"},
        {"name": "deadline", "type": "uint256"},
        {"name": "model", "type": "string"},
        {"name": "inputTokenAmount", "type": "uint256"},
        {"name": "maxOutputTokenAmount", "type": "uint256"},
    ]
}

def sign_voucher(account, voucher_data):
    """Signs an EIP-712 voucher."""
    structured_data = {
        "types": voucher_type,
        "primaryType": "Voucher",
        "domain": domain,
        "message": voucher_data,
    }
    signed_message = account.sign_message(encode_structured_data(structured_data))
    return signed_message.signature.hex()

def main():
    """Creates a voucher, signs it, and sends it to the backend."""
    print("--- Starting Chat Test Script ---")

    # 1. Create an account from a private key
    try:
        user_account = Account.from_key(USER_PRIVATE_KEY)
        print(f"Using address: {user_account.address}")
    except Exception as e:
        print(f"Error creating account: {e}")
        return

    # 2. Define the voucher details
    # This nonce must be unique for each new voucher from the same user
    # We use the current timestamp for simplicity here
    nonce = int(time.time())
    deadline = nonce + 3600 # 1 hour from now

    voucher = {
        "channel": user_account.address,
        "nonce": nonce,
        "deadline": deadline,
        "model": "gpt-4o-mini",
        "inputTokenAmount": 100,   # Max input tokens user is willing to pay for
        "maxOutputTokenAmount": 200, # Max output tokens user is willing to pay for
    }
    print(f"\nCreating voucher:\n{json.dumps(voucher, indent=2)}")


    # 3. Sign the voucher
    try:
        signature = sign_voucher(user_account, voucher)
        print(f"\nGenerated Signature: {signature}")
    except Exception as e:
        print(f"\nError signing voucher: {e}")
        return

    # 4. Prepare the request payload
    payload = {
        "voucher": voucher,
        "signature": signature,
        "prompt": "Hello, world! Please tell me a short story.",
    }

    # 5. Send the request to the backend
    print(f"\nSending POST request to {BACKEND_URL}...")
    try:
        response = requests.post(BACKEND_URL, json=payload)
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)

        print("\n--- Backend Response ---")
        print(f"Status Code: {response.status_code}")
        print("Response JSON:")
        print(json.dumps(response.json(), indent=2))
        print("--------------------------\n")

    except requests.exceptions.RequestException as e:
        print(f"\nError sending request to backend: {e}")
        if e.response:
            try:
                print("Backend error details:", json.dumps(e.response.json(), indent=2))
            except json.JSONDecodeError:
                print("Backend response (not JSON):", e.response.text)


if __name__ == "__main__":
    main()
