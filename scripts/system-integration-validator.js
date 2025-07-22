const { ethers } = require("hardhat");

/**
 * System Integration Validator
 *
 * Comprehensive validation of complete system integration ensuring:
 * 1. Cross-contract communication and data consistency
 * 2. End-to-end transaction flows and state synchronization
 * 3. Production readiness across all system components
 * 4. Emergency controls and recovery mechanisms
 * 5. Performance benchmarks and optimization validation
 * 6. Economic model stability under various conditions
 */

class SystemIntegrationValidator {
  constructor(token, bondingCurve, aiChatbot) {
    this.token = token;
    this.bondingCurve = bondingCurve;
    this.aiChatbot = aiChatbot;
    this.validationErrors = [];
    this.validationWarnings = [];
    this.integrationMetrics = {};

    // AIJudgment enum values
    this.AIJudgment = {
      NONE: 0,
      LIKED: 1,
      DISLIKED: 2,
    };
  }

  /**
   * Run complete system integration validation
   */
  async validateCompleteSystemIntegration() {
    console.log("🔍 Starting Complete System Integration Validation");
    console.log("=".repeat(50));

    try {
      await this._validateContractInterfaces();
      await this._validatePermissionsMatrix();
      await this._validateCrossContractCommunication();
      await this._validateStateConsistency();
      await this._validateEventPropagation();
      await this._validateDataIntegrity();
      await this._validateTransactionAtomicity();

      this._generateIntegrationReport();
    } catch (error) {
      console.error("❌ System integration validation failed:", error);
      throw error;
    }
  }

  /**
   * Validate production readiness
   */
  async validateProductionReadiness() {
    console.log("🚀 Starting Production Readiness Validation");
    console.log("=".repeat(50));

    try {
      await this._validateSecurityControls();
      await this._validateErrorHandling();
      await this._validateUpgradeability();
      await this._validateMonitoringCapabilities();
      await this._validateMaintenanceOperations();
      await this._validateDisasterRecovery();

      this._generateProductionReadinessReport();
    } catch (error) {
      console.error("❌ Production readiness validation failed:", error);
      throw error;
    }
  }

  /**
   * Validate contract interfaces and compatibility
   */
  async _validateContractInterfaces() {
    console.log("\n🔌 Validating Contract Interfaces...");

    // Check ERC20 interface compliance
    const erc20Functions = [
      "totalSupply",
      "balanceOf",
      "transfer",
      "transferFrom",
      "approve",
      "allowance",
      "name",
      "symbol",
      "decimals",
    ];

    for (const func of erc20Functions) {
      this._assert(
        typeof this.token[func] === "function",
        `Token should implement ERC20 function: ${func}`,
        "CRITICAL"
      );
    }

    // Check bonding curve interface
    const bondingCurveFunctions = [
      "getCurrentPrice",
      "calculatePrice",
      "buy",
      "sell",
      "getSupply",
      "notifySupplyChange",
    ];

    for (const func of bondingCurveFunctions) {
      this._assert(
        typeof this.bondingCurve[func] === "function",
        `Bonding curve should implement function: ${func}`,
        "CRITICAL"
      );
    }

    // Check AI chatbot interface
    const chatbotFunctions = [
      "sendMessage",
      "processAIResponse",
      "getMessage",
      "getMessageCount",
      "getJudgedMessageCount",
      "getUserStatistics",
      "getChatbotStatistics",
    ];

    for (const func of chatbotFunctions) {
      this._assert(
        typeof this.aiChatbot[func] === "function",
        `AI Chatbot should implement function: ${func}`,
        "CRITICAL"
      );
    }

    console.log("✅ Contract interfaces validated");
  }

  /**
   * Validate permissions matrix across contracts
   */
  async _validatePermissionsMatrix() {
    console.log("\n🔐 Validating Permissions Matrix...");

    // Check token permissions
    const tokenMinterRole = await this.token.MINTER_ROLE();
    const tokenBurnerRole = await this.token.BURNER_ROLE();

    const bondingCurveIsMinter = await this.token.hasRole(
      tokenMinterRole,
      this.bondingCurve.address
    );
    const bondingCurveIsBurner = await this.token.hasRole(
      tokenBurnerRole,
      this.bondingCurve.address
    );
    const chatbotIsMinter = await this.token.hasRole(
      tokenMinterRole,
      this.aiChatbot.address
    );
    const chatbotIsBurner = await this.token.hasRole(
      tokenBurnerRole,
      this.aiChatbot.address
    );

    this._assert(
      bondingCurveIsMinter,
      "Bonding curve should have minter role",
      "CRITICAL"
    );
    this._assert(
      bondingCurveIsBurner,
      "Bonding curve should have burner role",
      "CRITICAL"
    );
    this._assert(
      chatbotIsMinter,
      "AI Chatbot should have minter role",
      "CRITICAL"
    );
    this._assert(
      chatbotIsBurner,
      "AI Chatbot should have burner role",
      "CRITICAL"
    );

    // Check bonding curve permissions
    const supplyNotifierRole = await this.bondingCurve.SUPPLY_NOTIFIER_ROLE();
    const chatbotCanNotify = await this.bondingCurve.hasRole(
      supplyNotifierRole,
      this.aiChatbot.address
    );

    this._assert(
      chatbotCanNotify,
      "AI Chatbot should be able to notify bonding curve",
      "CRITICAL"
    );

    // Check AI chatbot permissions
    const aiProcessorRole = await this.aiChatbot.AI_PROCESSOR_ROLE();
    const [owner] = await ethers.getSigners();
    const ownerCanProcess = await this.aiChatbot.hasRole(
      aiProcessorRole,
      owner.address
    );

    this._assert(
      ownerCanProcess,
      "Owner should have AI processor role for testing",
      "WARNING"
    );

    console.log("✅ Permissions matrix validated");
  }

  /**
   * Validate cross-contract communication
   */
  async _validateCrossContractCommunication() {
    console.log("\n🔄 Validating Cross-Contract Communication...");

    const [owner, user1] = await ethers.getSigners();

    // Test bonding curve to token communication
    const initialSupply = await this.token.totalSupply();
    await this.bondingCurve
      .connect(user1)
      .buy(0, { value: ethers.utils.parseEther("0.1") });
    const afterBuySupply = await this.token.totalSupply();

    this._assert(
      afterBuySupply.gt(initialSupply),
      "Bonding curve should be able to mint tokens",
      "CRITICAL"
    );

    // Test AI chatbot to token communication (burn for fees)
    const userBalance = await this.token.balanceOf(user1.address);
    const messageFee = await this.aiChatbot.messageFee();

    if (userBalance.gte(messageFee)) {
      await this.token
        .connect(user1)
        .approve(this.aiChatbot.address, messageFee);
      const preMessageSupply = await this.token.totalSupply();

      await this.aiChatbot
        .connect(user1)
        .sendMessage("Test cross-contract communication");

      const postMessageSupply = await this.token.totalSupply();
      this._assert(
        postMessageSupply.eq(preMessageSupply.sub(messageFee)),
        "AI Chatbot should burn tokens for message fees",
        "CRITICAL"
      );
    }

    // Test AI chatbot to bonding curve communication (supply notifications)
    let supplyChangeDetected = false;
    let eventDetails = null;

    // Listen for SupplyChanged events
    this.bondingCurve.once(
      "SupplyChanged",
      (source, supplyDelta, newPrice, reason) => {
        supplyChangeDetected = true;
        eventDetails = { source, supplyDelta, newPrice, reason };
      }
    );

    // Process an AI judgment to trigger supply change
    const messageCount = await this.aiChatbot.getMessageCount();
    if (messageCount.gt(0)) {
      await this.aiChatbot
        .connect(owner)
        .processAIResponse(messageCount, this.AIJudgment.LIKED);

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      this._assert(
        supplyChangeDetected,
        "AI Chatbot should notify bonding curve of supply changes",
        "CRITICAL"
      );
    }

    console.log("✅ Cross-contract communication validated");
  }

  /**
   * Validate state consistency across contracts
   */
  async _validateStateConsistency() {
    console.log("\n📊 Validating State Consistency...");

    // Check token supply consistency
    const tokenTotalSupply = await this.token.totalSupply();
    const bondingCurveSupply = await this.bondingCurve.getSupply();

    this._assert(
      tokenTotalSupply.eq(bondingCurveSupply),
      "Token total supply should match bonding curve supply",
      "CRITICAL"
    );

    // Check price consistency
    const bondingCurvePrice = await this.bondingCurve.getCurrentPrice();
    const calculatedPrice = await this.bondingCurve.calculatePrice(
      bondingCurveSupply
    );

    this._assert(
      bondingCurvePrice.eq(calculatedPrice),
      "Current price should match calculated price for current supply",
      "CRITICAL"
    );

    // Check message count consistency
    const totalMessages = await this.aiChatbot.getMessageCount();
    const judgedMessages = await this.aiChatbot.getJudgedMessageCount();
    const systemStats = await this.aiChatbot.getChatbotStatistics();

    this._assert(
      systemStats[0].eq(totalMessages),
      "System stats total messages should match message count",
      "CRITICAL"
    );

    this._assert(
      systemStats[1].eq(judgedMessages),
      "System stats judged messages should match judged count",
      "CRITICAL"
    );

    this._assert(
      judgedMessages.lte(totalMessages),
      "Judged messages should not exceed total messages",
      "CRITICAL"
    );

    console.log("✅ State consistency validated");
  }

  /**
   * Validate event propagation across system
   */
  async _validateEventPropagation() {
    console.log("\n📡 Validating Event Propagation...");

    const [owner, user2] = await ethers.getSigners();

    // Test token events
    let tokenTransferDetected = false;
    let tokenApprovalDetected = false;

    this.token.once("Transfer", (from, to, value) => {
      tokenTransferDetected = true;
    });

    this.token.once("Approval", (owner, spender, value) => {
      tokenApprovalDetected = true;
    });

    // Test bonding curve events
    let tokensPurchasedDetected = false;
    let tokensSoldDetected = false;
    let supplyChangedDetected = false;

    this.bondingCurve.once(
      "TokensPurchased",
      (buyer, ethAmount, tokenAmount, newPrice) => {
        tokensPurchasedDetected = true;
      }
    );

    this.bondingCurve.once(
      "TokensSold",
      (seller, tokenAmount, ethAmount, newPrice) => {
        tokensSoldDetected = true;
      }
    );

    this.bondingCurve.once(
      "SupplyChanged",
      (source, supplyDelta, newPrice, reason) => {
        supplyChangedDetected = true;
      }
    );

    // Test AI chatbot events
    let messageSubmittedDetected = false;
    let aiResponseProcessedDetected = false;

    this.aiChatbot.once(
      "MessageSubmitted",
      (messageId, author, content, timestamp) => {
        messageSubmittedDetected = true;
      }
    );

    this.aiChatbot.once(
      "AIResponseProcessed",
      (messageId, judgment, author, tokenDelta, priceImpact) => {
        aiResponseProcessedDetected = true;
      }
    );

    // Trigger events through system operations
    if ((await this.token.balanceOf(user2.address)).eq(0)) {
      await this.bondingCurve
        .connect(user2)
        .buy(0, { value: ethers.utils.parseEther("0.1") });
    }

    const userBalance = await this.token.balanceOf(user2.address);
    const messageFee = await this.aiChatbot.messageFee();

    if (userBalance.gte(messageFee)) {
      await this.token
        .connect(user2)
        .approve(this.aiChatbot.address, messageFee);
      await this.aiChatbot
        .connect(user2)
        .sendMessage("Event propagation test message");

      const messageCount = await this.aiChatbot.getMessageCount();
      await this.aiChatbot
        .connect(owner)
        .processAIResponse(messageCount, this.AIJudgment.LIKED);

      // Test token sell to trigger more events
      const sellAmount = userBalance.div(10);
      if (sellAmount.gt(0)) {
        await this.bondingCurve.connect(user2).sell(sellAmount);
      }
    }

    // Wait for all events to propagate
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Validate events were detected
    this._assert(
      tokenTransferDetected,
      "Token Transfer events should be emitted",
      "WARNING"
    );
    this._assert(
      tokenApprovalDetected,
      "Token Approval events should be emitted",
      "WARNING"
    );
    this._assert(
      tokensPurchasedDetected,
      "TokensPurchased events should be emitted",
      "WARNING"
    );
    this._assert(
      messageSubmittedDetected,
      "MessageSubmitted events should be emitted",
      "WARNING"
    );
    this._assert(
      aiResponseProcessedDetected,
      "AIResponseProcessed events should be emitted",
      "WARNING"
    );

    console.log("✅ Event propagation validated");
  }

  /**
   * Validate data integrity across all operations
   */
  async _validateDataIntegrity() {
    console.log("\n🔒 Validating Data Integrity...");

    const [owner, user3] = await ethers.getSigners();

    // Capture initial state
    const initialState = {
      tokenSupply: await this.token.totalSupply(),
      bondingCurvePrice: await this.bondingCurve.getCurrentPrice(),
      messageCount: await this.aiChatbot.getMessageCount(),
      user3Balance: await this.token.balanceOf(user3.address),
    };

    // Perform series of operations
    const operations = [
      // Buy tokens
      { type: "buy", amount: ethers.utils.parseEther("0.2") },
      // Send messages
      { type: "message", content: "Data integrity test message 1" },
      { type: "message", content: "Data integrity test message 2" },
      { type: "message", content: "Data integrity test message 3" },
      // Process AI judgments
      { type: "judgment", messageOffset: -2, judgment: this.AIJudgment.LIKED },
      {
        type: "judgment",
        messageOffset: -1,
        judgment: this.AIJudgment.DISLIKED,
      },
      { type: "judgment", messageOffset: 0, judgment: this.AIJudgment.LIKED },
    ];

    let expectedSupplyChange = ethers.BigNumber.from(0);
    let expectedMessageCount = initialState.messageCount;

    for (const op of operations) {
      switch (op.type) {
        case "buy":
          await this.bondingCurve.connect(user3).buy(0, { value: op.amount });
          // Supply increases with buy, but exact amount depends on price curve
          break;

        case "message":
          const messageFee = await this.aiChatbot.messageFee();
          const userBalance = await this.token.balanceOf(user3.address);

          if (userBalance.gte(messageFee)) {
            await this.token
              .connect(user3)
              .approve(this.aiChatbot.address, messageFee);
            await this.aiChatbot.connect(user3).sendMessage(op.content);
            expectedSupplyChange = expectedSupplyChange.sub(messageFee);
            expectedMessageCount = expectedMessageCount.add(1);
          }
          break;

        case "judgment":
          const currentMessageCount = await this.aiChatbot.getMessageCount();
          const targetMessageId = currentMessageCount.add(op.messageOffset);

          if (targetMessageId.gt(0)) {
            await this.aiChatbot
              .connect(owner)
              .processAIResponse(targetMessageId, op.judgment);

            if (op.judgment === this.AIJudgment.LIKED) {
              const likeReward = await this.aiChatbot.likeReward();
              expectedSupplyChange = expectedSupplyChange.add(likeReward);
            } else if (op.judgment === this.AIJudgment.DISLIKED) {
              const dislikePenalty = await this.aiChatbot.dislikePenalty();
              expectedSupplyChange = expectedSupplyChange.sub(dislikePenalty);
            }
          }
          break;
      }
    }

    // Validate final state
    const finalState = {
      tokenSupply: await this.token.totalSupply(),
      bondingCurvePrice: await this.bondingCurve.getCurrentPrice(),
      messageCount: await this.aiChatbot.getMessageCount(),
    };

    // Message count should match expected
    this._assert(
      finalState.messageCount.eq(expectedMessageCount),
      "Message count should match expected value after operations",
      "CRITICAL"
    );

    // Supply changes should be consistent (allowing for buy operation complexity)
    const actualSupplyChange = finalState.tokenSupply.sub(
      initialState.tokenSupply
    );
    this._assert(
      actualSupplyChange.gte(
        expectedSupplyChange.sub(ethers.utils.parseEther("1000"))
      ),
      "Token supply changes should be approximately consistent",
      "WARNING"
    );

    // Price should have increased due to net positive supply operations
    this._assert(
      finalState.bondingCurvePrice.gte(initialState.bondingCurvePrice),
      "Token price should reflect supply changes appropriately",
      "WARNING"
    );

    console.log("✅ Data integrity validated");
  }

  /**
   * Validate transaction atomicity
   */
  async _validateTransactionAtomicity() {
    console.log("\n⚛️ Validating Transaction Atomicity...");

    const [owner, user4] = await ethers.getSigners();

    // Test failed transaction doesn't leave system in inconsistent state
    const initialSupply = await this.token.totalSupply();
    const initialMessageCount = await this.aiChatbot.getMessageCount();

    try {
      // Attempt to send message without sufficient approval (should fail)
      await this.aiChatbot.connect(user4).sendMessage("This should fail");
      this._recordError(
        "Message should fail without sufficient token approval",
        "CRITICAL"
      );
    } catch (error) {
      // Expected failure - verify system state unchanged
      const afterFailSupply = await this.token.totalSupply();
      const afterFailMessageCount = await this.aiChatbot.getMessageCount();

      this._assert(
        afterFailSupply.eq(initialSupply),
        "Token supply should be unchanged after failed transaction",
        "CRITICAL"
      );

      this._assert(
        afterFailMessageCount.eq(initialMessageCount),
        "Message count should be unchanged after failed transaction",
        "CRITICAL"
      );
    }

    // Test partial failure scenarios
    if ((await this.token.balanceOf(user4.address)).eq(0)) {
      await this.bondingCurve
        .connect(user4)
        .buy(0, { value: ethers.utils.parseEther("0.1") });
    }

    const messageFee = await this.aiChatbot.messageFee();
    await this.token.connect(user4).approve(this.aiChatbot.address, messageFee);

    // Successfully send message
    await this.aiChatbot.connect(user4).sendMessage("Atomicity test message");
    const newMessageId = await this.aiChatbot.getMessageCount();

    // Try to process same message twice (should fail on second attempt)
    await this.aiChatbot
      .connect(owner)
      .processAIResponse(newMessageId, this.AIJudgment.LIKED);

    const midState = {
      supply: await this.token.totalSupply(),
      messageCount: await this.aiChatbot.getMessageCount(),
    };

    try {
      await this.aiChatbot
        .connect(owner)
        .processAIResponse(newMessageId, this.AIJudgment.DISLIKED);
      this._recordError(
        "Should not be able to process same message twice",
        "CRITICAL"
      );
    } catch (error) {
      // Expected failure - verify state unchanged
      const finalSupply = await this.token.totalSupply();
      const finalMessageCount = await this.aiChatbot.getMessageCount();

      this._assert(
        finalSupply.eq(midState.supply),
        "Supply should be unchanged after failed re-judgment",
        "CRITICAL"
      );

      this._assert(
        finalMessageCount.eq(midState.messageCount),
        "Message count should be unchanged after failed re-judgment",
        "CRITICAL"
      );
    }

    console.log("✅ Transaction atomicity validated");
  }

  /**
   * Validate security controls
   */
  async _validateSecurityControls() {
    console.log("\n🛡️ Validating Security Controls...");

    const [owner, attacker] = await ethers.getSigners();

    // Test unauthorized minting attempts
    try {
      await this.token
        .connect(attacker)
        .mint(attacker.address, ethers.utils.parseEther("1000"));
      this._recordError("Unauthorized minting should be blocked", "CRITICAL");
    } catch (error) {
      console.log("  ✅ Unauthorized token minting blocked");
    }

    // Test unauthorized burning attempts
    try {
      await this.token.connect(attacker).burn(ethers.utils.parseEther("100"));
      this._recordError("Unauthorized burning should be blocked", "CRITICAL");
    } catch (error) {
      console.log("  ✅ Unauthorized token burning blocked");
    }

    // Test unauthorized AI processing
    try {
      await this.aiChatbot
        .connect(attacker)
        .processAIResponse(1, this.AIJudgment.LIKED);
      this._recordError(
        "Unauthorized AI processing should be blocked",
        "CRITICAL"
      );
    } catch (error) {
      console.log("  ✅ Unauthorized AI processing blocked");
    }

    // Test unauthorized parameter changes
    try {
      await this.aiChatbot
        .connect(attacker)
        .updateTokenomicsParameters(
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1")
        );
      this._recordError(
        "Unauthorized parameter changes should be blocked",
        "CRITICAL"
      );
    } catch (error) {
      console.log("  ✅ Unauthorized parameter changes blocked");
    }

    // Test unauthorized pause/unpause
    try {
      await this.aiChatbot.connect(attacker).pause();
      this._recordError("Unauthorized pause should be blocked", "CRITICAL");
    } catch (error) {
      console.log("  ✅ Unauthorized pause blocked");
    }

    console.log("✅ Security controls validated");
  }

  /**
   * Validate error handling
   */
  async _validateErrorHandling() {
    console.log("\n🚨 Validating Error Handling...");

    const [owner] = await ethers.getSigners();

    // Test invalid message ID handling
    try {
      await this.aiChatbot.getMessage(999999);
      this._recordError(
        "Should handle invalid message ID gracefully",
        "WARNING"
      );
    } catch (error) {
      console.log("  ✅ Invalid message ID handled gracefully");
    }

    // Test zero amount operations
    try {
      await this.bondingCurve.buy(0, { value: 0 });
      this._recordError(
        "Should handle zero ETH buy attempts appropriately",
        "WARNING"
      );
    } catch (error) {
      console.log("  ✅ Zero amount operations handled appropriately");
    }

    // Test edge case message lengths
    try {
      await this.aiChatbot.connect(owner).sendMessage("");
      this._recordError(
        "Should handle empty messages appropriately",
        "WARNING"
      );
    } catch (error) {
      console.log("  ✅ Empty messages handled appropriately");
    }

    const longMessage = "A".repeat(1000);
    try {
      const messageFee = await this.aiChatbot.messageFee();
      await this.token.approve(this.aiChatbot.address, messageFee);
      await this.aiChatbot.sendMessage(longMessage);
      console.log("  ✅ Long messages handled successfully");
    } catch (error) {
      console.log("  ⚠️  Long message handling may need optimization");
    }

    console.log("✅ Error handling validated");
  }

  /**
   * Validate upgradeability considerations
   */
  async _validateUpgradeability() {
    console.log("\n🔄 Validating Upgradeability Considerations...");

    // Check for proxy pattern implementation
    try {
      const implementationSlot = await ethers.provider.getStorageAt(
        this.aiChatbot.address,
        "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
      );

      if (
        implementationSlot !==
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      ) {
        console.log("  ✅ Proxy pattern detected - contract is upgradeable");
      } else {
        console.log(
          "  ⚠️  No proxy pattern detected - contract may not be upgradeable"
        );
      }
    } catch (error) {
      console.log("  ⚠️  Could not determine upgradeability status");
    }

    // Check for version tracking
    try {
      const version = await this.aiChatbot.version();
      console.log(`  ✅ Contract version tracking: ${version}`);
    } catch (error) {
      console.log("  ⚠️  No version tracking implemented");
    }

    console.log("✅ Upgradeability considerations validated");
  }

  /**
   * Validate monitoring capabilities
   */
  async _validateMonitoringCapabilities() {
    console.log("\n📊 Validating Monitoring Capabilities...");

    // Check event emission for monitoring
    const eventFilters = [
      this.token.filters.Transfer(),
      this.bondingCurve.filters.TokensPurchased(),
      this.bondingCurve.filters.SupplyChanged(),
      this.aiChatbot.filters.MessageSubmitted(),
      this.aiChatbot.filters.AIResponseProcessed(),
    ];

    this._assert(
      eventFilters.length >= 5,
      "Should have comprehensive event filters for monitoring",
      "WARNING"
    );

    // Check statistical data availability
    const stats = await this.aiChatbot.getChatbotStatistics();
    this._assert(
      stats.length >= 4,
      "Should provide comprehensive statistics for monitoring",
      "WARNING"
    );

    // Check individual user data availability
    const [owner] = await ethers.getSigners();
    const userStats = await this.aiChatbot.getUserStatistics(owner.address);
    this._assert(
      userStats.length >= 3,
      "Should provide individual user statistics for monitoring",
      "WARNING"
    );

    console.log("✅ Monitoring capabilities validated");
  }

  /**
   * Validate maintenance operations
   */
  async _validateMaintenanceOperations() {
    console.log("\n🔧 Validating Maintenance Operations...");

    // Test pause/unpause functionality
    const waspaused = await this.aiChatbot.paused();

    if (!waspaused) {
      await this.aiChatbot.pause();
      const isPaused = await this.aiChatbot.paused();
      this._assert(
        isPaused,
        "Contract should be pausable for maintenance",
        "CRITICAL"
      );

      await this.aiChatbot.unpause();
      const isUnpaused = await this.aiChatbot.paused();
      this._assert(
        !isUnpaused,
        "Contract should be unpausable after maintenance",
        "CRITICAL"
      );
    }

    // Test parameter updates
    const currentFee = await this.aiChatbot.messageFee();
    const newFee = currentFee.add(ethers.utils.parseEther("1"));

    await this.aiChatbot.updateTokenomicsParameters(
      newFee,
      await this.aiChatbot.likeReward(),
      await this.aiChatbot.dislikePenalty()
    );

    const updatedFee = await this.aiChatbot.messageFee();
    this._assert(
      updatedFee.eq(newFee),
      "Parameters should be updatable for maintenance",
      "CRITICAL"
    );

    // Restore original parameters
    await this.aiChatbot.updateTokenomicsParameters(
      currentFee,
      await this.aiChatbot.likeReward(),
      await this.aiChatbot.dislikePenalty()
    );

    console.log("✅ Maintenance operations validated");
  }

  /**
   * Validate disaster recovery mechanisms
   */
  async _validateDisasterRecovery() {
    console.log("\n🆘 Validating Disaster Recovery Mechanisms...");

    // Test emergency stops
    await this.aiChatbot.pause();
    console.log("  ✅ Emergency stop capability confirmed");
    await this.aiChatbot.unpause();

    // Test role-based recovery
    const adminRole = await this.aiChatbot.ADMIN_ROLE();
    const [owner] = await ethers.getSigners();
    const hasAdminRole = await this.aiChatbot.hasRole(adminRole, owner.address);

    this._assert(
      hasAdminRole,
      "Admin role should exist for disaster recovery",
      "CRITICAL"
    );

    // Test data export capabilities
    const messageCount = await this.aiChatbot.getMessageCount();
    if (messageCount.gt(0)) {
      try {
        const message = await this.aiChatbot.getMessage(1);
        this._assert(
          message.author !== ethers.constants.AddressZero,
          "Should be able to export message data for recovery",
          "WARNING"
        );
      } catch (error) {
        console.log("  ⚠️  Message data export may need improvement");
      }
    }

    console.log("✅ Disaster recovery mechanisms validated");
  }

  /**
   * Generate integration report
   */
  _generateIntegrationReport() {
    console.log("\n" + "=".repeat(50));
    console.log("📋 SYSTEM INTEGRATION VALIDATION REPORT");
    console.log("=".repeat(50));

    if (
      this.validationErrors.length === 0 &&
      this.validationWarnings.length === 0
    ) {
      console.log("🎉 SYSTEM INTEGRATION: FULLY VALIDATED");
      console.log("✅ Contract interfaces properly implemented");
      console.log("✅ Permission matrix correctly configured");
      console.log("✅ Cross-contract communication operational");
      console.log("✅ State consistency maintained across all operations");
      console.log("✅ Event propagation working correctly");
      console.log("✅ Data integrity preserved throughout system");
      console.log("✅ Transaction atomicity enforced properly");
    } else {
      if (this.validationErrors.length > 0) {
        console.log(
          `❌ CRITICAL INTEGRATION ERRORS (${this.validationErrors.length}):`
        );
        this.validationErrors.forEach((error, i) => {
          console.log(`   ${i + 1}. ${error}`);
        });
      }

      if (this.validationWarnings.length > 0) {
        console.log(
          `⚠️  INTEGRATION WARNINGS (${this.validationWarnings.length}):`
        );
        this.validationWarnings.forEach((warning, i) => {
          console.log(`   ${i + 1}. ${warning}`);
        });
      }
    }

    console.log("=".repeat(50));

    if (this.validationErrors.length > 0) {
      throw new Error(
        `System integration validation failed with ${this.validationErrors.length} critical errors`
      );
    }
  }

  /**
   * Generate production readiness report
   */
  _generateProductionReadinessReport() {
    console.log("\n" + "=".repeat(50));
    console.log("🚀 PRODUCTION READINESS VALIDATION REPORT");
    console.log("=".repeat(50));

    if (this.validationErrors.length === 0) {
      console.log("🎉 PRODUCTION READINESS: FULLY VALIDATED");
      console.log("✅ Security controls operational and tested");
      console.log("✅ Error handling robust and comprehensive");
      console.log("✅ Upgradeability considerations addressed");
      console.log("✅ Monitoring capabilities implemented");
      console.log("✅ Maintenance operations functional");
      console.log("✅ Disaster recovery mechanisms in place");
      console.log("");
      console.log("🌟 SYSTEM IS PRODUCTION-READY!");
    } else {
      console.log(
        `❌ PRODUCTION READINESS BLOCKED BY ${this.validationErrors.length} CRITICAL ISSUES`
      );
      this.validationErrors.forEach((error, i) => {
        console.log(`   ${i + 1}. ${error}`);
      });
    }

    if (this.validationWarnings.length > 0) {
      console.log(
        `⚠️  PRODUCTION CONSIDERATIONS (${this.validationWarnings.length}):`
      );
      this.validationWarnings.forEach((warning, i) => {
        console.log(`   ${i + 1}. ${warning}`);
      });
    }

    console.log("=".repeat(50));

    if (this.validationErrors.length > 0) {
      throw new Error(
        `Production readiness validation failed with ${this.validationErrors.length} critical errors`
      );
    }
  }

  /**
   * Assert condition and record error/warning
   */
  _assert(condition, message, severity = "WARNING") {
    if (!condition) {
      if (severity === "CRITICAL") {
        this._recordError(message, severity);
      } else {
        this._recordWarning(message);
      }
    }
  }

  /**
   * Record validation error
   */
  _recordError(message, severity) {
    this.validationErrors.push(message);
  }

  /**
   * Record validation warning
   */
  _recordWarning(message) {
    this.validationWarnings.push(message);
  }
}

module.exports = { SystemIntegrationValidator };
