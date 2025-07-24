const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Fixed-Point Math - Rust Implementation", function () {
  let calculator;
  let comparisonTest;
  const SCALE = ethers.utils.parseEther("1"); // 10^18

  // Helper to convert decimal to fixed-point
  const toFixed = (value) => {
    return ethers.utils.parseEther(value.toString());
  };

  // Helper to convert fixed-point to decimal string
  const fromFixed = (value) => {
    return ethers.utils.formatEther(value);
  };

  before(async function () {
    const RUST_CALCULATOR_ADDRESS = process.env.RUST_CALCULATOR_ADDRESS;

    if (!RUST_CALCULATOR_ADDRESS) {
      console.log(
        "⚠️  RUST_CALCULATOR_ADDRESS not set. Skipping fixed-point tests."
      );
      this.skip();
    }

    // Get the calculator interface
    calculator = await ethers.getContractAt(
      "ISigmoidCalculator",
      RUST_CALCULATOR_ADDRESS
    );

    // Deploy comparison test contract
    const FixedPointComparisonTest = await ethers.getContractFactory(
      "FixedPointComparisonTest"
    );
    comparisonTest = await FixedPointComparisonTest.deploy(
      RUST_CALCULATOR_ADDRESS
    );
    await comparisonTest.deployed();

    console.log(
      "✅ Fixed-point comparison test deployed at:",
      comparisonTest.address
    );
  });

  describe("Basic Fixed-Point Operations", function () {
    it("Should return correct scale factor", async function () {
      const scale = await calculator.scale();
      expect(scale).to.equal(SCALE);
      console.log("   Scale factor:", scale.toString());
    });

    it("Should multiply fixed-point numbers correctly", async function () {
      // Test: 1.5 * 2.0 = 3.0
      const a = toFixed("1.5");
      const b = toFixed("2.0");
      const result = await calculator.mulFixed(a, b);
      const expected = toFixed("3.0");

      console.log(`   1.5 * 2.0 = ${fromFixed(result)} (expected: 3.0)`);
      expect(result).to.equal(expected);
    });

    it("Should divide fixed-point numbers correctly", async function () {
      // Test: 6.0 / 2.0 = 3.0
      const a = toFixed("6.0");
      const b = toFixed("2.0");
      const result = await calculator.divFixed(a, b);
      const expected = toFixed("3.0");

      console.log(`   6.0 / 2.0 = ${fromFixed(result)} (expected: 3.0)`);
      expect(result).to.equal(expected);
    });

    it("Should square fixed-point numbers correctly", async function () {
      // Test: 3.0^2 = 9.0
      const a = toFixed("3.0");
      const result = await calculator.squareFixed(a);
      const expected = toFixed("9.0");

      console.log(`   3.0^2 = ${fromFixed(result)} (expected: 9.0)`);
      expect(result).to.equal(expected);
    });
  });

  describe("Precision Tests", function () {
    it("Should handle small numbers with precision", async function () {
      // Test: 0.001 * 0.001 = 0.000001
      const a = toFixed("0.001");
      const b = toFixed("0.001");
      const result = await calculator.mulFixed(a, b);
      const resultDecimal = fromFixed(result);

      console.log(`   0.001 * 0.001 = ${resultDecimal}`);
      expect(parseFloat(resultDecimal)).to.be.closeTo(0.000001, 0.0000001);
    });

    it("Should handle large numbers correctly", async function () {
      // Test: 1000.0 * 1000.0 = 1000000.0
      const a = toFixed("1000");
      const b = toFixed("1000");
      const result = await calculator.mulFixed(a, b);
      const expected = toFixed("1000000");

      console.log(`   1000 * 1000 = ${fromFixed(result)}`);
      expect(result).to.equal(expected);
    });
  });

  describe("Rust vs Solidity Comparison", function () {
    it("Should verify scale matches", async function () {
      const scaleMatches = await comparisonTest.verifyScale();
      expect(scaleMatches).to.be.true;
    });

    it("Should compare all operations and measure gas", async function () {
      console.log("\n📊 Rust vs Solidity Fixed-Point Math Comparison:\n");

      const tx = await comparisonTest.runAllTests();
      const receipt = await tx.wait();

      // Parse comparison events
      const events = receipt.events.filter(
        (e) => e.event === "ComparisonResult"
      );

      events.forEach((event) => {
        const {
          operation,
          rustResult,
          solidityResult,
          difference,
          rustGas,
          solidityGas,
        } = event.args;

        console.log(`   ${operation}:`);
        console.log(`     Rust Result:     ${fromFixed(rustResult)}`);
        console.log(`     Solidity Result: ${fromFixed(solidityResult)}`);
        console.log(`     Difference:      ${difference.toString()} wei`);
        console.log(`     Rust Gas:        ${rustGas.toString()}`);
        console.log(`     Solidity Gas:    ${solidityGas.toString()}`);
        console.log(
          `     Gas Savings:     ${solidityGas
            .sub(rustGas)
            .toString()} (${Math.round(
            (solidityGas.sub(rustGas).toNumber() / solidityGas.toNumber()) * 100
          )}%)\n`
        );

        // Results should match exactly
        expect(difference).to.equal(0);
      });
    });
  });

  describe("Edge Cases", function () {
    it("Should handle division by large numbers", async function () {
      const a = toFixed("1");
      const b = toFixed("1000000");
      const result = await calculator.divFixed(a, b);
      const resultDecimal = fromFixed(result);

      console.log(`   1 / 1000000 = ${resultDecimal}`);
      expect(parseFloat(resultDecimal)).to.be.closeTo(0.000001, 0.0000001);
    });

    it("Should handle multiplication resulting in very large numbers", async function () {
      const a = toFixed("1000000");
      const b = toFixed("1000000");
      const result = await calculator.mulFixed(a, b);
      const expected = toFixed("1000000000000"); // 1 trillion

      console.log(`   1M * 1M = ${fromFixed(result)}`);
      expect(result).to.equal(expected);
    });
  });
});
