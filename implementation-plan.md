# AI Chatbot Bonding Curve Demo - Implementation Plan

## Project Overview

This project demonstrates Fluent's "blended app" capabilities by building an AI chatbot where user interactions drive token economics through a sigmoid bonding curve. The demo showcases the transition from pure Solidity to Rust-enhanced smart contracts for computationally expensive mathematical operations.

### Core Concept

- Users pay fees in $CBT (Chatbot Token) to send messages to an AI
- AI selectively judges certain messages as "liked" or "disliked" based on a system prompt
- **Important**: Not all messages receive AI judgment - only select messages trigger likes/dislikes
- Likes mint tokens, dislikes burn tokens, affecting supply
- Token supply drives price via sigmoid bonding curve
- All interactions are public, creating a competitive game for token appreciation

## Technical Architecture

### Phase 1: Pure Solidity Implementation

**Goal**: Create a working bonding curve system entirely in Solidity to establish baseline functionality and demonstrate limitations.

**Components**:

1. **ERC20 Token Contract** ($CBT)

   - Standard ERC20 with mint/burn capabilities
   - Only bonding curve contract can mint/burn

2. **Sigmoid Bonding Curve Contract** (Solidity)
   - Implements: `price = A / (1 + e^(-k * (supply - B)))`
   - Uses polynomial/rational approximation for exponential function
   - Buy/sell functions that mint/burn tokens based on curve
   - Will be gas-expensive and less precise

3. **AI Chatbot Contract**
   - Handles message submissions (charges fee in $CBT)
   - Processes AI judgments (like/dislike)
   - Triggers token minting/burning based on AI responses
   - Implements anti-bystander decay mechanism

### Phase 2: Blended App Migration

**Goal**: Migrate expensive mathematical operations to Rust contracts, demonstrating performance and precision improvements.

**Migration Strategy**:

- Keep Solidity contracts for state management and user interactions
- Move sigmoid calculation (`e^x`) to Rust contract using `libm` or `micromath` crates
- **Critical**: Maintain clean, standardized interfaces for maximum extensibility
- Design bonding curve contracts as composable primitives for broader DeFi ecosystem
- Maintain identical external API to show drop-in replacement capability
- Measure and document gas savings and precision improvements

## Tokenomics Design

### Core Mechanics

- **Message Fee**: X $CBT (burned on every message regardless of AI response)
- **Like Reward**: Y $CBT (minted to message author) where Y >> X
- **Dislike Penalty**: Z $CBT (burned from treasury/circulating supply)
- **AI Selectivity**: Only certain messages trigger likes/dislikes - most messages only incur the fee
- **Target Ratio**: Approximately 17% like rate needed for supply equilibrium (among judged messages)

### Anti-Bystander Measures

- **Decay Mechanism**: $CBT holdings decay by 1% per day unless holder sends message in last 24 hours
- **Alternative**: Participation-based airdrops (easier to implement)

### AI Temperature Control

- AI system prompt includes current supply context
- Dynamic personality adjustment based on supply vs target range
- If supply low → AI more generous with likes
- If supply high → AI more critical
- Creates algorithmic monetary policy through sentiment

### Admin Controls

- Emergency mint function for supply recovery
- AI mood adjustment parameters
- Pause/unpause functionality

## Sigmoid Curve Implementation

### Mathematical Formula

```solidity
price = A / (1 + e^(-k * (supply - B)))
```

**Parameters**:

- `A`: Maximum price ceiling
- `k`: Steepness factor (controls adoption speed)
- `B`: Inflection point (supply level for 50% max price)

### Solidity Challenges

- No native exponential function
- Requires expensive approximation algorithms
- Limited precision with fixed-point arithmetic
- High gas costs for complex calculations

### Rust Advantages

- Native transcendental functions via `libm`
- Optimized fixed-point arithmetic libraries
- Superior numerical precision
- Significantly lower computational cost

## User Interface Components

### Chat Interface

- **Main Chat Room**: Public messages with AI responses
- **Strategy Room**: Private user coordination space (future enhancement)
- **Real-time Updates**: Live display of likes/dislikes and token price
- **Wallet Integration**: $CBT balance and bonding curve interaction

### Demo Features

- **Price Chart**: Real-time bonding curve visualization
- **Message History**: Public feed with AI judgments
- **Leaderboard**: Top message authors by likes received
- **Supply Dashboard**: Current token metrics and AI "mood"

## Smart Contract Interfaces

### IBondingCurve

```solidity
interface IBondingCurve {
    function calculatePrice(uint256 supply) external view returns (uint256);
    function buy(uint256 tokenAmount) external payable;
    function sell(uint256 tokenAmount) external;
    function getCurrentPrice() external view returns (uint256);
    function getSupply() external view returns (uint256);
}
```

**Design Principles**:

- Clean, standardized interface for maximum composability
- Functions should be pure where possible for predictable behavior
- Interface designed as a primitive that other contracts can easily integrate
- Support for both Solidity-only and Rust-enhanced implementations via same interface

### IAIChatbot

```solidity
interface IAIChatbot {
    function sendMessage(string calldata message) external;
    function processAIResponse(uint256 messageId, bool isLiked) external;
    function getUserBalance(address user) external view returns (uint256);
    function getMessageCount() external view returns (uint256);
    function getJudgedMessageCount() external view returns (uint256);
}
```

## Implementation Phases

### Phase 1: Solidity Foundation (Weeks 1-2)

1. Deploy ERC20 $CBT token contract
2. Implement sigmoid bonding curve with Solidity approximations
3. Create basic chatbot contract with fee mechanism
4. Build simple web interface for testing
5. Measure baseline gas costs and precision

### Phase 2: Rust Integration (Weeks 3-4)

1. Develop Rust contract for sigmoid calculation
2. Integrate Rust contract with existing Solidity system
3. Implement proper error handling and fallbacks
4. Document performance improvements
5. Add advanced curve parameter controls

### Phase 3: AI Integration (Week 5)

1. Connect AI service to smart contracts
2. Implement temperature control system
3. Add real-time AI mood indicators
4. Test and calibrate tokenomics parameters

### Phase 4: Polish & Demo (Week 6)

1. Enhanced UI with real-time charts
2. Mobile-responsive design
3. Comprehensive testing across scenarios
4. Documentation and demo script preparation

## Success Metrics

### Technical Demonstrations

- **Gas Efficiency**: X% reduction in computational costs
- **Precision**: Improved curve accuracy measurements
- **Performance**: Response time comparisons
- **Scalability**: Transaction throughput improvements

### User Engagement

- **Active Participation**: Messages per user per day
- **Token Activity**: Buy/sell volume on bonding curve
- **Price Discovery**: Volatility and price responsiveness to AI sentiment
- **Community Growth**: User acquisition and retention

## Risk Considerations

### Technical Risks

- **Curve Parameter Tuning**: May require multiple iterations to achieve desired dynamics
- **AI Consistency**: Potential for AI mood swings to destabilize tokenomics
- **MEV Opportunities**: Front-running potential on predictable AI responses
- **Emergency Scenarios**: Need robust admin controls for system recovery

### Demo Risks

- **User Confusion**: Complex tokenomics may overwhelm demo participants
- **AI Gaming**: Users may quickly optimize for AI preferences vs genuine engagement
- **Supply Death Spiral**: Consecutive dislikes could create negative feedback loops

## Future Enhancement Opportunities

This demo provides a solid foundation for ongoing experimentation with advanced mathematical operations in decentralized applications. The clean interface design ensures the bonding curve primitive can be easily extended or composed with other DeFi protocols.

## Conclusion

This demo effectively showcases Fluent's blended execution capabilities while creating an engaging user experience around AI interaction and token economics. The sigmoid bonding curve provides a natural progression from simple Solidity implementation to Rust-enhanced performance, demonstrating clear value proposition for developers building computationally intensive DeFi applications.

The project serves as both a technical demonstration and a community engagement tool, providing a foundation for ongoing experimentation with advanced mathematical operations in decentralized applications.