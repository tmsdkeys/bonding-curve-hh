const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Rust Sigmoid Calculator Integration", function () {
  let calculatorTest;
  let calculatorAddress;

  // This address should be set after deploying the Rust contract
  const RUST_CALCULATOR_ADDRESS = process.env.RUST_CALCULATOR_ADDRESS;

  before(async function () {
    if (!RUST_CALCULATOR_ADDRESS) {
      console.log(
        "⚠️  RUST_CALCULATOR_ADDRESS not set. Skipping integration tests."
      );
      console.log("   Deploy the Rust contract first and set the address.");
      this.skip();
    }

    calculatorAddress = RUST_CALCULATOR_ADDRESS;
    console.log(`🦀 Testing Rust calculator at: ${calculatorAddress}`);

    // Deploy test contract
    const SigmoidCalculatorTest = await ethers.getContractFactory(
      "SigmoidCalculatorTest"
    );
    calculatorTest = await SigmoidCalculatorTest.deploy(calculatorAddress);
    await calculatorTest.deployed();
    console.log(`✅ Test contract deployed at: ${calculatorTest.address}`);
  });

  describe("Basic Functionality", function () {
    it("Should pass all integration tests", async function () {
      const tx = await calculatorTest.runAllTests();
      const receipt = await tx.wait();

      // Check events for test results
      const events = receipt.events.filter((e) => e.event === "TestResult");
      console.log("\n📊 Test Results:");

      events.forEach((event) => {
        const { test, passed, expected, actual } = event.args;
        console.log(
          `   ${
            passed ? "✅" : "❌"
          } ${test}: expected=${expected}, actual=${actual}`
        );
        expect(passed).to.be.true;
      });

      // Check overall success
      const success = await calculatorTest.runAllTests.staticCall();
      expect(success).to.be.true;
    });

    it("Should have reasonable gas costs", async function () {
      const { pingGas, echoGas, addGas } =
        await calculatorTest.measureGasCosts();

      console.log("\n⛽ Gas Costs:");
      console.log(`   ping(): ${pingGas.toString()} gas`);
      console.log(`   echoValue(): ${echoGas.toString()} gas`);
      console.log(`   addValues(): ${addGas.toString()} gas`);

      // Basic sanity checks - Rust calls should be reasonable
      expect(pingGas).to.be.lt(100000);
      expect(echoGas).to.be.lt(100000);
      expect(addGas).to.be.lt(100000);
    });
  });

  describe("Direct Calls", function () {
    let calculator;

    before(async function () {
      calculator = await ethers.getContractAt(
        "ISigmoidCalculator",
        calculatorAddress
      );
    });

    it("Should ping successfully", async function () {
      const result = await calculator.ping();
      expect(result).to.equal(42);
    });

    it("Should return correct version", async function () {
      const version = await calculator.getVersion();
      expect(version).to.equal(1);
    });

    it("Should echo values correctly", async function () {
      const testValues = [0, 1, 42, 12345, ethers.constants.MaxUint256];

      for (const value of testValues) {
        const result = await calculator.echoValue(value);
        expect(result).to.equal(value);
      }
    });

    it("Should add values correctly", async function () {
      const testCases = [
        { a: 0, b: 0, expected: 0 },
        { a: 1, b: 1, expected: 2 },
        { a: 100, b: 200, expected: 300 },
        {
          a: ethers.utils.parseEther("1"),
          b: ethers.utils.parseEther("2"),
          expected: ethers.utils.parseEther("3"),
        },
      ];

      for (const { a, b, expected } of testCases) {
        const result = await calculator.addValues(a, b);
        expect(result).to.equal(expected);
      }
    });
  });
});
