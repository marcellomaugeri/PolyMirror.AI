require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const { Pool } = require('pg');
const axios = require('axios');

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const OPENAI_PRICES = {
  'gpt-3.5-turbo': 0.0015,
  'gpt-4o': 0.005,
};

app.post('/api/mirror', async (req, res) => {
  const { channel, voucher, sig, messages, model } = req.body;

  // 1. Verify voucher signature (simplified)

  // 2. Check user balance and reserve pending debit
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const balanceRes = await client.query('SELECT credit, pending FROM balances WHERE user = $1 FOR UPDATE', [channel]);
    const balance = balanceRes.rows[0];

    if (!balance || (balance.credit - balance.pending) < voucher.maxDebit) {
      return res.status(400).send('Insufficient balance');
    }

    await client.query('UPDATE balances SET pending = pending + $1 WHERE user = $2', [voucher.maxDebit, channel]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    return res.status(500).send('Database error');
  } finally {
    client.release();
  }

  // 3. Call OpenAI API
  let realCost = 0;
  try {
    const openaiRes = await axios.post('https://api.openai.com/v1/chat/completions', {
      model,
      messages,
    }, {
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
    });

    const usage = openaiRes.data.usage;
    const pricePerToken = OPENAI_PRICES[model] / 1000;
    realCost = Math.ceil((usage.prompt_tokens + usage.completion_tokens) * pricePerToken * 1_000_000); // in micro-USDC

    // 4. Reconcile real cost and queue voucher
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE balances SET pending = pending - $1 + $2 WHERE user = $3', [voucher.maxDebit, realCost, channel]);
      await client.query('INSERT INTO vouchers (user, nonce, max_debit, real_cost) VALUES ($1, $2, $3, $4)', [channel, voucher.nonce, voucher.maxDebit, realCost]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      // Handle reconciliation failure
    } finally {
      client.release();
    }

    res.json(openaiRes.data);

  } catch (error) {
    // Revert pending debit if OpenAI call fails
    const client = await pool.connect();
    await client.query('UPDATE balances SET pending = pending - $1 WHERE user = $2', [voucher.maxDebit, channel]);
    client.release();
    res.status(500).send('OpenAI API error');
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Mirror server running on port ${PORT}`);
});
