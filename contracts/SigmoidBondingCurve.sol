// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./IBondingCurve.sol";
import "./SigmoidMath.sol";
import "./ChatbotToken.sol";

/**
 * @title SigmoidBondingCurve
 * @dev Implementation of sigmoid bonding curve for AI Chatbot token economics
 * @notice Phase 1 implementation using Solidity approximations (gas-expensive, lower precision)
 * 
 * Mathematical Model: price = A / (1 + e^(-k * (supply - B)))
 * 
 * Flow:
 * 1. Users buy $CBT with ETH → ETH stored as reserves, tokens minted
 * 2. Users sell $CBT → tokens burned, ETH returned from reserves
 * 3. External contracts (chatbot) notify of supply changes → price updates
 * 4. All operations respect slippage protection and maintain reserve accounting
 */
contract SigmoidBondingCurve is IBondingCurve, AccessControl, Pausable, ReentrancyGuard {
    using SigmoidMath for uint256;

    // ============ ROLES ============
    
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant SUPPLY_NOTIFIER_ROLE = keccak256("SUPPLY_NOTIFIER_ROLE");
    bytes32 public constant PARAMETER_UPDATER_ROLE = keccak256("PARAMETER_UPDATER_ROLE");

    // ============ STATE VARIABLES ============
    
    /// @dev Connected ERC20 token contract
    ChatbotToken public immutable token;
    
    /// @dev Sigmoid curve parameters
    uint256 public A; // Maximum price ceiling (8 decimal precision)
    uint256 public k; // Steepness factor (18 decimal precision)  
    uint256 public B; // Inflection point supply (18 decimal precision)
    
    /// @dev Reserve accounting
    uint256 public totalReserves; // Total ETH held in contract
    uint256 public lastPriceUpdate; // Block number of last price calculation
    uint256 public priceUpdateInterval; // Blocks between automatic price updates
    
    /// @dev Cached values for gas optimization
    uint256 private cachedPrice;
    uint256 private cachedSupply;
    uint256 private cacheBlock;
    
    /// @dev Trading statistics
    uint256 public totalVolumeBought; // Total tokens bought (for analytics)
    uint256 public totalVolumeSold;   // Total tokens sold (for analytics)
    uint256 public totalEthSpent;     // Total ETH spent on purchases
    uint256 public totalEthWithdrawn; // Total ETH withdrawn from sales

    // ============ CONSTANTS ============
    
    uint256 private constant CACHE_DURATION = 5; // Cache valid for 5 blocks
    uint256 private constant BASIS_POINTS = 10000; // 100% = 10000 basis points
    uint256 private constant DEFAULT_PRICE_UPDATE_INTERVAL = 50; // Every ~10 minutes

    // ============ CUSTOM ERRORS ============
    
    error InsufficientETH(uint256 required, uint256 provided);
    error InsufficientTokens(uint256 required, uint256 available);
    error SlippageExceeded(uint256 expected, uint256 actual, uint256 tolerance);
    error InvalidParameters(string reason);
    error InsufficientReserves(uint256 required, uint256 available);
    error PriceCalculationFailed();
    error InvalidSupplyDelta();

    // ============ CONSTRUCTOR ============
    
    /**
     * @dev Initialize the bonding curve with parameters and token reference
     * @param _token Address of the ChatbotToken contract
     * @param _A Maximum price ceiling (8 decimal precision)
     * @param _k Steepness factor (18 decimal precision)
     * @param _B Inflection point supply (18 decimal precision)
     * @param _admin Address that will have admin roles
     */
    constructor(
        address _token,
        uint256 _A,
        uint256 _k,
        uint256 _B,
        address _admin
    ) {
        require(_token != address(0), "Invalid token address");
        require(_admin != address(0), "Invalid admin address");
        
        token = ChatbotToken(_token);
        
        // Validate and set parameters
        _validateParameters(_A, _k, _B);
        A = _A;
        k = _k;
        B = _B;
        
        // Set default update interval
        priceUpdateInterval = DEFAULT_PRICE_UPDATE_INTERVAL;
        
        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(PARAMETER_UPDATER_ROLE, _admin);
        
        // Initialize cache
        _updatePriceCache();
        
        emit ParametersUpdated(_admin, _getParametersArray());
    }

    // ============ CORE PRICING FUNCTIONS ============
    
    /**
     * @inheritdoc IBondingCurve
     */
    function calculatePrice(uint256 supply) external view override returns (uint256 price) {
        return SigmoidMath.calculateSigmoidPrice(supply, A, k, B);
    }
    
    /**
     * @inheritdoc IBondingCurve
     */
    function getCurrentPrice() external view override returns (uint256 price) {
        return _getCurrentPriceInternal();
    }
    
    /**
     * @inheritdoc IBondingCurve
     */
    function getSupply() external view override returns (uint256 supply) {
        return token.totalSupply();
    }

    // ============ BUY/SELL FUNCTIONS ============
    
    /**
     * @inheritdoc IBondingCurve
     */
    function buy(uint256 minTokensOut) 
        external 
        payable 
        override 
        whenNotPaused 
        nonReentrant 
        returns (uint256 tokensMinted) 
    {
        require(msg.value > 0, "Must send ETH");
        
        uint256 ethAmount = msg.value;
        uint256 currentSupply = token.totalSupply();
        uint256 currentPrice = _getCurrentPriceInternal();
        
        // Calculate tokens to mint based on bonding curve integral
        tokensMinted = _calculateTokensForEth(ethAmount, currentSupply, currentPrice);
        
        // Slippage protection
        if (tokensMinted < minTokensOut) {
            revert SlippageExceeded(minTokensOut, tokensMinted, minTokensOut);
        }
        
        // Update reserves
        totalReserves += ethAmount;
        totalVolumeBought += tokensMinted;
        totalEthSpent += ethAmount;
        
        // Mint tokens to buyer
        token.mint(msg.sender, tokensMinted, "Bonding curve purchase");
        
        // Update cached price
        _updatePriceCache();
        
        uint256 newPrice = _getCurrentPriceInternal();
        uint256 newSupply = token.totalSupply();
        
        emit TokensPurchased(
            msg.sender,
            ethAmount,
            tokensMinted,
            newPrice,
            newSupply
        );
        
        return tokensMinted;
    }
    
    /**
     * @inheritdoc IBondingCurve
     */
    function sell(uint256 tokenAmount, uint256 minEthOut) 
        external 
        override 
        whenNotPaused 
        nonReentrant 
        returns (uint256 ethReceived) 
    {
        require(tokenAmount > 0, "Must sell positive amount");
        require(token.balanceOf(msg.sender) >= tokenAmount, "Insufficient token balance");
        
        uint256 currentSupply = token.totalSupply();
        uint256 currentPrice = _getCurrentPriceInternal();
        
        // Calculate ETH to return based on bonding curve integral
        ethReceived = _calculateEthForTokens(tokenAmount, currentSupply, currentPrice);
        
        // Slippage protection
        if (ethReceived < minEthOut) {
            revert SlippageExceeded(minEthOut, ethReceived, minEthOut);
        }
        
        // Check reserve sufficiency
        if (ethReceived > totalReserves) {
            revert InsufficientReserves(ethReceived, totalReserves);
        }
        
        // Update reserves and statistics
        totalReserves -= ethReceived;
        totalVolumeSold += tokenAmount;
        totalEthWithdrawn += ethReceived;
        
        // Burn tokens from seller
        token.burn(msg.sender, tokenAmount, "Bonding curve sale");
        
        // Update cached price
        _updatePriceCache();
        
        uint256 newPrice = _getCurrentPriceInternal();
        uint256 newSupply = token.totalSupply();
        
        // Transfer ETH to seller
        (bool success, ) = payable(msg.sender).call{value: ethReceived}("");
        require(success, "ETH transfer failed");
        
        emit TokensSold(
            msg.sender,
            tokenAmount,
            ethReceived,
            newPrice,
            newSupply
        );
        
        return ethReceived;
    }

    // ============ CALCULATION FUNCTIONS ============
    
    /**
     * @inheritdoc IBondingCurve
     */
    function calculateTokensForEth(uint256 ethAmount) 
        external 
        view 
        override 
        returns (uint256 tokenAmount) 
    {
        uint256 currentSupply = token.totalSupply();
        uint256 currentPrice = _getCurrentPriceInternal();
        return _calculateTokensForEth(ethAmount, currentSupply, currentPrice);
    }
    
    /**
     * @inheritdoc IBondingCurve
     */
    function calculateEthForTokens(uint256 tokenAmount) 
        external 
        view 
        override 
        returns (uint256 ethAmount) 
    {
        uint256 currentSupply = token.totalSupply();
        uint256 currentPrice = _getCurrentPriceInternal();
        return _calculateEthForTokens(tokenAmount, currentSupply, currentPrice);
    }

    // ============ INTERNAL CALCULATION FUNCTIONS ============
    
    /**
     * @dev Calculate tokens receivable for ETH amount (internal implementation)
     * @param ethAmount Amount of ETH to spend
     * @param currentSupply Current token supply
     * @param currentPrice Current token price
     * @return tokenAmount Tokens that would be minted
     */
    function _calculateTokensForEth(
        uint256 ethAmount,
        uint256 currentSupply,
        uint256 currentPrice
    ) internal view returns (uint256 tokenAmount) {
        // Simplified calculation: assume linear approximation over small ranges
        // For more precision, we'd need to integrate the bonding curve
        // This is a known limitation of Phase 1 Solidity implementation
        
        // Convert price to ETH per token (currentPrice is tokens per ETH)
        // Price is in 8 decimals, so: ethPerToken = 1e26 / currentPrice
        uint256 ethPerToken = (1e26) / currentPrice; // 18 decimals (ETH) / 8 decimals (price)
        
        // Basic approximation: tokens = ethAmount / ethPerToken
        tokenAmount = (ethAmount * currentPrice) / SigmoidMath.PRICE_PRECISION;
        
        // Apply slight discount due to price increase during purchase
        // This is a rough approximation - actual integral would be more precise
        uint256 discountBasisPoints = _calculatePurchaseDiscount(tokenAmount, currentSupply);
        tokenAmount = (tokenAmount * (BASIS_POINTS - discountBasisPoints)) / BASIS_POINTS;
        
        return tokenAmount;
    }
    
    /**
     * @dev Calculate ETH receivable for token amount (internal implementation)
     * @param tokenAmount Amount of tokens to sell
     * @param currentSupply Current token supply
     * @param currentPrice Current token price
     * @return ethAmount ETH that would be received
     */
    function _calculateEthForTokens(
        uint256 tokenAmount,
        uint256 currentSupply,
        uint256 currentPrice
    ) internal view returns (uint256 ethAmount) {
        // Similar simplified calculation for selling
        ethAmount = (tokenAmount * currentPrice) / SigmoidMath.PRICE_PRECISION;
        
        // Apply slight discount due to price decrease during sale
        uint256 discountBasisPoints = _calculateSaleDiscount(tokenAmount, currentSupply);
        ethAmount = (ethAmount * (BASIS_POINTS - discountBasisPoints)) / BASIS_POINTS;
        
        return ethAmount;
    }
    
    /**
     * @dev Calculate purchase discount based on price impact
     * @param tokenAmount Tokens being purchased
     * @param currentSupply Current supply
     * @return discountBasisPoints Discount in basis points
     */
    function _calculatePurchaseDiscount(
        uint256 tokenAmount,
        uint256 currentSupply
    ) internal view returns (uint256 discountBasisPoints) {
        // Simple approximation: larger purchases get larger discounts
        uint256 impactRatio = (tokenAmount * BASIS_POINTS) / (currentSupply + 1);
        
        // Cap discount at 5% (500 basis points)
        discountBasisPoints = impactRatio > 500 ? 500 : impactRatio;
        
        return discountBasisPoints;
    }
    
    /**
     * @dev Calculate sale discount based on price impact
     * @param tokenAmount Tokens being sold
     * @param currentSupply Current supply
     * @return discountBasisPoints Discount in basis points
     */
    function _calculateSaleDiscount(
        uint256 tokenAmount,
        uint256 currentSupply
    ) internal view returns (uint256 discountBasisPoints) {
        // Similar to purchase discount but for sales
        uint256 impactRatio = (tokenAmount * BASIS_POINTS) / (currentSupply + 1);
        
        // Cap discount at 3% for sales (300 basis points)
        discountBasisPoints = impactRatio > 300 ? 300 : impactRatio;
        
        return discountBasisPoints;
    }

    // ============ PRICE CACHING & OPTIMIZATION ============
    
    /**
     * @dev Get current price with caching optimization
     * @return price Current token price
     */
    function _getCurrentPriceInternal() internal view returns (uint256 price) {
        // Use cached price if still valid
        if (block.number <= cacheBlock + CACHE_DURATION && cachedPrice > 0) {
            return cachedPrice;
        }
        
        // Calculate fresh price
        uint256 currentSupply = token.totalSupply();
        return SigmoidMath.calculateSigmoidPrice(currentSupply, A, k, B);
    }
    
    /**
     * @dev Update price cache
     */
    function _updatePriceCache() internal {
        uint256 currentSupply = token.totalSupply();
        cachedPrice = SigmoidMath.calculateSigmoidPrice(currentSupply, A, k, B);
        cachedSupply = currentSupply;
        cacheBlock = block.number;
        lastPriceUpdate = block.number;
    }

    // ============ EXTERNAL SUPPLY CHANGE NOTIFICATIONS ============
    
    /**
     * @inheritdoc IBondingCurve
     */
    function notifySupplyChange(int256 supplyDelta, string calldata reason) 
        external 
        override 
        onlyRole(SUPPLY_NOTIFIER_ROLE) 
    {
        if (supplyDelta == 0) revert InvalidSupplyDelta();
        
        // Update price cache due to supply change
        _updatePriceCache();
        
        uint256 newPrice = cachedPrice;
        
        emit SupplyChanged(msg.sender, supplyDelta, newPrice, reason);
    }

    // ============ METADATA & SWAPPABILITY ============
    
    /**
     * @inheritdoc IBondingCurve
     */
    function getCurveType() external pure override returns (string memory) {
        return "sigmoid";
    }
    
    /**
     * @inheritdoc IBondingCurve
     */
    function getParameters() external view override returns (uint256[] memory) {
        return _getParametersArray();
    }
    
    /**
     * @dev Get parameters as array (internal helper)
     * @return parameters [A, k, B]
     */
    function _getParametersArray() internal view returns (uint256[] memory parameters) {
        parameters = new uint256[](3);
        parameters[0] = A;
        parameters[1] = k; 
        parameters[2] = B;
        return parameters;
    }

    // ============ RESERVE MANAGEMENT ============
    
    /**
     * @inheritdoc IBondingCurve
     */
    function getReserveBalance() external view override returns (uint256) {
        return totalReserves;
    }
    
    /**
     * @inheritdoc IBondingCurve
     */
    function getReserveRatio() external view override returns (uint256 ratio) {
        uint256 currentSupply = token.totalSupply();
        uint256 currentPrice = _getCurrentPriceInternal();
        
        if (currentSupply == 0 || currentPrice == 0) return 0;
        
        // Market cap = supply * price
        uint256 marketCap = (currentSupply * currentPrice) / SigmoidMath.PRICE_PRECISION;
        
        if (marketCap == 0) return 0;
        
        // Reserve ratio = reserves / market cap (as percentage in 8 decimals)
        ratio = (totalReserves * SigmoidMath.PRICE_PRECISION) / marketCap;
        
        return ratio;
    }

    // ============ ADMIN FUNCTIONS ============
    
    /**
     * @inheritdoc IBondingCurve
     */
    function updateParameters(uint256[] calldata newParameters) 
        external 
        override 
        onlyRole(PARAMETER_UPDATER_ROLE) 
    {
        require(newParameters.length == 3, "Must provide [A, k, B]");
        
        uint256 newA = newParameters[0];
        uint256 newK = newParameters[1];
        uint256 newB = newParameters[2];
        
        _validateParameters(newA, newK, newB);
        
        A = newA;
        k = newK;
        B = newB;
        
        // Update cache with new parameters
        _updatePriceCache();
        
        emit ParametersUpdated(msg.sender, newParameters);
    }
    
    /**
     * @dev Validate sigmoid parameters
     * @param _A Maximum price ceiling
     * @param _k Steepness factor
     * @param _B Inflection point
     */
    function _validateParameters(uint256 _A, uint256 _k, uint256 _B) internal pure {
        if (_A < SigmoidMath.MIN_A || _A > SigmoidMath.MAX_A) {
            revert InvalidParameters("A out of bounds");
        }
        if (_k < SigmoidMath.MIN_K || _k > SigmoidMath.MAX_K) {
            revert InvalidParameters("k out of bounds");
        }
        if (_B < SigmoidMath.MIN_B || _B > SigmoidMath.MAX_B) {
            revert InvalidParameters("B out of bounds");
        }
    }

    // ============ EMERGENCY FUNCTIONS ============
    
    /**
     * @inheritdoc IBondingCurve
     */
    function pause() external override onlyRole(ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @inheritdoc IBondingCurve
     */
    function unpause() external override onlyRole(ADMIN_ROLE) {
        _unpause();
    }
    
    /**
     * @inheritdoc IBondingCurve
     */
    function paused() public view override(IBondingCurve, Pausable) returns (bool) {
        return super.paused();
    }

    // ============ ANALYTICS & STATISTICS ============
    
    /**
     * @dev Get comprehensive trading statistics
     * @return stats Array of [totalVolumeBought, totalVolumeSold, totalEthSpent, totalEthWithdrawn, netFlow]
     */
    function getTradingStatistics() external view returns (uint256[5] memory stats) {
        stats[0] = totalVolumeBought;
        stats[1] = totalVolumeSold;
        stats[2] = totalEthSpent;
        stats[3] = totalEthWithdrawn;
        stats[4] = totalEthSpent > totalEthWithdrawn ? 
                   totalEthSpent - totalEthWithdrawn : 0; // Net ETH inflow
        
        return stats;
    }
    
    /**
     * @dev Get current price derivative (rate of price change)
     * @return derivative Price sensitivity to supply changes
     */
    function getCurrentPriceDerivative() external view returns (uint256 derivative) {
        uint256 currentSupply = token.totalSupply();
        return SigmoidMath.calculatePriceDerivative(currentSupply, A, k, B);
    }

    // ============ FALLBACK ============
    
    /**
     * @dev Fallback function to reject direct ETH transfers
     */
    receive() external payable {
        revert("Use buy() function to purchase tokens");
    }
}