// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ISigmoidCalculator.sol";

/**
 * @title SigmoidCalculatorTest
 * @notice Test contract to verify Rust calculator integration
 */
contract SigmoidCalculatorTest {
    ISigmoidCalculator public calculator;
    
    event TestResult(string test, bool passed, uint256 expected, uint256 actual);
    
    constructor(address _calculator) {
        calculator = ISigmoidCalculator(_calculator);
    }
    
    /**
     * @notice Run all tests
     * @return success True if all tests pass
     */
    function runAllTests() external returns (bool success) {
        success = true;
        
        // Test 1: Ping
        uint256 pingResult = calculator.ping();
        bool pingPassed = pingResult == 42;
        emit TestResult("ping", pingPassed, 42, pingResult);
        success = success && pingPassed;
        
        // Test 2: Version
        uint256 versionResult = calculator.getVersion();
        bool versionPassed = versionResult == 1;
        emit TestResult("getVersion", versionPassed, 1, versionResult);
        success = success && versionPassed;
        
        // Test 3: Echo
        uint256 echoTest = 12345;
        uint256 echoResult = calculator.echoValue(echoTest);
        bool echoPassed = echoResult == echoTest;
        emit TestResult("echoValue", echoPassed, echoTest, echoResult);
        success = success && echoPassed;
        
        // Test 4: Add
        uint256 a = 100;
        uint256 b = 200;
        uint256 addResult = calculator.addValues(a, b);
        bool addPassed = addResult == 300;
        emit TestResult("addValues", addPassed, 300, addResult);
        success = success && addPassed;
    }
    
    /**
     * @notice Test gas costs for Rust vs potential Solidity implementation
     */
    function measureGasCosts() external view returns (
        uint256 pingGas,
        uint256 echoGas,
        uint256 addGas
    ) {
        uint256 gasBefore;
        
        // Measure ping
        gasBefore = gasleft();
        calculator.ping();
        pingGas = gasBefore - gasleft();
        
        // Measure echo
        gasBefore = gasleft();
        calculator.echoValue(12345);
        echoGas = gasBefore - gasleft();
        
        // Measure add
        gasBefore = gasleft();
        calculator.addValues(100, 200);
        addGas = gasBefore - gasleft();
    }
}