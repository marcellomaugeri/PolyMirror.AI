import express from 'express';
import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { abi as contractAbi } from '../../frontend/src/abi.js';
import OpenAI from 'openai';

// Recreate __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// --- DEBUGGING ---
console.log("--- Loaded Environment Variables ---");
console.log("PROVIDER_URL:", process.env.AMOY_RPC_URL);
console.log("CONTRACT_ADDRESS:", process.env.CONTRACT_ADDRESS);
console.log("PRIVATE_KEY loaded?", process.env.OWNER_PRIVATE_KEY ? "Yes" : "No");
console.log("OPENAI_API_KEY loaded?", process.env.OPENAI_API_KEY ? "Yes" : "No");
console.log("------------------------------------\n");

// --- CONFIGURATION ---
const app = express();
const port = process.env.PORT || 3001;
const contractAddress = process.env.CONTRACT_ADDRESS;

// Connect directly to the Amoy RPC endpoint specified in the .env file
const provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC_URL);
const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY;
const ownerWallet = new ethers.Wallet(ownerPrivateKey, provider);
const contract = new ethers.Contract(contractAddress, contractAbi, ownerWallet);

// Configure OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log(`[DEBUG] Backend wallet configured as owner: ${ownerWallet.address}`);

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- MOCK DATABASE ---
const usageData = {};

// --- ROUTES ---

// Endpoint to get token usage data
app.get("/api/usage/:channelId", (req, res) => {
  const { channelId } = req.params;
  const data = usageData[channelId] || [];
  res.json(data);
});

// OpenAI-compatible chat completions endpoint
app.post("/v1/chat/completions", async (req, res) => {
  console.log("\n--- Received OpenAI API Request ---");

  // 1. Extract Voucher from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Authorization header with Bearer token (voucher) required" });
  }
  const apiKeyPayload = authHeader.split(' ')[1];
  let voucher, signature;
  try {
    // Decode the Base64 payload before parsing
    const decodedPayload = Buffer.from(apiKeyPayload, 'base64').toString('utf-8');
    const parsedPayload = JSON.parse(decodedPayload);
    voucher = parsedPayload.voucher;
    signature = parsedPayload.signature;
    if (!voucher || !signature) throw new Error("Invalid voucher payload");
  } catch (e) {
    console.error("Failed to parse voucher:", e);
    return res.status(400).json({ error: "Invalid voucher format in Authorization header" });
  }

  // 2. Extract prompt from request body
  const prompt = req.body.messages?.find(m => m.role === 'user')?.content || '';
  if (!prompt) {
    return res.status(400).json({ error: "No user message found in request body" });
  }

  try {
    // 3. Call the actual OpenAI API
    console.log(`Forwarding request to OpenAI for model: ${req.body.model}`)
    const completion = await openai.chat.completions.create({
        messages: req.body.messages,
        model: req.body.model,
        stream: false, // We are not handling streaming responses in this example
    });

    const usage = completion.usage;
    if (!usage) {
        throw new Error("Could not determine token usage from OpenAI response.")
    }

    const inputTokens = usage.prompt_tokens;
    const outputTokens = usage.completion_tokens;

    // This is a simplified cost model where 1 token = 1 wei.
    const amount = BigInt(inputTokens + outputTokens);

    // 4. Redeem voucher on-chain for the actual cost
    console.log("Attempting to redeem voucher for actual cost...");
    console.log("  Voucher:", JSON.stringify(voucher, null, 2));
    console.log("  Signature:", signature);
    console.log("  Calculated Amount (wei):", amount.toString());

    const redeemTx = await contract.redeem(voucher, amount, signature);
    console.log("Redeem transaction sent, waiting for confirmation...");
    const receipt = await redeemTx.wait();
    console.log("Voucher redeemed successfully! Tx hash:", receipt.hash);

    // 5. Store usage data
    if (!usageData[voucher.channel]) {
      usageData[voucher.channel] = [];
    }
    usageData[voucher.channel].push({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // Add a unique ID
      name: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      input: inputTokens,
      output: outputTokens,
      model: completion.model,
    });

    // 6. Return the OpenAI-compatible response
    res.json(completion);
    console.log("--- Request Completed ---\n");

  } catch (error) {
    console.error("Error processing chat request:", error);
    const errorMessage = error.reason || error.message || "An unknown error occurred.";
    res.status(500).json({ 
        error: "Failed to process chat request", 
        details: errorMessage 
    });
  }
});

// --- SERVER ---
app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});
