# PolyMirror.AI

This project implements the PolyMirror.AI specification, creating a bridge for on-chain entities to interact with OpenAI APIs using cryptocurrency.

## Project Structure

```
mirror/
├─ contracts/      # Solidity smart contracts
├─ scripts/        # Deployment and verification scripts
├─ backend/        # Node.js backend services
├─ sql/            # PostgreSQL database schema
└─ frontend/       # React frontend application
```

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm
- A PostgreSQL database

### 1. Setup Environment

Navigate to the `backend` directory and create a `.env` file from the example:

```bash
cp mirror/backend/.env.example mirror/backend/.env
```

Now, edit `mirror/backend/.env` with your specific details:

- `OPENAI_API_KEY`: Your OpenAI API key.
- `DATABASE_URL`: Your PostgreSQL connection string.
- `POLYGON_AMOY_RPC_URL`: An RPC URL for the Polygon Amoy testnet (e.g., from Alchemy or Infura).
- `OWNER_PRIVATE_KEY`: The private key of the account you want to use to deploy the contract and claim funds.

### 2. Install Dependencies

Install the dependencies for all parts of the project:

```bash
npm install --prefix mirror/backend
npm install --prefix mirror/frontend
npm install --prefix mirror @nomicfoundation/hardhat-toolbox @openzeppelin/contracts
```

### 3. Compile & Deploy Smart Contract

First, compile the smart contracts:

```bash
cd mirror
npx hardhat compile
```

Next, you need to update the `mirror/scripts/deploy.js` file with the addresses of the USDC token and the Uniswap V3 router on the Amoy testnet.

Once updated, deploy the contract:

```bash
npx hardhat run scripts/deploy.js --network amoy
```

After deployment, take note of the deployed `PolyMirrorChannel` contract address and update it in the backend files (`watcher.js`, `mirror.js`, `redeemJob.js`, `claim.js`) and the frontend (`useVoucher.ts`).

### 4. Run the Backend

Start the backend services:

```bash
# In a new terminal
npm start --prefix mirror/backend
```

This will start the API mirror and the event watcher.

### 5. Run the Frontend

In another terminal, start the frontend application:

```bash
npm run dev --prefix mirror/frontend
```

This will open the React application in your browser, where you can interact with the PolyMirror.AI bridge.
