const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SigmoidMath - Mathematical Precision Tests", function () {
  let SigmoidMath, sigmoidMath;

  // Test parameters
  const PRICE_PRECISION = ethers.BigNumber.from("100000000"); // 1e8
  const TOKEN_PRECISION = ethers.utils.parseEther("1"); // 1e18

  // Standard test parameters for sigmoid curve
  const A = PRICE_PRECISION.mul(1000); // Max price: 1000.00000000
  const k = ethers.utils.parseEther("0.001"); // Steepness: 0.001 (1e15)
  const B = ethers.utils.parseEther("10000"); // Inflection: 10,000 tokens

  beforeEach(async function () {
    // Deploy test contract for SigmoidMath library
    const TestSigmoidMath = await ethers.getContractFactory("TestSigmoidMath");
    sigmoidMath = await TestSigmoidMath.deploy();
    await sigmoidMath.deployed();
  });

  describe("Parameter Validation", function () {
    it("Should accept valid parameters", async function () {
      const result = await sigmoidMath.testCalculateSigmoidPrice(
        ethers.utils.parseEther("5000"), // 5k tokens
        A,
        k,
        B
      );
      expect(result).to.be.gt(0);
    });

    it("Should reject A parameter out of bounds", async function () {
      const invalidA = PRICE_PRECISION.div(100); // Too small
      await expect(
        sigmoidMath.testCalculateSigmoidPrice(
          ethers.utils.parseEther("5000"),
          invalidA,
          k,
          B
        )
      ).to.be.revertedWith("ParameterOutOfBounds");
    });

    it("Should reject k parameter out of bounds", async function () {
      const invalidK = ethers.BigNumber.from(0); // Too small
      await expect(
        sigmoidMath.testCalculateSigmoidPrice(
          ethers.utils.parseEther("5000"),
          A,
          invalidK,
          B
        )
      ).to.be.revertedWith("ParameterOutOfBounds");
    });

    it("Should reject B parameter out of bounds", async function () {
      const invalidB = ethers.BigNumber.from(1); // Too small
      await expect(
        sigmoidMath.testCalculateSigmoidPrice(
          ethers.utils.parseEther("5000"),
          A,
          k,
          invalidB
        )
      ).to.be.revertedWith("ParameterOutOfBounds");
    });
  });

  describe("Sigmoid Curve Properties", function () {
    it("Should produce increasing prices with increasing supply", async function () {
      const supplies = [
        ethers.utils.parseEther("1000"), // 1k tokens
        ethers.utils.parseEther("5000"), // 5k tokens
        ethers.utils.parseEther("10000"), // 10k tokens (inflection)
        ethers.utils.parseEther("15000"), // 15k tokens
        ethers.utils.parseEther("20000"), // 20k tokens
      ];

      const prices = [];
      for (const supply of supplies) {
        const price = await sigmoidMath.testCalculateSigmoidPrice(
          supply,
          A,
          k,
          B
        );
        prices.push(price);
      }

      // Verify monotonically increasing
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).to.be.gt(
          prices[i - 1],
          `Price should increase: ${prices[i]} > ${prices[i - 1]}`
        );
      }

      console.log("Price progression:");
      supplies.forEach((supply, i) => {
        console.log(
          `  ${ethers.utils.formatEther(supply)} tokens -> ${formatPrice(
            prices[i]
          )} price`
        );
      });
    });

    it("Should approach maximum price asymptotically", async function () {
      const highSupply = ethers.utils.parseEther("100000"); // 100k tokens
      const veryHighSupply = ethers.utils.parseEther("1000000"); // 1M tokens

      const priceHigh = await sigmoidMath.testCalculateSigmoidPrice(
        highSupply,
        A,
        k,
        B
      );
      const priceVeryHigh = await sigmoidMath.testCalculateSigmoidPrice(
        veryHighSupply,
        A,
        k,
        B
      );

      // Should be close to max price A
      const maxPrice = A;
      const tolerance = maxPrice.div(100); // 1% tolerance

      expect(priceHigh).to.be.lt(maxPrice);
      expect(priceVeryHigh).to.be.lt(maxPrice);
      expect(maxPrice.sub(priceVeryHigh)).to.be.lt(tolerance);

      console.log(`High supply price: ${formatPrice(priceHigh)}`);
      console.log(`Very high supply price: ${formatPrice(priceVeryHigh)}`);
      console.log(`Max price A: ${formatPrice(maxPrice)}`);
    });

    it("Should have price ≈ A/2 at inflection point B", async function () {
      const priceAtInflection = await sigmoidMath.testCalculateSigmoidPrice(
        B,
        A,
        k,
        B
      );
      const expectedPrice = A.div(2); // A/2 at inflection
      const tolerance = expectedPrice.div(20); // 5% tolerance

      const difference = priceAtInflection.sub(expectedPrice).abs();
      expect(difference).to.be.lt(
        tolerance,
        `Price at inflection should be ~A/2: ${formatPrice(
          priceAtInflection
        )} ≈ ${formatPrice(expectedPrice)}`
      );

      console.log(
        `Price at inflection point: ${formatPrice(priceAtInflection)}`
      );
      console.log(`Expected (A/2): ${formatPrice(expectedPrice)}`);
      console.log(`Difference: ${formatPrice(difference)}`);
    });

    it("Should handle zero supply gracefully", async function () {
      const priceAtZero = await sigmoidMath.testCalculateSigmoidPrice(
        0,
        A,
        k,
        B
      );

      // Should be very small but positive
      expect(priceAtZero).to.be.gt(0);
      expect(priceAtZero).to.be.lt(A.div(100)); // Less than 1% of max

      console.log(`Price at zero supply: ${formatPrice(priceAtZero)}`);
    });
  });

  describe("Mathematical Precision", function () {
    it("Should maintain precision across different parameter scales", async function () {
      const testCases = [
        // [A, k, B, supply, description]
        [
          PRICE_PRECISION,
          ethers.utils.parseEther("0.01"),
          ethers.utils.parseEther("100"),
          ethers.utils.parseEther("50"),
          "Small scale",
        ],
        [
          PRICE_PRECISION.mul(10),
          ethers.utils.parseEther("0.001"),
          ethers.utils.parseEther("1000"),
          ethers.utils.parseEther("500"),
          "Medium scale",
        ],
        [
          PRICE_PRECISION.mul(100),
          ethers.utils.parseEther("0.0001"),
          ethers.utils.parseEther("100000"),
          ethers.utils.parseEther("50000"),
          "Large scale",
        ],
      ];

      for (const [testA, testK, testB, supply, description] of testCases) {
        const price = await sigmoidMath.testCalculateSigmoidPrice(
          supply,
          testA,
          testK,
          testB
        );
        expect(price).to.be.gt(
          0,
          `${description} should produce positive price`
        );
        expect(price).to.be.lt(
          testA,
          `${description} should be less than max price`
        );

        console.log(
          `${description}: ${formatPrice(price)} (max: ${formatPrice(testA)})`
        );
      }
    });

    it("Should produce consistent results for repeated calculations", async function () {
      const supply = ethers.utils.parseEther("7500");

      const results = [];
      for (let i = 0; i < 5; i++) {
        const price = await sigmoidMath.testCalculateSigmoidPrice(
          supply,
          A,
          k,
          B
        );
        results.push(price);
      }

      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).to.equal(
          results[0],
          "Results should be deterministic"
        );
      }
    });
  });

  describe("Gas Cost Analysis", function () {
    it("Should measure sigmoid calculation gas cost", async function () {
      const gasCost = await sigmoidMath.measureSigmoidGasCost();

      console.log(`Sigmoid calculation gas cost: ${gasCost.toString()}`);

      // Should be reasonable (under 100k gas for single calculation)
      expect(gasCost).to.be.lt(100000);
      expect(gasCost).to.be.gt(10000); // Should be substantial due to exponential
    });

    it("Should benchmark different supply ranges", async function () {
      const supplyRanges = [
        ethers.utils.parseEther("100"), // Low
        ethers.utils.parseEther("10000"), // Inflection
        ethers.utils.parseEther("100000"), // High
      ];

      console.log("Gas costs by supply range:");
      for (const supply of supplyRanges) {
        const tx = await sigmoidMath.testCalculateSigmoidPrice(supply, A, k, B);
        const receipt = await tx.wait();

        console.log(
          `  ${ethers.utils.formatEther(
            supply
          )} tokens: ${receipt.gasUsed.toString()} gas`
        );
      }
    });
  });

  describe("Built-in Test Suite", function () {
    it("Should run internal sigmoid tests successfully", async function () {
      const results = await sigmoidMath.runSigmoidTests();

      expect(results).to.have.length(5);

      console.log("Internal test results:");
      const labels = [
        "0% supply",
        "25% inflection",
        "50% inflection",
        "At inflection",
        "200% inflection",
      ];
      results.forEach((result, i) => {
        expect(result).to.be.gt(0);
        console.log(`  ${labels[i]}: ${formatPrice(result)}`);
      });

      // Verify ordering (prices should increase)
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).to.be.gt(results[i - 1]);
      }
    });
  });

  describe("Edge Cases & Error Handling", function () {
    it("Should handle extreme parameter values", async function () {
      const extremeCases = [
        // Very steep curve
        [A, ethers.utils.parseEther("1"), B, ethers.utils.parseEther("10000")],
        // Very shallow curve
        [A, ethers.BigNumber.from(1), B, ethers.utils.parseEther("10000")],
        // Very high max price
        [PRICE_PRECISION.mul(1000), k, B, ethers.utils.parseEther("10000")],
      ];

      for (const [testA, testK, testB, supply] of extremeCases) {
        try {
          const price = await sigmoidMath.testCalculateSigmoidPrice(
            supply,
            testA,
            testK,
            testB
          );
          expect(price).to.be.gt(0);
          console.log(`Extreme case result: ${formatPrice(price)}`);
        } catch (error) {
          console.log(
            `Expected error for extreme parameters: ${error.message}`
          );
        }
      }
    });

    it("Should handle supply values near inflection point", async function () {
      const nearInflectionSupplies = [
        B.sub(1), // Just below inflection
        B, // At inflection
        B.add(1), // Just above inflection
      ];

      const prices = [];
      for (const supply of nearInflectionSupplies) {
        const price = await sigmoidMath.testCalculateSigmoidPrice(
          supply,
          A,
          k,
          B
        );
        prices.push(price);
        console.log(
          `Supply ${ethers.utils.formatEther(supply)}: ${formatPrice(price)}`
        );
      }

      // Should be smooth transition
      expect(prices[1]).to.be.gt(prices[0]);
      expect(prices[2]).to.be.gt(prices[1]);
    });
  });

  describe("Comparison with Reference Implementation", function () {
    it("Should match JavaScript reference calculations", async function () {
      // JavaScript reference implementation for comparison
      function referenceSigmoid(supply, A, k, B) {
        const supplyNum = parseFloat(ethers.utils.formatEther(supply));
        const ANum = parseFloat(ethers.utils.formatUnits(A, 8));
        const kNum = parseFloat(ethers.utils.formatEther(k));
        const BNum = parseFloat(ethers.utils.formatEther(B));

        const exponent = -kNum * (supplyNum - BNum);
        const price = ANum / (1 + Math.exp(exponent));

        // Convert back to contract format (8 decimals)
        return ethers.BigNumber.from(Math.floor(price * 1e8));
      }

      const testSupplies = [
        ethers.utils.parseEther("1000"),
        ethers.utils.parseEther("5000"),
        ethers.utils.parseEther("10000"),
        ethers.utils.parseEther("20000"),
      ];

      console.log("Solidity vs JavaScript comparison:");
      for (const supply of testSupplies) {
        const contractResult = await sigmoidMath.testCalculateSigmoidPrice(
          supply,
          A,
          k,
          B
        );
        const referenceResult = referenceSigmoid(supply, A, k, B);

        const difference = contractResult.sub(referenceResult).abs();
        const percentDiff = difference.mul(10000).div(referenceResult); // Basis points

        console.log(`  Supply ${ethers.utils.formatEther(supply)}:`);
        console.log(`    Contract: ${formatPrice(contractResult)}`);
        console.log(`    Reference: ${formatPrice(referenceResult)}`);
        console.log(`    Difference: ${percentDiff.toString()} bps`);

        // Allow up to 100 basis points (1%) difference due to approximation
        expect(percentDiff).to.be.lt(100);
      }
    });
  });

  // ============ UTILITY FUNCTIONS ============

  /**
   * Format price with 8 decimal precision for logging
   */
  function formatPrice(price) {
    return ethers.utils.formatUnits(price, 8);
  }
});

// ============ TEST CONTRACT ============

// We need to create a test contract since we can't deploy libraries directly
const TestSigmoidMathSource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./SigmoidMath.sol";

contract TestSigmoidMath {
    using SigmoidMath for uint256;

    function testCalculateSigmoidPrice(
        uint256 supply,
        uint256 A,
        uint256 k,
        uint256 B
    ) external pure returns (uint256) {
        return SigmoidMath.calculateSigmoidPrice(supply, A, k, B);
    }

    function runSigmoidTests() external pure returns (uint256[] memory) {
        return SigmoidMath.runSigmoidTests();
    }

    function measureSigmoidGasCost() external view returns (uint256) {
        return SigmoidMath.measureSigmoidGasCost();
    }

    function testCalculatePriceDerivative(
        uint256 supply,
        uint256 A,
        uint256 k,
        uint256 B
    ) external pure returns (uint256) {
        return SigmoidMath.calculatePriceDerivative(supply, A, k, B);
    }

    function testCalculateSupplyForPrice(
        uint256 targetPrice,
        uint256 A,
        uint256 k,
        uint256 B
    ) external pure returns (uint256) {
        return SigmoidMath.calculateSupplyForPrice(targetPrice, A, k, B);
    }
}
`;
