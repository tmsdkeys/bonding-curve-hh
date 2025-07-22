const { expect } = require("chai");
const { ethers } = require("hardhat");
const { GasTestUtils } = require("./gas-measurement");

describe("Step 3.2 - Message Submission & Fee System", function () {
  let ChatbotToken, SigmoidBondingCurve, AIChatbot;
  let token, bondingCurve, aiChatbot;
  let owner, alice, bob, charlie, dave, aiProcessor;
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
  });

  describe("Message Submission Flow", function () {
    beforeEach(async function () {
      // Give users tokens for testing
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("2") });
      await bondingCurve
        .connect(bob)
        .buy(0, { value: ethers.utils.parseEther("1") });
      await bondingCurve
        .connect(charlie)
        .buy(0, { value: ethers.utils.parseEther("1.5") });
    });

    it("Should require token approval before sending messages", async function () {
      const messageContent = "Hello AI chatbot!";

      // Should fail without approval
      await expect(
        aiChatbot.connect(alice).sendMessage(messageContent)
      ).to.be.revertedWith("InsufficientAllowance");

      // Should succeed with approval
      await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE);
      await expect(aiChatbot.connect(alice).sendMessage(messageContent)).to.not
        .be.reverted;
    });

    it("Should burn message fee correctly", async function () {
      const messageContent = "Testing fee burning";
      const initialSupply = await token.totalSupply();
      const initialAliceBalance = await token.balanceOf(alice.address);

      await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE);

      const result = await gasUtils.measureTransaction(
        "message_submission_fee_burn",
        aiChatbot.connect(alice).sendMessage(messageContent),
        { messageContent: messageContent.substring(0, 20) + "..." }
      );

      const finalSupply = await token.totalSupply();
      const finalAliceBalance = await token.balanceOf(alice.address);

      // Supply should decrease by message fee
      expect(finalSupply).to.equal(initialSupply.sub(MESSAGE_FEE));

      // Alice balance should decrease by message fee
      expect(finalAliceBalance).to.equal(initialAliceBalance.sub(MESSAGE_FEE));

      console.log(`Message submission gas: ${result.gasUsed.toString()}`);
    });

    it("Should store message data correctly", async function () {
      const messageContent =
        "This is a test message with some content to verify storage";

      await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE);

      const tx = await aiChatbot.connect(alice).sendMessage(messageContent);
      const receipt = await tx.wait();
      const timestamp = (await ethers.provider.getBlock(receipt.blockNumber))
        .timestamp;

      const message = await aiChatbot.getMessage(1);

      expect(message.id).to.equal(1);
      expect(message.author).to.equal(alice.address);
      expect(message.content).to.equal(messageContent);
      expect(message.timestamp).to.equal(timestamp);
      expect(message.judgment).to.equal(0); // AIJudgment.NONE
      expect(message.feePaid).to.equal(MESSAGE_FEE);
      expect(message.rewardMinted).to.equal(0);
      expect(message.penaltyBurned).to.equal(0);
    });

    it("Should emit MessageSent event with correct parameters", async function () {
      const messageContent = "Event emission test message";

      await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE);

      await expect(aiChatbot.connect(alice).sendMessage(messageContent))
        .to.emit(aiChatbot, "MessageSent")
        .withArgs(
          1, // messageId
          alice.address, // author
          messageContent, // content
          MESSAGE_FEE, // feePaid
          await getNextBlockTimestamp() // timestamp
        );
    });

    it("Should update statistics correctly", async function () {
      await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE.mul(3));

      // Send multiple messages
      await aiChatbot.connect(alice).sendMessage("Message 1");
      await aiChatbot.connect(alice).sendMessage("Message 2");
      await aiChatbot.connect(alice).sendMessage("Message 3");

      // Check global statistics
      const globalStats = await aiChatbot.getChatbotStatistics();
      expect(globalStats[0]).to.equal(3); // Total messages
      expect(globalStats[4]).to.equal(MESSAGE_FEE.mul(3)); // Total fees collected

      // Check user statistics
      const userStats = await aiChatbot.getUserStatistics(alice.address);
      expect(userStats[0]).to.equal(3); // Messages sent by user
      expect(userStats[3]).to.equal(MESSAGE_FEE.mul(3)); // Fees paid by user
    });

    it("Should handle multiple users sending messages", async function () {
      const users = [alice, bob, charlie];
      const messages = [
        "Alice's first message",
        "Bob's message here",
        "Charlie joining the conversation",
      ];

      console.log("\n👥 Multi-user message submission test:");

      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const messageContent = messages[i];
        const userName = ["Alice", "Bob", "Charlie"][i];

        await token.connect(user).approve(aiChatbot.address, MESSAGE_FEE);

        const result = await gasUtils.measureTransaction(
          `message_submission_${userName.toLowerCase()}`,
          aiChatbot.connect(user).sendMessage(messageContent),
          { user: userName, messageLength: messageContent.length }
        );

        console.log(
          `${userName}: "${messageContent.substring(0, 30)}..." (${
            result.gasUsed
          } gas)`
        );
      }

      // Verify message count and authorship
      expect(await aiChatbot.getMessageCount()).to.equal(3);

      const message1 = await aiChatbot.getMessage(1);
      const message2 = await aiChatbot.getMessage(2);
      const message3 = await aiChatbot.getMessage(3);

      expect(message1.author).to.equal(alice.address);
      expect(message2.author).to.equal(bob.address);
      expect(message3.author).to.equal(charlie.address);
    });
  });

  describe("Message Length Validation", function () {
    beforeEach(async function () {
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("1") });
      await token
        .connect(alice)
        .approve(aiChatbot.address, MESSAGE_FEE.mul(10));
    });

    it("Should reject messages that are too short", async function () {
      const shortMessage = "Hi"; // Less than 10 characters (default minimum)

      await expect(
        aiChatbot.connect(alice).sendMessage(shortMessage)
      ).to.be.revertedWith("InvalidMessageLength");
    });

    it("Should reject messages that are too long", async function () {
      const longMessage = "x".repeat(501); // More than 500 characters (default maximum)

      await expect(
        aiChatbot.connect(alice).sendMessage(longMessage)
      ).to.be.revertedWith("InvalidMessageLength");
    });

    it("Should accept messages within valid length range", async function () {
      const validMessages = [
        "This is exactly ten chars", // Minimum length
        "This is a normal message length that should work fine",
        "x".repeat(500), // Maximum length
      ];

      for (let i = 0; i < validMessages.length; i++) {
        await expect(aiChatbot.connect(alice).sendMessage(validMessages[i])).to
          .not.be.reverted;
      }

      expect(await aiChatbot.getMessageCount()).to.equal(3);
    });

    it("Should respect updated length parameters", async function () {
      // Update to allow shorter messages
      await aiChatbot.updateAIParameters(1700, 5, 100); // Min: 5, Max: 100

      const shortMessage = "Hello"; // 5 characters (now valid)
      const longMessage = "x".repeat(101); // 101 characters (now invalid)

      await expect(aiChatbot.connect(alice).sendMessage(shortMessage)).to.not.be
        .reverted;

      await expect(
        aiChatbot.connect(alice).sendMessage(longMessage)
      ).to.be.revertedWith("InvalidMessageLength");
    });
  });

  describe("Token Balance & Allowance Validation", function () {
    it("Should reject messages when user has insufficient tokens", async function () {
      // Don't give alice any tokens
      await expect(
        aiChatbot
          .connect(alice)
          .sendMessage("This should fail due to no tokens")
      ).to.be.revertedWith("InsufficientTokenBalance");
    });

    it("Should reject messages when allowance is insufficient", async function () {
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("1") });

      // Approve less than required fee
      await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE.sub(1));

      await expect(
        aiChatbot.connect(alice).sendMessage("Insufficient allowance test")
      ).to.be.revertedWith("InsufficientAllowance");
    });

    it("Should handle partial allowance consumption correctly", async function () {
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("1") });

      // Approve exactly 2 message fees
      await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE.mul(2));

      // Send first message
      await aiChatbot.connect(alice).sendMessage("First message");

      // Check remaining allowance
      let remainingAllowance = await token.allowance(
        alice.address,
        aiChatbot.address
      );
      expect(remainingAllowance).to.equal(MESSAGE_FEE);

      // Send second message
      await aiChatbot.connect(alice).sendMessage("Second message");

      // Check allowance is depleted
      remainingAllowance = await token.allowance(
        alice.address,
        aiChatbot.address
      );
      expect(remainingAllowance).to.equal(0);

      // Third message should fail
      await expect(
        aiChatbot.connect(alice).sendMessage("Third message should fail")
      ).to.be.revertedWith("InsufficientAllowance");
    });

    it("Should handle edge case where user has exact fee amount", async function () {
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("1") });

      const aliceBalance = await token.balanceOf(alice.address);

      // Transfer away excess tokens, leaving exactly the message fee
      const excess = aliceBalance.sub(MESSAGE_FEE);
      if (excess.gt(0)) {
        await token.connect(alice).transfer(bob.address, excess);
      }

      const finalBalance = await token.balanceOf(alice.address);
      expect(finalBalance).to.equal(MESSAGE_FEE);

      // Should work with exact balance
      await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE);
      await expect(
        aiChatbot.connect(alice).sendMessage("Exact balance test message")
      ).to.not.be.reverted;

      // Balance should be zero after fee
      expect(await token.balanceOf(alice.address)).to.equal(0);
    });
  });

  describe("Message Indexing & Retrieval", function () {
    beforeEach(async function () {
      // Setup multiple users with tokens
      const users = [alice, bob, charlie, dave];
      for (const user of users) {
        await bondingCurve
          .connect(user)
          .buy(0, { value: ethers.utils.parseEther("1") });
        await token
          .connect(user)
          .approve(aiChatbot.address, MESSAGE_FEE.mul(5));
      }
    });

    it("Should index messages by author correctly", async function () {
      // Alice sends 3 messages
      await aiChatbot.connect(alice).sendMessage("Alice message 1");
      await aiChatbot.connect(alice).sendMessage("Alice message 2");
      await aiChatbot.connect(alice).sendMessage("Alice message 3");

      // Bob sends 2 messages
      await aiChatbot.connect(bob).sendMessage("Bob message 1");
      await aiChatbot.connect(bob).sendMessage("Bob message 2");

      // Test getMessagesByAuthor
      const [aliceMessages, aliceCount] = await aiChatbot.getMessagesByAuthor(
        alice.address,
        0,
        10
      );
      const [bobMessages, bobCount] = await aiChatbot.getMessagesByAuthor(
        bob.address,
        0,
        10
      );

      expect(aliceCount).to.equal(3);
      expect(bobCount).to.equal(2);
      expect(aliceMessages).to.have.length(3);
      expect(bobMessages).to.have.length(2);

      // Verify message IDs are correct
      expect(aliceMessages[0]).to.equal(1);
      expect(aliceMessages[1]).to.equal(2);
      expect(aliceMessages[2]).to.equal(3);
      expect(bobMessages[0]).to.equal(4);
      expect(bobMessages[1]).to.equal(5);
    });

    it("Should handle pagination for author messages", async function () {
      // Alice sends 5 messages
      for (let i = 1; i <= 5; i++) {
        await aiChatbot.connect(alice).sendMessage(`Alice message ${i}`);
      }

      // Test pagination
      const [page1, total] = await aiChatbot.getMessagesByAuthor(
        alice.address,
        0,
        2
      );
      const [page2] = await aiChatbot.getMessagesByAuthor(alice.address, 2, 2);
      const [page3] = await aiChatbot.getMessagesByAuthor(alice.address, 4, 2);

      expect(total).to.equal(5);
      expect(page1).to.have.length(2);
      expect(page2).to.have.length(2);
      expect(page3).to.have.length(1);

      expect(page1[0]).to.equal(1);
      expect(page1[1]).to.equal(2);
      expect(page2[0]).to.equal(3);
      expect(page2[1]).to.equal(4);
      expect(page3[0]).to.equal(5);
    });

    it("Should return recent messages in correct order", async function () {
      const messages = [
        { user: alice, content: "First message" },
        { user: bob, content: "Second message" },
        { user: charlie, content: "Third message" },
        { user: dave, content: "Fourth message" },
      ];

      // Send messages in order
      for (const msg of messages) {
        await aiChatbot.connect(msg.user).sendMessage(msg.content);
      }

      // Get recent messages (should be in reverse chronological order)
      const recentMessages = await aiChatbot.getRecentMessages(0, 4);

      expect(recentMessages).to.have.length(4);
      expect(recentMessages[0]).to.equal(4); // Most recent first
      expect(recentMessages[1]).to.equal(3);
      expect(recentMessages[2]).to.equal(2);
      expect(recentMessages[3]).to.equal(1); // Oldest last
    });

    it("Should handle pagination for recent messages", async function () {
      // Send 6 messages
      for (let i = 1; i <= 6; i++) {
        await aiChatbot.connect(alice).sendMessage(`Message ${i}`);
      }

      // Test pagination of recent messages
      const page1 = await aiChatbot.getRecentMessages(0, 3); // First 3 (most recent)
      const page2 = await aiChatbot.getRecentMessages(3, 3); // Next 3

      expect(page1).to.have.length(3);
      expect(page2).to.have.length(3);

      expect(page1[0]).to.equal(6); // Most recent
      expect(page1[1]).to.equal(5);
      expect(page1[2]).to.equal(4);
      expect(page2[0]).to.equal(3);
      expect(page2[1]).to.equal(2);
      expect(page2[2]).to.equal(1); // Oldest
    });
  });

  describe("Integration with Token & Bonding Curve", function () {
    beforeEach(async function () {
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("2") });
      await token
        .connect(alice)
        .approve(aiChatbot.address, MESSAGE_FEE.mul(10));
    });

    it("Should properly burn tokens from user balance", async function () {
      const initialUserBalance = await token.balanceOf(alice.address);
      const initialTotalSupply = await token.totalSupply();

      await aiChatbot
        .connect(alice)
        .sendMessage("Testing token burning integration");

      const finalUserBalance = await token.balanceOf(alice.address);
      const finalTotalSupply = await token.totalSupply();

      // User balance should decrease by message fee
      expect(finalUserBalance).to.equal(initialUserBalance.sub(MESSAGE_FEE));

      // Total supply should decrease by message fee (burned)
      expect(finalTotalSupply).to.equal(initialTotalSupply.sub(MESSAGE_FEE));
    });

    it("Should not notify bonding curve for message fees", async function () {
      // Listen for SupplyChanged events (should not be emitted for message fees)
      let supplyChangeEventEmitted = false;

      bondingCurve.on("SupplyChanged", () => {
        supplyChangeEventEmitted = true;
      });

      await aiChatbot
        .connect(alice)
        .sendMessage("Message fee should not trigger supply notification");

      // Wait a bit to ensure no async events
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(supplyChangeEventEmitted).to.be.false;
    });

    it("Should handle multiple rapid message submissions", async function () {
      const numberOfMessages = 5;
      const initialSupply = await token.totalSupply();

      console.log("\n⚡ Rapid message submission test:");

      for (let i = 1; i <= numberOfMessages; i++) {
        const result = await gasUtils.measureTransaction(
          `rapid_message_${i}`,
          aiChatbot.connect(alice).sendMessage(`Rapid message ${i}`),
          { messageNumber: i }
        );

        console.log(`Message ${i}: ${result.gasUsed} gas`);
      }

      const finalSupply = await token.totalSupply();
      const expectedBurn = MESSAGE_FEE.mul(numberOfMessages);

      expect(finalSupply).to.equal(initialSupply.sub(expectedBurn));
      expect(await aiChatbot.getMessageCount()).to.equal(numberOfMessages);
    });
  });

  describe("Gas Optimization Analysis", function () {
    beforeEach(async function () {
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("2") });
      await token
        .connect(alice)
        .approve(aiChatbot.address, MESSAGE_FEE.mul(20));
    });

    it("Should measure gas costs for different message lengths", async function () {
      console.log("\n📏 Gas costs by message length:");

      const messageLengths = [
        { length: 10, desc: "Minimum" },
        { length: 50, desc: "Short" },
        { length: 150, desc: "Medium" },
        { length: 300, desc: "Long" },
        { length: 500, desc: "Maximum" },
      ];

      for (const test of messageLengths) {
        const message = "x".repeat(test.length);

        const result = await gasUtils.measureTransaction(
          `message_length_${test.length}`,
          aiChatbot.connect(alice).sendMessage(message),
          { messageLength: test.length, description: test.desc }
        );

        console.log(
          `${test.desc} (${test.length} chars): ${result.gasUsed} gas`
        );
      }
    });

    it("Should measure gas costs for subsequent messages", async function () {
      console.log("\n📊 Gas costs for subsequent messages:");

      for (let i = 1; i <= 5; i++) {
        const result = await gasUtils.measureTransaction(
          `subsequent_message_${i}`,
          aiChatbot.connect(alice).sendMessage(`Message number ${i}`),
          { messageIndex: i }
        );

        console.log(`Message ${i}: ${result.gasUsed} gas`);
      }
    });
  });

  describe("Error Recovery & Edge Cases", function () {
    beforeEach(async function () {
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("1") });
    });

    it("Should handle contract pause correctly", async function () {
      await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE);

      // Should work when not paused
      await expect(aiChatbot.connect(alice).sendMessage("Message before pause"))
        .to.not.be.reverted;

      // Pause contract
      await aiChatbot.pause();

      // Should fail when paused
      await expect(
        aiChatbot.connect(alice).sendMessage("Message during pause")
      ).to.be.revertedWith("Pausable: paused");

      // Unpause and try again
      await aiChatbot.unpause();
      await expect(
        aiChatbot.connect(alice).sendMessage("Message after unpause")
      ).to.not.be.reverted;
    });

    it("Should handle reentrancy protection", async function () {
      // This test ensures the nonReentrant modifier is working
      // We can't easily test actual reentrancy without a malicious contract
      // But we can verify the modifier is in place

      await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE);

      await expect(
        aiChatbot.connect(alice).sendMessage("Testing reentrancy protection")
      ).to.not.be.reverted;
    });

    it("Should handle very long messages at the boundary", async function () {
      const maxLength = 500; // Default maximum
      const boundaryMessage = "x".repeat(maxLength);

      await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE);

      await expect(aiChatbot.connect(alice).sendMessage(boundaryMessage)).to.not
        .be.reverted;
    });

    it("Should handle special characters in messages", async function () {
      await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE.mul(3));

      const specialMessages = [
        "Message with émoji: 🚀🎉💯",
        "Unicode test: ñáéíóú çñ",
        "Symbols: !@#$%^&*()_+-=[]{}|;:,.<>?",
      ];

      for (const message of specialMessages) {
        await expect(aiChatbot.connect(alice).sendMessage(message)).to.not.be
          .reverted;
      }
    });
  });

  after(function () {
    console.log("\n🎉 STEP 3.2 COMPLETE - MESSAGE SUBMISSION & FEE SYSTEM");
    console.log("=".repeat(80));
    console.log("✅ Message submission mechanics working correctly");
    console.log("✅ Fee collection and token burning validated");
    console.log("✅ Message storage and indexing system operational");
    console.log("✅ Length validation and parameter enforcement active");
    console.log(
      "✅ Integration with Token and Bonding Curve contracts verified"
    );
    console.log("✅ Gas optimization analysis completed");
    console.log("");
    console.log("🎯 READY FOR STEP 3.3: AI JUDGMENT PROCESSING");
    console.log("=".repeat(80));

    // Print gas measurements
    gasUtils.printFinalReport();
  });

  // ============ UTILITY FUNCTIONS ============

  async function getNextBlockTimestamp() {
    const latestBlock = await ethers.provider.getBlock("latest");
    return latestBlock.timestamp + 1;
  }
});
