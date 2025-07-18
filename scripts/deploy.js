const { ethers } = require("hardhat");
const { parseEther } = ethers.utils;

async function main() {
  console.log("🚀 Starting AI Chatbot Bonding Curve Demo - Phase 1 Deployment");
  console.log("=".repeat(60));

  // Get network info
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const balance = await deployer.getBalance();

  console.log("📊 Network Information:");
  console.log(`  - Network: ${network.name} (Chain ID: ${network.chainId})`);
  console.log(`  - Deployer: ${deployer.address}`);
  console.log(`  - Balance: ${ethers.utils.formatEther(balance)} ETH`);
  console.log("");

  // Deployment parameters
  const TOKEN_NAME = "Chatbot Token";
  const TOKEN_SYMBOL = "CBT";
  const INITIAL_SUPPLY = parseEther("1000000"); // 1M tokens

  console.log("📋 Deployment Parameters:");
  console.log(`  - Token Name: ${TOKEN_NAME}`);
  console.log(`  - Token Symbol: ${TOKEN_SYMBOL}`);
  console.log(
    `  - Initial Supply: ${ethers.utils.formatEther(
      INITIAL_SUPPLY
    )} ${TOKEN_SYMBOL}`
  );
  console.log(`  - Admin: ${deployer.address}`);
  console.log("");

  // Deploy ChatbotToken
  console.log("🏗️  Deploying ChatbotToken contract...");
  const ChatbotToken = await ethers.getContractFactory("ChatbotToken");
  const token = await ChatbotToken.deploy(
    TOKEN_NAME,
    TOKEN_SYMBOL,
    INITIAL_SUPPLY,
    deployer.address
  );

  console.log(`  - Transaction hash: ${token.deployTransaction.hash}`);
  console.log("  - Waiting for confirmation...");

  await token.deployed();
  console.log(`✅ ChatbotToken deployed to: ${token.address}`);

  // Verify deployment
  console.log("\n🔍 Verifying deployment...");
  const tokenName = await token.name();
  const tokenSymbol = await token.symbol();
  const totalSupply = await token.totalSupply();
  const adminBalance = await token.balanceOf(deployer.address);

  console.log(`  - Token Name: ${tokenName}`);
  console.log(`  - Token Symbol: ${tokenSymbol}`);
  console.log(
    `  - Total Supply: ${ethers.utils.formatEther(totalSupply)} ${tokenSymbol}`
  );
  console.log(
    `  - Admin Balance: ${ethers.utils.formatEther(
      adminBalance
    )} ${tokenSymbol}`
  );

  // Check roles
  const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
  const PAUSER_ROLE = await token.PAUSER_ROLE();
  const hasAdminRole = await token.hasRole(
    DEFAULT_ADMIN_ROLE,
    deployer.address
  );
  const hasPauserRole = await token.hasRole(PAUSER_ROLE, deployer.address);

  console.log(`  - Has Admin Role: ${hasAdminRole}`);
  console.log(`  - Has Pauser Role: ${hasPauserRole}`);

  // Calculate deployment cost
  const deploymentReceipt = await token.deployTransaction.wait();
  const deploymentCost = deploymentReceipt.gasUsed.mul(
    token.deployTransaction.gasPrice
  );

  console.log("\n💰 Deployment Cost:");
  console.log(`  - Gas Used: ${deploymentReceipt.gasUsed.toString()}`);
  console.log(
    `  - Gas Price: ${ethers.utils.formatUnits(
      token.deployTransaction.gasPrice,
      "gwei"
    )} gwei`
  );
  console.log(
    `  - Total Cost: ${ethers.utils.formatEther(deploymentCost)} ETH`
  );

  console.log("\n📝 Contract Addresses:");
  console.log(`  - ChatbotToken: ${token.address}`);

  console.log("\n🎯 Next Steps:");
  console.log(
    "  1. Grant MINTER_ROLE to bonding curve contract (when deployed)"
  );
  console.log(
    "  2. Grant BURNER_ROLE to bonding curve contract (when deployed)"
  );
  console.log("  3. Grant BURNER_ROLE to chatbot contract (when deployed)");
  console.log("  4. Test token operations");

  console.log("\n" + "=".repeat(60));
  console.log("✅ Phase 1 Step 1 Complete - ERC20 Token Contract Deployed!");

  return {
    token: token.address,
    deployer: deployer.address,
    network: network.chainId,
  };
}

main()
  .then((result) => {
    console.log("\n🎉 Deployment successful!");
    console.log("Result:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Deployment failed!");
    console.error(error);
    process.exit(1);
  });
