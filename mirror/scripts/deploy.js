const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying PolyMirrorChannel with the account:", deployer.address);

  const PolyMirrorChannel = await ethers.getContractFactory("PolyMirrorChannel");
  const channelContract = await PolyMirrorChannel.deploy();

  await channelContract.waitForDeployment();

  console.log("PolyMirrorChannel deployed to:", channelContract.target);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
