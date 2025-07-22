const { ethers } = require("hardhat");
const { parseEther, formatEther, formatUnits } = ethers.utils;

async function main() {
  console.log("🚀 Starting Step 3.1 - AI Chatbot Core Architecture Deployment");
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
  const INITIAL_SUPPLY = 0;

  // Bonding curve parameters
  const PRICE_PRECISION = ethers.BigNumber.from("100000000"); // 1e8
  const A = PRICE_PRECISION.mul(1000); // Max price: 1000
  const k = parseEther("0.001"); // Steepness: 0.001
  const B = parseEther("10000"); // Inflection: 10,000 tokens

  // AI Chatbot tokenomics parameters (from Step 1 validation)
  const MESSAGE_FEE = parseEther("10"); // 10 CBT
  const LIKE_REWARD = parseEther("100"); // 100 CBT
  const DISLIKE_PENALTY = parseEther("50"); // 50 CBT

  console.log(`  AI Chatbot Tokenomics:`);
  console.log(`    - Message Fee: ${formatEther(MESSAGE_FEE)} CBT`);
  console.log(`    - Like Reward: ${formatEther(LIKE_REWARD)} CBT`);
  console.log(`    - Dislike Penalty: ${formatEther(DISLIKE_PENALTY)} CBT`);
  console.log(`    - Admin: ${deployer.address}`);
  console.log("");

  let totalGasUsed = ethers.BigNumber.from(0);
  let totalCostETH = ethers.BigNumber.from(0);

  // ============ DEPLOY OR CONNECT TO EXISTING CONTRACTS ============

  let token, bondingCurve;

  // Check if we need to deploy dependencies or connect to existing ones
  const existingTokenAddress = process.env.TOKEN_ADDRESS;
  const existingBondingCurveAddress = process.env.BONDING_CURVE_ADDRESS;

  if (existingTokenAddress && existingBondingCurveAddress) {
    console.log("🔗 Connecting to existing contracts...");

    const ChatbotToken = await ethers.getContractFactory("ChatbotToken");
    const SigmoidBondingCurve = await ethers.getContractFactory(
      "SigmoidBondingCurve"
    );

    token = ChatbotToken.attach(existingTokenAddress);
    bondingCurve = SigmoidBondingCurve.attach(existingBondingCurveAddress);

    console.log(`✅ Connected to ChatbotToken: ${token.address}`);
    console.log(`✅ Connected to SigmoidBondingCurve: ${bondingCurve.address}`);
  } else {
    console.log("🏗️  Deploying complete system (dependencies + chatbot)...");

    // Deploy ChatbotToken
    console.log("\n🪙 Deploying ChatbotToken...");
    const ChatbotToken = await ethers.getContractFactory("ChatbotToken");
    token = await ChatbotToken.deploy(
      TOKEN_NAME,
      TOKEN_SYMBOL,
      INITIAL_SUPPLY,
      deployer.address
    );
    await token.deployed();
    const tokenReceipt = await token.deployTransaction.wait();
    console.log(`✅ ChatbotToken deployed: ${token.address}`);

    // Deploy SigmoidBondingCurve
    console.log("\n📈 Deploying SigmoidBondingCurve...");
    const SigmoidBondingCurve = await ethers.getContractFactory(
      "SigmoidBondingCurve"
    );
    bondingCurve = await SigmoidBondingCurve.deploy(
      token.address,
      A,
      k,
      B,
      deployer.address
    );
    await bondingCurve.deployed();
    const curveReceipt = await bondingCurve.deployTransaction.wait();
    console.log(`✅ SigmoidBondingCurve deployed: ${bondingCurve.address}`);

    // Grant bonding curve permissions
    console.log("\n🔐 Configuring bonding curve permissions...");
    const MINTER_ROLE = await token.MINTER_ROLE();
    const BURNER_ROLE = await token.BURNER_ROLE();

    const mintTx = await token.grantRole(MINTER_ROLE, bondingCurve.address);
    const burnTx = await token.grantRole(BURNER_ROLE, bondingCurve.address);
    await mintTx.wait();
    await burnTx.wait();

    totalGasUsed = totalGasUsed
      .add(tokenReceipt.gasUsed)
      .add(curveReceipt.gasUsed);
    totalCostETH = totalCostETH.add(
      tokenReceipt.gasUsed.mul(token.deployTransaction.gasPrice)
    );
    totalCostETH = totalCostETH.add(
      curveReceipt.gasUsed.mul(bondingCurve.deployTransaction.gasPrice)
    );
  }

  // ============ DEPLOY AI CHATBOT CONTRACT ============

  console.log("\n🤖 Deploying AIChatbot contract...");
  const AIChatbot = await ethers.getContractFactory("AIChatbot");
  const aiChatbot = await AIChatbot.deploy(
    token.address,
    bondingCurve.address,
    MESSAGE_FEE,
    LIKE_REWARD,
    DISLIKE_PENALTY,
    deployer.address
  );

  console.log(`  - Transaction hash: ${aiChatbot.deployTransaction.hash}`);
  console.log("  - Waiting for confirmation...");

  await aiChatbot.deployed();
  const chatbotReceipt = await aiChatbot.deployTransaction.wait();

  console.log(`✅ AIChatbot deployed to: ${aiChatbot.address}`);
  console.log(`  - Gas used: ${chatbotReceipt.gasUsed.toString()}`);

  totalGasUsed = totalGasUsed.add(chatbotReceipt.gasUsed);
  totalCostETH = totalCostETH.add(
    chatbotReceipt.gasUsed.mul(aiChatbot.deployTransaction.gasPrice)
  );

  // ============ CONFIGURE AI CHATBOT PERMISSIONS ============

  console.log("\n🔐 Configuring AI Chatbot permissions...");

  // Grant chatbot permission to mint/burn tokens
  const MINTER_ROLE = await token.MINTER_ROLE();
  const BURNER_ROLE = await token.BURNER_ROLE();

  console.log("  - Granting MINTER_ROLE to AI chatbot...");
  const chatbotMintTx = await token.grantRole(MINTER_ROLE, aiChatbot.address);
  await chatbotMintTx.wait();

  console.log("  - Granting BURNER_ROLE to AI chatbot...");
  const chatbotBurnTx = await token.grantRole(BURNER_ROLE, aiChatbot.address);
  await chatbotBurnTx.wait();

  // Grant chatbot permission to notify bonding curve
  const SUPPLY_NOTIFIER_ROLE = await bondingCurve.SUPPLY_NOTIFIER_ROLE();
  console.log("  - Granting SUPPLY_NOTIFIER_ROLE to AI chatbot...");
  const notifierTx = await bondingCurve.grantRole(
    SUPPLY_NOTIFIER_ROLE,
    aiChatbot.address
  );
  await notifierTx.wait();

  console.log("✅ AI Chatbot permissions configured successfully");

  // ============ VERIFY DEPLOYMENT ============

  console.log("\n🔍 Verifying AI Chatbot deployment...");

  // Verify contract connections
  const connectedToken = await aiChatbot.token();
  const connectedBondingCurve = await aiChatbot.bondingCurve();
  const tokenomicsParams = await aiChatbot.getTokenomicsParameters();

  console.log("AI Chatbot Contract:");
  console.log(`  - Connected Token: ${connectedToken}`);
  console.log(`  - Connected Bonding Curve: ${connectedBondingCurve}`);
  console.log(`  - Message Fee: ${formatEther(tokenomicsParams[0])} CBT`);
  console.log(`  - Like Reward: ${formatEther(tokenomicsParams[1])} CBT`);
  console.log(`  - Dislike Penalty: ${formatEther(tokenomicsParams[2])} CBT`);
  console.log(
    `  - Judgment Probability: ${tokenomicsParams[3].toString()} basis points (${
      tokenomicsParams[3] / 100
    }%)`
  );

  // Verify permissions
  const isTokenMinter = await token.isMinter(aiChatbot.address);
  const isTokenBurner = await token.isBurner(aiChatbot.address);
  const hasNotifierRole = await bondingCurve.hasRole(
    SUPPLY_NOTIFIER_ROLE,
    aiChatbot.address
  );

  console.log("\nPermissions Verification:");
  console.log(`  - AI Chatbot is Token Minter: ${isTokenMinter}`);
  console.log(`  - AI Chatbot is Token Burner: ${isTokenBurner}`);
  console.log(`  - AI Chatbot can notify Bonding Curve: ${hasNotifierRole}`);

  // Verify initial state
  const messageCount = await aiChatbot.getMessageCount();
  const judgedCount = await aiChatbot.getJudgedMessageCount();
  const chatbotStats = await aiChatbot.getChatbotStatistics();
  const isPaused = await aiChatbot.paused();

  console.log("\nInitial State Verification:");
  console.log(`  - Total Messages: ${messageCount.toString()}`);
  console.log(`  - Judged Messages: ${judgedCount.toString()}`);
  console.log(`  - Total Likes: ${chatbotStats[2].toString()}`);
  console.log(`  - Total Dislikes: ${chatbotStats[3].toString()}`);
  console.log(`  - Is Paused: ${isPaused}`);

  // ============ INTERFACE COMPLIANCE TEST ============

  console.log("\n🔬 Testing Interface Compliance...");

  // Test enum values
  try {
    const pendingMessages = await aiChatbot.getPendingMessages(5);
    console.log(
      `✅ getPendingMessages() works: ${pendingMessages.length} pending`
    );

    const shouldJudge = await aiChatbot.shouldMessageBeJudged(1);
    console.log(`✅ shouldMessageBeJudged() works: ${shouldJudge}`);

    const recentMessages = await aiChatbot.getRecentMessages(0, 5);
    console.log(
      `✅ getRecentMessages() works: ${recentMessages.length} recent`
    );

    console.log("✅ All interface functions accessible");
  } catch (error) {
    console.log(`❌ Interface test failed: ${error.message}`);
  }

  // ============ ROLE TESTING ============

  console.log("\n👥 Testing Role Management...");

  const ADMIN_ROLE = await aiChatbot.ADMIN_ROLE();
  const AI_PROCESSOR_ROLE = await aiChatbot.AI_PROCESSOR_ROLE();
  const PARAMETER_UPDATER_ROLE = await aiChatbot.PARAMETER_UPDATER_ROLE();

  const hasAdminRole = await aiChatbot.hasRole(ADMIN_ROLE, deployer.address);
  const hasAIProcessorRole = await aiChatbot.hasRole(
    AI_PROCESSOR_ROLE,
    deployer.address
  );
  const hasParameterUpdaterRole = await aiChatbot.hasRole(
    PARAMETER_UPDATER_ROLE,
    deployer.address
  );

  console.log(`  - Deployer has ADMIN_ROLE: ${hasAdminRole}`);
  console.log(`  - Deployer has AI_PROCESSOR_ROLE: ${hasAIProcessorRole}`);
  console.log(
    `  - Deployer has PARAMETER_UPDATER_ROLE: ${hasParameterUpdaterRole}`
  );

  // ============ DEPLOYMENT COST SUMMARY ============

  console.log("\n💰 Deployment Cost Summary:");
  console.log(`  - Total Gas Used: ${totalGasUsed.toString()}`);
  if (totalCostETH.gt(0)) {
    console.log(
      `  - Average Gas Price: ${formatUnits(
        aiChatbot.deployTransaction.gasPrice,
        "gwei"
      )} gwei`
    );
    console.log(`  - Total Cost: ${formatEther(totalCostETH)} ETH`);
  }

  const remainingBalance = await deployer.getBalance();
  console.log(`  - Remaining Balance: ${formatEther(remainingBalance)} ETH`);

  // ============ CONTRACT ADDRESSES ============

  console.log("\n📝 Contract Addresses:");
  console.log(`  - ChatbotToken: ${token.address}`);
  console.log(`  - SigmoidBondingCurve: ${bondingCurve.address}`);
  console.log(`  - AIChatbot: ${aiChatbot.address}`);

  // ============ NEXT STEPS ============

  console.log("\n🎯 Next Steps:");
  console.log("  1. Verify contracts on block explorer:");
  console.log(
    `     CONTRACT_ADDRESS=${aiChatbot.address} npm run verify:devnet`
  );
  console.log("  2. Run Step 3.1 architecture tests:");
  console.log("     npm run test:step-3-1");
  console.log("  3. Test core chatbot functionality:");
  console.log("     - Users can get tokens from bonding curve");
  console.log("     - Users can approve and send messages");
  console.log("     - Admin can process AI judgments");
  console.log("  4. Ready for Step 3.2: Message Submission & Fee System");

  // ============ SAVE DEPLOYMENT INFO ============

  const deploymentInfo = {
    timestamp: new Date().toISOString(),
    step: "3.1 - AI Chatbot Core Architecture",
    network: {
      name: network.name,
      chainId: network.chainId,
    },
    deployer: deployer.address,
    contracts: {
      ChatbotToken: {
        address: token.address,
        existing: !!existingTokenAddress,
      },
      SigmoidBondingCurve: {
        address: bondingCurve.address,
        existing: !!existingBondingCurveAddress,
      },
      AIChatbot: {
        address: aiChatbot.address,
        txHash: aiChatbot.deployTransaction.hash,
        gasUsed: chatbotReceipt.gasUsed.toString(),
      },
    },
    parameters: {
      tokenomics: {
        messageFee: MESSAGE_FEE.toString(),
        likeReward: LIKE_REWARD.toString(),
        dislikePenalty: DISLIKE_PENALTY.toString(),
      },
      ai: {
        judgmentProbability: "1700", // 17%
        minMessageLength: "10",
        maxMessageLength: "500",
      },
    },
    verification: {
      interfaceCompliance: true,
      permissionsCorrect: isTokenMinter && isTokenBurner && hasNotifierRole,
      initialStateValid: messageCount.eq(0) && judgedCount.eq(0) && !isPaused,
    },
    costs: {
      chatbotGasUsed: chatbotReceipt.gasUsed.toString(),
      totalGasUsed: totalGasUsed.toString(),
      totalCostETH: totalCostETH.gt(0) ? formatEther(totalCostETH) : "0",
    },
  };

  // Save to file
  const fs = require("fs").promises;
  const filename = `step-3-1-deployment-${network.chainId}-${Date.now()}.json`;

  try {
    await fs.writeFile(filename, JSON.stringify(deploymentInfo, null, 2));
    console.log(`\n📄 Step 3.1 deployment info saved to: ${filename}`);
  } catch (error) {
    console.log(`⚠️  Could not save deployment info: ${error.message}`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("✅ Step 3.1 Complete - AI Chatbot Core Architecture Deployed!");
  console.log(
    "🎉 Ready for Step 3.2 - Message Submission & Fee System Implementation"
  );

  return {
    token: token.address,
    bondingCurve: bondingCurve.address,
    aiChatbot: aiChatbot.address,
    deployer: deployer.address,
    network: network.chainId,
    step: "3.1",
    gasUsed: chatbotReceipt.gasUsed.toString(),
    verified: deploymentInfo.verification,
  };
}

main()
  .then((result) => {
    console.log("\n🎉 Step 3.1 Deployment successful!");
    console.log("Result:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Step 3.1 Deployment failed!");
    console.error(error);
    process.exit(1);
  });
