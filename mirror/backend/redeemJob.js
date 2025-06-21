require('dotenv').config();
const cron = require('node-cron');
const { ethers } = require('ethers');
const { Pool } = require('pg');
const PolyMirrorChannel = require('../contracts/PolyMirrorChannel.sol/PolyMirrorChannel.json');

const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
const owner = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY, provider);
const contract = new ethers.Contract('DEPLOYED_CONTRACT_ADDRESS', PolyMirrorChannel.abi, owner);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function redeemVouchers() {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT * FROM vouchers WHERE redeemed_at IS NULL');
    const vouchersToRedeem = res.rows;

    // Batching logic would go here

    for (const voucher of vouchersToRedeem) {
      try {
        const tx = await contract.redeem(
          { channel: voucher.user, maxDebit: voucher.max_debit, nonce: voucher.nonce, deadline: Math.floor(Date.now() / 1000) + 3600 },
          voucher.real_cost,
          '0x...' // Signature needs to be stored or regenerated
        );
        await tx.wait();

        await client.query('UPDATE vouchers SET redeemed_at = NOW() WHERE user = $1 AND nonce = $2', [voucher.user, voucher.nonce]);
        await client.query('UPDATE balances SET credit = credit - $1 WHERE user = $2', [voucher.real_cost, voucher.user]);

      } catch (error) {
        console.error(`Failed to redeem voucher for user ${voucher.user}, nonce ${voucher.nonce}:`, error);
      }
    }
  } finally {
    client.release();
  }
}

// Schedule to run every hour
cron.schedule('0 * * * *', () => {
  console.log('Running redeem job...');
  redeemVouchers();
});

console.log('Redeem job started.');
