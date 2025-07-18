const { ethers, run } = require("hardhat");

async function main() {
  console.log("🔍 Starting Contract Verification");
  console.log("=".repeat(50));

  // Get network info
  const network = await ethers.provider.getNetwork();
  console.log(`📊 Network: ${network.name} (Chain ID: ${network.chainId})`);

  // Check if contract address is provided
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    console.error(
      "❌ Error: CONTRACT_ADDRESS environment variable is required"
    );
    console.log("\n💡 Usage:");
    console.log("   CONTRACT_ADDRESS=0x... npm run verify:devnet");
    console.log("   or");
    console.log(
      "   CONTRACT_ADDRESS=0x... npx hardhat run scripts/verify.js --network fluent_devnet"
    );
    process.exit(1);
  }

  console.log(`📋 Contract Address: ${contractAddress}`);

  // Deployment parameters (must match original deployment)
  const TOKEN_NAME = "Chatbot Token";
  const TOKEN_SYMBOL = "CBT";
  const INITIAL_SUPPLY = ethers.utils.parseEther("1000000"); // 1M tokens

  // Get deployer address (assuming verification is run by same account)
  const [deployer] = await ethers.getSigners();
  const ADMIN_ADDRESS = deployer.address;

  console.log("\n📋 Constructor Arguments:");
  console.log(`  - Name: ${TOKEN_NAME}`);
  console.log(`  - Symbol: ${TOKEN_SYMBOL}`);
  console.log(
    `  - Initial Supply: ${ethers.utils.formatEther(
      INITIAL_SUPPLY
    )} ${TOKEN_SYMBOL}`
  );
  console.log(`  - Admin: ${ADMIN_ADDRESS}`);

  try {
    console.log("\n🏗️  Verifying ChatbotToken contract...");

    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: [
        TOKEN_NAME,
        TOKEN_SYMBOL,
        INITIAL_SUPPLY,
        ADMIN_ADDRESS,
      ],
    });

    console.log("✅ Contract verification successful!");

    // Additional verification - check if contract is actually deployed
    const code = await ethers.provider.getCode(contractAddress);
    if (code === "0x") {
      console.log("⚠️  Warning: No contract code found at this address");
    } else {
      console.log("✅ Contract code confirmed on blockchain");
    }
  } catch (error) {
    console.error("❌ Verification failed!");

    if (error.message.includes("Already Verified")) {
      console.log("ℹ️  Contract is already verified");
    } else if (error.message.includes("does not have bytecode")) {
      console.error("❌ No contract found at the specified address");
    } else if (error.message.includes("Constructor arguments")) {
      console.error("❌ Constructor arguments mismatch");
      console.log(
        "\n💡 Make sure the constructor arguments match the original deployment:"
      );
      console.log(
        "   - Check token name, symbol, initial supply, and admin address"
      );
    } else {
      console.error("Error details:", error.message);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("🔍 Verification process complete");
}

main()
  .then(() => {
    console.log("\n🎉 Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed!");
    console.error(error);
    process.exit(1);
  });
