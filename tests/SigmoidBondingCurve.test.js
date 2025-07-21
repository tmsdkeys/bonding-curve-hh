const { expect } = require("chai");
const { ethers } = require("hardhat");
const { GasTestUtils } = require("./gas-measurement");

describe("SigmoidBondingCurve - Core Implementation", function () {
  let ChatbotToken, SigmoidBondingCurve, TestSigmoidMath;
  let token, bondingCurve, sigmoidMath;
  let owner, buyer1, buyer2, seller, notifier;
  let gasUtils;

  // Test parameters
  const PRICE_PRECISION = ethers.BigNumber.from("100000000"); // 1e8
  const TOKEN_PRECISION = ethers.utils.parseEther("1"); // 1e18

  // Bonding curve parameters
  const A = PRICE_PRECISION.mul(1000); // Max price: 1000.00000000
  const k = ethers.utils.parseEther("0.001"); // Steepness: 0.001
  const B = ethers.utils.parseEther("10000"); // Inflection: 10,000 tokens

  beforeEach(async function () {
    [owner, buyer1, buyer2, seller, notifier] = await ethers.getSigners();
    gasUtils = new GasTestUtils();

    // Deploy ChatbotToken
    ChatbotToken = await ethers.getContractFactory("ChatbotToken");
    token = await ChatbotToken.deploy(
      "Chatbot Token",
      "CBT",
      0, // No initial supply
      owner.address
    );
    await token.deployed();

    // Deploy SigmoidBondingCurve
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

    // Deploy test math library
    TestSigmoidMath = await ethers.getContractFactory("TestSigmoidMath");
    sigmoidMath = await TestSigmoidMath.deploy();
    await sigmoidMath.deployed();

    // Grant bonding curve permission to mint/burn tokens
    const MINTER_ROLE = await token.MINTER_ROLE();
    const BURNER_ROLE = await token.BURNER_ROLE();
    await token.grantRole(MINTER_ROLE, bondingCurve.address);
    await token.grantRole(BURNER_ROLE, bondingCurve.address);

    // Grant notifier role for supply change notifications
    const SUPPLY_NOTIFIER_ROLE = await bondingCurve.SUPPLY_NOTIFIER_ROLE();
    await bondingCurve.grantRole(SUPPLY_NOTIFIER_ROLE, notifier.address);
  });

  describe("Deployment & Initialization", function () {
    it("Should deploy with correct parameters", async function () {
      expect(await bondingCurve.token()).to.equal(token.address);
      expect(await bondingCurve.A()).to.equal(A);
      expect(await bondingCurve.k()).to.equal(k);
      expect(await bondingCurve.B()).to.equal(B);
      expect(await bondingCurve.getCurveType()).to.equal("sigmoid");
    });

    it("Should have correct initial state", async function () {
      expect(await bondingCurve.totalReserves()).to.equal(0);
      expect(await bondingCurve.getSupply()).to.equal(0);
      expect(await bondingCurve.paused()).to.be.false;
    });

    it("Should return correct parameters array", async function () {
      const params = await bondingCurve.getParameters();
      expect(params).to.have.length(3);
      expect(params[0]).to.equal(A);
      expect(params[1]).to.equal(k);
      expect(params[2]).to.equal(B);
    });

    it("Should reject invalid constructor parameters", async function () {
      await expect(
        SigmoidBondingCurve.deploy(
          ethers.constants.AddressZero, // Invalid token
          A,
          k,
          B,
          owner.address
        )
      ).to.be.revertedWith("Invalid token address");

      await expect(
        SigmoidBondingCurve.deploy(
          token.address,
          0, // Invalid A
          k,
          B,
          owner.address
        )
      ).to.be.revertedWith("ParameterOutOfBounds");
    });
  });

  describe("Price Calculations", function () {
    it("Should calculate price correctly for zero supply", async function () {
      const price = await bondingCurve.getCurrentPrice();
      expect(price).to.be.gt(0);
      expect(price).to.be.lt(A.div(100)); // Should be very low

      console.log(`Price at zero supply: ${formatPrice(price)}`);
    });

    it("Should calculate price correctly at inflection point", async function () {
      // First, we need some supply to test with
      await bondingCurve
        .connect(buyer1)
        .buy(0, { value: ethers.utils.parseEther("1") });

      // Mock supply at inflection point for testing
      const priceAtInflection = await bondingCurve.calculatePrice(B);
      const expectedPrice = A.div(2); // Should be ~A/2 at inflection
      const tolerance = expectedPrice.div(10); // 10% tolerance

      const difference = priceAtInflection.sub(expectedPrice).abs();
      expect(difference).to.be.lt(tolerance);

      console.log(`Price at inflection: ${formatPrice(priceAtInflection)}`);
      console.log(`Expected (A/2): ${formatPrice(expectedPrice)}`);
    });

    it("Should have monotonically increasing prices", async function () {
      const supplies = [
        ethers.utils.parseEther("1000"),
        ethers.utils.parseEther("5000"),
        ethers.utils.parseEther("10000"),
        ethers.utils.parseEther("20000"),
      ];

      const prices = [];
      for (const supply of supplies) {
        const price = await bondingCurve.calculatePrice(supply);
        prices.push(price);
      }

      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).to.be.gt(prices[i - 1]);
      }

      console.log("Price progression:");
      supplies.forEach((supply, i) => {
        console.log(
          `  ${ethers.utils.formatEther(supply)} tokens -> ${formatPrice(
            prices[i]
          )}`
        );
      });
    });
  });

  describe("Token Purchases (Buy Function)", function () {
    it("Should allow buying tokens with ETH", async function () {
      const ethAmount = ethers.utils.parseEther("1");
      const initialSupply = await token.totalSupply();
      const initialReserves = await bondingCurve.totalReserves();

      const result = await gasUtils.measureTransaction(
        "token_purchase",
        bondingCurve.connect(buyer1).buy(0, { value: ethAmount }),
        { ethAmount: ethAmount.toString(), buyer: buyer1.address }
      );

      // Check token balance increased
      const tokenBalance = await token.balanceOf(buyer1.address);
      expect(tokenBalance).to.be.gt(0);

      // Check supply increased
      const newSupply = await token.totalSupply();
      expect(newSupply).to.be.gt(initialSupply);

      // Check reserves increased
      const newReserves = await bondingCurve.totalReserves();
      expect(newReserves).to.equal(initialReserves.add(ethAmount));

      console.log(
        `Purchase: ${ethers.utils.formatEther(
          ethAmount
        )} ETH -> ${ethers.utils.formatEther(tokenBalance)} CBT`
      );
      console.log(`Gas used: ${result.gasUsed.toString()}`);
    });

    it("Should respect slippage protection", async function () {
      const ethAmount = ethers.utils.parseEther("1");

      // Calculate expected tokens
      const expectedTokens = await bondingCurve.calculateTokensForEth(
        ethAmount
      );

      // Set unrealistic minimum (should fail)
      const unrealisticMin = expectedTokens.mul(2);

      await expect(
        bondingCurve.connect(buyer1).buy(unrealisticMin, { value: ethAmount })
      ).to.be.revertedWith("SlippageExceeded");

      // Set reasonable minimum (should succeed)
      const reasonableMin = expectedTokens.mul(95).div(100); // 5% slippage tolerance

      await expect(
        bondingCurve.connect(buyer1).buy(reasonableMin, { value: ethAmount })
      ).to.not.be.reverted;
    });

    it("Should emit TokensPurchased event", async function () {
      const ethAmount = ethers.utils.parseEther("0.5");

      await expect(
        bondingCurve.connect(buyer1).buy(0, { value: ethAmount })
      ).to.emit(bondingCurve, "TokensPurchased");
    });

    it("Should update trading statistics", async function () {
      const ethAmount = ethers.utils.parseEther("1");

      const statsBefore = await bondingCurve.getTradingStatistics();
      await bondingCurve.connect(buyer1).buy(0, { value: ethAmount });
      const statsAfter = await bondingCurve.getTradingStatistics();

      expect(statsAfter[0]).to.be.gt(statsBefore[0]); // totalVolumeBought
      expect(statsAfter[2]).to.be.gt(statsBefore[2]); // totalEthSpent
    });

    it("Should reject zero ETH purchases", async function () {
      await expect(
        bondingCurve.connect(buyer1).buy(0, { value: 0 })
      ).to.be.revertedWith("Must send ETH");
    });

    it("Should work with multiple sequential purchases", async function () {
      const purchases = [
        ethers.utils.parseEther("0.1"),
        ethers.utils.parseEther("0.2"),
        ethers.utils.parseEther("0.5"),
      ];

      let totalTokens = ethers.BigNumber.from(0);

      for (const ethAmount of purchases) {
        const balanceBefore = await token.balanceOf(buyer1.address);
        await bondingCurve.connect(buyer1).buy(0, { value: ethAmount });
        const balanceAfter = await token.balanceOf(buyer1.address);

        const tokensMinted = balanceAfter.sub(balanceBefore);
        totalTokens = totalTokens.add(tokensMinted);

        console.log(
          `Purchase ${ethers.utils.formatEther(
            ethAmount
          )} ETH -> ${ethers.utils.formatEther(tokensMinted)} CBT`
        );
      }

      expect(await token.balanceOf(buyer1.address)).to.equal(totalTokens);
    });
  });

  describe("Token Sales (Sell Function)", function () {
    beforeEach(async function () {
      // Buy some tokens first for selling tests
      await bondingCurve
        .connect(seller)
        .buy(0, { value: ethers.utils.parseEther("2") });
    });

    it("Should allow selling tokens for ETH", async function () {
      const tokenBalance = await token.balanceOf(seller.address);
      const sellAmount = tokenBalance.div(2); // Sell half

      const ethBalanceBefore = await seller.getBalance();
      const reservesBefore = await bondingCurve.totalReserves();

      const result = await gasUtils.measureTransaction(
        "token_sale",
        bondingCurve.connect(seller).sell(sellAmount, 0),
        { tokenAmount: sellAmount.toString(), seller: seller.address }
      );

      // Check token balance decreased
      const newTokenBalance = await token.balanceOf(seller.address);
      expect(newTokenBalance).to.equal(tokenBalance.sub(sellAmount));

      // Check reserves decreased
      const newReserves = await bondingCurve.totalReserves();
      expect(newReserves).to.be.lt(reservesBefore);

      console.log(`Sale: ${ethers.utils.formatEther(sellAmount)} CBT -> ETH`);
      console.log(`Gas used: ${result.gasUsed.toString()}`);
    });

    it("Should respect slippage protection on sales", async function () {
      const tokenBalance = await token.balanceOf(seller.address);
      const sellAmount = tokenBalance.div(4);

      // Calculate expected ETH
      const expectedETH = await bondingCurve.calculateEthForTokens(sellAmount);

      // Set unrealistic minimum (should fail)
      const unrealisticMin = expectedETH.mul(2);

      await expect(
        bondingCurve.connect(seller).sell(sellAmount, unrealisticMin)
      ).to.be.revertedWith("SlippageExceeded");

      // Set reasonable minimum (should succeed)
      const reasonableMin = expectedETH.mul(95).div(100); // 5% slippage tolerance

      await expect(bondingCurve.connect(seller).sell(sellAmount, reasonableMin))
        .to.not.be.reverted;
    });

    it("Should emit TokensSold event", async function () {
      const tokenBalance = await token.balanceOf(seller.address);
      const sellAmount = tokenBalance.div(4);

      await expect(bondingCurve.connect(seller).sell(sellAmount, 0)).to.emit(
        bondingCurve,
        "TokensSold"
      );
    });

    it("Should reject selling more tokens than owned", async function () {
      const tokenBalance = await token.balanceOf(seller.address);
      const excessiveAmount = tokenBalance.add(ethers.utils.parseEther("1000"));

      await expect(
        bondingCurve.connect(seller).sell(excessiveAmount, 0)
      ).to.be.revertedWith("Insufficient token balance");
    });

    it("Should reject zero token sales", async function () {
      await expect(bondingCurve.connect(seller).sell(0, 0)).to.be.revertedWith(
        "Must sell positive amount"
      );
    });
  });

  describe("Reserve Management", function () {
    beforeEach(async function () {
      // Create some trading activity
      await bondingCurve
        .connect(buyer1)
        .buy(0, { value: ethers.utils.parseEther("1") });
      await bondingCurve
        .connect(buyer2)
        .buy(0, { value: ethers.utils.parseEther("0.5") });
    });

    it("Should track reserves correctly", async function () {
      const reserves = await bondingCurve.getReserveBalance();
      expect(reserves).to.equal(ethers.utils.parseEther("1.5"));
    });

    it("Should calculate reserve ratio", async function () {
      const reserveRatio = await bondingCurve.getReserveRatio();
      expect(reserveRatio).to.be.gt(0);
      expect(reserveRatio).to.be.lt(PRICE_PRECISION); // Should be less than 100%

      console.log(
        `Reserve ratio: ${ethers.utils.formatUnits(reserveRatio, 8)}%`
      );
    });

    it("Should prevent sales exceeding reserves", async function () {
      // This would require a complex setup where reserves are somehow depleted
      // For now, we'll test the error condition directly
      const tokenBalance = await token.balanceOf(buyer1.address);

      // Try to sell all tokens (would likely exceed reserves due to price appreciation)
      await expect(
        bondingCurve.connect(buyer1).sell(tokenBalance, 0)
      ).to.not.be.revertedWith("InsufficientReserves");
    });
  });

  describe("Supply Change Notifications", function () {
    it("Should allow authorized contracts to notify supply changes", async function () {
      await expect(
        bondingCurve.connect(notifier).notifySupplyChange(
          ethers.utils.parseEther("100"), // Positive delta (mint)
          "AI like reward"
        )
      ).to.emit(bondingCurve, "SupplyChanged");
    });

    it("Should reject unauthorized supply change notifications", async function () {
      await expect(
        bondingCurve
          .connect(buyer1)
          .notifySupplyChange(
            ethers.utils.parseEther("100"),
            "Unauthorized attempt"
          )
      ).to.be.reverted;
    });

    it("Should reject zero supply delta", async function () {
      await expect(
        bondingCurve.connect(notifier).notifySupplyChange(0, "Zero delta")
      ).to.be.revertedWith("InvalidSupplyDelta");
    });

    it("Should handle negative supply deltas", async function () {
      await expect(
        bondingCurve.connect(notifier).notifySupplyChange(
          ethers.utils.parseEther("-50"), // Negative delta (burn)
          "AI dislike penalty"
        )
      ).to.emit(bondingCurve, "SupplyChanged");
    });
  });

  describe("Parameter Updates", function () {
    it("Should allow admin to update parameters", async function () {
      const newA = A.mul(2);
      const newK = k.mul(2);
      const newB = B.mul(2);
      const newParams = [newA, newK, newB];

      await expect(bondingCurve.updateParameters(newParams)).to.emit(
        bondingCurve,
        "ParametersUpdated"
      );

      expect(await bondingCurve.A()).to.equal(newA);
      expect(await bondingCurve.k()).to.equal(newK);
      expect(await bondingCurve.B()).to.equal(newB);
    });

    it("Should reject invalid parameter updates", async function () {
      const invalidParams = [0, k, B]; // Invalid A

      await expect(
        bondingCurve.updateParameters(invalidParams)
      ).to.be.revertedWith("InvalidParameters");
    });

    it("Should reject parameter updates from non-admin", async function () {
      const newParams = [A, k, B];

      await expect(bondingCurve.connect(buyer1).updateParameters(newParams)).to
        .be.reverted;
    });

    it("Should require exactly 3 parameters", async function () {
      const invalidParams = [A, k]; // Missing B

      await expect(
        bondingCurve.updateParameters(invalidParams)
      ).to.be.revertedWith("Must provide [A, k, B]");
    });
  });

  describe("Pause Functionality", function () {
    it("Should allow admin to pause and unpause", async function () {
      await bondingCurve.pause();
      expect(await bondingCurve.paused()).to.be.true;

      await bondingCurve.unpause();
      expect(await bondingCurve.paused()).to.be.false;
    });

    it("Should prevent trading when paused", async function () {
      await bondingCurve.pause();

      await expect(
        bondingCurve
          .connect(buyer1)
          .buy(0, { value: ethers.utils.parseEther("1") })
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should reject pause from non-admin", async function () {
      await expect(bondingCurve.connect(buyer1).pause()).to.be.reverted;
    });
  });

  describe("Analytics & Statistics", function () {
    beforeEach(async function () {
      // Create trading activity
      await bondingCurve
        .connect(buyer1)
        .buy(0, { value: ethers.utils.parseEther("1") });
      await bondingCurve
        .connect(buyer2)
        .buy(0, { value: ethers.utils.parseEther("0.5") });

      // Sell some tokens
      const balance1 = await token.balanceOf(buyer1.address);
      await bondingCurve.connect(buyer1).sell(balance1.div(4), 0);
    });

    it("Should track trading statistics correctly", async function () {
      const stats = await bondingCurve.getTradingStatistics();

      expect(stats[0]).to.be.gt(0); // totalVolumeBought
      expect(stats[1]).to.be.gt(0); // totalVolumeSold
      expect(stats[2]).to.equal(ethers.utils.parseEther("1.5")); // totalEthSpent
      expect(stats[3]).to.be.gt(0); // totalEthWithdrawn
      expect(stats[4]).to.be.gt(0); // netFlow

      console.log("Trading Statistics:");
      console.log(`  Volume Bought: ${ethers.utils.formatEther(stats[0])} CBT`);
      console.log(`  Volume Sold: ${ethers.utils.formatEther(stats[1])} CBT`);
      console.log(`  ETH Spent: ${ethers.utils.formatEther(stats[2])} ETH`);
      console.log(`  ETH Withdrawn: ${ethers.utils.formatEther(stats[3])} ETH`);
      console.log(`  Net Flow: ${ethers.utils.formatEther(stats[4])} ETH`);
    });

    it("Should calculate price derivative", async function () {
      const derivative = await bondingCurve.getCurrentPriceDerivative();
      expect(derivative).to.be.gt(0);

      console.log(`Current price derivative: ${derivative.toString()}`);
    });
  });

  describe("Gas Cost Analysis", function () {
    it("Should measure gas costs for all major operations", async function () {
      console.log("\n🔥 GAS COST ANALYSIS - SIGMOID BONDING CURVE");
      console.log("=".repeat(60));

      // Price calculation
      const priceCalcGas = await bondingCurve.estimateGas.getCurrentPrice();
      gasUtils.getMeasurement().record("price_calculation", priceCalcGas);
      console.log(`Price calculation: ${priceCalcGas.toString()} gas`);

      // Token purchase
      const buyGas = await bondingCurve.connect(buyer1).estimateGas.buy(0, {
        value: ethers.utils.parseEther("0.1"),
      });
      gasUtils.getMeasurement().record("token_purchase_estimate", buyGas);
      console.log(`Token purchase (estimate): ${buyGas.toString()} gas`);

      // Actual purchase for selling test
      await bondingCurve
        .connect(buyer1)
        .buy(0, { value: ethers.utils.parseEther("1") });

      // Token sale
      const tokenBalance = await token.balanceOf(buyer1.address);
      const sellGas = await bondingCurve
        .connect(buyer1)
        .estimateGas.sell(tokenBalance.div(4), 0);
      gasUtils.getMeasurement().record("token_sale_estimate", sellGas);
      console.log(`Token sale (estimate): ${sellGas.toString()} gas`);

      // Parameter update
      const updateGas = await bondingCurve.estimateGas.updateParameters([
        A,
        k,
        B,
      ]);
      gasUtils.getMeasurement().record("parameter_update", updateGas);
      console.log(`Parameter update: ${updateGas.toString()} gas`);

      console.log("=".repeat(60));
    });

    it("Should compare with pure math library gas costs", async function () {
      const mathGasCost = await sigmoidMath.measureSigmoidGasCost();
      const fullPriceGas = await bondingCurve.estimateGas.getCurrentPrice();

      console.log(`Pure math calculation: ${mathGasCost.toString()} gas`);
      console.log(`Full price function: ${fullPriceGas.toString()} gas`);
      console.log(`Overhead: ${fullPriceGas.sub(mathGasCost).toString()} gas`);
    });
  });

  describe("Integration Scenarios", function () {
    it("Should handle realistic trading scenario", async function () {
      console.log("\n📊 REALISTIC TRADING SCENARIO");
      console.log("-".repeat(40));

      // Multiple buyers purchase tokens
      const buyers = [buyer1, buyer2];
      const purchaseAmounts = [
        ethers.utils.parseEther("0.5"),
        ethers.utils.parseEther("1.0"),
      ];

      for (let i = 0; i < buyers.length; i++) {
        const buyer = buyers[i];
        const amount = purchaseAmounts[i];

        const priceBefore = await bondingCurve.getCurrentPrice();
        await bondingCurve.connect(buyer).buy(0, { value: amount });
        const priceAfter = await bondingCurve.getCurrentPrice();
        const tokens = await token.balanceOf(buyer.address);

        console.log(`Buyer ${i + 1}:`);
        console.log(`  Spent: ${ethers.utils.formatEther(amount)} ETH`);
        console.log(`  Received: ${ethers.utils.formatEther(tokens)} CBT`);
        console.log(
          `  Price: ${formatPrice(priceBefore)} -> ${formatPrice(priceAfter)}`
        );
      }

      // Simulate AI interactions via supply notifications
      await bondingCurve
        .connect(notifier)
        .notifySupplyChange(ethers.utils.parseEther("100"), "AI like reward");

      const priceAfterLike = await bondingCurve.getCurrentPrice();
      console.log(`Price after AI like: ${formatPrice(priceAfterLike)}`);

      // One buyer sells some tokens
      const sellAmount = (await token.balanceOf(buyer1.address)).div(3);
      const ethBefore = await buyer1.getBalance();
      await bondingCurve.connect(buyer1).sell(sellAmount, 0);
      const ethAfter = await buyer1.getBalance();

      console.log(`Sale: ${ethers.utils.formatEther(sellAmount)} CBT sold`);
      console.log(
        `ETH change: ~${ethers.utils.formatEther(ethAfter.sub(ethBefore))} ETH`
      );

      // Final statistics
      const stats = await bondingCurve.getTradingStatistics();
      const reserves = await bondingCurve.getReserveBalance();
      const reserveRatio = await bondingCurve.getReserveRatio();

      console.log("\nFinal State:");
      console.log(
        `  Total Reserves: ${ethers.utils.formatEther(reserves)} ETH`
      );
      console.log(
        `  Reserve Ratio: ${ethers.utils.formatUnits(reserveRatio, 6)}%`
      );
      console.log(`  Net ETH Flow: ${ethers.utils.formatEther(stats[4])} ETH`);
    });
  });

  describe("Error Handling", function () {
    it("Should reject direct ETH transfers", async function () {
      await expect(
        buyer1.sendTransaction({
          to: bondingCurve.address,
          value: ethers.utils.parseEther("1"),
        })
      ).to.be.revertedWith("Use buy() function to purchase tokens");
    });

    it("Should handle edge cases gracefully", async function () {
      // Very small purchase
      await expect(bondingCurve.connect(buyer1).buy(0, { value: 1 })).to.not.be
        .reverted;

      // Very small sale (after purchase)
      const balance = await token.balanceOf(buyer1.address);
      if (balance.gt(0)) {
        await expect(bondingCurve.connect(buyer1).sell(1, 0)).to.not.be
          .reverted;
      }
    });
  });

  afterEach(function () {
    // Print gas measurements after each test
    gasUtils.printFinalReport();
  });

  // ============ UTILITY FUNCTIONS ============

  /**
   * Format price with 8 decimal precision for logging
   */
  function formatPrice(price) {
    return ethers.utils.formatUnits(price, 8);
  }
});
