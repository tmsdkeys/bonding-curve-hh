#![cfg_attr(target_arch = "wasm32", no_std, no_main)]
extern crate alloc;
extern crate fluentbase_sdk;

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
    use libm;

    /// Maximum iterations for Taylor series (kept as fallback)
    const MAX_ITERATIONS: usize = 8;

    /// Use libm for high-precision exponential calculation
    /// Converts fixed-point to f64, calculates exp, converts back
    pub fn exp_precise(x: U256, is_negative: bool) -> U256 {
        // Convert fixed-point to f64
        // First get the integer part
        let int_part = x / SCALE_U256;
        let frac_part = x % SCALE_U256;

        // Convert to f64 (limited by f64 precision but much better than Taylor)
        let x_f64 = int_part.as_limbs()[0] as f64 + (frac_part.as_limbs()[0] as f64 / SCALE as f64);

        // Apply sign
        let x_signed = if is_negative { -x_f64 } else { x_f64 };

        // Calculate e^x using libm
        let exp_result = libm::exp(x_signed);

        // Convert back to fixed-point
        // Handle overflow/underflow
        if exp_result.is_infinite() || exp_result > 1e30 {
            // Return a very large number
            U256::from(u128::MAX) * SCALE_U256 / U256::from(1000u128)
        } else if exp_result < 1e-18 {
            // Return a very small number (but not zero to avoid division issues)
            U256::from(1u128)
        } else {
            // Normal conversion using libm::trunc
            let whole = libm::trunc(exp_result) as u128;
            let frac = ((exp_result - libm::trunc(exp_result)) * SCALE as f64) as u128;
            U256::from(whole) * SCALE_U256 + U256::from(frac)
        }
    }

    /// Approximation of e^x using Taylor series (fallback method)
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

    /// High-precision sigmoid using libm
    pub fn sigmoid_precise(x: U256, is_negative: bool) -> U256 {
        if is_negative {
            // For negative x: e^(-|x|) / (1 + e^(-|x|))
            let exp_neg_x = exp_precise(x, true);
            div_fixed(exp_neg_x, SCALE_U256 + exp_neg_x)
        } else {
            // For positive x: 1 / (1 + e^(-x))
            let exp_neg_x = exp_precise(x, true);
            div_fixed(SCALE_U256, SCALE_U256 + exp_neg_x)
        }
    }

    /// Calculate sigmoid function: 1 / (1 + e^(-x))
    /// For numerical stability, we use:
    /// - If x >= 0: 1 / (1 + e^(-x))
    /// - If x < 0: e^x / (1 + e^x)
    pub fn sigmoid_fixed(x: U256, is_negative: bool) -> U256 {
        // Use precise version with libm
        sigmoid_precise(x, is_negative)
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

    /// Calculate the integral of the sigmoid function (for exact buy/sell amounts)
    /// This is where Rust really shines vs Solidity
    pub fn sigmoid_integral(from_supply: U256, to_supply: U256, a: U256, k: U256, b: U256) -> U256 {
        // The integral of A/(1 + e^(-k*(x-B))) is:
        // (A/k) * ln(1 + e^(k*(x-B))) + C

        // For now, use numerical integration with small steps
        // In production, we'd use the analytical solution with libm::log
        let steps = 100u64;
        let step_size = if to_supply > from_supply {
            (to_supply - from_supply) / U256::from(steps)
        } else {
            U256::ZERO
        };

        let mut integral = U256::ZERO;
        let mut current_supply = from_supply;

        for _ in 0..steps {
            let price = calculate_sigmoid_price(current_supply, a, k, b);
            integral = integral + mul_fixed(price, step_size);
            current_supply = current_supply + step_size;
        }

        integral
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
    fn exp_precise(&self, x: U256, is_negative: bool) -> U256;
    fn sigmoid(&self, x: U256, is_negative: bool) -> U256;
    fn calculate_price(&self, supply: U256, a: U256, k: U256, b: U256) -> U256;
    fn calculate_integral(
        &self,
        from_supply: U256,
        to_supply: U256,
        a: U256,
        k: U256,
        b: U256,
    ) -> U256;
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
        U256::from(2) // Version 2: with libm integration
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

    /// High-precision exponential using libm
    fn exp_precise(&self, x: U256, is_negative: bool) -> U256 {
        sigmoid_math::exp_precise(x, is_negative)
    }

    /// Sigmoid function: 1 / (1 + e^(-x))
    fn sigmoid(&self, x: U256, is_negative: bool) -> U256 {
        sigmoid_math::sigmoid_fixed(x, is_negative)
    }

    /// Calculate price using sigmoid bonding curve
    fn calculate_price(&self, supply: U256, a: U256, k: U256, b: U256) -> U256 {
        sigmoid_math::calculate_sigmoid_price(supply, a, k, b)
    }

    /// Calculate integral for exact buy/sell amounts
    fn calculate_integral(
        &self,
        from_supply: U256,
        to_supply: U256,
        a: U256,
        k: U256,
        b: U256,
    ) -> U256 {
        sigmoid_math::sigmoid_integral(from_supply, to_supply, a, k, b)
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
    fn test_exp_precise_vs_taylor() {
        // Compare libm exp with Taylor series
        let test_values = vec![
            U256::from(0u64),              // 0
            SCALE_U256 / U256::from(2u64), // 0.5
            SCALE_U256,                    // 1.0
            SCALE_U256 * U256::from(2u64), // 2.0
        ];

        for x in test_values {
            let taylor_result = exp_taylor(x, false);
            let precise_result = exp_precise(x, false);

            // Convert to readable format
            let taylor_decimal = taylor_result / (SCALE_U256 / U256::from(1000u64));
            let precise_decimal = precise_result / (SCALE_U256 / U256::from(1000u64));

            println!(
                "exp({}) - Taylor: {}, Precise: {}",
                x / SCALE_U256,
                taylor_decimal,
                precise_decimal
            );

            // They should be reasonably close
            let diff = if taylor_result > precise_result {
                taylor_result - precise_result
            } else {
                precise_result - taylor_result
            };

            // Allow up to 1% difference
            let tolerance = precise_result / U256::from(100u64);
            assert!(
                diff < tolerance,
                "exp({}) difference too large",
                x / SCALE_U256
            );
        }
    }

    #[test]
    fn test_libm_edge_cases() {
        // Test very small values
        let very_small = U256::from(1u64); // 0.000000000000000001
        let result_small = exp_precise(very_small, false);
        // Should be very close to 1
        assert!(
            result_small > SCALE_U256 - U256::from(1000u64)
                && result_small < SCALE_U256 + U256::from(1000u64)
        );

        // Test large positive values
        let large = SCALE_U256 * U256::from(10u64); // 10.0
        let result_large = exp_precise(large, false);
        // e^10 ≈ 22026, so result should be around 22026 * SCALE
        let expected_min = SCALE_U256 * U256::from(20000u64);
        let expected_max = SCALE_U256 * U256::from(25000u64);
        assert!(result_large > expected_min && result_large < expected_max);

        // Test large negative values
        let result_neg_large = exp_precise(large, true);
        // e^(-10) is very small, should be close to 0 but not exactly 0
        assert!(
            result_neg_large > U256::from(0u64)
                && result_neg_large < SCALE_U256 / U256::from(1000u64)
        );
    }
}
