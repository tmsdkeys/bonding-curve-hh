#!/bin/bash

# Build and Deploy Rust Sigmoid Calculator

echo "🦀 Building Rust Sigmoid Calculator..."

# Navigate to the Rust contract directory
cd contracts/rust/sigmoid_calculator

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf target/

# Build the contract
echo "🔨 Building contract..."
gblend build rust -r

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build successful!"

# The WASM file should be in target/wasm32-unknown-unknown/release/
WASM_FILE="target/wasm32-unknown-unknown/release/sigmoid_calculator.wasm"

if [ -f "$WASM_FILE" ]; then
    echo "📦 WASM file generated: $WASM_FILE"
    echo "📏 File size: $(ls -lh $WASM_FILE | awk '{print $5}')"
    
    # Create deployment artifacts directory
    mkdir -p ../../../deployments/rust
    cp $WASM_FILE ../../../deployments/rust/
    
    echo "📋 Contract ready for deployment!"
    echo ""
    echo "Next steps:"
    echo "1. Deploy using Fluent deployment tools"
    echo "2. Note the deployed contract address"
    echo "3. Run integration tests with SigmoidCalculatorTest.sol"
else
    echo "❌ WASM file not found!"
    exit 1
fi