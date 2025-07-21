// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { SD59x18 } from "@prb/math/src/SD59x18.sol";
import { UD60x18 } from "@prb/math/src/UD60x18.sol";

/**
 * @title SigmoidMath
 * @dev Mathematical utilities for sigmoid bonding curve calculations
 * @notice Research implementation exploring PRBMath exponential approximations
 * 
 * Sigmoid Formula: price = A / (1 + e^(-k * (supply - B)))
 * 
 * Where:
 * - A: Maximum price ceiling (asymptote)
 * - k: Steepness factor (controls adoption speed)  
 * - B: Inflection point (supply level for 50% max price)
 * - supply: Current token supply
 * 
 * Precision: 8 decimal places (1e8 = 1.00000000)
 */
library SigmoidMath {
    
    // ============ CONSTANTS ============
    
    /// @dev Precision for price calculations (8 decimals)
    uint256 public constant PRICE_PRECISION = 1e8;
    
    /// @dev Maximum safe input for exponential to prevent overflow
    int256 public constant MAX_EXP_INPUT = 50 * 1e18; // 50.0 in 18-decimal fixed point
    
    /// @dev Minimum safe input for exponential to prevent underflow
    int256 public constant MIN_EXP_INPUT = -50 * 1e18; // -50.0 in 18-decimal fixed point
    
    /// @dev Default parameter bounds for safety
    uint256 public constant MIN_A = 1e6; // 0.01 in 8-decimal precision
    uint256 public constant MAX_A = 1e12; // 10,000 in 8-decimal precision
    uint256 public constant MIN_K = 1; // Very small steepness
    uint256 public constant MAX_K = 1e6; // Very steep curve
    uint256 public constant MIN_B = 1e18; // 1 token minimum inflection
    uint256 public constant MAX_B = 1e30; // 1 trillion token maximum inflection
    
    // ============ ERRORS ============
    
    error ParameterOutOfBounds(string parameter, uint256 value, uint256 min, uint256 max);
    error ExponentialInputOutOfBounds(int256 input);
    error CalculationOverflow();
    error DivisionByZero();
    
    // ============ MAIN SIGMOID CALCULATION ============
    
    /**
     * @dev Calculate sigmoid price: A / (1 + e^(-k * (supply - B)))
     * @param supply Current token supply (18 decimals)
     * @param A Maximum price ceiling (8 decimal precision)
     * @param k Steepness factor (18 decimal precision)
     * @param B Inflection point supply (18 decimals)
     * @return price Calculated price (8 decimal precision)
     */
    function calculateSigmoidPrice(
        uint256 supply,
        uint256 A,
        uint256 k,
        uint256 B
    ) internal pure returns (uint256 price) {
        // Validate parameters
        _validateParameters(A, k, B);
        
        // Convert inputs to signed integers for mathematical operations
        int256 signedSupply = int256(supply);
        int256 signedB = int256(B);
        int256 signedK = int256(k);
        
        // Calculate: -k * (supply - B)
        int256 exponentInput;
        unchecked {
            // (supply - B) might be negative, which is expected
            int256 supplyDifference = signedSupply - signedB;
            
            // Multiply by -k (negate k first to avoid overflow issues)
            int256 negativeK = -signedK;
            exponentInput = (supplyDifference * negativeK) / 1e18; // Normalize k from 18 decimals
        }
        
        // Clamp exponential input to safe bounds
        if (exponentInput > MAX_EXP_INPUT) exponentInput = MAX_EXP_INPUT;
        if (exponentInput < MIN_EXP_INPUT) exponentInput = MIN_EXP_INPUT;
        
        // Calculate e^(exponentInput) using PRBMath
        uint256 exponentialResult = _safeExp(exponentInput);
        
        // Calculate: 1 + e^(exponentInput)  
        uint256 denominator = 1e18 + exponentialResult; // Both in 18-decimal format
        
        if (denominator == 0) revert DivisionByZero();
        
        // Calculate: A / (1 + e^(exponentInput))
        // Convert A from 8 decimals to 18 decimals for calculation
        uint256 numerator = A * 1e10; // 8 decimals -> 18 decimals
        uint256 result18Decimals = (numerator * 1e18) / denominator;
        
        // Convert back to 8 decimal precision
        price = result18Decimals / 1e10;
        
        return price;
    }
    
    // ============ HELPER FUNCTIONS ============
    
    /**
     * @dev Safe exponential calculation with overflow protection
     * @param x Input value (18 decimal fixed point)
     * @return result e^x (18 decimal fixed point)
     */
    function _safeExp(int256 x) private pure returns (uint256 result) {
        if (x > MAX_EXP_INPUT) revert ExponentialInputOutOfBounds(x);
        if (x < MIN_EXP_INPUT) revert ExponentialInputOutOfBounds(x);
        
        int256 expResult = SD59x18.unwrap(SD59x18.wrap(x).exp());
        if (expResult < 0) return 0;
        result = uint256(expResult);
    }
    
    /**
     * @dev Validate sigmoid parameters are within safe bounds
     * @param A Maximum price ceiling
     * @param k Steepness factor  
     * @param B Inflection point
     */
    function _validateParameters(uint256 A, uint256 k, uint256 B) private pure {
        if (A < MIN_A || A > MAX_A) {
            revert ParameterOutOfBounds("A", A, MIN_A, MAX_A);
        }
        if (k < MIN_K || k > MAX_K) {
            revert ParameterOutOfBounds("k", k, MIN_K, MAX_K);
        }  
        if (B < MIN_B || B > MAX_B) {
            revert ParameterOutOfBounds("B", B, MIN_B, MAX_B);
        }
    }
    
    // ============ UTILITY FUNCTIONS ============
    
    /**
     * @dev Calculate the derivative of sigmoid at given supply
     * @notice Useful for understanding price sensitivity
     * @param supply Current supply
     * @param A Maximum price ceiling
     * @param k Steepness factor
     * @param B Inflection point
     * @return derivative Price derivative with respect to supply
     */
    function calculatePriceDerivative(
        uint256 supply,
        uint256 A,
        uint256 k,
        uint256 B
    ) internal pure returns (uint256 derivative) {
        // This is complex calculation: A * k * e^(-k*(supply-B)) / (1 + e^(-k*(supply-B)))^2
        // For now, we can approximate using finite differences
        uint256 epsilon = 1e15; // Small supply change (0.001 tokens)
        
        uint256 priceAtSupply = calculateSigmoidPrice(supply, A, k, B);
        uint256 priceAtSupplyPlusEpsilon = calculateSigmoidPrice(supply + epsilon, A, k, B);
        
        // Derivative ≈ (f(x+h) - f(x)) / h
        if (priceAtSupplyPlusEpsilon > priceAtSupply) {
            derivative = ((priceAtSupplyPlusEpsilon - priceAtSupply) * 1e18) / epsilon;
        } else {
            derivative = ((priceAtSupply - priceAtSupplyPlusEpsilon) * 1e18) / epsilon;
        }
        
        return derivative;
    }
    
    /**
     * @dev Calculate supply needed to reach target price
     * @notice Uses Newton-Raphson method for inverse calculation
     * @param targetPrice Desired price (8 decimal precision)
     * @param A Maximum price ceiling
     * @param k Steepness factor
     * @param B Inflection point
     * @return supply Supply needed to achieve target price
     */
    function calculateSupplyForPrice(
        uint256 targetPrice,
        uint256 A,
        uint256 k,
        uint256 B
    ) internal pure returns (uint256 supply) {
        // Analytical solution: supply = B + ln(A/targetPrice - 1) / k
        // This is complex in Solidity, so we use binary search approximation
        
        uint256 low = 1;
        uint256 high = B * 10; // Search up to 10x inflection point
        uint256 tolerance = targetPrice / 1000; // 0.1% tolerance
        
        for (uint256 i = 0; i < 50; i++) { // Max 50 iterations
            uint256 mid = (low + high) / 2;
            uint256 calculatedPrice = calculateSigmoidPrice(mid, A, k, B);
            
            if (calculatedPrice > targetPrice + tolerance) {
                high = mid;
            } else if (calculatedPrice < targetPrice - tolerance) {
                low = mid;
            } else {
                return mid; // Found solution within tolerance
            }
            
            if (high - low < 1e15) break; // Converged to small range
        }
        
        return (low + high) / 2; // Return best approximation
    }
    
    // ============ TESTING & VALIDATION FUNCTIONS ============
    
    /**
     * @dev Test sigmoid function with known values for validation
     * @return results Array of test results for different inputs
     */
    function runSigmoidTests() external pure returns (uint256[] memory results) {
        results = new uint256[](5);
        
        // Test parameters: A=1000e8, k=1e15, B=10000e18
        uint256 A = 1000 * PRICE_PRECISION; // Max price: 1000
        uint256 k = 1e15; // Moderate steepness
        uint256 B = 10000 * 1e18; // Inflection at 10k tokens
        
        // Test different supply levels
        results[0] = calculateSigmoidPrice(0, A, k, B); // Should be very low
        results[1] = calculateSigmoidPrice(B / 4, A, k, B); // 25% of inflection
        results[2] = calculateSigmoidPrice(B / 2, A, k, B); // 50% of inflection  
        results[3] = calculateSigmoidPrice(B, A, k, B); // At inflection (should be A/2)
        results[4] = calculateSigmoidPrice(B * 2, A, k, B); // 2x inflection
        
        return results;
    }
    
    /**
     * @dev Measure gas cost of sigmoid calculation
     * @return gasUsed Gas consumed for one sigmoid calculation
     */
    function measureSigmoidGasCost() external view returns (uint256 gasUsed) {
        uint256 gasBefore = gasleft();
        
        calculateSigmoidPrice(
            10000 * 1e18, // 10k tokens
            1000 * PRICE_PRECISION, // Max price 1000
            1e15, // Steepness
            10000 * 1e18 // Inflection point
        );
        
        gasUsed = gasBefore - gasleft();
        return gasUsed;
    }
}