# PolyMirror.AI Usage Guide

This guide provides step-by-step instructions to deploy and run the PolyMirror.AI full-stack application on the Amoy testnet.

## Prerequisites

- [Node.js](https://nodejs.org/en/) (v18 or later recommended)
- [npm](https://www.npmjs.com/)
- [Python](https://www.python.org/downloads/) (v3.6 or later)
- [pip](https://pip.pypa.io/en/stable/installation/)
- A wallet (e.g., MetaMask) with an account funded with Amoy POL. You can get funds from an [Amoy Faucet](https://www.google.com/search?q=amoy+faucet).
- An RPC URL from a service like [Alchemy](https://www.alchemy.com/) or [Infura](https://www.infura.io/).

## Step 1: Configure Environment Variables

The `.env` file is the single source of configuration for your deployment and backend server.

1.  Open the environment file: `/Users/marcellomaugeri/Documents/PolyMirror.AI/mirror/backend/.env`
2.  Fill in the required values:
    ```env
    # The address of the contract will be placed here AFTER you deploy it.
    # For now, you can leave it as a placeholder.
    CONTRACT_ADDRESS=YOUR_AMOY_CONTRACT_ADDRESS_HERE

    # The private key for the account you want to deploy from.
    # IMPORTANT: This account must be funded with Amoy POL for gas fees.
    PRIVATE_KEY=YOUR_AMOY_ACCOUNT_PRIVATE_KEY

    # Your RPC URL for the Amoy network from Alchemy or Infura.
    AMOY_RPC_URL=YOUR_AMOY_RPC_URL
    ```

## Step 2: Deploy the Smart Contract to Amoy

This command compiles your contract and deploys it to the live Amoy testnet.

1.  Open a terminal and navigate to the project's root directory:
    ```bash
    cd /Users/marcellomaugeri/Documents/PolyMirror.AI/mirror
    ```
2.  Install the project dependencies:
    ```bash
    npm install
    ```
3.  Run the deployment script, targeting the `amoy` network:
    ```bash
    npx hardhat run scripts/deploy.js --network amoy
    ```
4.  After a successful deployment, the terminal will output the live contract address. It will look something like this:
    ```
    PolyMirrorChannel deployed to: 0x...
    ```
5.  **Copy this new contract address.**

## Step 3: Update Configuration with Live Address

Now that you have a live contract, you must update your configuration files to point to it.

1.  **Backend `.env` File:**
    -   Open `/Users/marcellomaugeri/Documents/PolyMirror.AI/mirror/backend/.env`.
    -   Paste the new contract address into the `CONTRACT_ADDRESS` variable.

2.  **Frontend `abi.js` File:**
    -   Open `/Users/marcellomaugeri/Documents/PolyMirror.AI/mirror/frontend/src/abi.js`.
    -   Paste the new contract address into the `contractAddress` variable.

## Step 4: Run the Application

With the configuration updated, you can now start the application servers.

1.  **Start the Backend Server:**
    -   In a new terminal, navigate to the backend directory:
        ```bash
        cd /Users/marcellomaugeri/Documents/PolyMirror.AI/mirror/backend
        ```
    -   Install dependencies and start the server:
        ```bash
        npm install
        node src/index.js
        ```
    -   The server will connect to your Amoy RPC and listen on `http://localhost:3001`.

2.  **Start the Frontend Server:**
    -   In another new terminal, navigate to the frontend directory:
        ```bash
        cd /Users/marcellomaugeri/Documents/PolyMirror.AI/mirror/frontend
        ```
    -   Install dependencies and start the server:
        ```bash
        npm install
        npm start
        ```
    -   Your browser should open to `http://localhost:3000`.

## Step 5: Test the Full Flow

1.  **Using the Frontend:**
    -   Open your browser to `http://localhost:3000`.
    -   Connect your wallet (e.g., MetaMask).
    -   **Ensure your wallet is connected to the Amoy network.**
    -   You can now use the dApp to open a channel, top it up, and interact with your live contract.

2.  **Using the Python Script:**
    -   This script tests the backend's chat endpoint and voucher redemption.
    -   Install Python dependencies:
        ```bash
        pip install requests python-dotenv eth-account
        ```
    -   Run the script from the backend directory:
        ```bash
        cd /Users/marcellomaugeri/Documents/PolyMirror.AI/mirror/backend
        python test_chat.py
        ```
    -   The script will sign a voucher with a test account and send it to your backend, which will then redeem it on the Amoy testnet. You will see the transaction confirmation in the backend logs.
