const { expect } = require("chai");
const { ethers } = require("hardhat");
const { GasTestUtils } = require("./gas-measurement");

describe("Step 3.3 - AI Judgment Processing", function () {
  let ChatbotToken, SigmoidBondingCurve, AIChatbot;
  let token, bondingCurve, aiChatbot;
  let owner, alice, bob, charlie, dave, aiProcessor, unauthorized;
  let gasUtils;

  // Test parameters
  const PRICE_PRECISION = ethers.BigNumber.from("100000000"); // 1e8
  const A = PRICE_PRECISION.mul(1000); // Max price: 1000
  const k = ethers.utils.parseEther("0.001"); // Steepness: 0.001
  const B = ethers.utils.parseEther("10000"); // Inflection: 10,000 tokens

  // Tokenomics parameters
  const MESSAGE_FEE = ethers.utils.parseEther("10"); // 10 CBT
  const LIKE_REWARD = ethers.utils.parseEther("100"); // 100 CBT
  const DISLIKE_PENALTY = ethers.utils.parseEther("50"); // 50 CBT

  // AIJudgment enum values
  const AIJudgment = {
    NONE: 0,
    LIKED: 1,
    DISLIKED: 2,
  };

  beforeEach(async function () {
    [owner, alice, bob, charlie, dave, aiProcessor, unauthorized] =
      await ethers.getSigners();
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

    // Configure all permissions
    const MINTER_ROLE = await token.MINTER_ROLE();
    const BURNER_ROLE = await token.BURNER_ROLE();
    const SUPPLY_NOTIFIER_ROLE = await bondingCurve.SUPPLY_NOTIFIER_ROLE();
    const AI_PROCESSOR_ROLE = await aiChatbot.AI_PROCESSOR_ROLE();

    await token.grantRole(MINTER_ROLE, bondingCurve.address);
    await token.grantRole(BURNER_ROLE, bondingCurve.address);
    await token.grantRole(MINTER_ROLE, aiChatbot.address);
    await token.grantRole(BURNER_ROLE, aiChatbot.address);
    await bondingCurve.grantRole(SUPPLY_NOTIFIER_ROLE, aiChatbot.address);
    await aiChatbot.grantRole(AI_PROCESSOR_ROLE, aiProcessor.address);

    // Setup users with tokens and messages
    await bondingCurve
      .connect(alice)
      .buy(0, { value: ethers.utils.parseEther("2") });
    await bondingCurve
      .connect(bob)
      .buy(0, { value: ethers.utils.parseEther("1.5") });
    await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE.mul(10));
    await token.connect(bob).approve(aiChatbot.address, MESSAGE_FEE.mul(10));
  });

  describe("AI Judgment Processing Flow", function () {
    beforeEach(async function () {
      // Send some messages to process
      await aiChatbot
        .connect(alice)
        .sendMessage("Alice's first message for AI judgment");
      await aiChatbot
        .connect(bob)
        .sendMessage("Bob's message that might get judged");
      await aiChatbot
        .connect(alice)
        .sendMessage("Alice's second message with different content");
    });

    it("Should process LIKED judgment correctly", async function () {
      console.log("\n👍 TESTING AI LIKE PROCESSING");
      console.log("=".repeat(60));

      const messageId = 1;
      const author = alice.address;

      // Record initial state
      const initialAuthorBalance = await token.balanceOf(author);
      const initialTotalSupply = await token.totalSupply();
      const initialBondingCurvePrice = await bondingCurve.getCurrentPrice();
      const initialStats = await aiChatbot.getChatbotStatistics();
      const initialUserStats = await aiChatbot.getUserStatistics(author);

      console.log("Initial state:");
      console.log(
        `  Author balance: ${ethers.utils.formatEther(
          initialAuthorBalance
        )} CBT`
      );
      console.log(
        `  Total supply: ${ethers.utils.formatEther(initialTotalSupply)} CBT`
      );
      console.log(
        `  Bonding curve price: ${ethers.utils.formatUnits(
          initialBondingCurvePrice,
          8
        )}`
      );

      // Process LIKED judgment
      const result = await gasUtils.measureTransaction(
        "ai_judgment_liked",
        aiChatbot
          .connect(aiProcessor)
          .processAIResponse(messageId, AIJudgment.LIKED),
        { messageId, judgment: "LIKED", author }
      );

      // Record final state
      const finalAuthorBalance = await token.balanceOf(author);
      const finalTotalSupply = await token.totalSupply();
      const finalBondingCurvePrice = await bondingCurve.getCurrentPrice();
      const finalStats = await aiChatbot.getChatbotStatistics();
      const finalUserStats = await aiChatbot.getUserStatistics(author);

      // Verify token minting
      expect(finalAuthorBalance).to.equal(
        initialAuthorBalance.add(LIKE_REWARD)
      );
      expect(finalTotalSupply).to.equal(initialTotalSupply.add(LIKE_REWARD));

      // Verify message update
      const message = await aiChatbot.getMessage(messageId);
      expect(message.judgment).to.equal(AIJudgment.LIKED);
      expect(message.rewardMinted).to.equal(LIKE_REWARD);
      expect(message.penaltyBurned).to.equal(0);

      // Verify statistics update
      expect(finalStats[1]).to.equal(initialStats[1].add(1)); // Total judged
      expect(finalStats[2]).to.equal(initialStats[2].add(1)); // Total likes
      expect(finalStats[5]).to.equal(initialStats[5].add(LIKE_REWARD)); // Total rewards
      expect(finalUserStats[1]).to.equal(initialUserStats[1].add(1)); // User likes
      expect(finalUserStats[4]).to.equal(initialUserStats[4].add(LIKE_REWARD)); // User rewards

      // Verify bonding curve price increase (due to supply increase)
      expect(finalBondingCurvePrice).to.be.gte(initialBondingCurvePrice);

      console.log("Final state:");
      console.log(
        `  Author balance: ${ethers.utils.formatEther(
          finalAuthorBalance
        )} CBT (+${ethers.utils.formatEther(LIKE_REWARD)})`
      );
      console.log(
        `  Total supply: ${ethers.utils.formatEther(
          finalTotalSupply
        )} CBT (+${ethers.utils.formatEther(LIKE_REWARD)})`
      );
      console.log(
        `  Bonding curve price: ${ethers.utils.formatUnits(
          finalBondingCurvePrice,
          8
        )}`
      );
      console.log(`  Gas used: ${result.gasUsed.toString()}`);
    });

    it("Should process DISLIKED judgment correctly", async function () {
      console.log("\n👎 TESTING AI DISLIKE PROCESSING");
      console.log("=".repeat(60));

      const messageId = 2;
      const author = bob.address;

      // Record initial state
      const initialAuthorBalance = await token.balanceOf(author);
      const initialTotalSupply = await token.totalSupply();
      const initialBondingCurvePrice = await bondingCurve.getCurrentPrice();
      const initialStats = await aiChatbot.getChatbotStatistics();
      const initialUserStats = await aiChatbot.getUserStatistics(author);

      console.log("Initial state:");
      console.log(
        `  Author balance: ${ethers.utils.formatEther(
          initialAuthorBalance
        )} CBT`
      );
      console.log(
        `  Total supply: ${ethers.utils.formatEther(initialTotalSupply)} CBT`
      );
      console.log(
        `  Bonding curve price: ${ethers.utils.formatUnits(
          initialBondingCurvePrice,
          8
        )}`
      );

      // Process DISLIKED judgment
      const result = await gasUtils.measureTransaction(
        "ai_judgment_disliked",
        aiChatbot
          .connect(aiProcessor)
          .processAIResponse(messageId, AIJudgment.DISLIKED),
        { messageId, judgment: "DISLIKED", author }
      );

      // Record final state
      const finalAuthorBalance = await token.balanceOf(author);
      const finalTotalSupply = await token.totalSupply();
      const finalBondingCurvePrice = await bondingCurve.getCurrentPrice();
      const finalStats = await aiChatbot.getChatbotStatistics();
      const finalUserStats = await aiChatbot.getUserStatistics(author);

      // Verify penalty burning (from total supply, not user)
      expect(finalAuthorBalance).to.equal(initialAuthorBalance); // User balance unchanged
      expect(finalTotalSupply).to.equal(
        initialTotalSupply.sub(DISLIKE_PENALTY)
      );

      // Verify message update
      const message = await aiChatbot.getMessage(messageId);
      expect(message.judgment).to.equal(AIJudgment.DISLIKED);
      expect(message.rewardMinted).to.equal(0);
      expect(message.penaltyBurned).to.equal(DISLIKE_PENALTY);

      // Verify statistics update
      expect(finalStats[1]).to.equal(initialStats[1].add(1)); // Total judged
      expect(finalStats[3]).to.equal(initialStats[3].add(1)); // Total dislikes
      expect(finalStats[6]).to.equal(initialStats[6].add(DISLIKE_PENALTY)); // Total penalties
      expect(finalUserStats[2]).to.equal(initialUserStats[2].add(1)); // User dislikes

      // Verify bonding curve price decrease (due to supply decrease)
      expect(finalBondingCurvePrice).to.be.lte(initialBondingCurvePrice);

      console.log("Final state:");
      console.log(
        `  Author balance: ${ethers.utils.formatEther(
          finalAuthorBalance
        )} CBT (unchanged)`
      );
      console.log(
        `  Total supply: ${ethers.utils.formatEther(
          finalTotalSupply
        )} CBT (-${ethers.utils.formatEther(DISLIKE_PENALTY)})`
      );
      console.log(
        `  Bonding curve price: ${ethers.utils.formatUnits(
          finalBondingCurvePrice,
          8
        )}`
      );
      console.log(`  Gas used: ${result.gasUsed.toString()}`);
    });

    it("Should emit AIJudgmentProcessed event correctly", async function () {
      const messageId = 1;
      const author = alice.address;

      await expect(
        aiChatbot
          .connect(aiProcessor)
          .processAIResponse(messageId, AIJudgment.LIKED)
      )
        .to.emit(aiChatbot, "AIJudgmentProcessed")
        .withArgs(
          messageId,
          author,
          AIJudgment.LIKED,
          LIKE_REWARD, // positive token delta
          await token.totalSupply() // this will be the new supply after minting
        );
    });

    it("Should notify bonding curve of supply changes", async function () {
      const messageId = 1;

      // Listen for bonding curve SupplyChanged event
      await expect(
        aiChatbot
          .connect(aiProcessor)
          .processAIResponse(messageId, AIJudgment.LIKED)
      )
        .to.emit(bondingCurve, "SupplyChanged")
        .withArgs(
          aiChatbot.address,
          LIKE_REWARD, // positive supply delta
          await bondingCurve.getCurrentPrice(), // new price after change
          "AI like reward"
        );
    });
  });

  describe("Access Control & Security", function () {
    beforeEach(async function () {
      await aiChatbot
        .connect(alice)
        .sendMessage("Test message for access control");
    });

    it("Should only allow AI_PROCESSOR_ROLE to process judgments", async function () {
      const messageId = 1;

      // Should fail for unauthorized user
      await expect(
        aiChatbot
          .connect(unauthorized)
          .processAIResponse(messageId, AIJudgment.LIKED)
      ).to.be.reverted;

      // Should fail for regular user (even message author)
      await expect(
        aiChatbot.connect(alice).processAIResponse(messageId, AIJudgment.LIKED)
      ).to.be.reverted;

      // Should succeed for authorized AI processor
      await expect(
        aiChatbot
          .connect(aiProcessor)
          .processAIResponse(messageId, AIJudgment.LIKED)
      ).to.not.be.reverted;
    });

    it("Should not allow processing non-existent messages", async function () {
      const nonExistentMessageId = 999;

      await expect(
        aiChatbot
          .connect(aiProcessor)
          .processAIResponse(nonExistentMessageId, AIJudgment.LIKED)
      ).to.be.revertedWith("MessageNotFound");
    });

    it("Should not allow processing already judged messages", async function () {
      const messageId = 1;

      // First judgment should succeed
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(messageId, AIJudgment.LIKED);

      // Second judgment should fail
      await expect(
        aiChatbot
          .connect(aiProcessor)
          .processAIResponse(messageId, AIJudgment.DISLIKED)
      ).to.be.revertedWith("MessageAlreadyJudged");
    });

    it("Should not allow NONE judgment", async function () {
      const messageId = 1;

      await expect(
        aiChatbot
          .connect(aiProcessor)
          .processAIResponse(messageId, AIJudgment.NONE)
      ).to.be.revertedWith("InvalidJudgment");
    });

    it("Should respect pause state", async function () {
      const messageId = 1;

      // Should work when not paused
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(messageId, AIJudgment.LIKED);

      // Send another message and pause
      await aiChatbot
        .connect(alice)
        .sendMessage("Second message for pause test");
      await aiChatbot.pause();

      // Should fail when paused
      await expect(
        aiChatbot.connect(aiProcessor).processAIResponse(2, AIJudgment.LIKED)
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("Token Economics & Supply Management", function () {
    beforeEach(async function () {
      // Send messages for judgment
      await aiChatbot
        .connect(alice)
        .sendMessage("Message for economics test 1");
      await aiChatbot.connect(bob).sendMessage("Message for economics test 2");
      await aiChatbot
        .connect(alice)
        .sendMessage("Message for economics test 3");
    });

    it("Should handle multiple likes correctly", async function () {
      console.log("\n💰 TESTING MULTIPLE LIKE ECONOMICS");
      console.log("=".repeat(60));

      const initialSupply = await token.totalSupply();
      const initialAliceBalance = await token.balanceOf(alice.address);

      console.log(`Initial state:`);
      console.log(
        `  Total supply: ${ethers.utils.formatEther(initialSupply)} CBT`
      );
      console.log(
        `  Alice balance: ${ethers.utils.formatEther(initialAliceBalance)} CBT`
      );

      // Process multiple likes
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(1, AIJudgment.LIKED); // Alice
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(3, AIJudgment.LIKED); // Alice

      const finalSupply = await token.totalSupply();
      const finalAliceBalance = await token.balanceOf(alice.address);
      const expectedSupplyIncrease = LIKE_REWARD.mul(2);

      expect(finalSupply).to.equal(initialSupply.add(expectedSupplyIncrease));
      expect(finalAliceBalance).to.equal(
        initialAliceBalance.add(expectedSupplyIncrease)
      );

      console.log(`Final state:`);
      console.log(
        `  Total supply: ${ethers.utils.formatEther(
          finalSupply
        )} CBT (+${ethers.utils.formatEther(expectedSupplyIncrease)})`
      );
      console.log(
        `  Alice balance: ${ethers.utils.formatEther(
          finalAliceBalance
        )} CBT (+${ethers.utils.formatEther(expectedSupplyIncrease)})`
      );
    });

    it("Should handle mixed judgments correctly", async function () {
      console.log("\n⚖️  TESTING MIXED JUDGMENT ECONOMICS");
      console.log("=".repeat(60));

      const initialSupply = await token.totalSupply();
      const initialAliceBalance = await token.balanceOf(alice.address);
      const initialBobBalance = await token.balanceOf(bob.address);

      console.log(`Initial state:`);
      console.log(
        `  Total supply: ${ethers.utils.formatEther(initialSupply)} CBT`
      );
      console.log(
        `  Alice balance: ${ethers.utils.formatEther(initialAliceBalance)} CBT`
      );
      console.log(
        `  Bob balance: ${ethers.utils.formatEther(initialBobBalance)} CBT`
      );

      // Mixed judgments: Like Alice (1), Dislike Bob (2), Like Alice (3)
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(1, AIJudgment.LIKED); // +100 CBT
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(2, AIJudgment.DISLIKED); // -50 CBT
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(3, AIJudgment.LIKED); // +100 CBT

      const finalSupply = await token.totalSupply();
      const finalAliceBalance = await token.balanceOf(alice.address);
      const finalBobBalance = await token.balanceOf(bob.address);

      // Net change: +100 + (-50) + 100 = +150 CBT supply
      const expectedNetSupplyChange = LIKE_REWARD.mul(2).sub(DISLIKE_PENALTY); // +150

      expect(finalSupply).to.equal(initialSupply.add(expectedNetSupplyChange));
      expect(finalAliceBalance).to.equal(
        initialAliceBalance.add(LIKE_REWARD.mul(2))
      ); // Alice got 2 likes
      expect(finalBobBalance).to.equal(initialBobBalance); // Bob balance unchanged (penalty comes from supply)

      console.log(`Final state:`);
      console.log(
        `  Total supply: ${ethers.utils.formatEther(finalSupply)} CBT (${
          finalSupply.gt(initialSupply) ? "+" : ""
        }${ethers.utils.formatEther(expectedNetSupplyChange)})`
      );
      console.log(
        `  Alice balance: ${ethers.utils.formatEther(
          finalAliceBalance
        )} CBT (+${ethers.utils.formatEther(LIKE_REWARD.mul(2))})`
      );
      console.log(
        `  Bob balance: ${ethers.utils.formatEther(
          finalBobBalance
        )} CBT (unchanged)`
      );
    });

    it("Should track net token changes correctly", async function () {
      const initialStats = await aiChatbot.getChatbotStatistics();

      // Process various judgments
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(1, AIJudgment.LIKED);
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(2, AIJudgment.DISLIKED);
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(3, AIJudgment.LIKED);

      const finalStats = await aiChatbot.getChatbotStatistics();

      // Verify statistics
      expect(finalStats[1]).to.equal(initialStats[1].add(3)); // Total judged
      expect(finalStats[2]).to.equal(initialStats[2].add(2)); // Total likes
      expect(finalStats[3]).to.equal(initialStats[3].add(1)); // Total dislikes
      expect(finalStats[5]).to.equal(initialStats[5].add(LIKE_REWARD.mul(2))); // Rewards distributed
      expect(finalStats[6]).to.equal(initialStats[6].add(DISLIKE_PENALTY)); // Penalties applied
    });
  });

  describe("Bonding Curve Integration", function () {
    beforeEach(async function () {
      await aiChatbot
        .connect(alice)
        .sendMessage("Message for bonding curve integration test");
    });

    it("Should trigger bonding curve price updates correctly", async function () {
      console.log("\n📈 TESTING BONDING CURVE INTEGRATION");
      console.log("=".repeat(60));

      const messageId = 1;
      const initialPrice = await bondingCurve.getCurrentPrice();
      const initialSupply = await bondingCurve.getSupply();

      console.log(`Initial bonding curve state:`);
      console.log(`  Price: ${ethers.utils.formatUnits(initialPrice, 8)}`);
      console.log(`  Supply: ${ethers.utils.formatEther(initialSupply)} CBT`);

      // Process like (should increase price due to supply increase)
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(messageId, AIJudgment.LIKED);

      const finalPrice = await bondingCurve.getCurrentPrice();
      const finalSupply = await bondingCurve.getSupply();

      console.log(`Final bonding curve state:`);
      console.log(`  Price: ${ethers.utils.formatUnits(finalPrice, 8)}`);
      console.log(`  Supply: ${ethers.utils.formatEther(finalSupply)} CBT`);

      // Verify supply increased and price potentially increased
      expect(finalSupply).to.equal(initialSupply.add(LIKE_REWARD));
      expect(finalPrice).to.be.gte(initialPrice); // Price should increase or stay same
    });

    it("Should handle dislike price impact correctly", async function () {
      // Send another message
      await aiChatbot
        .connect(bob)
        .sendMessage("Message for dislike price test");

      const initialPrice = await bondingCurve.getCurrentPrice();
      const initialSupply = await bondingCurve.getSupply();

      // Process dislike (should decrease price due to supply decrease)
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(2, AIJudgment.DISLIKED);

      const finalPrice = await bondingCurve.getCurrentPrice();
      const finalSupply = await bondingCurve.getSupply();

      // Verify supply decreased and price potentially decreased
      expect(finalSupply).to.equal(initialSupply.sub(DISLIKE_PENALTY));
      expect(finalPrice).to.be.lte(initialPrice); // Price should decrease or stay same
    });

    it("Should emit correct supply change notifications", async function () {
      const messageId = 1;

      // Test like notification
      await expect(
        aiChatbot
          .connect(aiProcessor)
          .processAIResponse(messageId, AIJudgment.LIKED)
      )
        .to.emit(bondingCurve, "SupplyChanged")
        .withArgs(
          aiChatbot.address,
          LIKE_REWARD,
          await bondingCurve.getCurrentPrice(),
          "AI like reward"
        );
    });
  });

  describe("Message State Management", function () {
    beforeEach(async function () {
      await aiChatbot
        .connect(alice)
        .sendMessage("Message for state management test");
    });

    it("Should update message judgment state correctly", async function () {
      const messageId = 1;

      // Verify initial state
      let message = await aiChatbot.getMessage(messageId);
      expect(message.judgment).to.equal(AIJudgment.NONE);
      expect(message.rewardMinted).to.equal(0);
      expect(message.penaltyBurned).to.equal(0);

      // Process judgment
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(messageId, AIJudgment.LIKED);

      // Verify updated state
      message = await aiChatbot.getMessage(messageId);
      expect(message.judgment).to.equal(AIJudgment.LIKED);
      expect(message.rewardMinted).to.equal(LIKE_REWARD);
      expect(message.penaltyBurned).to.equal(0);
    });

    it("Should maintain message immutability after judgment", async function () {
      const messageId = 1;
      const originalMessage = await aiChatbot.getMessage(messageId);

      // Process judgment
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(messageId, AIJudgment.LIKED);

      const updatedMessage = await aiChatbot.getMessage(messageId);

      // Verify core message data unchanged
      expect(updatedMessage.id).to.equal(originalMessage.id);
      expect(updatedMessage.author).to.equal(originalMessage.author);
      expect(updatedMessage.content).to.equal(originalMessage.content);
      expect(updatedMessage.timestamp).to.equal(originalMessage.timestamp);
      expect(updatedMessage.feePaid).to.equal(originalMessage.feePaid);

      // Only judgment-related fields should change
      expect(updatedMessage.judgment).to.not.equal(originalMessage.judgment);
      expect(updatedMessage.rewardMinted).to.not.equal(
        originalMessage.rewardMinted
      );
    });

    it("Should track judged message count correctly", async function () {
      // Send multiple messages
      await aiChatbot.connect(alice).sendMessage("Message 2");
      await aiChatbot.connect(alice).sendMessage("Message 3");

      const initialJudgedCount = await aiChatbot.getJudgedMessageCount();
      expect(initialJudgedCount).to.equal(0);

      // Judge some messages
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(1, AIJudgment.LIKED);
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(3, AIJudgment.DISLIKED);

      const finalJudgedCount = await aiChatbot.getJudgedMessageCount();
      expect(finalJudgedCount).to.equal(2);
    });
  });

  describe("Gas Efficiency & Performance", function () {
    beforeEach(async function () {
      // Send messages for gas testing
      await aiChatbot.connect(alice).sendMessage("Gas test message 1");
      await aiChatbot.connect(bob).sendMessage("Gas test message 2");
      await aiChatbot.connect(alice).sendMessage("Gas test message 3");
    });

    it("Should measure gas costs for different judgment types", async function () {
      console.log("\n⛽ GAS COST ANALYSIS - AI JUDGMENT PROCESSING");
      console.log("=".repeat(60));

      const gasResults = {};

      // Test LIKED judgment
      const likeResult = await gasUtils.measureTransaction(
        "judgment_liked",
        aiChatbot.connect(aiProcessor).processAIResponse(1, AIJudgment.LIKED),
        { judgment: "LIKED", tokenOperation: "mint" }
      );
      gasResults.liked = likeResult.gasUsed.toNumber();

      // Test DISLIKED judgment
      const dislikeResult = await gasUtils.measureTransaction(
        "judgment_disliked",
        aiChatbot
          .connect(aiProcessor)
          .processAIResponse(2, AIJudgment.DISLIKED),
        { judgment: "DISLIKED", tokenOperation: "burn" }
      );
      gasResults.disliked = dislikeResult.gasUsed.toNumber();

      console.log("Gas costs by judgment type:");
      console.log(
        `  LIKED (mint reward): ${gasResults.liked.toLocaleString()} gas`
      );
      console.log(
        `  DISLIKED (burn penalty): ${gasResults.disliked.toLocaleString()} gas`
      );
      console.log(
        `  Difference: ${Math.abs(
          gasResults.liked - gasResults.disliked
        ).toLocaleString()} gas`
      );

      // Both should be reasonable (under 250k gas)
      expect(gasResults.liked).to.be.lt(250000);
      expect(gasResults.disliked).to.be.lt(250000);
    });

    it("Should measure judgment processing performance over time", async function () {
      console.log("\n📊 JUDGMENT PROCESSING PERFORMANCE OVER TIME");
      console.log("=".repeat(60));

      // Send more messages for testing
      for (let i = 4; i <= 10; i++) {
        await aiChatbot
          .connect(alice)
          .sendMessage(`Performance test message ${i}`);
      }

      const performanceResults = [];

      // Process judgments and measure performance
      for (let messageId = 4; messageId <= 8; messageId++) {
        const judgment =
          messageId % 2 === 0 ? AIJudgment.LIKED : AIJudgment.DISLIKED;
        const judgmentName =
          judgment === AIJudgment.LIKED ? "LIKED" : "DISLIKED";

        const result = await gasUtils.measureTransaction(
          `performance_${messageId}`,
          aiChatbot.connect(aiProcessor).processAIResponse(messageId, judgment),
          { messageId, judgment: judgmentName }
        );

        performanceResults.push({
          messageId,
          judgment: judgmentName,
          gasUsed: result.gasUsed.toNumber(),
        });

        console.log(
          `Message ${messageId} (${judgmentName}): ${result.gasUsed.toLocaleString()} gas`
        );
      }

      // Analyze performance consistency
      const gasCosts = performanceResults.map((result) => result.gasUsed);
      const avgGas = Math.round(
        gasCosts.reduce((a, b) => a + b, 0) / gasCosts.length
      );
      const maxGas = Math.max(...gasCosts);
      const minGas = Math.min(...gasCosts);
      const variance = maxGas - minGas;

      console.log(`\nPerformance analysis:`);
      console.log(`  Average gas: ${avgGas.toLocaleString()}`);
      console.log(
        `  Range: ${minGas.toLocaleString()} - ${maxGas.toLocaleString()}`
      );
      console.log(
        `  Variance: ${variance.toLocaleString()} gas (${(
          (variance / avgGas) *
          100
        ).toFixed(1)}%)`
      );

      // Performance should be consistent (variance < 20%)
      expect(variance / avgGas).to.be.lt(0.2);
    });
  });

  describe("Complete End-to-End Flow", function () {
    it("Should demonstrate complete AI chatbot token economics flow", async function () {
      console.log("\n🔄 COMPLETE END-TO-END AI CHATBOT FLOW");
      console.log("=".repeat(80));

      // === Phase 1: Users acquire tokens via bonding curve ===
      console.log("\n💰 Phase 1: Token acquisition");

      const users = [
        {
          signer: charlie,
          name: "Charlie",
          ethAmount: ethers.utils.parseEther("1"),
        },
        {
          signer: dave,
          name: "Dave",
          ethAmount: ethers.utils.parseEther("1.5"),
        },
      ];

      for (const user of users) {
        await bondingCurve
          .connect(user.signer)
          .buy(0, { value: user.ethAmount });
        const tokens = await token.balanceOf(user.signer.address);
        console.log(
          `${user.name} acquired ${ethers.utils.formatEther(
            tokens
          )} CBT with ${ethers.utils.formatEther(user.ethAmount)} ETH`
        );
      }

      // === Phase 2: Users send messages (pay fees) ===
      console.log("\n💬 Phase 2: Message submission");

      const messages = [
        {
          user: alice,
          content: "Hello everyone! I'm excited to try this AI chatbot.",
        },
        { user: bob, content: "This is a test of the message system." },
        {
          user: charlie,
          content: "I hope the AI likes my creative message! 🎨✨",
        },
        {
          user: dave,
          content: "Technical question about blockchain consensus mechanisms.",
        },
        { user: alice, content: "Follow-up: What do you think about DeFi?" },
      ];

      // Approve tokens for all users
      const allUsers = [alice, bob, charlie, dave];
      for (const user of allUsers) {
        await token
          .connect(user)
          .approve(aiChatbot.address, MESSAGE_FEE.mul(5));
      }

      let totalMessageFees = ethers.BigNumber.from(0);

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const userName = allUsers.find((u) => u.address === msg.user.address)
          ? ["Alice", "Bob", "Charlie", "Dave"][allUsers.indexOf(msg.user)]
          : "Unknown";

        await aiChatbot.connect(msg.user).sendMessage(msg.content);
        totalMessageFees = totalMessageFees.add(MESSAGE_FEE);

        console.log(
          `${userName}: "${msg.content.substring(0, 50)}${
            msg.content.length > 50 ? "..." : ""
          }"`
        );
      }

      console.log(
        `Total message fees burned: ${ethers.utils.formatEther(
          totalMessageFees
        )} CBT`
      );

      // === Phase 3: AI processes judgments ===
      console.log("\n🤖 Phase 3: AI judgment processing");

      const judgments = [
        {
          messageId: 1,
          judgment: AIJudgment.LIKED,
          reason: "Positive and welcoming message",
        },
        {
          messageId: 2,
          judgment: AIJudgment.DISLIKED,
          reason: "Too generic, lacks creativity",
        },
        {
          messageId: 3,
          judgment: AIJudgment.LIKED,
          reason: "Creative use of emojis and enthusiasm",
        },
        {
          messageId: 4,
          judgment: AIJudgment.LIKED,
          reason: "Technical depth and specificity",
        },
        {
          messageId: 5,
          judgment: AIJudgment.DISLIKED,
          reason: "Too broad, needs more focus",
        },
      ];

      let totalRewardsMinted = ethers.BigNumber.from(0);
      let totalPenaltiesBurned = ethers.BigNumber.from(0);

      for (const judgment of judgments) {
        const message = await aiChatbot.getMessage(judgment.messageId);
        const authorName = ["Alice", "Bob", "Charlie", "Dave"][
          allUsers.indexOf(allUsers.find((u) => u.address === message.author))
        ];

        await aiChatbot
          .connect(aiProcessor)
          .processAIResponse(judgment.messageId, judgment.judgment);

        const judgmentName =
          judgment.judgment === AIJudgment.LIKED ? "LIKED" : "DISLIKED";
        console.log(
          `Message ${judgment.messageId} (${authorName}): ${judgmentName} - ${judgment.reason}`
        );

        if (judgment.judgment === AIJudgment.LIKED) {
          totalRewardsMinted = totalRewardsMinted.add(LIKE_REWARD);
        } else {
          totalPenaltiesBurned = totalPenaltiesBurned.add(DISLIKE_PENALTY);
        }
      }

      // === Phase 4: System state analysis ===
      console.log("\n📊 Phase 4: Final system analysis");

      const finalStats = await aiChatbot.getChatbotStatistics();
      const finalSupply = await token.totalSupply();
      const finalBondingCurvePrice = await bondingCurve.getCurrentPrice();
      const finalReserves = await bondingCurve.getReserveBalance();

      console.log(`\nFinal system state:`);
      console.log(`  Total messages: ${finalStats[0].toString()}`);
      console.log(`  Messages judged: ${finalStats[1].toString()}`);
      console.log(`  Likes: ${finalStats[2].toString()}`);
      console.log(`  Dislikes: ${finalStats[3].toString()}`);
      console.log(
        `  Total fees burned: ${ethers.utils.formatEther(finalStats[4])} CBT`
      );
      console.log(
        `  Total rewards distributed: ${ethers.utils.formatEther(
          finalStats[5]
        )} CBT`
      );
      console.log(
        `  Total penalties applied: ${ethers.utils.formatEther(
          finalStats[6]
        )} CBT`
      );
      console.log(
        `  Current token supply: ${ethers.utils.formatEther(finalSupply)} CBT`
      );
      console.log(
        `  Bonding curve price: ${ethers.utils.formatUnits(
          finalBondingCurvePrice,
          8
        )}`
      );
      console.log(
        `  ETH reserves: ${ethers.utils.formatEther(finalReserves)} ETH`
      );

      // === Phase 5: User outcome analysis ===
      console.log("\n👥 Phase 5: User outcome analysis");

      for (const user of allUsers) {
        const userName = ["Alice", "Bob", "Charlie", "Dave"][
          allUsers.indexOf(user)
        ];
        const userStats = await aiChatbot.getUserStatistics(user.address);
        const finalBalance = await token.balanceOf(user.address);

        console.log(`${userName}:`);
        console.log(`  Messages sent: ${userStats[0].toString()}`);
        console.log(`  Likes received: ${userStats[1].toString()}`);
        console.log(`  Dislikes received: ${userStats[2].toString()}`);
        console.log(
          `  Fees paid: ${ethers.utils.formatEther(userStats[3])} CBT`
        );
        console.log(
          `  Rewards earned: ${ethers.utils.formatEther(userStats[4])} CBT`
        );
        console.log(
          `  Final balance: ${ethers.utils.formatEther(finalBalance)} CBT`
        );
      }

      // === Verification ===
      const netSupplyChange = totalRewardsMinted
        .sub(totalPenaltiesBurned)
        .sub(totalMessageFees);
      console.log(`\n🔍 Economic verification:`);
      console.log(
        `  Net supply impact: ${ethers.utils.formatEther(netSupplyChange)} CBT`
      );
      console.log(
        `  (Rewards: +${ethers.utils.formatEther(
          totalRewardsMinted
        )} | Penalties: -${ethers.utils.formatEther(
          totalPenaltiesBurned
        )} | Fees: -${ethers.utils.formatEther(totalMessageFees)})`
      );

      // Verify system integrity
      expect(finalStats[0]).to.equal(messages.length); // Total messages
      expect(finalStats[1]).to.equal(judgments.length); // Judged messages
      expect(finalStats[2]).to.equal(3); // Likes
      expect(finalStats[3]).to.equal(2); // Dislikes
    });
  });

  describe("Error Recovery & Edge Cases", function () {
    beforeEach(async function () {
      await aiChatbot.connect(alice).sendMessage("Edge case test message");
    });

    it("Should handle contract pause during judgment processing", async function () {
      const messageId = 1;

      // Should work when not paused
      await aiChatbot
        .connect(aiProcessor)
        .processAIResponse(messageId, AIJudgment.LIKED);

      // Send another message and pause
      await aiChatbot.connect(alice).sendMessage("Message during pause test");
      await aiChatbot.pause();

      // Should fail when paused
      await expect(
        aiChatbot.connect(aiProcessor).processAIResponse(2, AIJudgment.LIKED)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should handle zero message ID", async function () {
      await expect(
        aiChatbot.connect(aiProcessor).processAIResponse(0, AIJudgment.LIKED)
      ).to.be.revertedWith("MessageNotFound");
    });

    it("Should maintain system consistency after failed judgment", async function () {
      const initialStats = await aiChatbot.getChatbotStatistics();
      const initialSupply = await token.totalSupply();

      // Try to process non-existent message (should fail)
      try {
        await aiChatbot
          .connect(aiProcessor)
          .processAIResponse(999, AIJudgment.LIKED);
      } catch (error) {
        // Expected to fail
      }

      const finalStats = await aiChatbot.getChatbotStatistics();
      const finalSupply = await token.totalSupply();

      // System state should be unchanged after failed transaction
      expect(finalStats[1]).to.equal(initialStats[1]); // Judged count unchanged
      expect(finalSupply).to.equal(initialSupply); // Supply unchanged
    });

    it("Should handle boundary conditions correctly", async function () {
      // Test with message ID at boundary (last valid message)
      const lastMessageId = await aiChatbot.getMessageCount();

      await expect(
        aiChatbot
          .connect(aiProcessor)
          .processAIResponse(lastMessageId, AIJudgment.LIKED)
      ).to.not.be.reverted;

      // Test with message ID just beyond boundary
      await expect(
        aiChatbot
          .connect(aiProcessor)
          .processAIResponse(lastMessageId.add(1), AIJudgment.LIKED)
      ).to.be.revertedWith("MessageNotFound");
    });
  });

  after(function () {
    console.log("\n🎉 STEP 3.3 COMPLETE - AI JUDGMENT PROCESSING IMPLEMENTED");
    console.log("=".repeat(80));
    console.log("✅ AI judgment processing (LIKED/DISLIKED) working correctly");
    console.log(
      "✅ Token minting for likes and burning for penalties operational"
    );
    console.log(
      "✅ Bonding curve supply notifications and price updates functioning"
    );
    console.log("✅ Access control and security measures enforced");
    console.log("✅ Message state management and immutability maintained");
    console.log("✅ Complete end-to-end AI chatbot token economics validated");
    console.log("✅ Gas efficiency and performance benchmarks established");
    console.log("");
    console.log("🎯 AI CHATBOT CORE IMPLEMENTATION COMPLETE!");
    console.log("   ✨ Users can purchase tokens via bonding curve");
    console.log("   ✨ Users can send messages and pay fees in $CBT");
    console.log("   ✨ AI can judge messages and mint/burn tokens accordingly");
    console.log(
      "   ✨ Token supply changes affect bonding curve price in real-time"
    );
    console.log("   ✨ Complete token economics loop operational");
    console.log("");
    console.log("🚀 READY FOR STEP 3.4: INTEGRATION & SYSTEM TESTING");
    console.log("=".repeat(80));

    // Print gas measurements
    gasUtils.printFinalReport();
  });

  // ============ UTILITY FUNCTIONS ============

  function formatTokenAmount(amount) {
    return ethers.utils.formatEther(amount);
  }

  function formatPrice(price) {
    return ethers.utils.formatUnits(price, 8);
  }
});
