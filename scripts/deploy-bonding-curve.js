const { ethers } = require("hardhat");
const { parseEther, formatEther, formatUnits } = ethers.utils;

async function main() {
  console.log(
    "🚀 Starting AI Chatbot Bonding Curve - Complete System Deployment"
  );
  console.log("=".repeat(80));

  // Get network info
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const balance = await deployer.getBalance();

  console.log("📊 Network Information:");
  console.log(`  - Network: ${network.name} (Chain ID: ${network.chainId})`);
  console.log(`  - Deployer: ${deployer.address}`);
  console.log(`  - Balance: ${formatEther(balance)} ETH`);
  console.log("");

  // ============ DEPLOYMENT PARAMETERS ============

  console.log("📋 Deployment Parameters:");

  // Token parameters
  const TOKEN_NAME = "Chatbot Token";
  const TOKEN_SYMBOL = "CBT";
  const INITIAL_SUPPLY = 0; // No initial supply - tokens minted via bonding curve

  // Bonding curve parameters (from our validated design)
  const PRICE_PRECISION = ethers.BigNumber.from("100000000"); // 1e8 (8 decimals)
  const A = PRICE_PRECISION.mul(1000); // Max price: 1000.00000000
  const k = parseEther("0.001"); // Steepness: 0.001
  const B = parseEther("10000"); // Inflection: 10,000 tokens

  console.log(`  Token:`);
  console.log(`    - Name: ${TOKEN_NAME}`);
  console.log(`    - Symbol: ${TOKEN_SYMBOL}`);
  console.log(`    - Initial Supply: ${INITIAL_SUPPLY} ${TOKEN_SYMBOL}`);

  console.log(`  Sigmoid Curve:`);
  console.log(`    - Max Price (A): ${formatUnits(A, 8)}`);
  console.log(`    - Steepness (k): ${formatEther(k)}`);
  console.log(`    - Inflection Point (B): ${formatEther(B)} tokens`);
  console.log(`    - Admin: ${deployer.address}`);
  console.log("");

  let totalGasUsed = ethers.BigNumber.from(0);
  let totalCostETH = ethers.BigNumber.from(0);

  // ============ DEPLOY CHATBOT TOKEN ============

  console.log("🪙 Deploying ChatbotToken contract...");
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
  const tokenReceipt = await token.deployTransaction.wait();

  console.log(`✅ ChatbotToken deployed to: ${token.address}`);
  console.log(`  - Gas used: ${tokenReceipt.gasUsed.toString()}`);

  totalGasUsed = totalGasUsed.add(tokenReceipt.gasUsed);
  totalCostETH = totalCostETH.add(
    tokenReceipt.gasUsed.mul(token.deployTransaction.gasPrice)
  );

  // ============ DEPLOY SIGMOID BONDING CURVE ============

  console.log("\n📈 Deploying SigmoidBondingCurve contract...");
  const SigmoidBondingCurve = await ethers.getContractFactory(
    "SigmoidBondingCurve"
  );
  const bondingCurve = await SigmoidBondingCurve.deploy(
    token.address,
    A,
    k,
    B,
    deployer.address
  );

  console.log(`  - Transaction hash: ${bondingCurve.deployTransaction.hash}`);
  console.log("  - Waiting for confirmation...");

  await bondingCurve.deployed();
  const curveReceipt = await bondingCurve.deployTransaction.wait();

  console.log(`✅ SigmoidBondingCurve deployed to: ${bondingCurve.address}`);
  console.log(`  - Gas used: ${curveReceipt.gasUsed.toString()}`);

  totalGasUsed = totalGasUsed.add(curveReceipt.gasUsed);
  totalCostETH = totalCostETH.add(
    curveReceipt.gasUsed.mul(bondingCurve.deployTransaction.gasPrice)
  );

  // ============ CONFIGURE PERMISSIONS ============

  console.log("\n🔐 Configuring permissions...");

  // Grant bonding curve permission to mint/burn tokens
  const MINTER_ROLE = await token.MINTER_ROLE();
  const BURNER_ROLE = await token.BURNER_ROLE();

  console.log("  - Granting MINTER_ROLE to bonding curve...");
  const mintTx = await token.grantRole(MINTER_ROLE, bondingCurve.address);
  await mintTx.wait();

  console.log("  - Granting BURNER_ROLE to bonding curve...");
  const burnTx = await token.grantRole(BURNER_ROLE, bondingCurve.address);
  await burnTx.wait();

  // Add gas costs for permission setup
  const mintReceipt = await mintTx.wait();
  const burnReceipt = await burnTx.wait();
  totalGasUsed = totalGasUsed.add(mintReceipt.gasUsed).add(burnReceipt.gasUsed);
  totalCostETH = totalCostETH.add(mintReceipt.gasUsed.mul(mintTx.gasPrice));
  totalCostETH = totalCostETH.add(burnReceipt.gasUsed.mul(burnTx.gasPrice));

  console.log("✅ Permissions configured successfully");

  // ============ VERIFY DEPLOYMENT ============

  console.log("\n🔍 Verifying deployment...");

  // Verify token contract
  const tokenName = await token.name();
  const tokenSymbol = await token.symbol();
  const totalSupply = await token.totalSupply();
  const isMinter = await token.isMinter(bondingCurve.address);
  const isBurner = await token.isBurner(bondingCurve.address);

  console.log("Token Contract:");
  console.log(`  - Name: ${tokenName}`);
  console.log(`  - Symbol: ${tokenSymbol}`);
  console.log(`  - Total Supply: ${formatEther(totalSupply)} ${tokenSymbol}`);
  console.log(`  - Bonding Curve is Minter: ${isMinter}`);
  console.log(`  - Bonding Curve is Burner: ${isBurner}`);

  // Verify bonding curve contract
  const curveToken = await bondingCurve.token();
  const curveA = await bondingCurve.A();
  const curveK = await bondingCurve.k();
  const curveB = await bondingCurve.B();
  const curveType = await bondingCurve.getCurveType();
  const currentPrice = await bondingCurve.getCurrentPrice();
  const currentSupply = await bondingCurve.getSupply();
  const reserves = await bondingCurve.getReserveBalance();

  console.log("\nBonding Curve Contract:");
  console.log(`  - Connected Token: ${curveToken}`);
  console.log(`  - Curve Type: ${curveType}`);
  console.log(
    `  - Parameters: A=${formatUnits(curveA, 8)}, k=${formatEther(
      curveK
    )}, B=${formatEther(curveB)}`
  );
  console.log(
    `  - Current Price: ${formatUnits(currentPrice, 8)} (8 decimals)`
  );
  console.log(
    `  - Current Supply: ${formatEther(currentSupply)} ${tokenSymbol}`
  );
  console.log(`  - Current Reserves: ${formatEther(reserves)} ETH`);

  // ============ CALCULATE SAMPLE PRICES ============

  console.log("\n📊 Sample Price Calculations:");
  const sampleSupplies = [
    parseEther("0"), // Zero supply
    parseEther("2500"), // 25% of inflection
    parseEther("5000"), // 50% of inflection
    parseEther("10000"), // At inflection point
    parseEther("20000"), // 2x inflection
    parseEther("50000"), // 5x inflection
  ];

  for (const supply of sampleSupplies) {
    const price = await bondingCurve.calculatePrice(supply);
    const supplyFormatted = formatEther(supply);
    const priceFormatted = formatUnits(price, 8);
    console.log(
      `  - ${supplyFormatted.padStart(8)} tokens -> ${priceFormatted.padStart(
        12
      )} price`
    );
  }

  // ============ DEPLOYMENT COST SUMMARY ============

  console.log("\n💰 Deployment Cost Summary:");
  console.log(`  - Total Gas Used: ${totalGasUsed.toString()}`);
  console.log(
    `  - Average Gas Price: ${formatUnits(
      token.deployTransaction.gasPrice,
      "gwei"
    )} gwei`
  );
  console.log(`  - Total Cost: ${formatEther(totalCostETH)} ETH`);

  const remainingBalance = await deployer.getBalance();
  console.log(`  - Remaining Balance: ${formatEther(remainingBalance)} ETH`);

  // ============ CONTRACT ADDRESSES ============

  console.log("\n📝 Contract Addresses:");
  console.log(`  - ChatbotToken: ${token.address}`);
  console.log(`  - SigmoidBondingCurve: ${bondingCurve.address}`);

  // ============ NEXT STEPS ============

  console.log("\n🎯 Next Steps:");
  console.log("  1. Verify contracts on block explorer:");
  console.log(`     CONTRACT_ADDRESS=${token.address} npm run verify:devnet`);
  console.log(
    `     CONTRACT_ADDRESS=${bondingCurve.address} npm run verify:devnet`
  );
  console.log("  2. Test token purchases:");
  console.log("     - Send ETH to bonding curve buy() function");
  console.log("     - Monitor price changes and reserve accumulation");
  console.log(
    "  3. Grant SUPPLY_NOTIFIER_ROLE to chatbot contract (when deployed)"
  );
  console.log("  4. Run integration tests:");
  console.log('     npm test -- --grep "SigmoidBondingCurve"');
  console.log("  5. Deploy chatbot contract (Step 2.3)");

  // ============ SAVE DEPLOYMENT INFO ============

  const deploymentInfo = {
    timestamp: new Date().toISOString(),
    network: {
      name: network.name,
      chainId: network.chainId,
    },
    deployer: deployer.address,
    contracts: {
      ChatbotToken: {
        address: token.address,
        txHash: token.deployTransaction.hash,
        gasUsed: tokenReceipt.gasUsed.toString(),
      },
      SigmoidBondingCurve: {
        address: bondingCurve.address,
        txHash: bondingCurve.deployTransaction.hash,
        gasUsed: curveReceipt.gasUsed.toString(),
      },
    },
    parameters: {
      token: {
        name: TOKEN_NAME,
        symbol: TOKEN_SYMBOL,
        initialSupply: INITIAL_SUPPLY,
      },
      curve: {
        A: A.toString(),
        k: k.toString(),
        B: B.toString(),
      },
    },
    costs: {
      totalGasUsed: totalGasUsed.toString(),
      totalCostETH: formatEther(totalCostETH),
      averageGasPrice:
        formatUnits(token.deployTransaction.gasPrice, "gwei") + " gwei",
    },
  };

  // Save to file
  const fs = require("fs").promises;
  const filename = `deployment-${network.chainId}-${Date.now()}.json`;

  try {
    await fs.writeFile(filename, JSON.stringify(deploymentInfo, null, 2));
    console.log(`\n📄 Deployment info saved to: ${filename}`);
  } catch (error) {
    console.log(`⚠️  Could not save deployment info: ${error.message}`);
  }

  console.log("\n" + "=".repeat(80));
  console.log(
    "✅ Step 2.2 Complete - Core Sigmoid Bonding Curve Implementation Deployed!"
  );
  console.log("🎉 Ready for Step 2.3 - Buy/Sell Mechanics Integration Testing");

  return {
    token: token.address,
    bondingCurve: bondingCurve.address,
    deployer: deployer.address,
    network: network.chainId,
    totalGasUsed: totalGasUsed.toString(),
    totalCostETH: formatEther(totalCostETH),
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
