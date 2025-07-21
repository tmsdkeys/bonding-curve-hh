// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IBondingCurve
 * @dev Standardized interface for swappable bonding curve implementations
 * @notice Designed as a composable primitive for DeFi integration
 * 
 * Flow:
 * 1. Users buy $CBT with ETH → creates reserves, mints tokens, updates price
 * 2. Users pay message fees in $CBT → tokens burned, no direct price impact
 * 3. AI likes → mints reward tokens → price increases
 * 4. AI dislikes → burns penalty tokens → price decreases
 */
interface IBondingCurve {
    
    // ============ EVENTS ============
    
    /**
     * @dev Emitted when tokens are purchased with ETH
     * @param buyer Address purchasing tokens
     * @param ethSpent Amount of ETH spent
     * @param tokensMinted Amount of tokens minted
     * @param newPrice New token price after purchase
     * @param newSupply New total token supply
     */
    event TokensPurchased(
        address indexed buyer,
        uint256 ethSpent,
        uint256 tokensMinted,
        uint256 newPrice,
        uint256 newSupply
    );
    
    /**
     * @dev Emitted when tokens are sold for ETH
     * @param seller Address selling tokens
     * @param tokensBurned Amount of tokens burned
     * @param ethReceived Amount of ETH received
     * @param newPrice New token price after sale
     * @param newSupply New total token supply
     */
    event TokensSold(
        address indexed seller,
        uint256 tokensBurned,
        uint256 ethReceived,
        uint256 newPrice,
        uint256 newSupply
    );
    
    /**
     * @dev Emitted when curve parameters are updated
     * @param admin Address that updated parameters
     * @param newParameters Array of new parameter values [A, k, B]
     */
    event ParametersUpdated(
        address indexed admin,
        uint256[] newParameters
    );
    
    /**
     * @dev Emitted when external supply change affects price
     * @param source Contract that triggered the change
     * @param supplyDelta Change in supply (positive for mint, negative for burn)
     * @param newPrice New price after supply change
     * @param reason Human-readable reason for change
     */
    event SupplyChanged(
        address indexed source,
        int256 supplyDelta,
        uint256 newPrice,
        string reason
    );
    
    // ============ CORE PRICING FUNCTIONS ============
    
    /**
     * @dev Calculate token price for a given supply amount
     * @param supply Total token supply to calculate price for
     * @return price Token price with 8 decimal precision (1e8 = 1.00000000)
     * @notice Must be a pure function for predictable behavior
     */
    function calculatePrice(uint256 supply) external view returns (uint256 price);
    
    /**
     * @dev Buy tokens with ETH, respecting slippage protection
     * @param minTokensOut Minimum tokens expected (slippage protection)
     * @return tokensMinted Actual tokens minted to buyer
     * @notice Reverts if slippage exceeds user's tolerance
     */
    function buy(uint256 minTokensOut) external payable returns (uint256 tokensMinted);
    
    /**
     * @dev Sell tokens for ETH, respecting slippage protection
     * @param tokenAmount Amount of tokens to sell
     * @param minEthOut Minimum ETH expected (slippage protection)
     * @return ethReceived Actual ETH received by seller
     * @notice Reverts if slippage exceeds user's tolerance
     */
    function sell(uint256 tokenAmount, uint256 minEthOut) external returns (uint256 ethReceived);
    
    /**
     * @dev Get current token price based on current supply
     * @return price Current token price with 8 decimal precision
     */
    function getCurrentPrice() external view returns (uint256 price);
    
    /**
     * @dev Get current token supply from connected ERC20 contract
     * @return supply Current total token supply
     */
    function getSupply() external view returns (uint256 supply);
    
    // ============ METADATA & SWAPPABILITY ============
    
    /**
     * @dev Get human-readable curve type identifier
     * @return curveType String identifier (e.g., "sigmoid", "linear", "exponential")
     */
    function getCurveType() external pure returns (string memory curveType);
    
    /**
     * @dev Get current curve parameters for frontend/analytics
     * @return parameters Array of curve parameters (interpretation depends on curve type)
     * @notice For sigmoid: [A (max price), k (steepness), B (inflection point)]
     */
    function getParameters() external view returns (uint256[] memory parameters);
    
    /**
     * @dev Calculate tokens receivable for a given ETH amount (preview function)
     * @param ethAmount Amount of ETH to spend
     * @return tokenAmount Estimated tokens that would be received
     * @notice Does not account for slippage, use for estimation only
     */
    function calculateTokensForEth(uint256 ethAmount) external view returns (uint256 tokenAmount);
    
    /**
     * @dev Calculate ETH receivable for a given token amount (preview function)
     * @param tokenAmount Amount of tokens to sell
     * @return ethAmount Estimated ETH that would be received
     * @notice Does not account for slippage, use for estimation only
     */
    function calculateEthForTokens(uint256 tokenAmount) external view returns (uint256 ethAmount);
    
    // ============ RESERVE MANAGEMENT ============
    
    /**
     * @dev Get current ETH reserve balance held by the contract
     * @return balance Current ETH reserves in wei
     */
    function getReserveBalance() external view returns (uint256 balance);
    
    /**
     * @dev Get reserve ratio (reserves / market cap)
     * @return ratio Reserve ratio with 8 decimal precision (1e8 = 100%)
     * @notice Useful for monitoring bonding curve health
     */
    function getReserveRatio() external view returns (uint256 ratio);
    
    // ============ ADMIN FUNCTIONS ============
    
    /**
     * @dev Update curve parameters (admin only)
     * @param newParameters Array of new parameter values
     * @notice Parameter interpretation depends on curve implementation
     */
    function updateParameters(uint256[] calldata newParameters) external;
    
    /**
     * @dev Notify bonding curve of external supply changes
     * @param supplyDelta Change in supply (positive for mint, negative for burn)  
     * @param reason Human-readable reason for the change
     * @notice Only callable by authorized contracts (chatbot, admin)
     */
    function notifySupplyChange(int256 supplyDelta, string calldata reason) external;
    
    // ============ EMERGENCY FUNCTIONS ============
    
    /**
     * @dev Emergency pause trading (admin only)
     */
    function pause() external;
    
    /**
     * @dev Unpause trading (admin only)
     */
    function unpause() external;
    
    /**
     * @dev Check if contract is currently paused
     * @return paused True if contract is paused
     */
    function paused() external view returns (bool paused);
}