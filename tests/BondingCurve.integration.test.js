const { expect } = require("chai");
const { ethers } = require("hardhat");
const { GasTestUtils } = require("./gas-measurement");

describe("BondingCurve Integration - Buy/Sell Mechanics", function () {
  let ChatbotToken, SigmoidBondingCurve;
  let token, bondingCurve;
  let owner, alice, bob, charlie, dave, notifier;
  let gasUtils;

  // Test parameters
  const PRICE_PRECISION = ethers.BigNumber.from("100000000"); // 1e8
  const A = PRICE_PRECISION.mul(1000); // Max price: 1000
  const k = ethers.utils.parseEther("0.001"); // Steepness: 0.001
  const B = ethers.utils.parseEther("10000"); // Inflection: 10,000 tokens

  beforeEach(async function () {
    [owner, alice, bob, charlie, dave, notifier] = await ethers.getSigners();
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

    // Configure permissions
    const MINTER_ROLE = await token.MINTER_ROLE();
    const BURNER_ROLE = await token.BURNER_ROLE();
    const SUPPLY_NOTIFIER_ROLE = await bondingCurve.SUPPLY_NOTIFIER_ROLE();

    await token.grantRole(MINTER_ROLE, bondingCurve.address);
    await token.grantRole(BURNER_ROLE, bondingCurve.address);
    await bondingCurve.grantRole(SUPPLY_NOTIFIER_ROLE, notifier.address);
  });

  describe("Complete Buy/Sell Flow", function () {
    it("Should handle full purchase -> hold -> sell cycle", async function () {
      console.log("\n🔄 COMPLETE BUY/SELL CYCLE TEST");
      console.log("=".repeat(60));

      // === PHASE 1: INITIAL PURCHASE ===
      const purchaseAmount = ethers.utils.parseEther("2");
      const aliceInitialETH = await alice.getBalance();

      console.log("📈 Phase 1: Token Purchase");
      console.log(`Alice starting ETH: ${formatETH(aliceInitialETH)}`);

      const priceBefore = await bondingCurve.getCurrentPrice();
      console.log(`Initial price: ${formatPrice(priceBefore)}`);

      // Purchase tokens
      const buyResult = await gasUtils.measureTransaction(
        "full_cycle_buy",
        bondingCurve.connect(alice).buy(0, { value: purchaseAmount }),
        { phase: "initial_purchase", user: "alice" }
      );

      const tokensReceived = await token.balanceOf(alice.address);
      const priceAfter = await bondingCurve.getCurrentPrice();
      const reservesAfter = await bondingCurve.getReserveBalance();

      console.log(`ETH spent: ${formatETH(purchaseAmount)}`);
      console.log(`Tokens received: ${formatTokens(tokensReceived)}`);
      console.log(`Price after: ${formatPrice(priceAfter)}`);
      console.log(`Reserves: ${formatETH(reservesAfter)}`);
      console.log(`Buy gas: ${buyResult.gasUsed.toString()}`);

      // === PHASE 2: HOLD PERIOD WITH EXTERNAL EVENTS ===
      console.log("\n⏳ Phase 2: Hold Period with AI Events");

      // Simulate AI likes (supply increases)
      await bondingCurve
        .connect(notifier)
        .notifySupplyChange(ethers.utils.parseEther("50"), "AI like rewards");

      const priceAfterLikes = await bondingCurve.getCurrentPrice();
      console.log(`Price after AI likes: ${formatPrice(priceAfterLikes)}`);

      // === PHASE 3: PARTIAL SELL ===
      console.log("\n📉 Phase 3: Partial Token Sale");

      const sellAmount = tokensReceived.div(3); // Sell 1/3 of tokens
      const ethBalanceBeforeSell = await alice.getBalance();

      const sellResult = await gasUtils.measureTransaction(
        "full_cycle_sell",
        bondingCurve.connect(alice).sell(sellAmount, 0),
        { phase: "partial_sell", user: "alice" }
      );

      const ethBalanceAfterSell = await alice.getBalance();
      const tokensRemaining = await token.balanceOf(alice.address);
      const finalPrice = await bondingCurve.getCurrentPrice();
      const finalReserves = await bondingCurve.getReserveBalance();

      // Calculate net ETH change (accounting for gas)
      const ethReceived = ethBalanceAfterSell.sub(ethBalanceBeforeSell);

      console.log(`Tokens sold: ${formatTokens(sellAmount)}`);
      console.log(`ETH received (net): ${formatETH(ethReceived)}`);
      console.log(`Tokens remaining: ${formatTokens(tokensRemaining)}`);
      console.log(`Final price: ${formatPrice(finalPrice)}`);
      console.log(`Final reserves: ${formatETH(finalReserves)}`);
      console.log(`Sell gas: ${sellResult.gasUsed.toString()}`);

      // === PHASE 4: ANALYSIS ===
      console.log("\n📊 Phase 4: Cycle Analysis");

      const stats = await bondingCurve.getTradingStatistics();
      const reserveRatio = await bondingCurve.getReserveRatio();

      console.log(`Volume bought: ${formatTokens(stats[0])}`);
      console.log(`Volume sold: ${formatTokens(stats[1])}`);
      console.log(`ETH inflow: ${formatETH(stats[2])}`);
      console.log(`ETH outflow: ${formatETH(stats[3])}`);
      console.log(`Net flow: ${formatETH(stats[4])}`);
      console.log(`Reserve ratio: ${formatPercent(reserveRatio)}`);

      // Verify invariants
      expect(tokensRemaining).to.be.gt(0);
      expect(finalReserves).to.be.gt(0);
      expect(finalPrice).to.be.gt(priceBefore); // Should be higher due to AI likes
      expect(reserveRatio).to.be.gt(0);
    });

    it("Should handle multiple users trading simultaneously", async function () {
      console.log("\n👥 MULTI-USER TRADING TEST");
      console.log("=".repeat(60));

      const users = [alice, bob, charlie, dave];
      const purchases = [
        ethers.utils.parseEther("0.5"),
        ethers.utils.parseEther("1.0"),
        ethers.utils.parseEther("0.3"),
        ethers.utils.parseEther("0.8"),
      ];

      console.log("📈 Phase 1: Simultaneous Purchases");

      // All users buy tokens
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const amount = purchases[i];
        const userName = ["Alice", "Bob", "Charlie", "Dave"][i];

        const priceBefore = await bondingCurve.getCurrentPrice();
        await bondingCurve.connect(user).buy(0, { value: amount });
        const priceAfter = await bondingCurve.getCurrentPrice();
        const tokens = await token.balanceOf(user.address);

        console.log(
          `${userName}: ${formatETH(amount)} ETH -> ${formatTokens(tokens)} CBT`
        );
        console.log(
          `  Price: ${formatPrice(priceBefore)} -> ${formatPrice(priceAfter)}`
        );
      }

      const totalSupplyAfterBuys = await token.totalSupply();
      const reservesAfterBuys = await bondingCurve.getReserveBalance();

      console.log(`\nTotal supply: ${formatTokens(totalSupplyAfterBuys)}`);
      console.log(`Total reserves: ${formatETH(reservesAfterBuys)}`);

      // Simulate AI activity
      console.log("\n🤖 Phase 2: AI Activity Simulation");

      await bondingCurve
        .connect(notifier)
        .notifySupplyChange(ethers.utils.parseEther("25"), "AI likes batch 1");

      await bondingCurve
        .connect(notifier)
        .notifySupplyChange(ethers.utils.parseEther("-10"), "AI dislike");

      await bondingCurve
        .connect(notifier)
        .notifySupplyChange(ethers.utils.parseEther("15"), "AI likes batch 2");

      const priceAfterAI = await bondingCurve.getCurrentPrice();
      console.log(`Price after AI activity: ${formatPrice(priceAfterAI)}`);

      // Some users sell
      console.log("\n📉 Phase 3: Partial Sales");

      const sellRatios = [0.2, 0.5, 0.3, 0.1]; // Different sell percentages

      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const userName = ["Alice", "Bob", "Charlie", "Dave"][i];
        const sellRatio = sellRatios[i];

        const balance = await token.balanceOf(user.address);
        const sellAmount = balance.mul(Math.floor(sellRatio * 100)).div(100);

        if (sellAmount.gt(0)) {
          await bondingCurve.connect(user).sell(sellAmount, 0);
          const remainingBalance = await token.balanceOf(user.address);

          console.log(
            `${userName}: Sold ${formatTokens(sellAmount)} (${
              sellRatio * 100
            }%)`
          );
          console.log(`  Remaining: ${formatTokens(remainingBalance)}`);
        }
      }

      // Final analysis
      const finalStats = await bondingCurve.getTradingStatistics();
      const finalSupply = await token.totalSupply();
      const finalReserves = await bondingCurve.getReserveBalance();
      const finalPrice = await bondingCurve.getCurrentPrice();

      console.log("\n📊 Final State:");
      console.log(`Supply: ${formatTokens(finalSupply)}`);
      console.log(`Reserves: ${formatETH(finalReserves)}`);
      console.log(`Price: ${formatPrice(finalPrice)}`);
      console.log(`Total volume bought: ${formatTokens(finalStats[0])}`);
      console.log(`Total volume sold: ${formatTokens(finalStats[1])}`);
    });
  });

  describe("Slippage Protection Edge Cases", function () {
    beforeEach(async function () {
      // Create some initial liquidity
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("1") });
    });

    it("Should protect against sandwich attacks", async function () {
      console.log("\n🥪 SANDWICH ATTACK PROTECTION TEST");
      console.log("=".repeat(60));

      // Scenario: Large purchase -> victim transaction -> large sale
      const largePurchase = ethers.utils.parseEther("5");
      const victimPurchase = ethers.utils.parseEther("0.1");

      // Step 1: Attacker makes large purchase (front-run)
      console.log("⚡ Attacker front-runs with large purchase...");
      const priceBeforeAttack = await bondingCurve.getCurrentPrice();
      await bondingCurve.connect(bob).buy(0, { value: largePurchase });
      const priceAfterFrontRun = await bondingCurve.getCurrentPrice();

      console.log(
        `Price manipulation: ${formatPrice(priceBeforeAttack)} -> ${formatPrice(
          priceAfterFrontRun
        )}`
      );
      const priceIncrease = priceAfterFrontRun.sub(priceBeforeAttack);
      const priceIncreasePercent = priceIncrease
        .mul(10000)
        .div(priceBeforeAttack);
      console.log(`Price increase: ${priceIncreasePercent.toString()} bps`);

      // Step 2: Victim transaction with slippage protection
      console.log("\n🛡️ Victim transaction with slippage protection...");
      const expectedTokens = await bondingCurve.calculateTokensForEth(
        victimPurchase
      );
      const minTokensWithSlippage = expectedTokens.mul(95).div(100); // 5% slippage tolerance

      // This should work despite price increase
      await bondingCurve
        .connect(charlie)
        .buy(minTokensWithSlippage, { value: victimPurchase });
      const victimTokens = await token.balanceOf(charlie.address);

      console.log(`Expected tokens: ${formatTokens(expectedTokens)}`);
      console.log(
        `Minimum with slippage: ${formatTokens(minTokensWithSlippage)}`
      );
      console.log(`Actual tokens received: ${formatTokens(victimTokens)}`);

      // Step 3: Attacker tries to sell (back-run)
      console.log("\n⚡ Attacker attempts back-run sale...");
      const attackerTokens = await token.balanceOf(bob.address);
      const sellAmount = attackerTokens.div(2);

      await bondingCurve.connect(bob).sell(sellAmount, 0);
      const finalPrice = await bondingCurve.getCurrentPrice();

      console.log(`Final price after attack: ${formatPrice(finalPrice)}`);

      // Victim should still have received reasonable value
      expect(victimTokens).to.be.gte(minTokensWithSlippage);
    });

    it("Should handle extreme slippage scenarios", async function () {
      const purchaseAmount = ethers.utils.parseEther("0.1");

      // Calculate expected tokens
      const expectedTokens = await bondingCurve.calculateTokensForEth(
        purchaseAmount
      );

      // Test different slippage tolerances
      const slippageTests = [
        { tolerance: 1, description: "1% slippage (very tight)" },
        { tolerance: 5, description: "5% slippage (reasonable)" },
        { tolerance: 10, description: "10% slippage (loose)" },
        { tolerance: 50, description: "50% slippage (very loose)" },
      ];

      for (const test of slippageTests) {
        const minTokens = expectedTokens.mul(100 - test.tolerance).div(100);

        try {
          await bondingCurve
            .connect(dave)
            .buy(minTokens, { value: purchaseAmount });
          console.log(`✅ ${test.description}: Succeeded`);
        } catch (error) {
          console.log(
            `❌ ${test.description}: Failed - ${error.message.split("(")[0]}`
          );
        }
      }
    });
  });

  describe("Reserve Management Stress Tests", function () {
    it("Should maintain reserve integrity under heavy trading", async function () {
      console.log("\n💪 RESERVE INTEGRITY STRESS TEST");
      console.log("=".repeat(60));

      const iterations = 10;
      const baseAmount = ethers.utils.parseEther("0.2");

      console.log(`Running ${iterations} buy/sell cycles...`);

      for (let i = 0; i < iterations; i++) {
        const buyer = i % 2 === 0 ? alice : bob;
        const purchaseAmount = baseAmount.mul(i + 1).div(2); // Varying amounts

        // Buy
        await bondingCurve.connect(buyer).buy(0, { value: purchaseAmount });

        // Immediate partial sell
        const balance = await token.balanceOf(buyer.address);
        const sellAmount = balance.div(3);

        if (sellAmount.gt(0)) {
          await bondingCurve.connect(buyer).sell(sellAmount, 0);
        }

        // Check reserve integrity
        const reserves = await bondingCurve.getReserveBalance();
        const reserveRatio = await bondingCurve.getReserveRatio();

        expect(reserves).to.be.gte(0);
        expect(reserveRatio).to.be.gte(0);

        if (i % 3 === 0) {
          console.log(
            `Cycle ${i + 1}: Reserves ${formatETH(
              reserves
            )}, Ratio ${formatPercent(reserveRatio)}`
          );
        }
      }

      const finalStats = await bondingCurve.getTradingStatistics();
      console.log("\nFinal Statistics:");
      console.log(`Total ETH inflow: ${formatETH(finalStats[2])}`);
      console.log(`Total ETH outflow: ${formatETH(finalStats[3])}`);
      console.log(`Net ETH retained: ${formatETH(finalStats[4])}`);
    });

    it("Should prevent reserve depletion", async function () {
      // Create scenario where reserves might be at risk

      // Large initial purchase
      await bondingCurve
        .connect(alice)
        .buy(0, { value: ethers.utils.parseEther("2") });

      // Simulate significant token minting via AI likes
      await bondingCurve
        .connect(notifier)
        .notifySupplyChange(ethers.utils.parseEther("500"), "Large AI reward");

      // Try to sell all tokens (should work due to increased supply/price)
      const aliceTokens = await token.balanceOf(alice.address);

      // This should not fail due to insufficient reserves
      await expect(
        bondingCurve.connect(alice).sell(aliceTokens, 0)
      ).to.not.be.revertedWith("InsufficientReserves");
    });
  });

  describe("Price Discovery Mechanisms", function () {
    it("Should demonstrate price discovery through trading", async function () {
      console.log("\n🎯 PRICE DISCOVERY DEMONSTRATION");
      console.log("=".repeat(60));

      const tradingEvents = [
        {
          action: "buy",
          user: alice,
          amount: ethers.utils.parseEther("0.5"),
          desc: "Initial purchase",
        },
        {
          action: "buy",
          user: bob,
          amount: ethers.utils.parseEther("1.0"),
          desc: "Second buyer joins",
        },
        {
          action: "ai_like",
          amount: ethers.utils.parseEther("75"),
          desc: "AI rewards users",
        },
        {
          action: "buy",
          user: charlie,
          amount: ethers.utils.parseEther("0.3"),
          desc: "FOMO purchase",
        },
        {
          action: "ai_dislike",
          amount: ethers.utils.parseEther("-25"),
          desc: "AI penalty",
        },
        { action: "sell", user: alice, ratio: 0.3, desc: "Profit taking" },
        {
          action: "buy",
          user: dave,
          amount: ethers.utils.parseEther("0.8"),
          desc: "Dip buying",
        },
        {
          action: "ai_like",
          amount: ethers.utils.parseEther("50"),
          desc: "Recovery likes",
        },
      ];

      let priceHistory = [];

      for (const event of tradingEvents) {
        const priceBefore = await bondingCurve.getCurrentPrice();
        const supplyBefore = await token.totalSupply();

        if (event.action === "buy") {
          await bondingCurve
            .connect(event.user)
            .buy(0, { value: event.amount });
        } else if (event.action === "sell") {
          const balance = await token.balanceOf(event.user.address);
          const sellAmount = balance
            .mul(Math.floor(event.ratio * 100))
            .div(100);
          await bondingCurve.connect(event.user).sell(sellAmount, 0);
        } else if (
          event.action === "ai_like" ||
          event.action === "ai_dislike"
        ) {
          await bondingCurve
            .connect(notifier)
            .notifySupplyChange(event.amount, event.desc);
        }

        const priceAfter = await bondingCurve.getCurrentPrice();
        const supplyAfter = await token.totalSupply();

        const priceChange = priceAfter.sub(priceBefore);
        const priceChangePercent = priceBefore.gt(0)
          ? priceChange.mul(10000).div(priceBefore)
          : 0;

        console.log(`${event.desc}:`);
        console.log(
          `  Price: ${formatPrice(priceBefore)} -> ${formatPrice(
            priceAfter
          )} (${
            priceChangePercent > 0 ? "+" : ""
          }${priceChangePercent.toString()} bps)`
        );
        console.log(
          `  Supply: ${formatTokens(supplyBefore)} -> ${formatTokens(
            supplyAfter
          )}`
        );

        priceHistory.push({
          event: event.desc,
          price: priceAfter,
          supply: supplyAfter,
        });
      }

      // Analyze price volatility
      console.log("\n📈 Price Volatility Analysis:");
      let maxPrice = ethers.BigNumber.from(0);
      let minPrice = ethers.constants.MaxUint256;

      for (const point of priceHistory) {
        if (point.price.gt(maxPrice)) maxPrice = point.price;
        if (point.price.lt(minPrice)) minPrice = point.price;
      }

      const volatility = maxPrice.sub(minPrice).mul(10000).div(minPrice);
      console.log(
        `Price range: ${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`
      );
      console.log(`Volatility: ${volatility.toString()} bps`);
    });
  });

  describe("Gas Efficiency Analysis", function () {
    it("Should measure gas efficiency across different scenarios", async function () {
      console.log("\n⛽ GAS EFFICIENCY ANALYSIS");
      console.log("=".repeat(60));

      const scenarios = [
        { name: "Small Purchase", ethAmount: ethers.utils.parseEther("0.01") },
        { name: "Medium Purchase", ethAmount: ethers.utils.parseEther("0.1") },
        { name: "Large Purchase", ethAmount: ethers.utils.parseEther("1.0") },
        {
          name: "Very Large Purchase",
          ethAmount: ethers.utils.parseEther("5.0"),
        },
      ];

      console.log("Buy Transaction Gas Costs:");
      for (const scenario of scenarios) {
        const gasResult = await gasUtils.measureTransaction(
          `buy_${scenario.name.toLowerCase().replace(" ", "_")}`,
          bondingCurve.connect(alice).buy(0, { value: scenario.ethAmount }),
          { scenario: scenario.name, amount: scenario.ethAmount.toString() }
        );

        console.log(`  ${scenario.name}: ${gasResult.gasUsed.toString()} gas`);
      }

      // Now test sell gas costs
      console.log("\nSell Transaction Gas Costs:");
      const aliceBalance = await token.balanceOf(alice.address);

      const sellScenarios = [
        { name: "Small Sell", ratio: 0.05 },
        { name: "Medium Sell", ratio: 0.25 },
        { name: "Large Sell", ratio: 0.5 },
      ];

      for (const scenario of sellScenarios) {
        const sellAmount = aliceBalance
          .mul(Math.floor(scenario.ratio * 100))
          .div(100);

        const gasResult = await gasUtils.measureTransaction(
          `sell_${scenario.name.toLowerCase().replace(" ", "_")}`,
          bondingCurve.connect(alice).sell(sellAmount, 0),
          { scenario: scenario.name, ratio: scenario.ratio }
        );

        console.log(`  ${scenario.name}: ${gasResult.gasUsed.toString()} gas`);
      }
    });
  });

  afterEach(function () {
    // gasUtils.printFinalReport();
  });

  // ============ UTILITY FUNCTIONS ============

  function formatETH(amount) {
    return ethers.utils.formatEther(amount);
  }

  function formatTokens(amount) {
    return ethers.utils.formatEther(amount);
  }

  function formatPrice(price) {
    return ethers.utils.formatUnits(price, 8);
  }

  function formatPercent(ratio) {
    return ethers.utils.formatUnits(ratio, 6) + "%";
  }
});
