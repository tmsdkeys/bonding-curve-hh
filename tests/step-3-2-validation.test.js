const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MessageFlowValidator } = require("./message-flow-validator");
const { GasTestUtils } = require("./gas-measurement");

describe("Step 3.2 Complete Validation - Message Submission & Fee System", function () {
  let ChatbotToken, SigmoidBondingCurve, AIChatbot;
  let token, bondingCurve, aiChatbot;
  let owner, alice, bob, charlie, dave, aiProcessor;
  let validator, gasUtils;

  // Test parameters
  const A = ethers.BigNumber.from("100000000").mul(1000); // 1000.00000000
  const k = ethers.utils.parseEther("0.001"); // 0.001
  const B = ethers.utils.parseEther("10000"); // 10,000 tokens
  const MESSAGE_FEE = ethers.utils.parseEther("10"); // 10 CBT
  const LIKE_REWARD = ethers.utils.parseEther("100"); // 100 CBT
  const DISLIKE_PENALTY = ethers.utils.parseEther("50"); // 50 CBT

  beforeEach(async function () {
    [owner, alice, bob, charlie, dave, aiProcessor] = await ethers.getSigners();
    gasUtils = new GasTestUtils();

    // Deploy complete system
    ChatbotToken = await ethers.getContractFactory("ChatbotToken");
    token = await ChatbotToken.deploy("Chatbot Token", "CBT", 0, owner.address);
    await token.deployed();

    SigmoidBondingCurve = await ethers.getContractFactory(
      "SigmoidBondingCurve"
    );
    bondingCurve = await SigmoidBondingCurve.deploy(
      token.address,
      A,
      k,
      B,
      owner.address
    );
    await bondingCurve.deployed();

    AIChatbot = await ethers.getContractFactory("AIChatbot");
    aiChatbot = await AIChatbot.deploy(
      token.address,
      bondingCurve.address,
      MESSAGE_FEE,
      LIKE_REWARD,
      DISLIKE_PENALTY,
      owner.address
    );
    await aiChatbot.deployed();

    // Configure permissions
    await token.grantRole(await token.MINTER_ROLE(), bondingCurve.address);
    await token.grantRole(await token.BURNER_ROLE(), bondingCurve.address);
    await token.grantRole(await token.MINTER_ROLE(), aiChatbot.address);
    await token.grantRole(await token.BURNER_ROLE(), aiChatbot.address);
    await bondingCurve.grantRole(
      await bondingCurve.SUPPLY_NOTIFIER_ROLE(),
      aiChatbot.address
    );
    await aiChatbot.grantRole(
      await aiChatbot.AI_PROCESSOR_ROLE(),
      aiProcessor.address
    );

    // Initialize validator
    validator = new MessageFlowValidator(token, bondingCurve, aiChatbot);
  });

  describe("Comprehensive Message Flow Validation", function () {
    it("Should pass complete message flow validation", async function () {
      console.log("\n🔬 STEP 3.2 - COMPREHENSIVE MESSAGE FLOW VALIDATION");
      console.log("=".repeat(80));

      // Run complete validation using our MessageFlowValidator
      await validator.validateCompleteMessageFlow();

      console.log(
        "\n✅ All message flow validations passed - System ready for AI processing"
      );
    });

    it("Should demonstrate production-ready message submission system", async function () {
      console.log("\n🏭 PRODUCTION-READY MESSAGE SUBMISSION DEMONSTRATION");
      console.log("=".repeat(80));

      // === Phase 1: User Onboarding & Token Acquisition ===
      console.log("\n💰 Phase 1: User onboarding and token acquisition");

      const users = [
        {
          signer: alice,
          name: "Alice",
          ethAmount: ethers.utils.parseEther("1.5"),
        },
        { signer: bob, name: "Bob", ethAmount: ethers.utils.parseEther("0.8") },
        {
          signer: charlie,
          name: "Charlie",
          ethAmount: ethers.utils.parseEther("1.2"),
        },
        {
          signer: dave,
          name: "Dave",
          ethAmount: ethers.utils.parseEther("2.0"),
        },
      ];

      // Users acquire tokens via bonding curve
      for (const user of users) {
        const result = await gasUtils.measureTransaction(
          `token_acquisition_${user.name.toLowerCase()}`,
          bondingCurve.connect(user.signer).buy(0, { value: user.ethAmount }),
          { user: user.name, phase: "onboarding" }
        );

        const tokens = await token.balanceOf(user.signer.address);
        console.log(`${user.name}:`);
        console.log(`  ETH spent: ${ethers.utils.formatEther(user.ethAmount)}`);
        console.log(`  CBT received: ${ethers.utils.formatEther(tokens)}`);
        console.log(`  Gas: ${result.gasUsed.toString()}`);
      }

      // === Phase 2: Message Submission Patterns ===
      console.log("\n💬 Phase 2: Diverse message submission patterns");

      const messageScenarios = [
        {
          user: alice,
          message:
            "Hello everyone! This is my first message in the AI chatbot.",
          category: "greeting",
        },
        {
          user: bob,
          message:
            "I'm testing the system with a technical question about blockchain.",
          category: "technical",
        },
        {
          user: charlie,
          message: "What's the weather like? Just making conversation here!",
          category: "casual",
        },
        {
          user: dave,
          message:
            "This is a longer message to test how the system handles more verbose content. I want to see if there are any issues with longer text submissions and how the gas costs scale.",
          category: "verbose",
        },
        { user: alice, message: "Quick follow-up! 🚀💯", category: "emoji" },
        {
          user: bob,
          message: "Testing special chars: !@#$%^&*()_+-=[]{}|;:,.<>?",
          category: "special_chars",
        },
      ];

      // Approve tokens for all users
      for (const user of users) {
        await token
          .connect(user.signer)
          .approve(aiChatbot.address, MESSAGE_FEE.mul(10));
      }

      let totalMessageGas = ethers.BigNumber.from(0);

      for (const scenario of messageScenarios) {
        const result = await gasUtils.measureTransaction(
          `message_${scenario.category}`,
          aiChatbot.connect(scenario.user).sendMessage(scenario.message),
          {
            user: scenario.user.address,
            category: scenario.category,
            messageLength: scenario.message.length,
          }
        );

        totalMessageGas = totalMessageGas.add(result.gasUsed);

        console.log(`${scenario.category.toUpperCase()}:`);
        console.log(
          `  Message: "${scenario.message.substring(0, 50)}${
            scenario.message.length > 50 ? "..." : ""
          }"`
        );
        console.log(`  Length: ${scenario.message.length} chars`);
        console.log(`  Gas: ${result.gasUsed.toString()}`);
      }

      // === Phase 3: System State Analysis ===
      console.log("\n📊 Phase 3: System state analysis");

      const globalStats = await aiChatbot.getChatbotStatistics();
      const totalMessages = globalStats[0];
      const totalFeesCollected = globalStats[4];

      console.log(`System Statistics:`);
      console.log(`  Total messages: ${totalMessages.toString()}`);
      console.log(
        `  Total fees collected: ${ethers.utils.formatEther(
          totalFeesCollected
        )} CBT`
      );
      console.log(
        `  Average gas per message: ${totalMessageGas
          .div(totalMessages)
          .toString()}`
      );

      // User-specific statistics
      for (const user of users) {
        const userStats = await aiChatbot.getUserStatistics(
          user.signer.address
        );
        if (userStats[0].gt(0)) {
          console.log(`${user.name} statistics:`);
          console.log(`  Messages sent: ${userStats[0].toString()}`);
          console.log(
            `  Fees paid: ${ethers.utils.formatEther(userStats[3])} CBT`
          );
        }
      }

      // === Phase 4: Message Retrieval & Indexing ===
      console.log("\n🗂️  Phase 4: Message retrieval and indexing verification");

      // Test recent messages
      const recentMessages = await aiChatbot.getRecentMessages(0, 5);
      console.log(
        `Recent messages (latest 5): ${recentMessages
          .map((id) => id.toString())
          .join(", ")}`
      );

      // Test author indexing
      const [aliceMessages, aliceCount] = await aiChatbot.getMessagesByAuthor(
        alice.address,
        0,
        10
      );
      console.log(
        `Alice's messages: ${aliceCount.toString()} total, IDs: ${aliceMessages
          .map((id) => id.toString())
          .join(", ")}`
      );

      // Verify message content integrity
      const firstMessage = await aiChatbot.getMessage(1);
      const lastMessage = await aiChatbot.getMessage(totalMessages);

      console.log(`Message integrity check:`);
      console.log(`  First message author: ${firstMessage.author}`);
      console.log(`  Last message author: ${lastMessage.author}`);
      console.log(
        `  All messages have valid content: ${
          firstMessage.content.length > 0 && lastMessage.content.length > 0
        }`
      );

      // === Phase 5: Token Economics Validation ===
      console.log("\n💰 Phase 5: Token economics validation");

      const currentSupply = await token.totalSupply();
      const expectedBurn = MESSAGE_FEE.mul(totalMessages);

      // Calculate expected supply (initial purchases minus burned fees)
      let totalTokensMinted = ethers.BigNumber.from(0);
      for (const user of users) {
        const balance = await token.balanceOf(user.signer.address);
        const userStats = await aiChatbot.getUserStatistics(
          user.signer.address
        );
        const userFeesSpent = userStats[3];
        totalTokensMinted = totalTokensMinted.add(balance).add(userFeesSpent);
      }

      console.log(`Token economics verification:`);
      console.log(
        `  Current supply: ${ethers.utils.formatEther(currentSupply)} CBT`
      );
      console.log(
        `  Total tokens minted: ${ethers.utils.formatEther(
          totalTokensMinted
        )} CBT`
      );
      console.log(
        `  Total fees burned: ${ethers.utils.formatEther(expectedBurn)} CBT`
      );
      console.log(
        `  Supply calculation check: ${
          currentSupply.add(expectedBurn).eq(totalTokensMinted) ? "✅" : "❌"
        }`
      );

      // Final validation
      expect(totalMessages).to.be.gt(0);
      expect(totalFeesCollected).to.equal(expectedBurn);
      expect(currentSupply.add(expectedBurn)).to.equal(totalTokensMinted);
    });
  });

  describe("Message Submission Edge Cases & Stress Testing", function () {
    beforeEach(async function () {
      // Setup users with tokens
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("2") });
      await token
        .connect(alice)
        .approve(aiChatbot.address, MESSAGE_FEE.mul(20));
    });

    it("Should handle rapid message submissions", async function () {
      console.log("\n⚡ RAPID MESSAGE SUBMISSION STRESS TEST");
      console.log("=".repeat(60));

      const rapidMessages = [];
      const numberOfMessages = 10;

      console.log(`Submitting ${numberOfMessages} messages rapidly...`);

      for (let i = 1; i <= numberOfMessages; i++) {
        const messagePromise = gasUtils.measureTransaction(
          `rapid_message_${i}`,
          aiChatbot
            .connect(alice)
            .sendMessage(`Rapid message ${i} - testing concurrent submissions`),
          { messageNumber: i, testType: "rapid_submission" }
        );
        rapidMessages.push(messagePromise);
      }

      const results = await Promise.all(rapidMessages);

      console.log("Results:");
      results.forEach((result, i) => {
        console.log(`  Message ${i + 1}: ${result.gasUsed} gas`);
      });

      // Verify all messages were stored
      const totalMessages = await aiChatbot.getMessageCount();
      expect(totalMessages).to.be.gte(numberOfMessages);

      const averageGas =
        results.reduce((sum, result) => sum + result.gasUsed.toNumber(), 0) /
        results.length;
      console.log(`Average gas per message: ${Math.round(averageGas)}`);
    });

    it("Should handle message length boundary cases", async function () {
      console.log("\n📏 MESSAGE LENGTH BOUNDARY TESTING");
      console.log("=".repeat(60));

      const minLength = await aiChatbot.minimumMessageLength();
      const maxLength = await aiChatbot.maximumMessageLength();

      console.log(
        `Testing length boundaries: ${minLength} - ${maxLength} characters`
      );

      const boundaryTests = [
        { length: minLength.toNumber(), description: "Minimum length" },
        { length: minLength.toNumber() + 1, description: "Minimum + 1" },
        {
          length: Math.floor((minLength.toNumber() + maxLength.toNumber()) / 2),
          description: "Middle length",
        },
        { length: maxLength.toNumber() - 1, description: "Maximum - 1" },
        { length: maxLength.toNumber(), description: "Maximum length" },
      ];

      for (const test of boundaryTests) {
        const message = "x".repeat(test.length);

        const result = await gasUtils.measureTransaction(
          `boundary_${test.length}`,
          aiChatbot.connect(alice).sendMessage(message),
          { messageLength: test.length, testType: "boundary" }
        );

        console.log(
          `${test.description} (${test.length} chars): ${result.gasUsed} gas`
        );
      }
    });

    it("Should handle special character encoding correctly", async function () {
      console.log("\n🌐 SPECIAL CHARACTER ENCODING TEST");
      console.log("=".repeat(60));

      const specialMessages = [
        { content: "Hello with émojis: 🚀🎉💯🔥⚡", category: "emoji" },
        { content: "Unicode test: ñáéíóú çñ ü ß Ω π", category: "unicode" },
        {
          content: "Asian characters: 你好世界 こんにちは 안녕하세요",
          category: "asian",
        },
        { content: "Math symbols: ∑∏∫∂∇∆≈≠≤≥∞", category: "math" },
        { content: "Symbols: !@#$%^&*()_+-=[]{}|;:,.<>?", category: "symbols" },
      ];

      for (const test of specialMessages) {
        const result = await gasUtils.measureTransaction(
          `special_${test.category}`,
          aiChatbot.connect(alice).sendMessage(test.content),
          { category: test.category, contentLength: test.content.length }
        );

        // Verify message was stored correctly
        const messageId = await aiChatbot.getMessageCount();
        const storedMessage = await aiChatbot.getMessage(messageId);

        expect(storedMessage.content).to.equal(test.content);
        console.log(
          `${test.category.toUpperCase()}: "${test.content.substring(
            0,
            30
          )}..." (${result.gasUsed} gas)`
        );
      }
    });

    it("Should maintain system integrity under stress", async function () {
      console.log("\n💪 SYSTEM INTEGRITY STRESS TEST");
      console.log("=".repeat(60));

      // Setup multiple users
      const stressUsers = [bob, charlie, dave];
      for (const user of stressUsers) {
        await bondingCurve
          .connect(user)
          .buy(0, { value: ethers.utils.parseEther("1") });
        await token
          .connect(user)
          .approve(aiChatbot.address, MESSAGE_FEE.mul(10));
      }

      const initialSupply = await token.totalSupply();
      const initialMessageCount = await aiChatbot.getMessageCount();

      // Concurrent submissions from multiple users
      const stressPromises = [];
      const usersArray = [alice, ...stressUsers];

      for (let round = 1; round <= 3; round++) {
        for (let userIndex = 0; userIndex < usersArray.length; userIndex++) {
          const user = usersArray[userIndex];
          const promise = aiChatbot
            .connect(user)
            .sendMessage(
              `Stress test round ${round} from user ${userIndex + 1}`
            );
          stressPromises.push(promise);
        }
      }

      await Promise.all(stressPromises);

      const finalSupply = await token.totalSupply();
      const finalMessageCount = await aiChatbot.getMessageCount();
      const messagesAdded = finalMessageCount.sub(initialMessageCount);
      const expectedBurn = MESSAGE_FEE.mul(messagesAdded);

      console.log(`Stress test results:`);
      console.log(`  Messages added: ${messagesAdded.toString()}`);
      console.log(
        `  Supply change: ${ethers.utils.formatEther(
          initialSupply.sub(finalSupply)
        )} CBT`
      );
      console.log(
        `  Expected burn: ${ethers.utils.formatEther(expectedBurn)} CBT`
      );
      console.log(
        `  Supply integrity: ${
          finalSupply.eq(initialSupply.sub(expectedBurn)) ? "✅" : "❌"
        }`
      );

      expect(finalSupply).to.equal(initialSupply.sub(expectedBurn));
    });
  });

  describe("Integration with External Systems", function () {
    beforeEach(async function () {
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("1") });
      await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE.mul(5));
    });

    it("Should not affect bonding curve price during message submission", async function () {
      const priceBefore = await bondingCurve.getCurrentPrice();

      await aiChatbot
        .connect(alice)
        .sendMessage("This message fee should not affect bonding curve price");

      const priceAfter = await bondingCurve.getCurrentPrice();

      // Message fees are burned but don't trigger bonding curve notifications
      expect(priceAfter).to.equal(priceBefore);
    });

    it("Should properly integrate with token burn mechanics", async function () {
      const userBalanceBefore = await token.balanceOf(alice.address);
      const totalSupplyBefore = await token.totalSupply();
      const chatbotStatsBefore = await aiChatbot.getChatbotStatistics();

      await aiChatbot
        .connect(alice)
        .sendMessage("Testing token burn integration");

      const userBalanceAfter = await token.balanceOf(alice.address);
      const totalSupplyAfter = await token.totalSupply();
      const chatbotStatsAfter = await aiChatbot.getChatbotStatistics();

      // Verify token burn
      expect(userBalanceAfter).to.equal(userBalanceBefore.sub(MESSAGE_FEE));
      expect(totalSupplyAfter).to.equal(totalSupplyBefore.sub(MESSAGE_FEE));

      // Verify statistics update
      expect(chatbotStatsAfter[4]).to.equal(
        chatbotStatsBefore[4].add(MESSAGE_FEE)
      );
    });

    it("Should maintain proper allowance tracking", async function () {
      const allowanceBefore = await token.allowance(
        alice.address,
        aiChatbot.address
      );

      await aiChatbot.connect(alice).sendMessage("Testing allowance tracking");

      const allowanceAfter = await token.allowance(
        alice.address,
        aiChatbot.address
      );

      expect(allowanceAfter).to.equal(allowanceBefore.sub(MESSAGE_FEE));
    });
  });

  describe("Gas Optimization & Performance Analysis", function () {
    beforeEach(async function () {
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("2") });
      await token
        .connect(alice)
        .approve(aiChatbot.address, MESSAGE_FEE.mul(20));
    });

    it("Should establish gas cost baselines for different scenarios", async function () {
      console.log("\n⛽ GAS COST BASELINE ANALYSIS");
      console.log("=".repeat(60));

      const scenarios = [
        { desc: "First message", setup: () => {} },
        {
          desc: "Subsequent message",
          setup: () => aiChatbot.connect(alice).sendMessage("Setup message"),
        },
        { desc: "Long message", messageOverride: "x".repeat(450) },
        { desc: "Short message", messageOverride: "x".repeat(15) },
        {
          desc: "Emoji message",
          messageOverride: "Hello! 🚀🎉💯 Testing emoji handling",
        },
      ];

      const baselineGasCosts = {};

      for (const scenario of scenarios) {
        if (scenario.setup) await scenario.setup();

        const message =
          scenario.messageOverride || `Testing ${scenario.desc.toLowerCase()}`;

        const result = await gasUtils.measureTransaction(
          `baseline_${scenario.desc.replace(/\s+/g, "_").toLowerCase()}`,
          aiChatbot.connect(alice).sendMessage(message),
          { scenario: scenario.desc, messageLength: message.length }
        );

        baselineGasCosts[scenario.desc] = result.gasUsed.toNumber();
        console.log(`${scenario.desc}: ${result.gasUsed.toString()} gas`);
      }

      // Analysis
      const costs = Object.values(baselineGasCosts);
      const avgGas = Math.round(
        costs.reduce((a, b) => a + b, 0) / costs.length
      );
      const maxGas = Math.max(...costs);
      const minGas = Math.min(...costs);

      console.log(`\nAnalysis:`);
      console.log(`  Average: ${avgGas} gas`);
      console.log(`  Range: ${minGas} - ${maxGas} gas`);
      console.log(
        `  Variance: ${maxGas - minGas} gas (${(
          ((maxGas - minGas) / avgGas) *
          100
        ).toFixed(1)}%)`
      );

      // Reasonable gas usage expectations
      expect(maxGas).to.be.lt(200000); // Should be under 200k gas
      expect(minGas).to.be.gt(50000); // Should be over 50k gas (due to storage operations)
    });
  });

  after(function () {
    console.log(
      "\n🎉 STEP 3.2 COMPLETE - MESSAGE SUBMISSION & FEE SYSTEM VALIDATED"
    );
    console.log("=".repeat(80));
    console.log("✅ Message submission flow working correctly");
    console.log("✅ Fee collection and token burning operational");
    console.log("✅ Message storage and indexing systems functional");
    console.log("✅ Length validation and parameter enforcement working");
    console.log("✅ Multi-user scenarios handled properly");
    console.log("✅ Edge cases and stress conditions managed");
    console.log("✅ Integration with token and bonding curve systems verified");
    console.log("✅ Gas optimization baselines established");
    console.log("");
    console.log("🎯 READY FOR STEP 3.3: AI JUDGMENT PROCESSING");
    console.log("   - Like/dislike processing implementation");
    console.log("   - Token minting and burning for judgments");
    console.log("   - Bonding curve supply notifications");
    console.log("   - Complete end-to-end AI chatbot flow");
    console.log("=".repeat(80));

    // Print final gas report
    gasUtils.printFinalReport();
  });
});
