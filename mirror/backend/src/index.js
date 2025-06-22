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

// --- DATABASE & PRISMA ---
const prisma = new PrismaClient();

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

// --- Pricing Configuration ---
// We use BigInt for all currency calculations to avoid floating point errors.

// 1 POL = 0.19 USD. To avoid floats, we define this as 19 USD cents per POL.
const USD_CENTS_PER_POL = 19;

// Original prices are in USD per 1,000,000 tokens.
// We convert them to USD Cents per 1,000,000 tokens to work with integers.
// E.g., $0.15 becomes 15.
const openAiPricingScaled = {
    "gpt-4.1": { input: 200, output: 800 },
    "gpt-4.1-mini": { input: 40, output: 160 },
    "gpt-4.1-nano": { input: 10, output: 40 },
    "gpt-4.5-preview": { input: 7500, output: 15000 },
    "gpt-4o": { input: 250, output: 1000 },
    "gpt-4o-audio-preview": { input: 250, output: 1000 },
    "gpt-4o-realtime-preview": { input: 500, output: 2000 },
    "gpt-4o-mini": { input: 15, output: 60 },
    "gpt-4o-mini-audio-preview": { input: 15, output: 60 },
    "gpt-4o-mini-realtime-preview": { input: 60, output: 240 },
    "o1": { input: 1500, output: 6000 },
    "o1-pro": { input: 15000, output: 60000 },
    "o3-pro": { input: 2000, output: 8000 },
    "o3": { input: 200, output: 800 },
    "o4-mini": { input: 110, output: 440 },
    "o3-mini": { input: 110, output: 440 },
    "o1-mini": { input: 110, output: 440 },
};

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

// --- ROUTES ---

// Endpoint to get token usage data from the database
app.get("/api/usage/:channelId", async (req, res) => {
  const { channelId } = req.params;
  try {
    const records = await prisma.usageRecord.findMany({
      where: { channelId },
      orderBy: { timestamp: 'desc' },
    });
    // Map the database records to the format expected by the frontend
    const formattedRecords = records.map(record => ({
        id: record.id,
        timestamp: record.timestamp.toISOString(),
        name: record.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        input: record.input,
        output: record.output,
        model: record.model,
        cost: record.cost,
    }));
    res.json(formattedRecords);
  } catch (error) {
    console.error(`[ERROR] Failed to fetch usage data for channel ${channelId}:`, error);
    res.status(500).json({ error: "Failed to retrieve usage data." });
  }
});

// Endpoint to provide pricing data to the frontend
app.get("/api/pricing", (req, res) => {
  const models = {};
  const polPerUsd = 100 / USD_CENTS_PER_POL;

  for (const [model, prices] of Object.entries(openAiPricingScaled)) {
    const inputUsd = prices.input / 100;
    const outputUsd = prices.output / 100;
    models[model] = {
      inputUsd,
      outputUsd,
      inputPol: (inputUsd * polPerUsd).toFixed(4),
      outputPol: (outputUsd * polPerUsd).toFixed(4),
    };
  }

  res.json({
    polRate: polPerUsd,
    models,
  });
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

    const model = req.body.model;
    const inputTokens = usage.prompt_tokens;
    const outputTokens = usage.completion_tokens;

    // 4. Calculate cost using BigInt to avoid precision errors
    const modelPricing = openAiPricingScaled[model];
    if (!modelPricing) {
        return res.status(400).json({ error: `Pricing for model '${model}' not found.` });
    }

    // totalScaledCost represents the cost in cents * 100 if we had used (N * 1,000,000) tokens.
    const totalScaledCost = 
        BigInt(inputTokens) * BigInt(modelPricing.input) + 
        BigInt(outputTokens) * BigInt(modelPricing.output);

    // To get the actual cost, we must divide by 1,000,000.
    // To maintain precision with BigInt, we do all multiplications first, then division.
    // Formula: (totalScaledCost * WEI_PER_POL) / (TOKENS_PER_UNIT * USD_CENTS_PER_POL * 100)
    const costInWeiNumerator = totalScaledCost * BigInt(10**18); // Cost * 10^18 to get to wei
    const costInWeiDenominator = BigInt(1_000_000) * BigInt(USD_CENTS_PER_POL);
    const amountInWei = costInWeiNumerator / costInWeiDenominator;

    // For logging and storage, convert wei back to a readable POL string
    const totalCostPOL = ethers.formatUnits(amountInWei, 18);

    console.log("--- Cost Calculation (Corrected) ---");
    console.log(`  Model: ${model}`);
    console.log(`  Input: ${inputTokens} tokens, Output: ${outputTokens} tokens`);
    console.log(`  POL Cost: ${totalCostPOL} POL`);
    console.log(`  Amount to Redeem (wei): ${amountInWei.toString()}`);
    console.log("-------------------------------------");

    // 5. Redeem voucher on-chain for the actual cost
    console.log("Attempting to redeem voucher for actual cost...");
    console.log("  Voucher:", JSON.stringify(voucher, null, 2));
    console.log("  Signature:", signature);
    console.log("  Calculated Amount (wei):", amountInWei.toString());

    const redeemTx = await contract.redeem(voucher, amountInWei, signature);
    console.log("Redeem transaction sent, waiting for confirmation...");
    const receipt = await redeemTx.wait();
    console.log("Voucher redeemed successfully! Tx hash:", receipt.hash);

    // 5. Store usage data in the database
    try {
      const now = new Date();
      await prisma.usageRecord.create({
        data: {
          channelId: voucher.channel,
          timestamp: now,
          model: completion.model,
          input: inputTokens,
          output: outputTokens,
          cost: amountInWei.toString(),
        },
      });
      console.log(`[INFO] Usage record saved to database for channel ${voucher.channel}`);
    } catch (dbError) {
        console.error("[ERROR] Failed to save usage record to database:", dbError);
        // We don't block the response to the user if this fails, but we log it.
    }

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
