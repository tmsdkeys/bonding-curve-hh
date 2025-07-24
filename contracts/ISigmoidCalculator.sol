// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ISigmoidCalculator
 * @notice Interface for the Rust sigmoid calculator contract
 * @dev This interface allows Solidity contracts to call the Rust implementation
 */
interface ISigmoidCalculator {
    /**
     * @notice Simple ping function to test contract is alive
     * @return Always returns 42
     */
    function ping() external view returns (uint256);
    
    /**
     * @notice Returns the contract version
     * @return Version number (currently 1)
     */
    function getVersion() external view returns (uint256);
    
    /**
     * @notice Echoes back the input value (tests parameter passing)
     * @param value The value to echo
     * @return The same value that was passed in
     */
    function echoValue(uint256 value) external view returns (uint256);
    
    /**
     * @notice Adds two values (tests multiple parameters)
     * @param a First value
     * @param b Second value
     * @return Sum of a and b
     */
    function addValues(uint256 a, uint256 b) external view returns (uint256);
    
    // ============ Fixed-Point Math Functions ============
    
    /**
     * @notice Multiply two fixed-point numbers (18 decimals)
     * @param a First fixed-point number
     * @param b Second fixed-point number
     * @return Product in fixed-point representation
     */
    function mulFixed(uint256 a, uint256 b) external view returns (uint256);
    
    /**
     * @notice Divide two fixed-point numbers (18 decimals)
     * @param a Numerator in fixed-point
     * @param b Denominator in fixed-point
     * @return Quotient in fixed-point representation
     */
    function divFixed(uint256 a, uint256 b) external view returns (uint256);
    
    /**
     * @notice Square a fixed-point number
     * @param a Fixed-point number to square
     * @return Square in fixed-point representation
     */
    function squareFixed(uint256 a) external view returns (uint256);
    
    /**
     * @notice Get the scale factor for fixed-point math
     * @return Scale factor (10^18)
     */
    function scale() external view returns (uint256);
    
    // ============ Sigmoid Functions ============
    
    /**
     * @notice Calculate e^x using Taylor series approximation
     * @param x The exponent in fixed-point
     * @param isNegative True if x is negative
     * @return e^x in fixed-point representation
     */
    function expTaylor(uint256 x, bool isNegative) external view returns (uint256);
    
    /**
     * @notice Calculate sigmoid function: 1 / (1 + e^(-x))
     * @param x Input value in fixed-point
     * @param isNegative True if x is negative
     * @return Sigmoid(x) in fixed-point representation
     */
    function sigmoid(uint256 x, bool isNegative) external view returns (uint256);
    
    /**
     * @notice Calculate price using sigmoid bonding curve
     * @param supply Current token supply
     * @param a Maximum price (with decimals)
     * @param k Steepness factor (with decimals)
     * @param b Inflection point (with decimals)
     * @return Price in fixed-point representation
     */
    function calculatePrice(uint256 supply, uint256 a, uint256 k, uint256 b) external view returns (uint256);
}