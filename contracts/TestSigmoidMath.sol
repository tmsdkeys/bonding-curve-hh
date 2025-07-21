// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./SigmoidMath.sol";

/**
 * @title TestSigmoidMath
 * @dev Test contract wrapper for SigmoidMath library functions
 * @notice Allows testing of library functions that can't be deployed directly
 */
contract TestSigmoidMath {
    using SigmoidMath for uint256;

    // ============ TEST FUNCTIONS ============

    /**
     * @dev Test the main sigmoid price calculation
     * @param supply Current token supply
     * @param A Maximum price ceiling
     * @param k Steepness factor
     * @param B Inflection point
     * @return Calculated sigmoid price
     */
    function testCalculateSigmoidPrice(
        uint256 supply,
        uint256 A,
        uint256 k,
        uint256 B
    ) external pure returns (uint256) {
        return SigmoidMath.calculateSigmoidPrice(supply, A, k, B);
    }

    /**
     * @dev Test the price derivative calculation
     * @param supply Current supply
     * @param A Maximum price ceiling
     * @param k Steepness factor
     * @param B Inflection point
     * @return Price derivative with respect to supply
     */
    function testCalculatePriceDerivative(
        uint256 supply,
        uint256 A,
        uint256 k,
        uint256 B
    ) external pure returns (uint256) {
        return SigmoidMath.calculatePriceDerivative(supply, A, k, B);
    }

    /**
     * @dev Test the inverse calculation (supply for target price)
     * @param targetPrice Desired price
     * @param A Maximum price ceiling
     * @param k Steepness factor
     * @param B Inflection point
     * @return Supply needed to achieve target price
     */
    function testCalculateSupplyForPrice(
        uint256 targetPrice,
        uint256 A,
        uint256 k,
        uint256 B
    ) external pure returns (uint256) {
        return SigmoidMath.calculateSupplyForPrice(targetPrice, A, k, B);
    }

    /**
     * @dev Run the built-in test suite
     * @return Array of test results
     */
    function runSigmoidTests() external pure returns (uint256[] memory) {
        return SigmoidMath.runSigmoidTests();
    }

    /**
     * @dev Measure gas cost of sigmoid calculation
     * @return Gas used for one calculation
     */
    function measureSigmoidGasCost() external view returns (uint256) {
        return SigmoidMath.measureSigmoidGasCost();
    }

    // ============ BATCH TESTING FUNCTIONS ============

    /**
     * @dev Test sigmoid calculation with multiple supply values
     * @param supplies Array of supply values to test
     * @param A Maximum price ceiling
     * @param k Steepness factor
     * @param B Inflection point
     * @return prices Array of calculated prices
     */
    function batchCalculatePrices(
        uint256[] calldata supplies,
        uint256 A,
        uint256 k,
        uint256 B
    ) external pure returns (uint256[] memory prices) {
        prices = new uint256[](supplies.length);
        
        for (uint256 i = 0; i < supplies.length; i++) {
            prices[i] = SigmoidMath.calculateSigmoidPrice(supplies[i], A, k, B);
        }
        
        return prices;
    }

    // ============ PERFORMANCE TESTING ============

    /**
     * @dev Stress test sigmoid calculation with many iterations
     * @param iterations Number of calculations to perform
     * @return totalGasUsed Total gas consumed
     */
    function stressTestSigmoid(uint256 iterations) external view returns (uint256 totalGasUsed) {
        uint256 gasBefore = gasleft();
        
        // Standard parameters
        uint256 A = 1000 * SigmoidMath.PRICE_PRECISION;
        uint256 k = 1e15;
        uint256 B = 10000e18;
        
        for (uint256 i = 1; i <= iterations; i++) {
            // Vary supply for each iteration
            uint256 supply = B * i / iterations;
            SigmoidMath.calculateSigmoidPrice(supply, A, k, B);
        }
        
        totalGasUsed = gasBefore - gasleft();
        return totalGasUsed;
    }

    /**
     * @dev Compare gas costs of different parameter scales
     * @return results Array of [small_scale_gas, medium_scale_gas, large_scale_gas]
     */
    function compareParameterScaleGasCosts() external view returns (uint256[3] memory results) {
        uint256 supply = 5000e18;
        
        // Small scale
        uint256 gasSmall = gasleft();
        SigmoidMath.calculateSigmoidPrice(supply / 1000, 10e8, 1e18, 100e18);
        results[0] = gasSmall - gasleft();
        
        // Medium scale  
        uint256 gasMedium = gasleft();
        SigmoidMath.calculateSigmoidPrice(supply, 1000e8, 1e15, 10000e18);
        results[1] = gasMedium - gasleft();
        
        // Large scale
        uint256 gasLarge = gasleft();
        SigmoidMath.calculateSigmoidPrice(supply * 1000, 100000e8, 1e12, 10000000e18);
        results[2] = gasLarge - gasleft();
        
        return results;
    }

    // ============ UTILITY FUNCTIONS ============

    /**
     * @dev Get library constants for testing
     * @return Constants array [PRICE_PRECISION, MAX_EXP_INPUT, MIN_EXP_INPUT]
     */
    function getLibraryConstants() external pure returns (uint256[3] memory) {
        return [
            SigmoidMath.PRICE_PRECISION,
            uint256(int256(SigmoidMath.MAX_EXP_INPUT)),
            uint256(int256(-SigmoidMath.MIN_EXP_INPUT)) // Convert negative to positive for return
        ];
    }

    /**
     * @dev Verify sigmoid curve properties with a comprehensive test
     * @return properties Array of boolean results for various curve properties
     */
    function verifyCurveProperties() external pure returns (bool[5] memory properties) {
        uint256 A = 1000e8;
        uint256 k = 1e15; 
        uint256 B = 10000e18;
        
        // 1. Monotonically increasing
        uint256 price1 = SigmoidMath.calculateSigmoidPrice(B / 2, A, k, B);
        uint256 price2 = SigmoidMath.calculateSigmoidPrice(B, A, k, B);
        uint256 price3 = SigmoidMath.calculateSigmoidPrice(B * 2, A, k, B);
        properties[0] = (price1 < price2) && (price2 < price3);
        
        // 2. Approaches zero at very low supply
        uint256 priceAtZero = SigmoidMath.calculateSigmoidPrice(1, A, k, B);
        properties[1] = priceAtZero < A / 100; // Less than 1% of max
        
        // 3. Approaches A at very high supply
        uint256 priceAtHigh = SigmoidMath.calculateSigmoidPrice(B * 100, A, k, B);
        properties[2] = priceAtHigh > A * 90 / 100; // Greater than 90% of max
        
        // 4. Price at inflection ≈ A/2
        uint256 priceAtInflection = SigmoidMath.calculateSigmoidPrice(B, A, k, B);
        uint256 halfA = A / 2;
        uint256 tolerance = halfA / 10; // 10% tolerance
        properties[3] = (priceAtInflection > halfA - tolerance) && (priceAtInflection < halfA + tolerance);
        
        // 5. All prices are positive and less than A
        properties[4] = (price1 > 0) && (price2 > 0) && (price3 > 0) && 
                       (price1 < A) && (price2 < A) && (price3 < A);
        
        return properties;
    }
}