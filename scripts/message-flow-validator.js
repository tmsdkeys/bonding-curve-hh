const { ethers } = require("hardhat");

/**
 * Message Flow Validator
 *
 * Comprehensive validation of message submission and fee system to ensure:
 * 1. Proper fee collection and token burning
 * 2. Correct message storage and indexing
 * 3. Accurate statistics tracking
 * 4. Integration with token and bonding curve systems
 * 5. Edge case handling and error conditions
 */

class MessageFlowValidator {
  constructor(token, bondingCurve, aiChatbot) {
    this.token = token;
    this.bondingCurve = bondingCurve;
    this.aiChatbot = aiChatbot;
    this.validationErrors = [];
    this.validationWarnings = [];
    this.gasMetrics = {};
  }

  /**
   * Run complete message flow validation
   */
  async validateCompleteMessageFlow() {
    console.log("🔍 Starting Message Flow Validation");
    console.log("=".repeat(50));

    try {
      await this._validatePreConditions();
      await this._validateBasicMessageSubmission();
      await this._validateFeeCollection();
      await this._validateMessageStorage();
      await this._validateIndexingSystem();
      await this._validateStatisticsTracking();
      await this._validateLengthValidation();
      await this._validateMultiUserScenarios();
      await this._validateEdgeCases();
      await this._validateGasEfficiency();

      this._generateReport();
    } catch (error) {
      console.error("❌ Message flow validation failed:", error);
      throw error;
    }
  }

  /**
   * Validate pre-conditions and setup
   */
  async _validatePreConditions() {
    console.log("\n📋 Validating Pre-conditions...");

    // Check contract addresses
    const tokenAddress = await this.aiChatbot.token();
    const bondingCurveAddress = await this.aiChatbot.bondingCurve();

    this._assert(
      tokenAddress === this.token.address,
      "AI Chatbot should be connected to correct token contract",
      "CRITICAL"
    );

    this._assert(
      bondingCurveAddress === this.bondingCurve.address,
      "AI Chatbot should be connected to correct bonding curve contract",
      "CRITICAL"
    );

    // Check permissions
    const isMinter = await this.token.isMinter(this.aiChatbot.address);
    const isBurner = await this.token.isBurner(this.aiChatbot.address);

    this._assert(
      isMinter,
      "AI Chatbot should have minter role on token",
      "CRITICAL"
    );
    this._assert(
      isBurner,
      "AI Chatbot should have burner role on token",
      "CRITICAL"
    );

    // Check initial state
    const messageCount = await this.aiChatbot.getMessageCount();
    this._assert(
      messageCount.eq(0),
      "Should start with zero messages",
      "WARNING"
    );

    console.log("✅ Pre-conditions validated");
  }

  /**
   * Validate basic message submission
   */
  async _validateBasicMessageSubmission() {
    console.log("\n💬 Validating Basic Message Submission...");

    const [user] = await ethers.getSigners();

    // Give user tokens via bonding curve
    await this.bondingCurve
      .connect(user)
      .buy(0, { value: ethers.utils.parseEther("1") });
    const userBalance = await this.token.balanceOf(user.address);

    this._assert(
      userBalance.gt(0),
      "User should have tokens after purchase",
      "CRITICAL"
    );

    const messageFee = await this.aiChatbot.messageFee();

    // Test without approval (should fail)
    try {
      await this.aiChatbot
        .connect(user)
        .sendMessage("Test message without approval");
      this._recordError(
        "Message submission should fail without approval",
        "CRITICAL"
      );
    } catch (error) {
      if (error.message.includes("InsufficientAllowance")) {
        console.log("✅ Correctly rejected message without approval");
      } else {
        this._recordError(`Unexpected error: ${error.message}`, "WARNING");
      }
    }

    // Approve and test successful submission
    await this.token.connect(user).approve(this.aiChatbot.address, messageFee);

    const balanceBefore = await this.token.balanceOf(user.address);
    const supplyBefore = await this.token.totalSupply();

    const tx = await this.aiChatbot
      .connect(user)
      .sendMessage("Validation test message");
    const receipt = await tx.wait();

    const balanceAfter = await this.token.balanceOf(user.address);
    const supplyAfter = await this.token.totalSupply();

    // Validate fee burning
    this._assert(
      balanceAfter.eq(balanceBefore.sub(messageFee)),
      "User balance should decrease by message fee",
      "CRITICAL"
    );

    this._assert(
      supplyAfter.eq(supplyBefore.sub(messageFee)),
      "Total supply should decrease by message fee",
      "CRITICAL"
    );

    // Record gas usage
    this.gasMetrics.basicMessageSubmission = receipt.gasUsed.toNumber();

    console.log("✅ Basic message submission validated");
    console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
  }

  /**
   * Validate fee collection mechanics
   */
  async _validateFeeCollection() {
    console.log("\n💰 Validating Fee Collection...");

    const [user] = await ethers.getSigners();
    const messageFee = await this.aiChatbot.messageFee();

    // Test insufficient balance
    const userBalance = await this.token.balanceOf(user.address);
    if (userBalance.lt(messageFee)) {
      try {
        await this.aiChatbot
          .connect(user)
          .sendMessage("Should fail - insufficient balance");
        this._recordError(
          "Should reject message with insufficient balance",
          "CRITICAL"
        );
      } catch (error) {
        if (error.message.includes("InsufficientTokenBalance")) {
          console.log("✅ Correctly rejected insufficient balance");
        }
      }
    }

    // Test partial allowance
    if (userBalance.gte(messageFee)) {
      await this.token
        .connect(user)
        .approve(this.aiChatbot.address, messageFee.sub(1));

      try {
        await this.aiChatbot
          .connect(user)
          .sendMessage("Should fail - insufficient allowance");
        this._recordError(
          "Should reject message with insufficient allowance",
          "CRITICAL"
        );
      } catch (error) {
        if (error.message.includes("InsufficientAllowance")) {
          console.log("✅ Correctly rejected insufficient allowance");
        }
      }
    }

    console.log("✅ Fee collection validation completed");
  }

  /**
   * Validate message storage
   */
  async _validateMessageStorage() {
    console.log("\n📚 Validating Message Storage...");

    const [user] = await ethers.getSigners();
    const messageFee = await this.aiChatbot.messageFee();

    await this.token.connect(user).approve(this.aiChatbot.address, messageFee);

    const messageContent = "Test message for storage validation";
    const tx = await this.aiChatbot.connect(user).sendMessage(messageContent);
    const receipt = await tx.wait();
    const timestamp = (await ethers.provider.getBlock(receipt.blockNumber))
      .timestamp;

    const messageCount = await this.aiChatbot.getMessageCount();
    const storedMessage = await this.aiChatbot.getMessage(messageCount);

    // Validate stored data
    this._assert(
      storedMessage.id.eq(messageCount),
      "Message ID should match count",
      "CRITICAL"
    );
    this._assert(
      storedMessage.author === user.address,
      "Author should be correct",
      "CRITICAL"
    );
    this._assert(
      storedMessage.content === messageContent,
      "Content should be preserved",
      "CRITICAL"
    );
    this._assert(
      storedMessage.timestamp.eq(timestamp),
      "Timestamp should be accurate",
      "CRITICAL"
    );
    this._assert(
      storedMessage.judgment.eq(0),
      "Initial judgment should be NONE",
      "CRITICAL"
    );
    this._assert(
      storedMessage.feePaid.eq(messageFee),
      "Fee paid should be recorded",
      "CRITICAL"
    );
    this._assert(
      storedMessage.rewardMinted.eq(0),
      "Reward should be zero initially",
      "CRITICAL"
    );
    this._assert(
      storedMessage.penaltyBurned.eq(0),
      "Penalty should be zero initially",
      "CRITICAL"
    );

    console.log("✅ Message storage validated");
    console.log(`   Message ID: ${storedMessage.id.toString()}`);
    console.log(`   Content length: ${messageContent.length} characters`);
  }

  /**
   * Validate indexing system
   */
  async _validateIndexingSystem() {
    console.log("\n🗂️  Validating Indexing System...");

    const [user1, user2] = await ethers.getSigners();
    const messageFee = await this.aiChatbot.messageFee();

    // Setup tokens for both users
    await this.bondingCurve
      .connect(user2)
      .buy(0, { value: ethers.utils.parseEther("1") });
    await this.token
      .connect(user1)
      .approve(this.aiChatbot.address, messageFee.mul(3));
    await this.token
      .connect(user2)
      .approve(this.aiChatbot.address, messageFee.mul(2));

    // Send messages from both users
    await this.aiChatbot.connect(user1).sendMessage("User1 message 1");
    await this.aiChatbot.connect(user2).sendMessage("User2 message 1");
    await this.aiChatbot.connect(user1).sendMessage("User1 message 2");

    // Test author indexing
    const [user1Messages, user1Count] =
      await this.aiChatbot.getMessagesByAuthor(user1.address, 0, 10);
    const [user2Messages, user2Count] =
      await this.aiChatbot.getMessagesByAuthor(user2.address, 0, 10);

    this._assert(user1Count.eq(2), "User1 should have 2 messages", "CRITICAL");
    this._assert(user2Count.eq(1), "User2 should have 1 message", "CRITICAL");

    // Test recent messages ordering
    const recentMessages = await this.aiChatbot.getRecentMessages(0, 3);
    this._assert(
      recentMessages.length === 3,
      "Should return 3 recent messages",
      "CRITICAL"
    );

    // Should be in reverse chronological order
    const message1 = await this.aiChatbot.getMessage(recentMessages[2]);
    const message2 = await this.aiChatbot.getMessage(recentMessages[1]);
    const message3 = await this.aiChatbot.getMessage(recentMessages[0]);

    this._assert(
      message1.timestamp.lte(message2.timestamp) &&
        message2.timestamp.lte(message3.timestamp),
      "Recent messages should be in reverse chronological order",
      "CRITICAL"
    );

    console.log("✅ Indexing system validated");
  }

  /**
   * Validate statistics tracking
   */
  async _validateStatisticsTracking() {
    console.log("\n📊 Validating Statistics Tracking...");

    const [user] = await ethers.getSigners();
    const messageFee = await this.aiChatbot.messageFee();

    const statsBefore = await this.aiChatbot.getChatbotStatistics();
    const userStatsBefore = await this.aiChatbot.getUserStatistics(
      user.address
    );

    await this.token.connect(user).approve(this.aiChatbot.address, messageFee);
    await this.aiChatbot.connect(user).sendMessage("Statistics tracking test");

    const statsAfter = await this.aiChatbot.getChatbotStatistics();
    const userStatsAfter = await this.aiChatbot.getUserStatistics(user.address);

    // Validate global statistics
    this._assert(
      statsAfter[0].eq(statsBefore[0].add(1)),
      "Total message count should increase by 1",
      "CRITICAL"
    );

    this._assert(
      statsAfter[4].eq(statsBefore[4].add(messageFee)),
      "Total fees collected should increase by message fee",
      "CRITICAL"
    );

    // Validate user statistics
    this._assert(
      userStatsAfter[0].eq(userStatsBefore[0].add(1)),
      "User message count should increase by 1",
      "CRITICAL"
    );

    this._assert(
      userStatsAfter[3].eq(userStatsBefore[3].add(messageFee)),
      "User fees paid should increase by message fee",
      "CRITICAL"
    );

    console.log("✅ Statistics tracking validated");
  }

  /**
   * Validate length validation
   */
  async _validateLengthValidation() {
    console.log("\n📏 Validating Length Validation...");

    const [user] = await ethers.getSigners();
    const messageFee = await this.aiChatbot.messageFee();

    await this.token
      .connect(user)
      .approve(this.aiChatbot.address, messageFee.mul(5));

    // Test minimum length
    const minLength = await this.aiChatbot.minimumMessageLength();
    const tooShort = "x".repeat(minLength.toNumber() - 1);

    try {
      await this.aiChatbot.connect(user).sendMessage(tooShort);
      this._recordError(
        "Should reject message below minimum length",
        "CRITICAL"
      );
    } catch (error) {
      if (error.message.includes("InvalidMessageLength")) {
        console.log("✅ Correctly rejected too short message");
      }
    }

    // Test maximum length
    const maxLength = await this.aiChatbot.maximumMessageLength();
    const tooLong = "x".repeat(maxLength.toNumber() + 1);

    try {
      await this.aiChatbot.connect(user).sendMessage(tooLong);
      this._recordError(
        "Should reject message above maximum length",
        "CRITICAL"
      );
    } catch (error) {
      if (error.message.includes("InvalidMessageLength")) {
        console.log("✅ Correctly rejected too long message");
      }
    }

    // Test valid lengths
    const validMin = "x".repeat(minLength.toNumber());
    const validMax = "x".repeat(maxLength.toNumber());

    await this.aiChatbot.connect(user).sendMessage(validMin);
    await this.aiChatbot.connect(user).sendMessage(validMax);

    console.log("✅ Length validation working correctly");
  }

  /**
   * Validate multi-user scenarios
   */
  async _validateMultiUserScenarios() {
    console.log("\n👥 Validating Multi-user Scenarios...");

    const [user1, user2, user3] = await ethers.getSigners();
    const messageFee = await this.aiChatbot.messageFee();

    // Setup multiple users
    const users = [user2, user3]; // user1 already has tokens
    for (const user of users) {
      await this.bondingCurve
        .connect(user)
        .buy(0, { value: ethers.utils.parseEther("1") });
      await this.token
        .connect(user)
        .approve(this.aiChatbot.address, messageFee.mul(3));
    }

    const initialMessageCount = await this.aiChatbot.getMessageCount();

    // Concurrent message submissions
    const messagePromises = [
      this.aiChatbot.connect(user1).sendMessage("Concurrent message 1"),
      this.aiChatbot.connect(user2).sendMessage("Concurrent message 2"),
      this.aiChatbot.connect(user3).sendMessage("Concurrent message 3"),
    ];

    await Promise.all(messagePromises);

    const finalMessageCount = await this.aiChatbot.getMessageCount();

    this._assert(
      finalMessageCount.eq(initialMessageCount.add(3)),
      "Should handle concurrent submissions correctly",
      "CRITICAL"
    );

    console.log("✅ Multi-user scenarios validated");
  }

  /**
   * Validate edge cases
   */
  async _validateEdgeCases() {
    console.log("\n⚠️  Validating Edge Cases...");

    const [user] = await ethers.getSigners();

    // Test contract pause
    await this.aiChatbot.pause();

    try {
      await this.aiChatbot.connect(user).sendMessage("Should fail when paused");
      this._recordError("Should reject messages when paused", "CRITICAL");
    } catch (error) {
      if (error.message.includes("Pausable: paused")) {
        console.log("✅ Correctly rejects messages when paused");
      }
    }

    await this.aiChatbot.unpause();

    // Test special characters
    const messageFee = await this.aiChatbot.messageFee();
    await this.token.connect(user).approve(this.aiChatbot.address, messageFee);

    const specialMessage = "Test émoji: 🚀💯 and symbols: !@#$%";
    await this.aiChatbot.connect(user).sendMessage(specialMessage);

    const storedMessage = await this.aiChatbot.getMessage(
      await this.aiChatbot.getMessageCount()
    );
    this._assert(
      storedMessage.content === specialMessage,
      "Should handle special characters correctly",
      "WARNING"
    );

    console.log("✅ Edge cases validated");
  }

  /**
   * Validate gas efficiency
   */
  async _validateGasEfficiency() {
    console.log("\n⛽ Validating Gas Efficiency...");

    const [user] = await ethers.getSigners();
    const messageFee = await this.aiChatbot.messageFee();

    await this.token
      .connect(user)
      .approve(this.aiChatbot.address, messageFee.mul(3));

    // Test different message lengths
    const tests = [
      { length: 50, desc: "Short" },
      { length: 200, desc: "Medium" },
      { length: 400, desc: "Long" },
    ];

    for (const test of tests) {
      const message = "x".repeat(test.length);
      const tx = await this.aiChatbot.connect(user).sendMessage(message);
      const receipt = await tx.wait();

      this.gasMetrics[`message_${test.desc.toLowerCase()}`] =
        receipt.gasUsed.toNumber();

      console.log(
        `${test.desc} message (${test.length} chars): ${receipt.gasUsed} gas`
      );
    }

    // Validate gas usage is reasonable
    const maxGas = Math.max(...Object.values(this.gasMetrics));
    this._assert(
      maxGas < 200000,
      "Gas usage should be under 200k for message submission",
      "WARNING"
    );

    console.log("✅ Gas efficiency validated");
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
    console.log("📊 MESSAGE FLOW VALIDATION REPORT");
    console.log("=".repeat(50));

    if (
      this.validationErrors.length === 0 &&
      this.validationWarnings.length === 0
    ) {
      console.log("🎉 ALL MESSAGE FLOW VALIDATIONS PASSED!");
      console.log("✅ Message submission mechanics working correctly");
      console.log("✅ Fee collection and token burning operational");
      console.log("✅ Message storage and retrieval systems functional");
      console.log("✅ Indexing and pagination working properly");
      console.log("✅ Statistics tracking accurate");
      console.log("✅ Length validation enforced");
      console.log("✅ Multi-user scenarios handled correctly");
      console.log("✅ Edge cases managed appropriately");
      console.log("✅ Gas efficiency within acceptable ranges");
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

    console.log("=".repeat(50));

    if (this.validationErrors.length > 0) {
      throw new Error(
        `Message flow validation failed with ${this.validationErrors.length} critical errors`
      );
    }
  }
}

module.exports = { MessageFlowValidator };
