#![cfg_attr(target_arch = "wasm32", no_std, no_main)]
extern crate alloc;
extern crate fluentbase_sdk;

use alloy_sol_types::sol;
use fluentbase_sdk::{
    basic_entrypoint,
    derive::{router, Contract},
    SharedAPI, U256,
};

// Fixed-point math module
mod fixed_point {
    use fluentbase_sdk::U256;

    // Constants for fixed-point arithmetic (18 decimals like Solidity)
    pub const DECIMALS: u32 = 18;
    pub const SCALE: u128 = 10_u128.pow(DECIMALS); // 10^18
    pub const SCALE_U256: U256 = U256::from_limbs([SCALE as u64, (SCALE >> 64) as u64, 0, 0]);

    /// Convert a decimal number to fixed-point representation
    /// e.g., from_decimal(1, 18) = 1e18 (represents 1.0)
    pub fn from_decimal(value: u128) -> U256 {
        U256::from(value) * SCALE_U256
    }

    /// Multiply two fixed-point numbers
    /// (a * b) / SCALE
    pub fn mul_fixed(a: U256, b: U256) -> U256 {
        let product = a * b;
        product / SCALE_U256
    }

    /// Divide two fixed-point numbers
    /// (a * SCALE) / b
    pub fn div_fixed(a: U256, b: U256) -> U256 {
        if b == U256::ZERO {
            panic!("Division by zero");
        }
        let scaled_a = a * SCALE_U256;
        scaled_a / b
    }

    /// Square a fixed-point number
    pub fn square_fixed(a: U256) -> U256 {
        mul_fixed(a, a)
    }

    /// Convert fixed-point to percentage (basis points)
    /// e.g., 0.15 * 10^18 -> 1500 (15%)
    pub fn to_basis_points(a: U256) -> U256 {
        a * U256::from(10000u64) / SCALE_U256
    }
}

// Define the contract structure
#[derive(Contract)]
struct SigmoidCalculator<SDK> {
    sdk: SDK,
}

// Define the public API trait
pub trait SigmoidAPI {
    fn ping(&self) -> U256;
    fn get_version(&self) -> U256;
    fn echo_value(&self, value: U256) -> U256;
    fn add_values(&self, a: U256, b: U256) -> U256;

    // Fixed-point math functions
    fn mul_fixed(&self, a: U256, b: U256) -> U256;
    fn div_fixed(&self, a: U256, b: U256) -> U256;
    fn square_fixed(&self, a: U256) -> U256;
    fn scale(&self) -> U256;
}

// Implement the router for automatic function dispatch
#[router(mode = "solidity")]
impl<SDK: SharedAPI> SigmoidAPI for SigmoidCalculator<SDK> {
    /// Simple ping function to test contract is alive
    fn ping(&self) -> U256 {
        U256::from(42)
    }

    /// Returns the contract version
    fn get_version(&self) -> U256 {
        U256::from(1)
    }

    /// Echoes back the input value (tests parameter passing)
    fn echo_value(&self, value: U256) -> U256 {
        value
    }

    /// Adds two values (tests multiple parameters)
    fn add_values(&self, a: U256, b: U256) -> U256 {
        a + b
    }

    /// Multiply two fixed-point numbers
    fn mul_fixed(&self, a: U256, b: U256) -> U256 {
        fixed_point::mul_fixed(a, b)
    }

    /// Divide two fixed-point numbers
    fn div_fixed(&self, a: U256, b: U256) -> U256 {
        fixed_point::div_fixed(a, b)
    }

    /// Square a fixed-point number
    fn square_fixed(&self, a: U256) -> U256 {
        fixed_point::square_fixed(a)
    }

    /// Get the scale factor (10^18)
    fn scale(&self) -> U256 {
        fixed_point::SCALE_U256
    }
}

// Contract implementation
impl<SDK: SharedAPI> SigmoidCalculator<SDK> {
    /// Deploy function - called when contract is deployed
    pub fn deploy(&self) {
        // For now, just log deployment
        // In the future, we might initialize parameters here
    }
}

// Define the entry point
basic_entrypoint!(SigmoidCalculator);

// Unit tests
#[cfg(test)]
mod tests {
    use super::*;
    use fixed_point::*;

    #[test]
    fn test_basic_arithmetic() {
        // Test that U256 arithmetic works as expected
        let a = U256::from(100);
        let b = U256::from(200);
        assert_eq!(a + b, U256::from(300));
    }

    #[test]
    fn test_u256_conversions() {
        // Test various U256 conversions
        assert_eq!(U256::from(42), U256::from(42u64));
        assert_eq!(U256::from(1), U256::from(1u32));
    }

    #[test]
    fn test_fixed_point_multiplication() {
        // Test: 1.5 * 2.0 = 3.0
        let one_point_five = U256::from(15u64) * SCALE_U256 / U256::from(10u64); // 1.5
        let two = U256::from(2u64) * SCALE_U256; // 2.0
        let result = mul_fixed(one_point_five, two);
        let expected = U256::from(3u64) * SCALE_U256; // 3.0
        assert_eq!(result, expected);
    }

    #[test]
    fn test_fixed_point_division() {
        // Test: 6.0 / 2.0 = 3.0
        let six = U256::from(6u64) * SCALE_U256;
        let two = U256::from(2u64) * SCALE_U256;
        let result = div_fixed(six, two);
        let expected = U256::from(3u64) * SCALE_U256;
        assert_eq!(result, expected);
    }

    #[test]
    fn test_square_fixed() {
        // Test: 3^2 = 9
        let three = U256::from(3u64) * SCALE_U256;
        let result = square_fixed(three);
        let expected = U256::from(9u64) * SCALE_U256;
        assert_eq!(result, expected);
    }
}
