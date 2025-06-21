require('dotenv').config();
const { ethers } = require('ethers');
const PolyMirrorChannel = require('../contracts/PolyMirrorChannel.sol/PolyMirrorChannel.json');

async function claimFunds() {
  const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
  const owner = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract('DEPLOYED_CONTRACT_ADDRESS', PolyMirrorChannel.abi, owner);

  const amountToClaim = ethers.parseUnits('100', 6); // Example: claim 100 USDC

  try {
    const tx = await contract.claim(amountToClaim);
    console.log('Claim transaction sent:', tx.hash);
    await tx.wait();
    console.log('Claim transaction confirmed.');
  } catch (error) {
    console.error('Failed to claim funds:', error);
  }
}

claimFunds();
