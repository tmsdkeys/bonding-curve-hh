const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Libm Integration - Precision Comparison", function () {
  let calculator;
  const SCALE = ethers.utils.parseEther("1");

  before(async function () {
    const RUST_CALCULATOR_ADDRESS = process.env.RUST_CALCULATOR_ADDRESS;

    if (!RUST_CALCULATOR_ADDRESS) {
      console.log("⚠️  RUST_CALCULATOR_ADDRESS not set. Skipping libm tests.");
      this.skip();
    }

    calculator = await ethers.getContractAt(
      "ISigmoidCalculator",
      RUST_CALCULATOR_ADDRESS
    );

    // Verify we have version 2 (with libm)
    const version = await calculator.getVersion();
    console.log(`📦 Sigmoid Calculator Version: ${version}`);
    expect(version).to.equal(2);
  });

  describe("Taylor vs Libm Exponential Comparison", function () {
    it("Should compare precision for various exponents", async function () {
      const testCases = [
        { x: 0, desc: "e^0" },
        { x: 0.5, desc: "e^0.5" },
        { x: 1, desc: "e^1" },
        { x: 2, desc: "e^2" },
        { x: 3, desc: "e^3" },
        { x: 5, desc: "e^5" },
        { x: -1, desc: "e^(-1)" },
        { x: -2, desc: "e^(-2)" },
        { x: -5, desc: "e^(-5)" },
      ];

      console.log("\n📊 Taylor Series vs Libm Precision Comparison:\n");
      console.log("Value | Taylor Result | Libm Result | Difference | % Error");
      console.log("------|---------------|-------------|------------|--------");

      for (const test of testCases) {
        const xFixed = ethers.utils.parseEther(Math.abs(test.x).toString());
        const isNegative = test.x < 0;

        // Get both results
        const taylorResult = await calculator.expTaylor(xFixed, isNegative);
        const libmResult = await calculator.expPrecise(xFixed, isNegative);

        // Convert to float for comparison
        const taylorFloat = parseFloat(ethers.utils.formatEther(taylorResult));
        const libmFloat = parseFloat(ethers.utils.formatEther(libmResult));

        // Calculate actual e^x value
        const actualValue = Math.exp(test.x);

        // Calculate errors
        const taylorError = Math.abs(
          ((taylorFloat - actualValue) / actualValue) * 100
        );
        const libmError = Math.abs(
          ((libmFloat - actualValue) / actualValue) * 100
        );

        console.log(
          `${test.desc.padEnd(6)} | ${taylorFloat
            .toFixed(6)
            .padEnd(13)} | ${libmFloat.toFixed(6).padEnd(11)} | ${(
            libmFloat - taylorFloat
          )
            .toFixed(6)
            .padEnd(11)} | ${libmError.toFixed(2)}%`
        );

        // Libm should be more accurate
        expect(libmError).to.be.lessThan(0.1); // Less than 0.1% error
      }
    });
  });

  describe("Integral Calculation Tests", function () {
    it("Should calculate integral for buy amounts", async function () {
      const A = ethers.utils.parseUnits("1000", 8); // Max price: 1000
      const k = SCALE.div(1000); // Steepness: 0.001
      const B = SCALE.mul(10000); // Inflection: 10,000

      console.log("\n📈 Integral Calculations (Buy Amounts):\n");

      const testRanges = [
        { from: 0, to: 1000, desc: "0 → 1,000 tokens" },
        { from: 9000, to: 10000, desc: "9,000 → 10,000 tokens" },
        { from: 10000, to: 11000, desc: "10,000 → 11,000 tokens" },
        { from: 0, to: 20000, desc: "0 → 20,000 tokens" },
      ];

      for (const range of testRanges) {
        const fromSupply = SCALE.mul(range.from);
        const toSupply = SCALE.mul(range.to);

        const integral = await calculator.calculateIntegral(
          fromSupply,
          toSupply,
          A,
          k,
          B
        );
        const integralFloat = parseFloat(ethers.utils.formatEther(integral));

        // Also calculate average price in this range
        const startPrice = await calculator.calculatePrice(fromSupply, A, k, B);
        const endPrice = await calculator.calculatePrice(toSupply, A, k, B);
        const avgPrice = startPrice.add(endPrice).div(2);
        const avgPriceFloat = avgPrice.toNumber() / 1e8;

        console.log(`${range.desc}:`);
        console.log(`  Total Cost: ${integralFloat.toFixed(2)} ETH`);
        console.log(`  Avg Price: $${avgPriceFloat.toFixed(2)}`);
        console.log(
          `  Cost per Token: ${(
            integralFloat /
            (range.to - range.from)
          ).toFixed(4)} ETH\n`
        );
      }
    });
  });

  describe("Precision Impact on Bonding Curve", function () {
    it("Should show improved accuracy at extreme values", async function () {
      const A = ethers.utils.parseUnits("1000", 8);
      const k = SCALE.div(1000);
      const B = SCALE.mul(10000);

      console.log("\n🎯 Precision at Extreme Supply Levels:\n");

      // Test very small and very large supplies
      const extremeSupplies = [
        { supply: 1, desc: "1 token (near zero)" },
        { supply: 100, desc: "100 tokens" },
        { supply: 50000, desc: "50,000 tokens" },
        { supply: 100000, desc: "100,000 tokens" },
        { supply: 1000000, desc: "1,000,000 tokens" },
      ];

      for (const test of extremeSupplies) {
        const supply = SCALE.mul(test.supply);
        const price = await calculator.calculatePrice(supply, A, k, B);
        const priceFloat = price.toNumber() / 1e8;

        console.log(`${test.desc}: $${priceFloat.toFixed(6)}`);

        // Verify price is within reasonable bounds
        expect(priceFloat).to.be.greaterThan(0);
        expect(priceFloat).to.be.lessThanOrEqual(1000);
      }
    });
  });

  describe("Gas Comparison: Taylor vs Libm", function () {
    it("Should measure gas difference between methods", async function () {
      console.log("\n⛽ Gas Usage Comparison:\n");

      const testValue = SCALE.mul(2); // e^2

      // Measure Taylor series gas
      const taylorGas = await calculator.estimateGas.expTaylor(
        testValue,
        false
      );

      // Measure libm gas
      const libmGas = await calculator.estimateGas.expPrecise(testValue, false);

      console.log(`Taylor Series: ${taylorGas.toString()} gas`);
      console.log(`Libm:          ${libmGas.toString()} gas`);
      console.log(
        `Difference:    ${taylorGas.sub(libmGas).toString()} gas saved`
      );

      // Libm might use slightly more gas but provides much better precision
      // The trade-off is worth it for financial calculations
    });
  });
});
