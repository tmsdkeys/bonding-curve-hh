const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ChatbotToken", function () {
  let ChatbotToken, token;
  let owner, minter, burner, user, otherUser;
  let MINTER_ROLE, BURNER_ROLE, PAUSER_ROLE, DEFAULT_ADMIN_ROLE;

  const TOKEN_NAME = "Chatbot Token";
  const TOKEN_SYMBOL = "CBT";
  const INITIAL_SUPPLY = ethers.utils.parseEther("1000000"); // 1M tokens
  const ZERO_ADDRESS = ethers.constants.AddressZero;

  beforeEach(async function () {
    // Get signers
    [owner, minter, burner, user, otherUser] = await ethers.getSigners();

    // Deploy contract
    ChatbotToken = await ethers.getContractFactory("ChatbotToken");
    token = await ChatbotToken.deploy(
      TOKEN_NAME,
      TOKEN_SYMBOL,
      INITIAL_SUPPLY,
      owner.address
    );
    await token.deployed();

    // Get role constants
    MINTER_ROLE = await token.MINTER_ROLE();
    BURNER_ROLE = await token.BURNER_ROLE();
    PAUSER_ROLE = await token.PAUSER_ROLE();
    DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await token.name()).to.equal(TOKEN_NAME);
      expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
    });

    it("Should set the correct decimals", async function () {
      expect(await token.decimals()).to.equal(18);
    });

    it("Should mint initial supply to admin", async function () {
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
    });

    it("Should grant admin roles to deployer", async function () {
      expect(await token.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await token.hasRole(PAUSER_ROLE, owner.address)).to.be.true;
    });

    it("Should revert if admin address is zero", async function () {
      await expect(
        ChatbotToken.deploy(
          TOKEN_NAME,
          TOKEN_SYMBOL,
          INITIAL_SUPPLY,
          ZERO_ADDRESS
        )
      ).to.be.revertedWith("CBT: Admin address cannot be zero");
    });

    it("Should handle zero initial supply", async function () {
      const zeroSupplyToken = await ChatbotToken.deploy(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        0,
        owner.address
      );
      expect(await zeroSupplyToken.totalSupply()).to.equal(0);
    });
  });

  describe("Role Management", function () {
    it("Should allow admin to grant minter role", async function () {
      await token.grantRole(MINTER_ROLE, minter.address);
      expect(await token.hasRole(MINTER_ROLE, minter.address)).to.be.true;
      expect(await token.isMinter(minter.address)).to.be.true;
    });

    it("Should allow admin to grant burner role", async function () {
      await token.grantRole(BURNER_ROLE, burner.address);
      expect(await token.hasRole(BURNER_ROLE, burner.address)).to.be.true;
      expect(await token.isBurner(burner.address)).to.be.true;
    });

    it("Should not allow non-admin to grant roles", async function () {
      await expect(token.connect(user).grantRole(MINTER_ROLE, minter.address))
        .to.be.reverted;
    });

    it("Should allow admin to revoke roles", async function () {
      await token.grantRole(MINTER_ROLE, minter.address);
      await token.revokeRole(MINTER_ROLE, minter.address);
      expect(await token.hasRole(MINTER_ROLE, minter.address)).to.be.false;
    });
  });

  describe("Minting", function () {
    beforeEach(async function () {
      await token.grantRole(MINTER_ROLE, minter.address);
    });

    it("Should allow minter to mint tokens", async function () {
      const mintAmount = ethers.utils.parseEther("100");
      const reason = "Like reward";

      await expect(token.connect(minter).mint(user.address, mintAmount, reason))
        .to.emit(token, "TokensMinted")
        .withArgs(user.address, mintAmount, reason);

      expect(await token.balanceOf(user.address)).to.equal(mintAmount);
      expect(await token.totalSupply()).to.equal(
        INITIAL_SUPPLY.add(mintAmount)
      );
    });

    it("Should not allow non-minter to mint tokens", async function () {
      const mintAmount = ethers.utils.parseEther("100");

      await expect(token.connect(user).mint(user.address, mintAmount, "test"))
        .to.be.reverted;
    });

    it("Should revert when minting to zero address", async function () {
      const mintAmount = ethers.utils.parseEther("100");

      await expect(
        token.connect(minter).mint(ZERO_ADDRESS, mintAmount, "test")
      ).to.be.revertedWith("CBT: Cannot mint to zero address");
    });

    it("Should revert when minting zero amount", async function () {
      await expect(
        token.connect(minter).mint(user.address, 0, "test")
      ).to.be.revertedWith("CBT: Amount must be greater than 0");
    });

    it("Should not allow minting when paused", async function () {
      await token.pause();
      const mintAmount = ethers.utils.parseEther("100");

      await expect(
        token.connect(minter).mint(user.address, mintAmount, "test")
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("Burning", function () {
    beforeEach(async function () {
      await token.grantRole(BURNER_ROLE, burner.address);
      // Transfer some tokens to user for burning tests
      await token.transfer(user.address, ethers.utils.parseEther("1000"));
    });

    it("Should allow burner to burn tokens from address", async function () {
      const burnAmount = ethers.utils.parseEther("100");
      const reason = "Message fee";
      const initialBalance = await token.balanceOf(user.address);
      const initialSupply = await token.totalSupply();

      await expect(token.connect(burner).burn(user.address, burnAmount, reason))
        .to.emit(token, "TokensBurned")
        .withArgs(user.address, burnAmount, reason);

      expect(await token.balanceOf(user.address)).to.equal(
        initialBalance.sub(burnAmount)
      );
      expect(await token.totalSupply()).to.equal(initialSupply.sub(burnAmount));
    });

    it("Should not allow non-burner to burn tokens", async function () {
      const burnAmount = ethers.utils.parseEther("100");

      await expect(token.connect(user).burn(user.address, burnAmount, "test"))
        .to.be.reverted;
    });

    it("Should revert when burning from zero address", async function () {
      const burnAmount = ethers.utils.parseEther("100");

      await expect(
        token.connect(burner).burn(ZERO_ADDRESS, burnAmount, "test")
      ).to.be.revertedWith("CBT: Cannot burn from zero address");
    });

    it("Should revert when burning zero amount", async function () {
      await expect(
        token.connect(burner).burn(user.address, 0, "test")
      ).to.be.revertedWith("CBT: Amount must be greater than 0");
    });

    it("Should revert when burning more than balance", async function () {
      const userBalance = await token.balanceOf(user.address);
      const burnAmount = userBalance.add(ethers.utils.parseEther("1"));

      await expect(
        token.connect(burner).burn(user.address, burnAmount, "test")
      ).to.be.revertedWith("CBT: Insufficient balance to burn");
    });

    it("Should not allow burning when paused", async function () {
      await token.pause();
      const burnAmount = ethers.utils.parseEther("100");

      await expect(
        token.connect(burner).burn(user.address, burnAmount, "test")
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("Self Burning", function () {
    beforeEach(async function () {
      // Transfer some tokens to user for self-burning tests
      await token.transfer(user.address, ethers.utils.parseEther("1000"));
    });

    it("Should allow user to burn their own tokens", async function () {
      const burnAmount = ethers.utils.parseEther("100");
      const initialBalance = await token.balanceOf(user.address);
      const initialSupply = await token.totalSupply();

      await expect(token.connect(user).burnSelf(burnAmount))
        .to.emit(token, "TokensBurned")
        .withArgs(user.address, burnAmount, "Self-burn");

      expect(await token.balanceOf(user.address)).to.equal(
        initialBalance.sub(burnAmount)
      );
      expect(await token.totalSupply()).to.equal(initialSupply.sub(burnAmount));
    });

    it("Should revert when self-burning zero amount", async function () {
      await expect(token.connect(user).burnSelf(0)).to.be.revertedWith(
        "CBT: Amount must be greater than 0"
      );
    });

    it("Should revert when self-burning more than balance", async function () {
      const userBalance = await token.balanceOf(user.address);
      const burnAmount = userBalance.add(ethers.utils.parseEther("1"));

      await expect(token.connect(user).burnSelf(burnAmount)).to.be.revertedWith(
        "CBT: Insufficient balance to burn"
      );
    });

    it("Should not allow self-burning when paused", async function () {
      await token.pause();
      const burnAmount = ethers.utils.parseEther("100");

      await expect(token.connect(user).burnSelf(burnAmount)).to.be.revertedWith(
        "Pausable: paused"
      );
    });
  });

  describe("Pause Functionality", function () {
    it("Should allow pauser to pause contract", async function () {
      await token.pause();
      expect(await token.paused()).to.be.true;
    });

    it("Should allow pauser to unpause contract", async function () {
      await token.pause();
      await token.unpause();
      expect(await token.paused()).to.be.false;
    });

    it("Should not allow non-pauser to pause", async function () {
      await expect(token.connect(user).pause()).to.be.reverted;
    });

    it("Should prevent transfers when paused", async function () {
      await token.pause();

      await expect(
        token.transfer(user.address, ethers.utils.parseEther("100"))
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should allow transfers when unpaused", async function () {
      await token.pause();
      await token.unpause();

      await expect(token.transfer(user.address, ethers.utils.parseEther("100")))
        .to.not.be.reverted;
    });
  });

  describe("Utility Functions", function () {
    it("Should return correct current supply", async function () {
      expect(await token.getCurrentSupply()).to.equal(INITIAL_SUPPLY);
    });

    it("Should correctly identify minter", async function () {
      await token.grantRole(MINTER_ROLE, minter.address);
      expect(await token.isMinter(minter.address)).to.be.true;
      expect(await token.isMinter(user.address)).to.be.false;
    });

    it("Should correctly identify burner", async function () {
      await token.grantRole(BURNER_ROLE, burner.address);
      expect(await token.isBurner(burner.address)).to.be.true;
      expect(await token.isBurner(user.address)).to.be.false;
    });
  });

  describe("Integration Scenarios", function () {
    it("Should handle multiple mint and burn operations", async function () {
      await token.grantRole(MINTER_ROLE, minter.address);
      await token.grantRole(BURNER_ROLE, burner.address);

      const mintAmount = ethers.utils.parseEther("500");
      const burnAmount = ethers.utils.parseEther("200");

      // Mint tokens
      await token.connect(minter).mint(user.address, mintAmount, "Like reward");
      expect(await token.balanceOf(user.address)).to.equal(mintAmount);

      // Burn some tokens
      await token.connect(burner).burn(user.address, burnAmount, "Message fee");
      expect(await token.balanceOf(user.address)).to.equal(
        mintAmount.sub(burnAmount)
      );

      // Check total supply
      expect(await token.totalSupply()).to.equal(
        INITIAL_SUPPLY.add(mintAmount).sub(burnAmount)
      );
    });

    it("Should handle role changes during operation", async function () {
      await token.grantRole(MINTER_ROLE, minter.address);

      // Mint should work
      await token
        .connect(minter)
        .mint(user.address, ethers.utils.parseEther("100"), "test");

      // Revoke role
      await token.revokeRole(MINTER_ROLE, minter.address);

      // Mint should fail
      await expect(
        token
          .connect(minter)
          .mint(user.address, ethers.utils.parseEther("100"), "test")
      ).to.be.reverted;
    });
  });
});
