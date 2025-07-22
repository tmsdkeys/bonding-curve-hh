// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./IAIChatbot.sol";
import "./ChatbotToken.sol";
import "./IBondingCurve.sol";

/**
 * @title AIChatbot
 * @dev AI-powered chatbot with integrated token economics
 * @notice Phase 1 implementation with mock AI system (admin-controlled judgments)
 * 
 * Core Mechanics:
 * 1. Users pay message fees in $CBT (burned immediately)
 * 2. AI selectively judges messages with configurable probability
 * 3. Likes mint reward tokens to authors
 * 4. Dislikes burn penalty tokens from supply
 * 5. Supply changes notify bonding curve for price updates
 */
contract AIChatbot is IAIChatbot, AccessControl, Pausable, ReentrancyGuard {

    // ============ ROLES ============
    
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant AI_PROCESSOR_ROLE = keccak256("AI_PROCESSOR_ROLE");
    bytes32 public constant PARAMETER_UPDATER_ROLE = keccak256("PARAMETER_UPDATER_ROLE");

    // ============ STATE VARIABLES ============
    
    /// @dev Connected contracts
    ChatbotToken public immutable token;
    IBondingCurve public immutable bondingCurve;
    
    /// @dev Message storage
    mapping(uint256 => Message) private messages;
    mapping(address => uint256[]) private messagesByAuthor;
    uint256[] private allMessageIds;
    
    /// @dev Counters and statistics
    uint256 public messageIdCounter;
    uint256 public totalMessagesJudged;
    uint256 public totalLikes;
    uint256 public totalDislikes;
    uint256 public totalFeesCollected;
    uint256 public totalRewardsDistributed;
    uint256 public totalPenaltiesApplied;
    
    /// @dev User statistics
    mapping(address => uint256) public userMessageCount;
    mapping(address => uint256) public userLikeCount;
    mapping(address => uint256) public userDislikeCount;
    mapping(address => uint256) public userFeesTotal;
    mapping(address => uint256) public userRewardsTotal;
    
    /// @dev Tokenomics parameters
    uint256 public messageFee;
    uint256 public likeReward;
    uint256 public dislikePenalty;
    uint256 public judgmentProbability; // Basis points (0-10000)
    
    /// @dev Message constraints
    uint256 public minimumMessageLength;
    uint256 public maximumMessageLength;

    // ============ CONSTANTS ============
    
    uint256 private constant BASIS_POINTS = 10000; // 100% = 10000 basis points
    uint256 private constant DEFAULT_JUDGMENT_PROBABILITY = 1700; // 17%
    uint256 private constant DEFAULT_MIN_LENGTH = 10; // 10 characters
    uint256 private constant DEFAULT_MAX_LENGTH = 500; // 500 characters

    // ============ CUSTOM ERRORS ============
    
    error InvalidMessageLength(uint256 length, uint256 min, uint256 max);
    error InsufficientTokenBalance(uint256 required, uint256 available);
    error InsufficientAllowance(uint256 required, uint256 available);
    error MessageNotFound(uint256 messageId);
    error MessageAlreadyJudged(uint256 messageId);
    error InvalidJudgment();
    error InvalidParameters(string reason);
    error ArrayLengthMismatch();

    // ============ CONSTRUCTOR ============
    
    /**
     * @dev Initialize the AI chatbot with connected contracts and parameters
     * @param _token Address of the ChatbotToken contract
     * @param _bondingCurve Address of the bonding curve contract
     * @param _messageFee Initial message fee in $CBT tokens
     * @param _likeReward Initial reward for liked messages
     * @param _dislikePenalty Initial penalty for disliked messages
     * @param _admin Address that will have admin roles
     */
    constructor(
        address _token,
        address _bondingCurve,
        uint256 _messageFee,
        uint256 _likeReward,
        uint256 _dislikePenalty,
        address _admin
    ) {
        require(_token != address(0), "Invalid token address");
        require(_bondingCurve != address(0), "Invalid bonding curve address");
        require(_admin != address(0), "Invalid admin address");
        
        token = ChatbotToken(_token);
        bondingCurve = IBondingCurve(_bondingCurve);
        
        // Validate and set tokenomics parameters
        _validateTokenomicsParameters(_messageFee, _likeReward, _dislikePenalty);
        messageFee = _messageFee;
        likeReward = _likeReward;
        dislikePenalty = _dislikePenalty;
        
        // Set default AI parameters
        judgmentProbability = DEFAULT_JUDGMENT_PROBABILITY;
        minimumMessageLength = DEFAULT_MIN_LENGTH;
        maximumMessageLength = DEFAULT_MAX_LENGTH;
        
        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(AI_PROCESSOR_ROLE, _admin); // Admin can process AI responses in Phase 1
        _grantRole(PARAMETER_UPDATER_ROLE, _admin);
        
        emit TokenomicsUpdated(_admin, _messageFee, _likeReward, _dislikePenalty, judgmentProbability);
        emit AIParametersUpdated(_admin, judgmentProbability, minimumMessageLength, maximumMessageLength);
    }

    // ============ CORE FUNCTIONS ============
    
    /**
     * @inheritdoc IAIChatbot
     */
    function sendMessage(string calldata content) 
        external 
        override 
        whenNotPaused 
        nonReentrant 
    {
        // Validate message length
        uint256 contentLength = bytes(content).length;
        if (contentLength < minimumMessageLength || contentLength > maximumMessageLength) {
            revert InvalidMessageLength(contentLength, minimumMessageLength, maximumMessageLength);
        }
        
        // Check user has sufficient token balance
        uint256 userBalance = token.balanceOf(msg.sender);
        if (userBalance < messageFee) {
            revert InsufficientTokenBalance(messageFee, userBalance);
        }
        
        // Check user has approved sufficient tokens
        uint256 allowance = token.allowance(msg.sender, address(this));
        if (allowance < messageFee) {
            revert InsufficientAllowance(messageFee, allowance);
        }
        
        // Generate message ID
        uint256 messageId = ++messageIdCounter;
        
        // Burn message fee
        token.burn(msg.sender, messageFee, "Message fee");
        
        // Store message
        messages[messageId] = Message({
            id: messageId,
            author: msg.sender,
            content: content,
            timestamp: block.timestamp,
            judgment: AIJudgment.NONE,
            feePaid: messageFee,
            rewardMinted: 0,
            penaltyBurned: 0
        });
        
        // Update indices and statistics
        messagesByAuthor[msg.sender].push(messageId);
        allMessageIds.push(messageId);
        
        userMessageCount[msg.sender]++;
        userFeesTotal[msg.sender] += messageFee;
        totalFeesCollected += messageFee;
        
        emit MessageSent(messageId, msg.sender, content, messageFee, block.timestamp);
    }
    
    /**
     * @inheritdoc IAIChatbot
     */
    function processAIResponse(uint256 messageId, AIJudgment judgment) 
        external 
        override 
        onlyRole(AI_PROCESSOR_ROLE) 
        whenNotPaused 
        nonReentrant 
    {
        // Validate message exists
        if (messageId == 0 || messageId > messageIdCounter) {
            revert MessageNotFound(messageId);
        }
        
        Message storage message = messages[messageId];
        
        // Check message hasn't been judged already
        if (message.judgment != AIJudgment.NONE) {
            revert MessageAlreadyJudged(messageId);
        }
        
        // Validate judgment
        if (judgment == AIJudgment.NONE) {
            revert InvalidJudgment();
        }
        
        // Update message judgment
        message.judgment = judgment;
        totalMessagesJudged++;
        
        int256 tokenDelta = 0;
        address author = message.author;
        
        if (judgment == AIJudgment.LIKED) {
            // Mint reward tokens to author
            token.mint(author, likeReward, "AI like reward");
            message.rewardMinted = likeReward;
            
            // Update statistics
            totalLikes++;
            userLikeCount[author]++;
            userRewardsTotal[author] += likeReward;
            totalRewardsDistributed += likeReward;
            
            tokenDelta = int256(likeReward);
            
        } else if (judgment == AIJudgment.DISLIKED) {
            // Burn penalty tokens from supply (not from user)
            // This reduces total supply, affecting price
            token.burn(address(this), dislikePenalty, "AI dislike penalty");
            message.penaltyBurned = dislikePenalty;
            
            // Update statistics
            totalDislikes++;
            userDislikeCount[author]++;
            totalPenaltiesApplied += dislikePenalty;
            
            tokenDelta = -int256(dislikePenalty);
        }
        
        // Notify bonding curve of supply change
        if (tokenDelta != 0) {
            string memory reason = judgment == AIJudgment.LIKED ? "AI like reward" : "AI dislike penalty";
            bondingCurve.notifySupplyChange(tokenDelta, reason);
        }
        
        uint256 newTotalSupply = token.totalSupply();
        
        emit AIJudgmentProcessed(messageId, author, judgment, tokenDelta, newTotalSupply);
    }

    // ============ VIEW FUNCTIONS ============
    
    /**
     * @inheritdoc IAIChatbot
     */
    function getUserBalance(address user) external view override returns (uint256) {
        return token.balanceOf(user);
    }
    
    /**
     * @inheritdoc IAIChatbot
     */
    function getMessageCount() external view override returns (uint256) {
        return messageIdCounter;
    }
    
    /**
     * @inheritdoc IAIChatbot
     */
    function getJudgedMessageCount() external view override returns (uint256) {
        return totalMessagesJudged;
    }
    
    /**
     * @inheritdoc IAIChatbot
     */
    function getMessage(uint256 messageId) external view override returns (Message memory) {
        if (messageId == 0 || messageId > messageIdCounter) {
            revert MessageNotFound(messageId);
        }
        return messages[messageId];
    }
    
    /**
     * @inheritdoc IAIChatbot
     */
    function getMessagesByAuthor(
        address author, 
        uint256 offset, 
        uint256 limit
    ) external view override returns (uint256[] memory, uint256) {
        uint256[] storage authorMessages = messagesByAuthor[author];
        uint256 totalCount = authorMessages.length;
        
        if (offset >= totalCount) {
            return (new uint256[](0), totalCount);
        }
        
        uint256 end = offset + limit;
        if (end > totalCount) {
            end = totalCount;
        }
        
        uint256 resultLength = end - offset;
        uint256[] memory result = new uint256[](resultLength);
        
        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = authorMessages[offset + i];
        }
        
        return (result, totalCount);
    }
    
    /**
     * @inheritdoc IAIChatbot
     */
    function getRecentMessages(
        uint256 offset, 
        uint256 limit
    ) external view override returns (uint256[] memory) {
        uint256 totalCount = allMessageIds.length;
        
        if (offset >= totalCount) {
            return new uint256[](0);
        }
        
        uint256 end = offset + limit;
        if (end > totalCount) {
            end = totalCount;
        }
        
        uint256 resultLength = end - offset;
        uint256[] memory result = new uint256[](resultLength);
        
        // Return in reverse chronological order (newest first)
        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = allMessageIds[totalCount - 1 - offset - i];
        }
        
        return result;
    }

    // ============ STATISTICS FUNCTIONS ============
    
    /**
     * @inheritdoc IAIChatbot
     */
    function getChatbotStatistics() external view override returns (uint256[8] memory) {
        return [
            messageIdCounter,           // Total messages sent
            totalMessagesJudged,        // Total messages judged
            totalLikes,                 // Total likes received
            totalDislikes,              // Total dislikes received
            totalFeesCollected,         // Total fees collected (burned)
            totalRewardsDistributed,    // Total rewards distributed
            totalPenaltiesApplied,      // Total penalties applied
            judgmentProbability         // Current judgment probability (basis points)
        ];
    }
    
    /**
     * @inheritdoc IAIChatbot
     */
    function getUserStatistics(address user) external view override returns (uint256[6] memory) {
        uint256 netTokenChange = userRewardsTotal[user] > (userFeesTotal[user] + (userDislikeCount[user] * dislikePenalty))
            ? userRewardsTotal[user] - userFeesTotal[user] - (userDislikeCount[user] * dislikePenalty)
            : 0;
            
        return [
            userMessageCount[user],     // Messages sent by user
            userLikeCount[user],        // Likes received by user
            userDislikeCount[user],     // Dislikes received by user
            userFeesTotal[user],        // Total fees paid by user
            userRewardsTotal[user],     // Total rewards earned by user
            netTokenChange              // Net token change for user
        ];
    }
    
    /**
     * @inheritdoc IAIChatbot
     */
    function getTokenomicsParameters() external view override returns (uint256[4] memory) {
        return [
            messageFee,
            likeReward,
            dislikePenalty,
            judgmentProbability
        ];
    }

    // ============ ADMIN FUNCTIONS ============
    
    /**
     * @inheritdoc IAIChatbot
     */
    function updateTokenomics(
        uint256 _messageFee,
        uint256 _likeReward,
        uint256 _dislikePenalty
    ) external override onlyRole(PARAMETER_UPDATER_ROLE) {
        _validateTokenomicsParameters(_messageFee, _likeReward, _dislikePenalty);
        
        messageFee = _messageFee;
        likeReward = _likeReward;
        dislikePenalty = _dislikePenalty;
        
        emit TokenomicsUpdated(msg.sender, _messageFee, _likeReward, _dislikePenalty, judgmentProbability);
    }
    
    /**
     * @inheritdoc IAIChatbot
     */
    function updateAIParameters(
        uint256 _judgmentProbability,
        uint256 _minLength,
        uint256 _maxLength
    ) external override onlyRole(PARAMETER_UPDATER_ROLE) {
        if (_judgmentProbability > BASIS_POINTS) {
            revert InvalidParameters("Judgment probability cannot exceed 100%");
        }
        if (_minLength == 0 || _minLength >= _maxLength) {
            revert InvalidParameters("Invalid message length bounds");
        }
        if (_maxLength > 2000) { // Reasonable gas limit
            revert InvalidParameters("Maximum message length too large");
        }
        
        judgmentProbability = _judgmentProbability;
        minimumMessageLength = _minLength;
        maximumMessageLength = _maxLength;
        
        emit AIParametersUpdated(msg.sender, _judgmentProbability, _minLength, _maxLength);
    }

    // ============ EMERGENCY FUNCTIONS ============
    
    /**
     * @inheritdoc IAIChatbot
     */
    function pause() external override onlyRole(ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @inheritdoc IAIChatbot
     */
    function unpause() external override onlyRole(ADMIN_ROLE) {
        _unpause();
    }
    
    /**
     * @inheritdoc IAIChatbot
     */
    function paused() public view override(IAIChatbot, Pausable) returns (bool) {
        return super.paused();
    }

    // ============ INTERNAL HELPER FUNCTIONS ============
    
    /**
     * @dev Validate tokenomics parameters
     * @param _messageFee Message fee amount
     * @param _likeReward Like reward amount
     * @param _dislikePenalty Dislike penalty amount
     */
    function _validateTokenomicsParameters(
        uint256 _messageFee,
        uint256 _likeReward,
        uint256 _dislikePenalty
    ) internal pure {
        if (_messageFee == 0) {
            revert InvalidParameters("Message fee cannot be zero");
        }
        if (_likeReward <= _messageFee) {
            revert InvalidParameters("Like reward must exceed message fee");
        }
        if (_dislikePenalty == 0) {
            revert InvalidParameters("Dislike penalty cannot be zero");
        }
        // Ensure economic incentives are balanced
        if (_likeReward > _messageFee * 20) {
            revert InvalidParameters("Like reward too high relative to fee");
        }
    }

    // ============ UTILITY FUNCTIONS ============
    
    /**
     * @dev Check if a message should be judged based on probability
     * @param messageId Message ID to use for randomness
     * @return shouldJudge True if message should receive AI judgment
     */
    function shouldMessageBeJudged(uint256 messageId) external view returns (bool) {
        if (judgmentProbability == 0) return false;
        if (judgmentProbability >= BASIS_POINTS) return true;
        
        uint256 randomValue = uint256(keccak256(abi.encode(messageId, block.timestamp, block.prevrandao))) % BASIS_POINTS;
        return randomValue < judgmentProbability;
    }
    
    /**
     * @dev Get pending messages that could be judged
     * @param limit Maximum number of messages to return
     * @return pendingIds Array of message IDs pending judgment
     */
    function getPendingMessages(uint256 limit) external view returns (uint256[] memory pendingIds) {
        uint256 totalMessages = messageIdCounter;
        uint256 count = 0;
        
        // First pass: count pending messages
        for (uint256 i = totalMessages; i > 0 && count < limit; i--) {
            if (messages[i].judgment == AIJudgment.NONE) {
                count++;
            }
        }
        
        // Second pass: collect pending message IDs
        pendingIds = new uint256[](count);
        uint256 index = 0;
        
        for (uint256 i = totalMessages; i > 0 && index < count; i--) {
            if (messages[i].judgment == AIJudgment.NONE) {
                pendingIds[index] = i;
                index++;
            }
        }
        
        return pendingIds;
    }
}