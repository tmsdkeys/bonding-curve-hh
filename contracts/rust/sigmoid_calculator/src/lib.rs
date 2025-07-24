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

// Sigmoid math module
mod sigmoid_math {
    use super::fixed_point::*;
    use fluentbase_sdk::U256;

    /// Maximum iterations for Taylor series
    const MAX_ITERATIONS: usize = 8;

    /// Approximation of e^x using Taylor series
    /// e^x = 1 + x + x²/2! + x³/3! + x⁴/4! + ...
    /// Works best for x in range [-2, 2]
    pub fn exp_taylor(x: U256, is_negative: bool) -> U256 {
        // If x is too large, cap it to prevent overflow
        let x_capped = if x > from_decimal(5) {
            from_decimal(5)
        } else {
            x
        };

        let mut result = SCALE_U256; // 1.0
        let mut term = SCALE_U256; // Current term in the series
        let mut i = 1u64;

        // Calculate positive exponential
        while i <= MAX_ITERATIONS as u64 {
            // term = term * x / i
            term = mul_fixed(term, x_capped);
            term = term / U256::from(i);
            result = result + term;

            // Early exit if term becomes negligible
            if term < U256::from(1000u64) {
                // 0.000000000000001
                break;
            }

            i += 1;
        }

        // If input was negative, return 1/e^|x|
        if is_negative {
            div_fixed(SCALE_U256, result)
        } else {
            result
        }
    }

    /// Calculate sigmoid function: 1 / (1 + e^(-x))
    /// For numerical stability, we use:
    /// - If x >= 0: 1 / (1 + e^(-x))
    /// - If x < 0: e^x / (1 + e^x)
    pub fn sigmoid_fixed(x: U256, is_negative: bool) -> U256 {
        if is_negative {
            // For negative x: e^x / (1 + e^x)
            // Note: when is_negative is true, x contains the absolute value
            // So we need e^(-|x|) / (1 + e^(-|x|))
            let exp_neg_x = exp_taylor(x, true); // This gives us e^(-|x|)
            div_fixed(exp_neg_x, SCALE_U256 + exp_neg_x)
        } else {
            // For positive x: 1 / (1 + e^(-x))
            let exp_neg_x = exp_taylor(x, true);
            div_fixed(SCALE_U256, SCALE_U256 + exp_neg_x)
        }
    }

    /// Calculate the price using sigmoid bonding curve
    /// price = A / (1 + e^(-k * (supply - B)))
    pub fn calculate_sigmoid_price(
        supply: U256,
        a: U256, // Maximum price (with decimals)
        k: U256, // Steepness (with decimals)
        b: U256, // Inflection point (with decimals)
    ) -> U256 {
        // Calculate (supply - B)
        let (diff, is_negative) = if supply >= b {
            (supply - b, false)
        } else {
            (b - supply, true)
        };

        // Calculate k * (supply - B)
        let k_times_diff = mul_fixed(k, diff);

        // Calculate sigmoid of k * (supply - B)
        let sigmoid = sigmoid_fixed(k_times_diff, is_negative);

        // Return A * sigmoid
        mul_fixed(a, sigmoid)
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

    // Sigmoid functions
    fn exp_taylor(&self, x: U256, is_negative: bool) -> U256;
    fn sigmoid(&self, x: U256, is_negative: bool) -> U256;
    fn calculate_price(&self, supply: U256, a: U256, k: U256, b: U256) -> U256;
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

    /// Exponential function using Taylor series
    fn exp_taylor(&self, x: U256, is_negative: bool) -> U256 {
        sigmoid_math::exp_taylor(x, is_negative)
    }

    /// Sigmoid function: 1 / (1 + e^(-x))
    fn sigmoid(&self, x: U256, is_negative: bool) -> U256 {
        sigmoid_math::sigmoid_fixed(x, is_negative)
    }

    /// Calculate price using sigmoid bonding curve
    fn calculate_price(&self, supply: U256, a: U256, k: U256, b: U256) -> U256 {
        sigmoid_math::calculate_sigmoid_price(supply, a, k, b)
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
    use sigmoid_math::*;

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

    #[test]
    fn test_exp_taylor_positive() {
        // Test e^1 ≈ 2.71828
        let one = SCALE_U256;
        let result = exp_taylor(one, false);
        // Should be approximately 2.71828 * SCALE
        let expected_min = U256::from(27u64) * SCALE_U256 / U256::from(10u64); // 2.7
        let expected_max = U256::from(28u64) * SCALE_U256 / U256::from(10u64); // 2.8
        assert!(result > expected_min && result < expected_max);
    }

    #[test]
    fn test_exp_taylor_zero() {
        // Test e^0 = 1
        let zero = U256::ZERO;
        let result = exp_taylor(zero, false);
        assert_eq!(result, SCALE_U256); // Should be exactly 1.0
    }

    #[test]
    fn test_exp_taylor_negative() {
        // Test e^(-1) ≈ 0.36788
        let one = SCALE_U256;
        let result = exp_taylor(one, true);
        // Should be approximately 0.36788 * SCALE
        let expected_min = U256::from(36u64) * SCALE_U256 / U256::from(100u64); // 0.36
        let expected_max = U256::from(37u64) * SCALE_U256 / U256::from(100u64); // 0.37
        assert!(result > expected_min && result < expected_max);
    }

    #[test]
    fn test_sigmoid_zero() {
        // Test sigmoid(0) = 0.5
        let zero = U256::ZERO;
        let result = sigmoid_fixed(zero, false);
        let expected = SCALE_U256 / U256::from(2u64); // 0.5
                                                      // Allow small error due to approximation
        let diff = if result > expected {
            result - expected
        } else {
            expected - result
        };
        assert!(diff < SCALE_U256 / U256::from(1000u64)); // Less than 0.001 error
    }

    #[test]
    fn test_sigmoid_positive() {
        // Test sigmoid(2) ≈ 0.88
        let two = U256::from(2u64) * SCALE_U256;
        let result = sigmoid_fixed(two, false);
        // Should be approximately 0.88
        let expected_min = U256::from(87u64) * SCALE_U256 / U256::from(100u64); // 0.87
        let expected_max = U256::from(89u64) * SCALE_U256 / U256::from(100u64); // 0.89
        assert!(result > expected_min && result < expected_max);
    }

    #[test]
    fn test_sigmoid_negative() {
        // Test sigmoid(-2) ≈ 0.119 (about 0.12)
        // When x = -2, sigmoid(x) = 1/(1+e^2) ≈ 0.119
        let two = U256::from(2u64) * SCALE_U256;
        let result = sigmoid_fixed(two, true);

        // Convert to decimal for debugging
        let result_decimal = result * U256::from(1000u64) / SCALE_U256;
        println!(
            "sigmoid(-2) result: {} (expecting ~119 for 0.119)",
            result_decimal
        );

        // Should be approximately 0.119
        let expected_min = U256::from(10u64) * SCALE_U256 / U256::from(100u64); // 0.10
        let expected_max = U256::from(13u64) * SCALE_U256 / U256::from(100u64); // 0.13
        assert!(
            result > expected_min && result < expected_max,
            "sigmoid(-2) = {} is not in range [{}, {}]",
            result,
            expected_min,
            expected_max
        );
    }
}
