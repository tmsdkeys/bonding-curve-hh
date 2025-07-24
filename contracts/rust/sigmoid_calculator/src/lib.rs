#![cfg_attr(target_arch = "wasm32", no_std, no_main)]
extern crate alloc;
extern crate fluentbase_sdk;

use alloy_sol_types::sol;
use fluentbase_sdk::{
    basic_entrypoint,
    derive::{router, Contract},
    SharedAPI, U256,
};

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
    use fluentbase_sdk::testing::HostSdkInstance;

    #[test]
    fn test_ping() {
        let sdk = HostSdkInstance::default();
        let calculator = SigmoidCalculator::new(sdk);

        assert_eq!(calculator.ping(), U256::from(42));
    }

    #[test]
    fn test_echo_value() {
        let sdk = HostSdkInstance::default();
        let calculator = SigmoidCalculator::new(sdk);

        let test_value = U256::from(12345);
        assert_eq!(calculator.echo_value(test_value), test_value);
    }

    #[test]
    fn test_add_values() {
        let sdk = HostSdkInstance::default();
        let calculator = SigmoidCalculator::new(sdk);

        let a = U256::from(100);
        let b = U256::from(200);
        assert_eq!(calculator.add_values(a, b), U256::from(300));
    }
}
