// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ISigmoidCalculator.sol";
import "./SigmoidMath.sol"; // Your existing Solidity sigmoid implementation

/**
 * @title SigmoidComparisonTest
 * @notice Compare Rust sigmoid implementation with Solidity version
 */
contract SigmoidComparisonTest {
    using SigmoidMath for uint256;
    
    ISigmoidCalculator public rustCalculator;
    
    uint256 public constant SCALE = 1e18;
    uint256 public constant PRICE_PRECISION = 1e8;
    
    event PriceComparison(
        uint256 supply,
        uint256 rustPrice,
        uint256 solidityPrice,
        int256 priceDiff,
        uint256 rustGas,
        uint256 solidityGas,
        int256 gasReduction
    );
    
    constructor(address _rustCalculator) {
        rustCalculator = ISigmoidCalculator(_rustCalculator);
    }
    
    /**
     * @notice Compare sigmoid calculations at different supply levels
     */
    function compareSigmoidPrices(
        uint256 supply,
        uint256 A,
        uint256 k,
        uint256 B
    ) external {
        // Measure Rust implementation
        uint256 gasBeforeRust = gasleft();
        uint256 rustPrice = rustCalculator.calculatePrice(supply, A, k, B);
        uint256 rustGas = gasBeforeRust - gasleft();
        
        // Measure Solidity implementation
        uint256 gasBeforeSolidity = gasleft();
        uint256 solidityPrice = SigmoidMath.calculateSigmoidPrice(supply, A, k, B);
        uint256 solidityGas = gasBeforeSolidity - gasleft();
        
        // Calculate differences
        int256 priceDiff = int256(rustPrice) - int256(solidityPrice);
        int256 gasReduction = int256(solidityGas) - int256(rustGas);
        
        emit PriceComparison(
            supply,
            rustPrice,
            solidityPrice,
            priceDiff,
            rustGas,
            solidityGas,
            gasReduction
        );
    }
    
    /**
     * @notice Test multiple supply points across the curve
     */
    function runComprehensiveTest() external {
        // Test parameters (matching your bonding curve)
        uint256 A = PRICE_PRECISION * 1000; // Max price: 1000.00000000
        uint256 k = SCALE / 1000; // Steepness: 0.001
        uint256 B = 10000 * SCALE; // Inflection: 10,000 tokens
        
        // Test points across the curve
        uint256[] memory testSupplies = new uint256[](7);
        testSupplies[0] = 0; // Start
        testSupplies[1] = 5000 * SCALE; // Before inflection
        testSupplies[2] = 9000 * SCALE; // Near inflection
        testSupplies[3] = 10000 * SCALE; // At inflection
        testSupplies[4] = 11000 * SCALE; // Just after inflection
        testSupplies[5] = 15000 * SCALE; // After inflection
        testSupplies[6] = 20000 * SCALE; // Far after inflection
        
        for (uint i = 0; i < testSupplies.length; i++) {
            this.compareSigmoidPrices(testSupplies[i], A, k, B);
        }
    }
    
    /**
     * @notice Calculate percentage difference between two values
     */
    function calculatePercentageDiff(uint256 a, uint256 b) public pure returns (int256) {
        if (b == 0) return 0;
        return (int256(a) - int256(b)) * 10000 / int256(b); // Basis points
    }
    
    /**
     * @notice Test edge cases
     */
    function testEdgeCases() external {
        uint256 A = PRICE_PRECISION * 1000;
        uint256 k = SCALE / 1000;
        uint256 B = 10000 * SCALE;
        
        // Test very small supply
        this.compareSigmoidPrices(1, A, k, B);
        
        // Test very large supply
        this.compareSigmoidPrices(1000000 * SCALE, A, k, B);
        
        // Test with different k values (steepness)
        this.compareSigmoidPrices(10000 * SCALE, A, SCALE / 100, B); // k = 0.01
        this.compareSigmoidPrices(10000 * SCALE, A, SCALE / 10000, B); // k = 0.0001
    }
}