const { ethers } = require("hardhat");

/**
 * Token Flow Validator
 *
 * Comprehensive validation of buy/sell mechanics to ensure:
 * 1. Correct token minting/burning
 * 2. Proper ETH reserve management
 * 3. Price calculation accuracy
 * 4. Slippage protection functionality
 * 5. Event emission correctness
 */

class TokenFlowValidator {
  constructor(token, bondingCurve) {
    this.token = token;
    this.bondingCurve = bondingCurve;
    this.validationErrors = [];
    this.validationWarnings = [];
  }

  /**
   * Run complete flow validation
   */
  async validateCompleteFlow() {
    console.log("🔍 Starting Token Flow Validation");
    console.log("=".repeat(50));

    try {
      await this._validateInitialState();
      await this._validateBuyMechanics();
      await this._validateSellMechanics();
      await this._validateSlippageProtection();
      await this._validateReserveAccounting();
      await this._validateEventEmissions();
      await this._validateEdgeCases();

      this._generateReport();
    } catch (error) {
      console.error("❌ Validation failed:", error);
      throw error;
    }
  }

  /**
   * Validate initial state
   */
  async _validateInitialState() {
    console.log("\n📋 Validating Initial State...");

    const supply = await this.token.totalSupply();
    const reserves = await this.bondingCurve.getReserveBalance();
    const price = await this.bondingCurve.getCurrentPrice();

    this._assert(supply.eq(0), "Initial supply should be zero", "CRITICAL");
    this._assert(reserves.eq(0), "Initial reserves should be zero", "CRITICAL");
    this._assert(price.gt(0), "Initial price should be positive", "CRITICAL");

    console.log(`✅ Initial state validated`);
    console.log(`   Supply: ${ethers.utils.formatEther(supply)}`);
    console.log(`   Reserves: ${ethers.utils.formatEther(reserves)} ETH`);
    console.log(`   Price: ${ethers.utils.formatUnits(price, 8)}`);
  }

  /**
   * Validate buy mechanics
   */
  async _validateBuyMechanics() {
    console.log("\n💰 Validating Buy Mechanics...");

    const [buyer] = await ethers.getSigners();
    const ethAmount = ethers.utils.parseEther("1");

    // Record pre-buy state
    const preBuySupply = await this.token.totalSupply();
    const preBuyReserves = await this.bondingCurve.getReserveBalance();
    const preBuyPrice = await this.bondingCurve.getCurrentPrice();
    const preBuyBalance = await this.token.balanceOf(buyer.address);

    // Execute buy
    const tx = await this.bondingCurve.buy(0, { value: ethAmount });
    const receipt = await tx.wait();

    // Record post-buy state
    const postBuySupply = await this.token.totalSupply();
    const postBuyReserves = await this.bondingCurve.getReserveBalance();
    const postBuyPrice = await this.bondingCurve.getCurrentPrice();
    const postBuyBalance = await this.token.balanceOf(buyer.address);

    // Validate supply increase
    const supplyIncrease = postBuySupply.sub(preBuySupply);
    const balanceIncrease = postBuyBalance.sub(preBuyBalance);

    this._assert(
      supplyIncrease.eq(balanceIncrease),
      "Supply increase should equal balance increase",
      "CRITICAL"
    );

    // Validate reserve increase
    const reserveIncrease = postBuyReserves.sub(preBuyReserves);
    this._assert(
      reserveIncrease.eq(ethAmount),
      "Reserve increase should equal ETH spent",
      "CRITICAL"
    );

    // Validate price increase (should increase due to more supply)
    this._assert(
      postBuyPrice.gte(preBuyPrice),
      "Price should increase or stay same after purchase",
      "WARNING"
    );

    // Check TokensPurchased event
    const purchaseEvent = receipt.events?.find(
      (e) => e.event === "TokensPurchased"
    );
    this._assert(
      purchaseEvent != null,
      "TokensPurchased event should be emitted",
      "CRITICAL"
    );

    if (purchaseEvent) {
      this._assert(
        purchaseEvent.args.ethSpent.eq(ethAmount),
        "Event should record correct ETH amount",
        "CRITICAL"
      );
      this._assert(
        purchaseEvent.args.tokensMinted.eq(supplyIncrease),
        "Event should record correct token amount",
        "CRITICAL"
      );
    }

    console.log(`✅ Buy mechanics validated`);
    console.log(`   ETH spent: ${ethers.utils.formatEther(ethAmount)}`);
    console.log(
      `   Tokens minted: ${ethers.utils.formatEther(supplyIncrease)}`
    );
    console.log(
      `   Price change: ${ethers.utils.formatUnits(
        preBuyPrice,
        8
      )} -> ${ethers.utils.formatUnits(postBuyPrice, 8)}`
    );
  }

  /**
   * Validate sell mechanics
   */
  async _validateSellMechanics() {
    console.log("\n💸 Validating Sell Mechanics...");

    const [seller] = await ethers.getSigners();
    const sellerBalance = await this.token.balanceOf(seller.address);

    // Skip if no tokens to sell
    if (sellerBalance.eq(0)) {
      console.log("⚠️  No tokens to sell, skipping sell validation");
      return;
    }

    const sellAmount = sellerBalance.div(2); // Sell half

    // Record pre-sell state
    const preSellSupply = await this.token.totalSupply();
    const preSellReserves = await this.bondingCurve.getReserveBalance();
    const preSellPrice = await this.bondingCurve.getCurrentPrice();
    const preSellETHBalance = await seller.getBalance();

    // Execute sell
    const tx = await this.bondingCurve.sell(sellAmount, 0);
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed.mul(tx.gasPrice);

    // Record post-sell state
    const postSellSupply = await this.token.totalSupply();
    const postSellReserves = await this.bondingCurve.getReserveBalance();
    const postSellPrice = await this.bondingCurve.getCurrentPrice();
    const postSellETHBalance = await seller.getBalance();
    const postSellTokenBalance = await this.token.balanceOf(seller.address);

    // Validate supply decrease
    const supplyDecrease = preSellSupply.sub(postSellSupply);
    const tokenDecrease = sellerBalance.sub(postSellTokenBalance);

    this._assert(
      supplyDecrease.eq(sellAmount),
      "Supply decrease should equal tokens sold",
      "CRITICAL"
    );
    this._assert(
      tokenDecrease.eq(sellAmount),
      "Token balance decrease should equal sell amount",
      "CRITICAL"
    );

    // Validate reserve decrease
    const reserveDecrease = preSellReserves.sub(postSellReserves);
    const ethReceived = postSellETHBalance.add(gasUsed).sub(preSellETHBalance);

    this._assert(
      reserveDecrease.eq(ethReceived),
      "Reserve decrease should equal ETH received",
      "CRITICAL"
    );

    // Check TokensSold event
    const saleEvent = receipt.events?.find((e) => e.event === "TokensSold");
    this._assert(
      saleEvent != null,
      "TokensSold event should be emitted",
      "CRITICAL"
    );

    console.log(`✅ Sell mechanics validated`);
    console.log(`   Tokens sold: ${ethers.utils.formatEther(sellAmount)}`);
    console.log(`   ETH received: ${ethers.utils.formatEther(ethReceived)}`);
    console.log(
      `   Reserve decrease: ${ethers.utils.formatEther(reserveDecrease)}`
    );
  }

  /**
   * Validate slippage protection
   */
  async _validateSlippageProtection() {
    console.log("\n🛡️  Validating Slippage Protection...");

    const [user] = await ethers.getSigners();
    const ethAmount = ethers.utils.parseEther("0.1");

    // Get expected tokens
    const expectedTokens = await this.bondingCurve.calculateTokensForEth(
      ethAmount
    );

    // Test buy with reasonable slippage (should succeed)
    const reasonableMin = expectedTokens.mul(95).div(100); // 5% slippage
    try {
      await this.bondingCurve.buy(reasonableMin, { value: ethAmount });
      console.log(`✅ Reasonable slippage protection works`);
    } catch (error) {
      this._recordError("Reasonable slippage protection failed", "CRITICAL");
    }

    // Test buy with unrealistic slippage (should fail)
    const unrealisticMin = expectedTokens.mul(2); // 200% of expected
    try {
      await this.bondingCurve.buy(unrealisticMin, { value: ethAmount });
      this._recordError(
        "Unrealistic slippage protection should have failed",
        "CRITICAL"
      );
    } catch (error) {
      if (error.message.includes("SlippageExceeded")) {
        console.log(`✅ Unrealistic slippage correctly rejected`);
      } else {
        this._recordError(`Unexpected error: ${error.message}`, "WARNING");
      }
    }

    // Test sell slippage if user has tokens
    const userBalance = await this.token.balanceOf(user.address);
    if (userBalance.gt(0)) {
      const sellAmount = userBalance.div(4);
      const expectedETH = await this.bondingCurve.calculateEthForTokens(
        sellAmount
      );

      // Unrealistic sell expectation (should fail)
      const unrealisticETHMin = expectedETH.mul(2);
      try {
        await this.bondingCurve.sell(sellAmount, unrealisticETHMin);
        this._recordError(
          "Unrealistic sell slippage should have failed",
          "CRITICAL"
        );
      } catch (error) {
        if (error.message.includes("SlippageExceeded")) {
          console.log(`✅ Sell slippage protection works`);
        } else {
          this._recordError(
            `Unexpected sell error: ${error.message}`,
            "WARNING"
          );
        }
      }
    }
  }

  /**
   * Validate reserve accounting
   */
  async _validateReserveAccounting() {
    console.log("\n🏦 Validating Reserve Accounting...");

    const reserves = await this.bondingCurve.getReserveBalance();
    const contractBalance = await ethers.provider.getBalance(
      this.bondingCurve.address
    );

    // Reserves should match contract ETH balance
    this._assert(
      reserves.eq(contractBalance),
      "Reserve accounting should match contract ETH balance",
      "CRITICAL"
    );

    // Reserve ratio calculation
    const reserveRatio = await this.bondingCurve.getReserveRatio();
    const supply = await this.token.totalSupply();
    const price = await this.bondingCurve.getCurrentPrice();

    if (supply.gt(0) && price.gt(0)) {
      // Manual calculation: (reserves * 1e8) / (supply * price / 1e18)
      const marketCap = supply
        .mul(price)
        .div(ethers.BigNumber.from(10).pow(18));
      const expectedRatio = marketCap.gt(0)
        ? reserves.mul(ethers.BigNumber.from(10).pow(8)).div(marketCap)
        : 0;

      const ratioDifference = reserveRatio.sub(expectedRatio).abs();
      const tolerance = expectedRatio.div(100); // 1% tolerance

      this._assert(
        ratioDifference.lte(tolerance),
        "Reserve ratio calculation should be accurate",
        "WARNING"
      );
    }

    console.log(`✅ Reserve accounting validated`);
    console.log(
      `   Contract ETH: ${ethers.utils.formatEther(contractBalance)}`
    );
    console.log(`   Recorded reserves: ${ethers.utils.formatEther(reserves)}`);
    console.log(
      `   Reserve ratio: ${ethers.utils.formatUnits(reserveRatio, 6)}%`
    );
  }

  /**
   * Validate event emissions
   */
  async _validateEventEmissions() {
    console.log("\n📡 Validating Event Emissions...");

    const [user] = await ethers.getSigners();

    // Test buy event
    const ethAmount = ethers.utils.parseEther("0.05");
    const buyTx = await this.bondingCurve.buy(0, { value: ethAmount });
    const buyReceipt = await buyTx.wait();

    const purchaseEvent = buyReceipt.events?.find(
      (e) => e.event === "TokensPurchased"
    );
    this._assert(
      purchaseEvent != null,
      "TokensPurchased event should be emitted",
      "CRITICAL"
    );

    if (purchaseEvent) {
      this._assert(
        purchaseEvent.args.buyer === user.address,
        "Purchase event should record correct buyer",
        "CRITICAL"
      );
      this._assert(
        purchaseEvent.args.ethSpent.eq(ethAmount),
        "Purchase event should record correct ETH amount",
        "CRITICAL"
      );
    }

    // Test sell event (if user has tokens)
    const userBalance = await this.token.balanceOf(user.address);
    if (userBalance.gt(0)) {
      const sellAmount = userBalance.div(5);
      const sellTx = await this.bondingCurve.sell(sellAmount, 0);
      const sellReceipt = await sellTx.wait();

      const saleEvent = sellReceipt.events?.find(
        (e) => e.event === "TokensSold"
      );
      this._assert(
        saleEvent != null,
        "TokensSold event should be emitted",
        "CRITICAL"
      );
    }

    console.log(`✅ Event emissions validated`);
  }

  /**
   * Validate edge cases
   */
  async _validateEdgeCases() {
    console.log("\n⚠️  Validating Edge Cases...");

    const [user] = await ethers.getSigners();

    // Test minimum buy amount
    try {
      await this.bondingCurve.buy(0, { value: 1 }); // 1 wei
      console.log(`✅ Minimum buy amount works`);
    } catch (error) {
      console.log(`⚠️  Minimum buy failed: ${error.message.split("(")[0]}`);
    }

    // Test zero buy amount (should fail)
    try {
      await this.bondingCurve.buy(0, { value: 0 });
      this._recordError("Zero ETH buy should have failed", "CRITICAL");
    } catch (error) {
      if (error.message.includes("Must send ETH")) {
        console.log(`✅ Zero ETH buy correctly rejected`);
      }
    }

    // Test selling more tokens than owned (should fail)
    const userBalance = await this.token.balanceOf(user.address);
    const excessiveAmount = userBalance.add(ethers.utils.parseEther("1000"));

    try {
      await this.bondingCurve.sell(excessiveAmount, 0);
      this._recordError(
        "Selling more than owned should have failed",
        "CRITICAL"
      );
    } catch (error) {
      if (error.message.includes("Insufficient token balance")) {
        console.log(`✅ Excessive sell correctly rejected`);
      }
    }

    // Test direct ETH transfer (should fail)
    try {
      await user.sendTransaction({
        to: this.bondingCurve.address,
        value: ethers.utils.parseEther("0.1"),
      });
      this._recordError("Direct ETH transfer should have failed", "CRITICAL");
    } catch (error) {
      if (error.message.includes("Use buy() function")) {
        console.log(`✅ Direct ETH transfer correctly rejected`);
      }
    }

    console.log(`✅ Edge cases validated`);
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
    console.log("📊 VALIDATION REPORT");
    console.log("=".repeat(50));

    if (
      this.validationErrors.length === 0 &&
      this.validationWarnings.length === 0
    ) {
      console.log("🎉 ALL VALIDATIONS PASSED!");
      console.log("✅ Token flow mechanics are working correctly");
      console.log("✅ Buy/sell functionality is robust");
      console.log("✅ Slippage protection is effective");
      console.log("✅ Reserve accounting is accurate");
      console.log("✅ Event emissions are correct");
      console.log("✅ Edge cases are handled properly");
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

    console.log("=".repeat(50));

    if (this.validationErrors.length > 0) {
      throw new Error(
        `Validation failed with ${this.validationErrors.length} critical errors`
      );
    }
  }
}

module.exports = { TokenFlowValidator };
