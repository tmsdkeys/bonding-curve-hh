const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Sigmoid Implementation - Rust vs Solidity", function () {
  let calculator;
  let comparisonTest;
  const SCALE = ethers.utils.parseEther("1");
  const PRICE_PRECISION = ethers.BigNumber.from("100000000"); // 1e8

  before(async function () {
    const RUST_CALCULATOR_ADDRESS = process.env.RUST_CALCULATOR_ADDRESS;

    if (!RUST_CALCULATOR_ADDRESS) {
      console.log(
        "⚠️  RUST_CALCULATOR_ADDRESS not set. Skipping sigmoid tests."
      );
      this.skip();
    }

    calculator = await ethers.getContractAt(
      "ISigmoidCalculator",
      RUST_CALCULATOR_ADDRESS
    );

    // Deploy comparison test
    const SigmoidComparisonTest = await ethers.getContractFactory(
      "SigmoidComparisonTest"
    );
    comparisonTest = await SigmoidComparisonTest.deploy(
      RUST_CALCULATOR_ADDRESS
    );
    await comparisonTest.deployed();

    console.log(
      "✅ Sigmoid comparison test deployed at:",
      comparisonTest.address
    );
  });

  describe("Exponential Function Tests", function () {
    it("Should calculate e^0 = 1", async function () {
      const result = await calculator.expTaylor(0, false);
      expect(result).to.equal(SCALE); // Should be exactly 1.0
    });

    it("Should calculate e^1 ≈ 2.71828", async function () {
      const result = await calculator.expTaylor(SCALE, false);
      const resultFloat = parseFloat(ethers.utils.formatEther(result));
      console.log(`   e^1 = ${resultFloat}`);
      expect(resultFloat).to.be.within(2.7, 2.8);
    });

    it("Should calculate e^(-1) ≈ 0.36788", async function () {
      const result = await calculator.expTaylor(SCALE, true);
      const resultFloat = parseFloat(ethers.utils.formatEther(result));
      console.log(`   e^(-1) = ${resultFloat}`);
      expect(resultFloat).to.be.within(0.36, 0.38);
    });

    it("Should handle larger exponents", async function () {
      // Test e^2
      const result = await calculator.expTaylor(SCALE.mul(2), false);
      const resultFloat = parseFloat(ethers.utils.formatEther(result));
      console.log(`   e^2 = ${resultFloat}`);
      expect(resultFloat).to.be.within(7.0, 7.5); // e^2 ≈ 7.389
    });
  });

  describe("Sigmoid Function Tests", function () {
    it("Should calculate sigmoid(0) = 0.5", async function () {
      const result = await calculator.sigmoid(0, false);
      const resultFloat = parseFloat(ethers.utils.formatEther(result));
      console.log(`   sigmoid(0) = ${resultFloat}`);
      expect(resultFloat).to.be.within(0.49, 0.51);
    });

    it("Should calculate sigmoid for positive values", async function () {
      // sigmoid(2) ≈ 0.88
      const result = await calculator.sigmoid(SCALE.mul(2), false);
      const resultFloat = parseFloat(ethers.utils.formatEther(result));
      console.log(`   sigmoid(2) = ${resultFloat}`);
      expect(resultFloat).to.be.within(0.87, 0.89);
    });

    it("Should calculate sigmoid for negative values", async function () {
      // sigmoid(-2) ≈ 0.12
      const result = await calculator.sigmoid(SCALE.mul(2), true);
      const resultFloat = parseFloat(ethers.utils.formatEther(result));
      console.log(`   sigmoid(-2) = ${resultFloat}`);
      expect(resultFloat).to.be.within(0.11, 0.13);
    });
  });

  describe("Bonding Curve Price Calculation", function () {
    const A = PRICE_PRECISION.mul(1000); // Max price: 1000
    const k = SCALE.div(1000); // Steepness: 0.001
    const B = SCALE.mul(10000); // Inflection: 10,000

    it("Should calculate price at supply = 0", async function () {
      const price = await calculator.calculatePrice(0, A, k, B);
      const priceFloat = price.toNumber() / 1e8;
      console.log(`   Price at supply 0: ${priceFloat}`);
      expect(priceFloat).to.be.lessThan(10); // Should be very low
    });

    it("Should calculate price at inflection point", async function () {
      const price = await calculator.calculatePrice(B, A, k, B);
      const priceFloat = price.toNumber() / 1e8;
      console.log(`   Price at inflection (10,000): ${priceFloat}`);
      expect(priceFloat).to.be.within(400, 600); // Should be around half of max
    });

    it("Should calculate price at high supply", async function () {
      const highSupply = SCALE.mul(20000);
      const price = await calculator.calculatePrice(highSupply, A, k, B);
      const priceFloat = price.toNumber() / 1e8;
      console.log(`   Price at supply 20,000: ${priceFloat}`);
      expect(priceFloat).to.be.greaterThan(900); // Should approach max
    });
  });

  describe("Rust vs Solidity Comparison", function () {
    it("Should run comprehensive comparison test", async function () {
      console.log("\n📊 Comprehensive Sigmoid Price Comparison:\n");

      const tx = await comparisonTest.runComprehensiveTest();
      const receipt = await tx.wait();

      const events = receipt.events.filter(
        (e) => e.event === "PriceComparison"
      );

      let totalGasSaved = ethers.BigNumber.from(0);
      let maxPriceDiff = 0;

      events.forEach((event, index) => {
        const {
          supply,
          rustPrice,
          solidityPrice,
          priceDiff,
          rustGas,
          solidityGas,
          gasReduction,
        } = event.args;

        const supplyFloat = parseFloat(ethers.utils.formatEther(supply));
        const rustPriceFloat = rustPrice.toNumber() / 1e8;
        const solidityPriceFloat = solidityPrice.toNumber() / 1e8;
        const priceDiffFloat = Math.abs(priceDiff.toNumber()) / 1e8;
        const percentDiff =
          solidityPriceFloat > 0
            ? (priceDiffFloat / solidityPriceFloat) * 100
            : 0;

        console.log(`   Supply: ${supplyFloat.toFixed(0)}`);
        console.log(`     Rust Price:     $${rustPriceFloat.toFixed(2)}`);
        console.log(`     Solidity Price: $${solidityPriceFloat.toFixed(2)}`);
        console.log(
          `     Difference:     $${priceDiffFloat.toFixed(
            2
          )} (${percentDiff.toFixed(2)}%)`
        );
        console.log(`     Rust Gas:       ${rustGas.toString()}`);
        console.log(`     Solidity Gas:   ${solidityGas.toString()}`);
        console.log(
          `     Gas Saved:      ${gasReduction.toString()} (${Math.round(
            (gasReduction.toNumber() / solidityGas.toNumber()) * 100
          )}%)\n`
        );

        totalGasSaved = totalGasSaved.add(gasReduction);
        maxPriceDiff = Math.max(maxPriceDiff, percentDiff);
      });

      console.log(`   📈 Total Gas Saved: ${totalGasSaved.toString()}`);
      console.log(`   📊 Max Price Difference: ${maxPriceDiff.toFixed(2)}%`);

      // Verify reasonable accuracy (within 5%)
      expect(maxPriceDiff).to.be.lessThan(5);
    });

    it("Should test edge cases", async function () {
      console.log("\n🔬 Edge Case Testing:\n");

      const tx = await comparisonTest.testEdgeCases();
      const receipt = await tx.wait();

      const events = receipt.events.filter(
        (e) => e.event === "PriceComparison"
      );

      events.forEach((event) => {
        const { supply, rustPrice, solidityPrice, gasReduction } = event.args;
        console.log(`   Supply: ${ethers.utils.formatEther(supply)}`);
        console.log(`   Gas Saved: ${gasReduction.toString()}`);
      });
    });
  });
});
