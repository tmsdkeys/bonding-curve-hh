# General Setup Guide

This guide covers the shared setup requirements for both Solidity and Blended modes of the AI Chatbot Bonding Curve system.

## 📋 Prerequisites

### System Requirements

- **Node.js** >= 18.x
- **npm** >= 8.x
- **Git** for version control
- **MetaMask** or compatible Web3 wallet (for testnet deployment)

### Development Tools

- **Code Editor** (VS Code recommended with Solidity extensions)
- **Terminal/Command Line** access
- **Web Browser** for interacting with deployed contracts

### Fluent Network Access

- **Fluent Devnet** connection configured
- **Test ETH** from [Fluent Faucet](https://dev.gblend.xyz/faucet/)

## 🔧 Environment Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd ai-chatbot-bonding-curve
```

### 2. Install Dependencies

```bash
npm install
```

This installs all required packages:

- **Hardhat** - Development environment and testing framework
- **OpenZeppelin Contracts** - Security-audited smart contract libraries
- **Ethers.js** - Ethereum library for contract interaction
- **Chai** - Testing assertion library
- **Additional utilities** for gas measurement and validation

### 3. Environment Configuration

Create a `.env` file in the root directory:

```bash
# Copy the example environment file
cp .env.example .env
```

Configure your environment variables:

```env
# Private key for deployment (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# Fluent Devnet Configuration
FLUENT_DEVNET_URL=https://rpc.dev.gblend.xyz/
FLUENT_DEVNET_CHAIN_ID=20993

# Optional: Etherscan API key for contract verification
ETHERSCAN_API_KEY=your_etherscan_api_key

# Optional: Gas reporting
REPORT_GAS=false
```

> ⚠️ **Security Note**: Never commit your private key to version control. The `.env` file is already included in `.gitignore`.

### 4. Network Configuration

The project is pre-configured for Fluent Devnet in `hardhat.config.js`:

```javascript
networks: {
  fluent_devnet: {
    url: process.env.FLUENT_DEVNET_URL || 'https://rpc.dev.gblend.xyz/',
    chainId: parseInt(process.env.FLUENT_DEVNET_CHAIN_ID) || 20993,
    accounts: process.env.PRIVATE_KEY ? [`0x${process.env.PRIVATE_KEY}`] : [],
  },
  localhost: {
    url: "http://127.0.0.1:8545",
    chainId: 31337,
  }
}
```

### 5. Verify Setup

Test your environment setup:

```bash
# Compile all contracts
npm run compile

# Run basic tests
npm test

# Check network connectivity
npx hardhat console --network fluent_devnet
```

If everything is configured correctly, you should see successful compilation and test execution.

## 📁 Project Structure

Understanding the shared project structure:

```
ai-chatbot-bonding-curve/
├── contracts/                          # Smart contracts
│   ├── ChatbotToken.sol                # ERC-20 token with minting/burning
│   ├── AIChatbot.sol                   # AI chatbot logic and message handling  
│   ├── [Mode-Specific Files]           # SigmoidBondingCurve & SigmoidMath variants
│   └── interfaces/                     # Contract interfaces
├── scripts/                            # Deployment and utility scripts
│   ├── deploy-step-3-1.js             # Core deployment script
│   ├── system-integration-validator.js # System validation utilities
│   └── gas-measurement.js             # Gas analysis tools
├── tests/                              # Comprehensive test suites
│   ├── step-3-1-architecture.test.js  # Core architecture tests
│   ├── step-3-2-validation.test.js    # Message flow validation
│   ├── step-3-3-complete.test.js      # AI judgment processing
│   └── step-3-4-complete.integration.test.js # Full system integration
├── docs/                               # Documentation
├── hardhat.config.js                  # Hardhat configuration
├── package.json                       # Project dependencies and scripts
└── .env                               # Environment variables (create from .env.example)
```

## 🔑 Core Contracts Overview

All modes share these fundamental smart contracts:

### ChatbotToken.sol

- **Purpose**: ERC-20 token with advanced minting/burning capabilities
- **Features**: Role-based access control, supply tracking, integration hooks
- **Dependencies**: OpenZeppelin contracts for security and standards compliance

### AIChatbot.sol  

- **Purpose**: Core chatbot logic, message handling, and AI judgment processing
- **Features**: Message storage, fee collection, reward distribution, statistics tracking
- **Integration**: Works with any bonding curve implementation

### Mode-Specific Components

Different modes include their own implementations of:

- **SigmoidBondingCurve.sol** - Bonding curve with buy/sell mechanics
- **SigmoidMath.sol** - Mathematical operations for curve calculations

## 🧪 Testing Framework

The project includes a comprehensive testing suite with multiple validation levels:

### Test Categories

- **Unit Tests**: Individual contract functionality
- **Integration Tests**: Cross-contract communication and state management
- **System Tests**: Complete user flow simulation
- **Stress Tests**: High-volume operation validation
- **Gas Analysis**: Performance benchmarking and optimization

### Key Testing Utilities

- **Gas Measurement**: Detailed gas usage tracking across all operations
- **System Validators**: Comprehensive validation of system state and integration
- **Mock User Flows**: Simulation of realistic user interactions
- **Economic Validation**: Tokenomics equilibrium and sustainability testing

### Running Tests

```bash
# All tests
npm test

# Specific test categories  
npm run test:step-3-1        # Architecture tests
npm run test:step-3-2        # Message flow validation
npm run test:step-3-3        # AI judgment processing
npm run test:step-3-4        # System integration

# Performance analysis
npm run benchmark:gas        # Gas cost analysis
npm run test:stress         # Stress testing

# Complete validation suite
npm run validate:production-ready
```

## 📊 Gas Analysis & Optimization

Both modes include comprehensive gas analysis tools:

### Measurement Categories

- **Token Operations**: Transfer, approval, minting, burning
- **Bonding Curve Operations**: Buy, sell, price calculations  
- **AI Chatbot Operations**: Message submission, AI judgment processing
- **Integration Flows**: Complete user journeys with gas tracking

### Optimization Targets

- Message submission: <100k gas
- AI judgment processing: <150k gas
- Token operations: Standard ERC-20 efficiency
- Bonding curve operations: Mode-specific optimizations

## 🔒 Security Considerations

### Role-Based Access Control

All contracts implement OpenZeppelin's AccessControl for secure operations:

- **ADMIN_ROLE**: Contract administration and emergency controls
- **MINTER_ROLE**: Token minting permissions (bonding curve, AI rewards)
- **BURNER_ROLE**: Token burning permissions (fees, penalties)
- **AI_PROCESSOR_ROLE**: AI judgment processing authorization

### Emergency Controls

- **Pausable Operations**: All user-facing functions can be paused
- **Role Management**: Secure role granting and revocation
- **Parameter Updates**: Controlled tokenomics parameter adjustments
- **Recovery Mechanisms**: Data export and system state recovery

### Best Practices

- Private keys never committed to version control
- Environment variables for sensitive configuration
- Comprehensive input validation and error handling
- Event emission for all significant state changes

## 🚀 Deployment Preparation

Before deploying to any network:

### 1. Funding

Ensure your deployment account has sufficient ETH:

- **Fluent Devnet**: Get test ETH from the [Fluent Faucet](https://dev.gblend.xyz/faucet/)
- **Local Network**: Use Hardhat's built-in accounts with pre-funded ETH

### 2. Configuration Verification

Double-check your environment configuration:

```bash
# Verify network connectivity
npx hardhat console --network fluent_devnet

# Check account balance
npx hardhat run scripts/check-balance.js --network fluent_devnet
```

### 3. Gas Estimation

Run gas analysis before deployment:

```bash
npm run benchmark:gas
```

This ensures you understand the deployment costs and operational expenses.

## 📈 Monitoring & Analytics

### Event Monitoring

All contracts emit comprehensive events for monitoring:

- Token transfers, mints, and burns
- Message submissions and AI judgments  
- Bonding curve purchases and sales
- Price updates and supply changes

### Statistical Tracking

Built-in analytics for system health:

- Total messages and judgment statistics
- User activity and reward distribution
- Token supply dynamics and price history
- Gas usage patterns and optimization opportunities

## 🔄 Next Steps

After completing the general setup:

1. **Choose Your Mode**:
   - [Solidity Mode](./solidity-mode.md) - Pure EVM implementation
   - [Blended Mode](./blended-mode.md) - Rust + Solidity hybrid

2. **Deploy Contracts**: Follow mode-specific deployment guides

3. **Run Validations**: Execute comprehensive testing suites

4. **Integration**: Prepare for frontend integration using the deployed contracts

## 🆘 Troubleshooting

### Common Issues

**Compilation Errors**:

```bash
# Clear Hardhat cache and recompile
npx hardhat clean
npm run compile
```

**Network Connection Issues**:

- Verify `.env` configuration
- Check Fluent Devnet status
- Ensure sufficient account balance

**Test Failures**:

- Run tests individually to isolate issues
- Check gas limits and network configuration
- Verify all dependencies are installed

**Gas Estimation Problems**:

- Update gas price settings in `hardhat.config.js`
- Check network congestion
- Review contract optimization opportunities

### Getting Help

- Check the [FAQ](./faq.md) for common questions
- Review [troubleshooting guide](./troubleshooting.md) for detailed solutions
- Consult mode-specific documentation for implementation details

---

**Ready to proceed with your chosen implementation mode!**
