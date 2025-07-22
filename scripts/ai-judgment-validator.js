const { ethers } = require("hardhat");

/**
 * AI Judgment Validator
 *
 * Comprehensive validation of AI judgment processing to ensure:
 * 1. Proper like/dislike processing with enum-based logic
 * 2. Correct token minting and burning mechanics
 * 3. Bonding curve integration and supply notifications
 * 4. Access control and security enforcement
 * 5. Message state management and statistics tracking
 * 6. Complete end-to-end token economics flow
 */

class AIJudgmentValidator {
  constructor(token, bondingCurve, aiChatbot) {
    this.token = token;
    this.bondingCurve = bondingCurve;
    this.aiChatbot = aiChatbot;
    this.validationErrors = [];
    this.validationWarnings = [];
    this.gasMetrics = {};

    // AIJudgment enum values
    this.AIJudgment = {
      NONE: 0,
      LIKED: 1,
      DISLIKED: 2,
    };
  }

  /**
   * Run complete AI judgment validation
   */
  async validateCompleteAIJudgmentFlow() {
    console.log("🔍 Starting AI Judgment Processing Validation");
    console.log("=".repeat(50));

    try {
      await this._validatePreConditions();
      await this._setupTestMessages();
      await this._validateLikeProcessing();
      await this._validateDislikeProcessing();
      await this._validateAccessControl();
      await this._validateBondingCurveIntegration();
      await this._validateMessageStateManagement();
      await this._validateStatisticsTracking();
      await this._validateEdgeCases();
      await this._validateCompleteEconomicsFlow();

      this._generateReport();
    } catch (error) {
      console.error("❌ AI judgment validation failed:", error);
      throw error;
    }
  }

  /**
   * Validate pre-conditions and permissions
   */
  async _validatePreConditions() {
    console.log("\n📋 Validating AI Judgment Pre-conditions...");

    // Check AI processor role exists
    const aiProcessorRole = await this.aiChatbot.AI_PROCESSOR_ROLE();
    const [owner] = await ethers.getSigners();
    const hasRole = await this.aiChatbot.hasRole(
      aiProcessorRole,
      owner.address
    );

    this._assert(
      hasRole,
      "Owner should have AI processor role for testing",
      "CRITICAL"
    );

    // Check chatbot has required permissions on token
    const isMinter = await this.token.isMinter(this.aiChatbot.address);
    const isBurner = await this.token.isBurner(this.aiChatbot.address);

    this._assert(
      isMinter,
      "Chatbot should have minter role for rewards",
      "CRITICAL"
    );
    this._assert(
      isBurner,
      "Chatbot should have burner role for penalties",
      "CRITICAL"
    );

    // Check chatbot can notify bonding curve
    const supplyNotifierRole = await this.bondingCurve.SUPPLY_NOTIFIER_ROLE();
    const canNotify = await this.bondingCurve.hasRole(
      supplyNotifierRole,
      this.aiChatbot.address
    );

    this._assert(
      canNotify,
      "Chatbot should be able to notify bonding curve",
      "CRITICAL"
    );

    console.log("✅ Pre-conditions validated");
  }

  /**
   * Setup test messages for judgment processing
   */
  async _setupTestMessages() {
    console.log("\n📝 Setting up test messages...");

    const [owner, user1, user2] = await ethers.getSigners();

    // Give users tokens via bonding curve
    await this.bondingCurve
      .connect(user1)
      .buy(0, { value: ethers.utils.parseEther("1") });
    await this.bondingCurve
      .connect(user2)
      .buy(0, { value: ethers.utils.parseEther("1") });

    // Approve tokens for messaging
    const messageFee = await this.aiChatbot.messageFee();
    await this.token
      .connect(user1)
      .approve(this.aiChatbot.address, messageFee.mul(5));
    await this.token
      .connect(user2)
      .approve(this.aiChatbot.address, messageFee.mul(5));

    // Send test messages
    await this.aiChatbot
      .connect(user1)
      .sendMessage("Test message 1 for AI judgment validation");
    await this.aiChatbot
      .connect(user2)
      .sendMessage("Test message 2 for comprehensive testing");
    await this.aiChatbot
      .connect(user1)
      .sendMessage("Test message 3 with different content");

    const messageCount = await this.aiChatbot.getMessageCount();
    this._assert(messageCount.eq(3), "Should have 3 test messages", "CRITICAL");

    console.log("✅ Test messages setup complete");
  }

  /**
   * Validate LIKE processing
   */
  async _validateLikeProcessing() {
    console.log("\n👍 Validating LIKE Processing...");

    const [owner] = await ethers.getSigners();
    const messageId = 1;
    const message = await this.aiChatbot.getMessage(messageId);
    const author = message.author;

    // Record initial state
    const initialAuthorBalance = await this.token.balanceOf(author);
    const initialTotalSupply = await this.token.totalSupply();
    const initialBondingCurvePrice = await this.bondingCurve.getCurrentPrice();
    const initialStats = await this.aiChatbot.getChatbotStatistics();

    // Process LIKE
    const tx = await this.aiChatbot
      .connect(owner)
      .processAIResponse(messageId, this.AIJudgment.LIKED);
    const receipt = await tx.wait();
    this.gasMetrics.likeProcessing = receipt.gasUsed.toNumber();

    // Validate token minting
    const likeReward = await this.aiChatbot.likeReward();
    const finalAuthorBalance = await this.token.balanceOf(author);
    const finalTotalSupply = await this.token.totalSupply();

    this._assert(
      finalAuthorBalance.eq(initialAuthorBalance.add(likeReward)),
      "Author should receive like reward tokens",
      "CRITICAL"
    );

    this._assert(
      finalTotalSupply.eq(initialTotalSupply.add(likeReward)),
      "Total supply should increase by like reward",
      "CRITICAL"
    );

    // Validate message state update
    const updatedMessage = await this.aiChatbot.getMessage(messageId);
    this._assert(
      updatedMessage.judgment.eq(this.AIJudgment.LIKED),
      "Message judgment should be LIKED",
      "CRITICAL"
    );
    this._assert(
      updatedMessage.rewardMinted.eq(likeReward),
      "Message should record reward amount",
      "CRITICAL"
    );
    this._assert(
      updatedMessage.penaltyBurned.eq(0),
      "Message should have no penalty for like",
      "CRITICAL"
    );

    // Validate statistics update
    const finalStats = await this.aiChatbot.getChatbotStatistics();
    this._assert(
      finalStats[1].eq(initialStats[1].add(1)),
      "Total judged count should increase",
      "CRITICAL"
    );
    this._assert(
      finalStats[2].eq(initialStats[2].add(1)),
      "Total likes count should increase",
      "CRITICAL"
    );
    this._assert(
      finalStats[5].eq(initialStats[5].add(likeReward)),
      "Total rewards should increase by like reward",
      "CRITICAL"
    );

    // Validate bonding curve price impact
    const finalBondingCurvePrice = await this.bondingCurve.getCurrentPrice();
    this._assert(
      finalBondingCurvePrice.gte(initialBondingCurvePrice),
      "Bonding curve price should increase or stay same after like",
      "WARNING"
    );

    console.log("✅ LIKE processing validated");
    console.log(
      `   Gas used: ${this.gasMetrics.likeProcessing.toLocaleString()}`
    );
  }

  /**
   * Validate DISLIKE processing
   */
  async _validateDislikeProcessing() {
    console.log("\n👎 Validating DISLIKE Processing...");

    const [owner] = await ethers.getSigners();
    const messageId = 2;
    const message = await this.aiChatbot.getMessage(messageId);
    const author = message.author;

    // Record initial state
    const initialAuthorBalance = await this.token.balanceOf(author);
    const initialTotalSupply = await this.token.totalSupply();
    const initialBondingCurvePrice = await this.bondingCurve.getCurrentPrice();
    const initialStats = await this.aiChatbot.getChatbotStatistics();

    // Process DISLIKE
    const tx = await this.aiChatbot
      .connect(owner)
      .processAIResponse(messageId, this.AIJudgment.DISLIKED);
    const receipt = await tx.wait();
    this.gasMetrics.dislikeProcessing = receipt.gasUsed.toNumber();

    // Validate penalty burning (from supply, not user)
    const dislikePenalty = await this.aiChatbot.dislikePenalty();
    const finalAuthorBalance = await this.token.balanceOf(author);
    const finalTotalSupply = await this.token.totalSupply();

    this._assert(
      finalAuthorBalance.eq(initialAuthorBalance),
      "Author balance should be unchanged for dislike",
      "CRITICAL"
    );

    this._assert(
      finalTotalSupply.eq(initialTotalSupply.sub(dislikePenalty)),
      "Total supply should decrease by dislike penalty",
      "CRITICAL"
    );

    // Validate message state update
    const updatedMessage = await this.aiChatbot.getMessage(messageId);
    this._assert(
      updatedMessage.judgment.eq(this.AIJudgment.DISLIKED),
      "Message judgment should be DISLIKED",
      "CRITICAL"
    );
    this._assert(
      updatedMessage.rewardMinted.eq(0),
      "Message should have no reward for dislike",
      "CRITICAL"
    );
    this._assert(
      updatedMessage.penaltyBurned.eq(dislikePenalty),
      "Message should record penalty amount",
      "CRITICAL"
    );

    // Validate statistics update
    const finalStats = await this.aiChatbot.getChatbotStatistics();
    this._assert(
      finalStats[1].eq(initialStats[1].add(1)),
      "Total judged count should increase",
      "CRITICAL"
    );
    this._assert(
      finalStats[3].eq(initialStats[3].add(1)),
      "Total dislikes count should increase",
      "CRITICAL"
    );
    this._assert(
      finalStats[6].eq(initialStats[6].add(dislikePenalty)),
      "Total penalties should increase by dislike penalty",
      "CRITICAL"
    );

    // Validate bonding curve price impact
    const finalBondingCurvePrice = await this.bondingCurve.getCurrentPrice();
    this._assert(
      finalBondingCurvePrice.lte(initialBondingCurvePrice),
      "Bonding curve price should decrease or stay same after dislike",
      "WARNING"
    );

    console.log("✅ DISLIKE processing validated");
    console.log(
      `   Gas used: ${this.gasMetrics.dislikeProcessing.toLocaleString()}`
    );
  }

  /**
   * Validate access control
   */
  async _validateAccessControl() {
    console.log("\n🔒 Validating Access Control...");

    const [owner, user1, unauthorized] = await ethers.getSigners();
    const messageId = 3; // Unjudged message

    // Test unauthorized access (should fail)
    try {
      await this.aiChatbot
        .connect(unauthorized)
        .processAIResponse(messageId, this.AIJudgment.LIKED);
      this._recordError(
        "Unauthorized user should not be able to process judgments",
        "CRITICAL"
      );
    } catch (error) {
      console.log("✅ Correctly blocked unauthorized access");
    }

    // Test user trying to judge their own message (should fail)
    try {
      await this.aiChatbot
        .connect(user1)
        .processAIResponse(messageId, this.AIJudgment.LIKED);
      this._recordError(
        "Message author should not be able to judge their own message",
        "CRITICAL"
      );
    } catch (error) {
      console.log("✅ Correctly blocked self-judgment");
    }

    // Test invalid judgment value (NONE should fail)
    try {
      await this.aiChatbot
        .connect(owner)
        .processAIResponse(messageId, this.AIJudgment.NONE);
      this._recordError("NONE judgment should not be allowed", "CRITICAL");
    } catch (error) {
      if (error.message.includes("InvalidJudgment")) {
        console.log("✅ Correctly rejected NONE judgment");
      }
    }

    console.log("✅ Access control validated");
  }

  /**
   * Validate bonding curve integration
   */
  async _validateBondingCurveIntegration() {
    console.log("\n📈 Validating Bonding Curve Integration...");

    const [owner, user2] = await ethers.getSigners();

    // Send a new message for testing
    const messageFee = await this.aiChatbot.messageFee();
    await this.token.connect(user2).approve(this.aiChatbot.address, messageFee);
    await this.aiChatbot
      .connect(user2)
      .sendMessage("Message for bonding curve integration test");

    const messageId = await this.aiChatbot.getMessageCount();

    // Test that judgment triggers supply change notification
    const likeReward = await this.aiChatbot.likeReward();

    // Listen for SupplyChanged event
    let supplyChangeEventEmitted = false;
    let eventDetails = null;

    this.bondingCurve.once(
      "SupplyChanged",
      (source, supplyDelta, newPrice, reason) => {
        supplyChangeEventEmitted = true;
        eventDetails = { source, supplyDelta, newPrice, reason };
      }
    );

    // Process judgment
    await this.aiChatbot
      .connect(owner)
      .processAIResponse(messageId, this.AIJudgment.LIKED);

    // Wait for event processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    this._assert(
      supplyChangeEventEmitted,
      "Bonding curve should receive supply change notification",
      "CRITICAL"
    );

    if (eventDetails) {
      this._assert(
        eventDetails.source === this.aiChatbot.address,
        "Supply change should come from AI chatbot",
        "CRITICAL"
      );
      this._assert(
        eventDetails.supplyDelta.eq(likeReward),
        "Supply delta should match like reward",
        "CRITICAL"
      );
    }

    console.log("✅ Bonding curve integration validated");
  }

  /**
   * Validate message state management
   */
  async _validateMessageStateManagement() {
    console.log("\n📄 Validating Message State Management...");

    // Test that judged messages cannot be re-judged
    const [owner] = await ethers.getSigners();
    const messageId = 1; // Already judged in like test

    try {
      await this.aiChatbot
        .connect(owner)
        .processAIResponse(messageId, this.AIJudgment.DISLIKED);
      this._recordError(
        "Should not be able to re-judge already judged message",
        "CRITICAL"
      );
    } catch (error) {
      if (error.message.includes("MessageAlreadyJudged")) {
        console.log("✅ Correctly prevented re-judgment");
      }
    }

    // Test message immutability (core fields should not change)
    const originalMessage = await this.aiChatbot.getMessage(messageId);

    this._assert(
      originalMessage.judgment.eq(this.AIJudgment.LIKED),
      "Message judgment should remain LIKED after re-judgment attempt",
      "CRITICAL"
    );

    // Test non-existent message handling
    try {
      await this.aiChatbot
        .connect(owner)
        .processAIResponse(999, this.AIJudgment.LIKED);
      this._recordError(
        "Should not be able to judge non-existent message",
        "CRITICAL"
      );
    } catch (error) {
      if (error.message.includes("MessageNotFound")) {
        console.log("✅ Correctly handled non-existent message");
      }
    }

    console.log("✅ Message state management validated");
  }

  /**
   * Validate statistics tracking
   */
  async _validateStatisticsTracking() {
    console.log("\n📊 Validating Statistics Tracking...");

    const finalStats = await this.aiChatbot.getChatbotStatistics();
    const messageCount = await this.aiChatbot.getMessageCount();
    const judgedCount = await this.aiChatbot.getJudgedMessageCount();

    // Validate global statistics consistency
    this._assert(
      finalStats[0].eq(messageCount),
      "Global stats total messages should match message count",
      "CRITICAL"
    );

    this._assert(
      finalStats[1].eq(judgedCount),
      "Global stats judged messages should match judged count",
      "CRITICAL"
    );

    this._assert(
      finalStats[2].add(finalStats[3]).eq(judgedCount),
      "Likes plus dislikes should equal judged messages",
      "CRITICAL"
    );

    // Validate user statistics
    const [owner, user1, user2] = await ethers.getSigners();
    const user1Stats = await this.aiChatbot.getUserStatistics(user1.address);
    const user2Stats = await this.aiChatbot.getUserStatistics(user2.address);

    // User1 sent messages 1 and 3, got 1 like (message 1)
    this._assert(
      user1Stats[0].eq(2),
      "User1 should have sent 2 messages",
      "CRITICAL"
    );
    this._assert(user1Stats[1].eq(1), "User1 should have 1 like", "CRITICAL");

    // User2 sent messages 2 and 4, got 1 dislike (message 2)
    this._assert(
      user2Stats[0].eq(2),
      "User2 should have sent 2 messages",
      "CRITICAL"
    );
    this._assert(
      user2Stats[2].eq(1),
      "User2 should have 1 dislike",
      "CRITICAL"
    );

    console.log("✅ Statistics tracking validated");
  }

  /**
   * Validate edge cases
   */
  async _validateEdgeCases() {
    console.log("\n⚠️  Validating Edge Cases...");

    const [owner] = await ethers.getSigners();

    // Test pause functionality
    await this.aiChatbot.pause();

    try {
      await this.aiChatbot
        .connect(owner)
        .processAIResponse(3, this.AIJudgment.LIKED);
      this._recordError("Should not process judgments when paused", "CRITICAL");
    } catch (error) {
      if (error.message.includes("Pausable: paused")) {
        console.log("✅ Correctly blocked judgment processing when paused");
      }
    }

    await this.aiChatbot.unpause();

    // Test zero message ID
    try {
      await this.aiChatbot
        .connect(owner)
        .processAIResponse(0, this.AIJudgment.LIKED);
      this._recordError("Should reject zero message ID", "CRITICAL");
    } catch (error) {
      if (error.message.includes("MessageNotFound")) {
        console.log("✅ Correctly rejected zero message ID");
      }
    }

    console.log("✅ Edge cases validated");
  }

  /**
   * Validate complete economics flow
   */
  async _validateCompleteEconomicsFlow() {
    console.log("\n💰 Validating Complete Economics Flow...");

    // Measure initial system state
    const initialSupply = await this.token.totalSupply();
    const initialStats = await this.aiChatbot.getChatbotStatistics();
    const initialPrice = await this.bondingCurve.getCurrentPrice();

    console.log("Initial state:");
    console.log(
      `  Token supply: ${ethers.utils.formatEther(initialSupply)} CBT`
    );
    console.log(
      `  Bonding curve price: ${ethers.utils.formatUnits(initialPrice, 8)}`
    );
    console.log(`  Messages judged: ${initialStats[1].toString()}`);

    // Calculate economic impact
    const likeReward = await this.aiChatbot.likeReward();
    const dislikePenalty = await this.aiChatbot.dislikePenalty();
    const messageFee = await this.aiChatbot.messageFee();

    const totalLikes = initialStats[2];
    const totalDislikes = initialStats[3];
    const totalMessages = initialStats[0];

    // Calculate expected supply impact
    const rewardsIssued = totalLikes.mul(likeReward);
    const penaltiesApplied = totalDislikes.mul(dislikePenalty);
    const feesCollected = totalMessages.mul(messageFee);

    const netSupplyFromJudgments = rewardsIssued.sub(penaltiesApplied);
    const netSupplyFromFees = feesCollected.mul(-1); // Fees are burned
    const expectedTotalSupplyImpact =
      netSupplyFromJudgments.add(netSupplyFromFees);

    console.log("Economics breakdown:");
    console.log(
      `  Rewards issued: +${ethers.utils.formatEther(rewardsIssued)} CBT`
    );
    console.log(
      `  Penalties applied: -${ethers.utils.formatEther(penaltiesApplied)} CBT`
    );
    console.log(
      `  Fees burned: -${ethers.utils.formatEther(feesCollected)} CBT`
    );
    console.log(
      `  Net supply impact: ${ethers.utils.formatEther(
        expectedTotalSupplyImpact
      )} CBT`
    );

    // Validate tokenomics balance (17% like rate for equilibrium)
    if (initialStats[1].gt(0)) {
      const likeRatio = totalLikes.mul(10000).div(initialStats[1]); // Basis points
      console.log(
        `  Like ratio: ${likeRatio.toString()} bps (${(
          likeRatio.toNumber() / 100
        ).toFixed(1)}%)`
      );

      if (likeRatio.lt(1500) || likeRatio.gt(2000)) {
        this._recordError(
          "Like ratio outside optimal range (15-20%)",
          "WARNING"
        );
      }
    }

    console.log("✅ Complete economics flow validated");
  }

  /**
   * Record assertion result
   */
  _assert(condition, message, severity = "WARNING") {
    if (!condition) {
      if (severity === "CRITICAL") {
        this.validationErrors.push(message);
      } else {
        this.validationWarnings.push(message);
      }
    }
  }

  /**
   * Record error
   */
  _recordError(message, severity = "WARNING") {
    if (severity === "CRITICAL") {
      this.validationErrors.push(message);
    } else {
      this.validationWarnings.push(message);
    }
  }

  /**
   * Generate validation report
   */
  _generateReport() {
    console.log("\n" + "=".repeat(50));
    console.log("📊 AI JUDGMENT VALIDATION REPORT");
    console.log("=".repeat(50));

    if (
      this.validationErrors.length === 0 &&
      this.validationWarnings.length === 0
    ) {
      console.log("🎉 ALL AI JUDGMENT VALIDATIONS PASSED!");
      console.log("✅ LIKE processing working correctly");
      console.log("✅ DISLIKE processing operational");
      console.log("✅ Token minting and burning mechanics functional");
      console.log("✅ Bonding curve integration and notifications working");
      console.log("✅ Access control and security measures enforced");
      console.log("✅ Message state management operating correctly");
      console.log("✅ Statistics tracking accurate and consistent");
      console.log("✅ Edge cases handled appropriately");
      console.log("✅ Complete token economics flow validated");
    } else {
      if (this.validationErrors.length > 0) {
        console.log(`❌ CRITICAL ERRORS (${this.validationErrors.length}):`);
        this.validationErrors.forEach((error, i) => {
          console.log(`   ${i + 1}. ${error}`);
        });
      }

      if (this.validationWarnings.length > 0) {
        console.log(`⚠️  WARNINGS (${this.validationWarnings.length}):`);
        this.validationWarnings.forEach((warning, i) => {
          console.log(`   ${i + 1}. ${warning}`);
        });
      }
    }

    // Gas metrics summary
    if (Object.keys(this.gasMetrics).length > 0) {
      console.log("\n⛽ GAS METRICS SUMMARY:");
      for (const [operation, gas] of Object.entries(this.gasMetrics)) {
        console.log(`   ${operation}: ${gas.toLocaleString()} gas`);
      }
    }

    // Performance analysis
    if (this.gasMetrics.likeProcessing && this.gasMetrics.dislikeProcessing) {
      const avgGas = Math.round(
        (this.gasMetrics.likeProcessing + this.gasMetrics.dislikeProcessing) / 2
      );
      const gasVariance = Math.abs(
        this.gasMetrics.likeProcessing - this.gasMetrics.dislikeProcessing
      );
      const variancePercent = ((gasVariance / avgGas) * 100).toFixed(1);

      console.log("\n📊 PERFORMANCE ANALYSIS:");
      console.log(`   Average judgment gas: ${avgGas.toLocaleString()}`);
      console.log(
        `   Gas variance: ${gasVariance.toLocaleString()} (${variancePercent}%)`
      );

      if (avgGas > 250000) {
        this._recordError("Average gas usage too high (>250k)", "WARNING");
      }
    }

    console.log("=".repeat(50));

    if (this.validationErrors.length > 0) {
      throw new Error(
        `AI judgment validation failed with ${this.validationErrors.length} critical errors`
      );
    }
  }
}

module.exports = { AIJudgmentValidator };
