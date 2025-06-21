require('dotenv').config();
const { ethers } = require('ethers');
const { Pool } = require('pg');
const PolyMirrorChannel = require('../contracts/PolyMirrorChannel.sol/PolyMirrorChannel.json');

const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
const contract = new ethers.Contract('DEPLOYED_CONTRACT_ADDRESS', PolyMirrorChannel.abi, provider);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function updateUserCredit(user, amount) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const queryText = 'INSERT INTO balances (user, credit) VALUES ($1, $2) ON CONFLICT (user) DO UPDATE SET credit = balances.credit + $2';
    await client.query(queryText, [user, amount]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

contract.on('Deposit', (user, tokenIn, usdcOut) => {
  console.log(`Deposit from ${user} for ${usdcOut} USDC`);
  updateUserCredit(user, usdcOut).catch(console.error);
});

contract.on('ChannelToppedUp', (user, amount, newBal) => {
  console.log(`Channel topped up for ${user} with ${amount}, new balance is ${newBal}`);
  updateUserCredit(user, amount).catch(console.error);
});

console.log('Watcher started...');
