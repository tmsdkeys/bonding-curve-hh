const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AIChatbot - Core Architecture", function () {
  let ChatbotToken, SigmoidBondingCurve, AIChatbot;
  let token, bondingCurve, aiChatbot;
  let owner, alice, bob, charlie, aiProcessor;

  // Test parameters
  const PRICE_PRECISION = ethers.BigNumber.from("100000000"); // 1e8
  const A = PRICE_PRECISION.mul(1000); // Max price: 1000
  const k = ethers.utils.parseEther("0.001"); // Steepness: 0.001
  const B = ethers.utils.parseEther("10000"); // Inflection: 10,000 tokens

  // Tokenomics parameters (from Step 1 validation)
  const MESSAGE_FEE = ethers.utils.parseEther("10"); // 10 CBT
  const LIKE_REWARD = ethers.utils.parseEther("100"); // 100 CBT
  const DISLIKE_PENALTY = ethers.utils.parseEther("50"); // 50 CBT

  beforeEach(async function () {
    [owner, alice, bob, charlie, aiProcessor] = await ethers.getSigners();

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
    const MINTER_ROLE = await token.MINTER_ROLE();
    const BURNER_ROLE = await token.BURNER_ROLE();
    const SUPPLY_NOTIFIER_ROLE = await bondingCurve.SUPPLY_NOTIFIER_ROLE();

    await token.grantRole(MINTER_ROLE, bondingCurve.address);
    await token.grantRole(BURNER_ROLE, bondingCurve.address);
    await token.grantRole(MINTER_ROLE, aiChatbot.address);
    await token.grantRole(BURNER_ROLE, aiChatbot.address);
    await bondingCurve.grantRole(SUPPLY_NOTIFIER_ROLE, aiChatbot.address);

    // Grant AI processor role
    const AI_PROCESSOR_ROLE = await aiChatbot.AI_PROCESSOR_ROLE();
    await aiChatbot.grantRole(AI_PROCESSOR_ROLE, aiProcessor.address);
  });

  describe("Deployment & Initialization", function () {
    it("Should deploy with correct parameters", async function () {
      expect(await aiChatbot.token()).to.equal(token.address);
      expect(await aiChatbot.bondingCurve()).to.equal(bondingCurve.address);
      expect(await aiChatbot.messageFee()).to.equal(MESSAGE_FEE);
      expect(await aiChatbot.likeReward()).to.equal(LIKE_REWARD);
      expect(await aiChatbot.dislikePenalty()).to.equal(DISLIKE_PENALTY);
    });

    it("Should have correct initial state", async function () {
      expect(await aiChatbot.getMessageCount()).to.equal(0);
      expect(await aiChatbot.getJudgedMessageCount()).to.equal(0);
      expect(await aiChatbot.totalLikes()).to.equal(0);
      expect(await aiChatbot.totalDislikes()).to.equal(0);
      expect(await aiChatbot.paused()).to.be.false;
    });

    it("Should have correct tokenomics parameters", async function () {
      const params = await aiChatbot.getTokenomicsParameters();
      expect(params[0]).to.equal(MESSAGE_FEE);
      expect(params[1]).to.equal(LIKE_REWARD);
      expect(params[2]).to.equal(DISLIKE_PENALTY);
      expect(params[3]).to.equal(1700); // 17% judgment probability
    });

    it("Should reject invalid constructor parameters", async function () {
      await expect(
        AIChatbot.deploy(
          ethers.constants.AddressZero, // Invalid token
          bondingCurve.address,
          MESSAGE_FEE,
          LIKE_REWARD,
          DISLIKE_PENALTY,
          owner.address
        )
      ).to.be.revertedWith("Invalid token address");

      await expect(
        AIChatbot.deploy(
          token.address,
          bondingCurve.address,
          0, // Invalid message fee
          LIKE_REWARD,
          DISLIKE_PENALTY,
          owner.address
        )
      ).to.be.revertedWith("Message fee cannot be zero");
    });
  });

  describe("Role Management", function () {
    it("Should have correct initial roles", async function () {
      const ADMIN_ROLE = await aiChatbot.ADMIN_ROLE();
      const AI_PROCESSOR_ROLE = await aiChatbot.AI_PROCESSOR_ROLE();

      expect(await aiChatbot.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
      expect(await aiChatbot.hasRole(AI_PROCESSOR_ROLE, owner.address)).to.be
        .true;
      expect(await aiChatbot.hasRole(AI_PROCESSOR_ROLE, aiProcessor.address)).to
        .be.true;
    });

    it("Should allow admin to grant roles", async function () {
      const AI_PROCESSOR_ROLE = await aiChatbot.AI_PROCESSOR_ROLE();

      await aiChatbot.grantRole(AI_PROCESSOR_ROLE, alice.address);
      expect(await aiChatbot.hasRole(AI_PROCESSOR_ROLE, alice.address)).to.be
        .true;
    });

    it("Should not allow non-admin to grant roles", async function () {
      const AI_PROCESSOR_ROLE = await aiChatbot.AI_PROCESSOR_ROLE();

      await expect(
        aiChatbot.connect(alice).grantRole(AI_PROCESSOR_ROLE, bob.address)
      ).to.be.reverted;
    });
  });

  describe("Interface Compliance", function () {
    it("Should implement IAIChatbot interface correctly", async function () {
      // Test all required functions exist
      expect(typeof aiChatbot.sendMessage).to.equal("function");
      expect(typeof aiChatbot.processAIResponse).to.equal("function");
      expect(typeof aiChatbot.getUserBalance).to.equal("function");
      expect(typeof aiChatbot.getMessageCount).to.equal("function");
      expect(typeof aiChatbot.getJudgedMessageCount).to.equal("function");
    });

    it("Should have correct enum values", async function () {
      // Test AIJudgment enum values (NONE=0, LIKED=1, DISLIKED=2)
      // We can test this by creating a message and checking initial judgment

      // First, get user some tokens and approve
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("1") });
      await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE);

      // Send message
      await aiChatbot.connect(alice).sendMessage("Test message");

      const message = await aiChatbot.getMessage(1);
      expect(message.judgment).to.equal(0); // AIJudgment.NONE
    });
  });

  describe("Message Storage & Indexing", function () {
    beforeEach(async function () {
      // Give users tokens and approve
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("1") });
      await bondingCurve
        .connect(bob)
        .buy(0, { value: ethers.utils.parseEther("1") });

      await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE.mul(5));
      await token.connect(bob).approve(aiChatbot.address, MESSAGE_FEE.mul(5));
    });

    it("Should store messages correctly", async function () {
      const messageContent = "Hello AI chatbot!";

      await aiChatbot.connect(alice).sendMessage(messageContent);

      const message = await aiChatbot.getMessage(1);
      expect(message.id).to.equal(1);
      expect(message.author).to.equal(alice.address);
      expect(message.content).to.equal(messageContent);
      expect(message.judgment).to.equal(0); // NONE
      expect(message.feePaid).to.equal(MESSAGE_FEE);
      expect(message.rewardMinted).to.equal(0);
      expect(message.penaltyBurned).to.equal(0);
    });

    it("Should increment message IDs correctly", async function () {
      await aiChatbot.connect(alice).sendMessage("Message 1");
      await aiChatbot.connect(bob).sendMessage("Message 2");
      await aiChatbot.connect(alice).sendMessage("Message 3");

      expect(await aiChatbot.getMessageCount()).to.equal(3);

      const message1 = await aiChatbot.getMessage(1);
      const message2 = await aiChatbot.getMessage(2);
      const message3 = await aiChatbot.getMessage(3);

      expect(message1.author).to.equal(alice.address);
      expect(message2.author).to.equal(bob.address);
      expect(message3.author).to.equal(alice.address);
    });

    it("Should index messages by author correctly", async function () {
      await aiChatbot.connect(alice).sendMessage("Alice message 1");
      await aiChatbot.connect(bob).sendMessage("Bob message 1");
      await aiChatbot.connect(alice).sendMessage("Alice message 2");

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

      expect(aliceCount).to.equal(2);
      expect(bobCount).to.equal(1);
      expect(aliceMessages).to.have.length(2);
      expect(bobMessages).to.have.length(1);
      expect(aliceMessages[0]).to.equal(1);
      expect(aliceMessages[1]).to.equal(3);
      expect(bobMessages[0]).to.equal(2);
    });

    it("Should handle pagination correctly", async function () {
      // Send multiple messages
      for (let i = 0; i < 5; i++) {
        await aiChatbot.connect(alice).sendMessage(`Message ${i + 1}`);
      }

      // Test pagination
      const [page1, total] = await aiChatbot.getMessagesByAuthor(
        alice.address,
        0,
        2
      );
      const [page2] = await aiChatbot.getMessagesByAuthor(alice.address, 2, 2);

      expect(total).to.equal(5);
      expect(page1).to.have.length(2);
      expect(page2).to.have.length(2);
      expect(page1[0]).to.equal(1);
      expect(page1[1]).to.equal(2);
      expect(page2[0]).to.equal(3);
      expect(page2[1]).to.equal(4);
    });

    it("Should return recent messages in reverse chronological order", async function () {
      await aiChatbot.connect(alice).sendMessage("First message");
      await aiChatbot.connect(bob).sendMessage("Second message");
      await aiChatbot.connect(alice).sendMessage("Third message");

      const recentMessages = await aiChatbot.getRecentMessages(0, 3);

      expect(recentMessages).to.have.length(3);
      expect(recentMessages[0]).to.equal(3); // Most recent first
      expect(recentMessages[1]).to.equal(2);
      expect(recentMessages[2]).to.equal(1);
    });
  });

  describe("Statistics Tracking", function () {
    beforeEach(async function () {
      // Setup tokens
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("1") });
      await token
        .connect(alice)
        .approve(aiChatbot.address, MESSAGE_FEE.mul(10));
    });

    it("Should track global statistics correctly", async function () {
      await aiChatbot.connect(alice).sendMessage("Test message");

      const stats = await aiChatbot.getChatbotStatistics();
      expect(stats[0]).to.equal(1); // Total messages
      expect(stats[1]).to.equal(0); // Total judged
      expect(stats[2]).to.equal(0); // Total likes
      expect(stats[3]).to.equal(0); // Total dislikes
      expect(stats[4]).to.equal(MESSAGE_FEE); // Total fees collected
      expect(stats[5]).to.equal(0); // Total rewards distributed
      expect(stats[6]).to.equal(0); // Total penalties applied
    });

    it("Should track user statistics correctly", async function () {
      await aiChatbot.connect(alice).sendMessage("Test message");

      const userStats = await aiChatbot.getUserStatistics(alice.address);
      expect(userStats[0]).to.equal(1); // Messages sent
      expect(userStats[1]).to.equal(0); // Likes received
      expect(userStats[2]).to.equal(0); // Dislikes received
      expect(userStats[3]).to.equal(MESSAGE_FEE); // Fees paid
      expect(userStats[4]).to.equal(0); // Rewards earned
      expect(userStats[5]).to.equal(0); // Net token change (negative due to fee)
    });

    it("Should return correct user balance", async function () {
      const initialBalance = await token.balanceOf(alice.address);
      const chatbotBalance = await aiChatbot.getUserBalance(alice.address);

      expect(chatbotBalance).to.equal(initialBalance);
    });
  });

  describe("Parameter Validation", function () {
    it("Should validate tokenomics parameters", async function () {
      const PARAMETER_UPDATER_ROLE = await aiChatbot.PARAMETER_UPDATER_ROLE();

      // Test invalid message fee (zero)
      await expect(
        aiChatbot.updateTokenomics(0, LIKE_REWARD, DISLIKE_PENALTY)
      ).to.be.revertedWith("Message fee cannot be zero");

      // Test invalid like reward (less than message fee)
      await expect(
        aiChatbot.updateTokenomics(
          MESSAGE_FEE,
          MESSAGE_FEE.div(2),
          DISLIKE_PENALTY
        )
      ).to.be.revertedWith("Like reward must exceed message fee");

      // Test invalid dislike penalty (zero)
      await expect(
        aiChatbot.updateTokenomics(MESSAGE_FEE, LIKE_REWARD, 0)
      ).to.be.revertedWith("Dislike penalty cannot be zero");
    });

    it("Should validate AI parameters", async function () {
      // Test invalid judgment probability (> 100%)
      await expect(
        aiChatbot.updateAIParameters(10001, 10, 500)
      ).to.be.revertedWith("Judgment probability cannot exceed 100%");

      // Test invalid message lengths
      await expect(
        aiChatbot.updateAIParameters(1700, 0, 500)
      ).to.be.revertedWith("Invalid message length bounds");

      await expect(
        aiChatbot.updateAIParameters(1700, 500, 100)
      ).to.be.revertedWith("Invalid message length bounds");

      // Test maximum length too large
      await expect(
        aiChatbot.updateAIParameters(1700, 10, 3000)
      ).to.be.revertedWith("Maximum message length too large");
    });
  });

  describe("Error Handling", function () {
    it("Should revert when getting non-existent message", async function () {
      await expect(aiChatbot.getMessage(999)).to.be.revertedWith(
        "MessageNotFound"
      );
    });

    it("Should handle empty arrays gracefully", async function () {
      const [messages, count] = await aiChatbot.getMessagesByAuthor(
        alice.address,
        0,
        10
      );
      expect(messages).to.have.length(0);
      expect(count).to.equal(0);

      const recentMessages = await aiChatbot.getRecentMessages(0, 10);
      expect(recentMessages).to.have.length(0);
    });

    it("Should handle pagination edge cases", async function () {
      // Test offset beyond array length
      const [messages, count] = await aiChatbot.getMessagesByAuthor(
        alice.address,
        100,
        10
      );
      expect(messages).to.have.length(0);
      expect(count).to.equal(0);
    });
  });

  describe("Utility Functions", function () {
    it("Should check judgment probability correctly", async function () {
      // Test with 100% probability
      await aiChatbot.updateAIParameters(10000, 10, 500);
      expect(await aiChatbot.shouldMessageBeJudged(1)).to.be.true;

      // Test with 0% probability
      await aiChatbot.updateAIParameters(0, 10, 500);
      expect(await aiChatbot.shouldMessageBeJudged(1)).to.be.false;
    });

    it("Should return pending messages correctly", async function () {
      const pendingMessages = await aiChatbot.getPendingMessages(10);
      expect(pendingMessages).to.have.length(0);
    });
  });

  describe("Event Emissions", function () {
    beforeEach(async function () {
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("1") });
      await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE);
    });

    it("Should emit MessageSent event correctly", async function () {
      const messageContent = "Test message for events";

      await expect(aiChatbot.connect(alice).sendMessage(messageContent))
        .to.emit(aiChatbot, "MessageSent")
        .withArgs(
          1,
          alice.address,
          messageContent,
          MESSAGE_FEE,
          await getBlockTimestamp()
        );
    });

    it("Should emit TokenomicsUpdated event on parameter change", async function () {
      const newFee = MESSAGE_FEE.mul(2);

      await expect(
        aiChatbot.updateTokenomics(newFee, LIKE_REWARD, DISLIKE_PENALTY)
      )
        .to.emit(aiChatbot, "TokenomicsUpdated")
        .withArgs(owner.address, newFee, LIKE_REWARD, DISLIKE_PENALTY, 1700);
    });

    it("Should emit AIParametersUpdated event on parameter change", async function () {
      await expect(aiChatbot.updateAIParameters(2000, 15, 600))
        .to.emit(aiChatbot, "AIParametersUpdated")
        .withArgs(owner.address, 2000, 15, 600);
    });
  });

  // ============ UTILITY FUNCTIONS ============

  async function getBlockTimestamp() {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp;
  }
});
