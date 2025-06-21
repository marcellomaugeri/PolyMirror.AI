const hre = require("hardhat");

async function main() {
  // Replace with your deployed contract address
  const contractAddress = "YOUR_CONTRACT_ADDRESS";
  // Replace with constructor arguments if any
  const constructorArguments = [];

  await hre.run("verify:verify", {
    address: contractAddress,
    constructorArguments: constructorArguments,
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
