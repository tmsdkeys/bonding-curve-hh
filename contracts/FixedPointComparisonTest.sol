// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ISigmoidCalculator.sol";

/**
 * @title FixedPointComparisonTest
 * @notice Compare fixed-point math between Rust and Solidity implementations
 * @dev Tests precision and gas costs
 */
contract FixedPointComparisonTest {
    ISigmoidCalculator public rustCalculator;
    uint256 public constant SCALE = 1e18;
    
    event ComparisonResult(
        string operation,
        uint256 rustResult,
        uint256 solidityResult,
        int256 difference,
        uint256 rustGas,
        uint256 solidityGas
    );
    
    constructor(address _rustCalculator) {
        rustCalculator = ISigmoidCalculator(_rustCalculator);
    }
    
    // ============ Solidity Fixed-Point Math ============
    
    function mulFixedSolidity(uint256 a, uint256 b) public pure returns (uint256) {
        return (a * b) / SCALE;
    }
    
    function divFixedSolidity(uint256 a, uint256 b) public pure returns (uint256) {
        require(b != 0, "Division by zero");
        return (a * SCALE) / b;
    }
    
    function squareFixedSolidity(uint256 a) public pure returns (uint256) {
        return (a * a) / SCALE;
    }
    
    // ============ Comparison Tests ============
    
    /**
     * @notice Compare multiplication: 1.5 * 2.5 = 3.75
     */
    function testMultiplication() external {
        uint256 a = 15 * SCALE / 10; // 1.5
        uint256 b = 25 * SCALE / 10; // 2.5
        
        // Measure Rust gas
        uint256 gasBeforeRust = gasleft();
        uint256 rustResult = rustCalculator.mulFixed(a, b);
        uint256 rustGas = gasBeforeRust - gasleft();
        
        // Measure Solidity gas
        uint256 gasBeforeSolidity = gasleft();
        uint256 solidityResult = mulFixedSolidity(a, b);
        uint256 solidityGas = gasBeforeSolidity - gasleft();
        
        // Calculate difference
        int256 difference = int256(rustResult) - int256(solidityResult);
        
        emit ComparisonResult(
            "multiplication",
            rustResult,
            solidityResult,
            difference,
            rustGas,
            solidityGas
        );
    }
    
    /**
     * @notice Compare division: 7.5 / 2.5 = 3.0
     */
    function testDivision() external {
        uint256 a = 75 * SCALE / 10; // 7.5
        uint256 b = 25 * SCALE / 10; // 2.5
        
        // Measure Rust gas
        uint256 gasBeforeRust = gasleft();
        uint256 rustResult = rustCalculator.divFixed(a, b);
        uint256 rustGas = gasBeforeRust - gasleft();
        
        // Measure Solidity gas
        uint256 gasBeforeSolidity = gasleft();
        uint256 solidityResult = divFixedSolidity(a, b);
        uint256 solidityGas = gasBeforeSolidity - gasleft();
        
        // Calculate difference
        int256 difference = int256(rustResult) - int256(solidityResult);
        
        emit ComparisonResult(
            "division",
            rustResult,
            solidityResult,
            difference,
            rustGas,
            solidityGas
        );
    }
    
    /**
     * @notice Compare squaring: 3.5^2 = 12.25
     */
    function testSquare() external {
        uint256 a = 35 * SCALE / 10; // 3.5
        
        // Measure Rust gas
        uint256 gasBeforeRust = gasleft();
        uint256 rustResult = rustCalculator.squareFixed(a);
        uint256 rustGas = gasBeforeRust - gasleft();
        
        // Measure Solidity gas
        uint256 gasBeforeSolidity = gasleft();
        uint256 solidityResult = squareFixedSolidity(a);
        uint256 solidityGas = gasBeforeSolidity - gasleft();
        
        // Calculate difference
        int256 difference = int256(rustResult) - int256(solidityResult);
        
        emit ComparisonResult(
            "square",
            rustResult,
            solidityResult,
            difference,
            rustGas,
            solidityGas
        );
    }
    
    /**
     * @notice Run all comparison tests
     */
    function runAllTests() external {
        this.testMultiplication();
        this.testDivision();
        this.testSquare();
    }
    
    /**
     * @notice Verify scale factor matches
     */
    function verifyScale() external view returns (bool) {
        return rustCalculator.scale() == SCALE;
    }
}