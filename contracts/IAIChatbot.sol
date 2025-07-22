// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IAIChatbot
 * @dev Standardized interface for AI-powered chatbot with token economics
 * @notice Handles message submissions, AI judgments, and token economy integration
 * 
 * Flow:
 * 1. Users send messages and pay fees in $CBT (burned)
 * 2. AI selectively judges certain messages (like/dislike/none)
 * 3. Likes mint reward tokens, dislikes burn penalty tokens
 * 4. Supply changes notify bonding curve for price updates
 */
interface IAIChatbot {
    
    // ============ ENUMS ============
    
    /**
     * @dev AI judgment states for messages
     * @param NONE No judgment made (most messages)
     * @param LIKED AI liked the message (mint reward tokens)
     * @param DISLIKED AI disliked the message (burn penalty tokens)
     */
    enum AIJudgment { NONE, LIKED, DISLIKED }

    // ============ STRUCTS ============
    
    /**
     * @dev Message data structure
     * @param id Unique message identifier
     * @param author Address of message sender
     * @param content Message text content
     * @param timestamp Block timestamp when message was sent
     * @param judgment AI judgment for this message
     * @param feePaid Amount of $CBT fee paid
     * @param rewardMinted Amount of $CBT reward minted (if liked)
     * @param penaltyBurned Amount of $CBT penalty burned (if disliked)
     */
    struct Message {
        uint256 id;
        address author;
        string content;
        uint256 timestamp;
        AIJudgment judgment;
        uint256 feePaid;
        uint256 rewardMinted;
        uint256 penaltyBurned;
    }

    // ============ EVENTS ============
    
    /**
     * @dev Emitted when a user sends a message
     * @param messageId Unique identifier for the message
     * @param author Address of the message sender
     * @param content Message text content
     * @param feePaid Amount of $CBT fee burned
     * @param timestamp Block timestamp
     */
    event MessageSent(
        uint256 indexed messageId,
        address indexed author,
        string content,
        uint256 feePaid,
        uint256 timestamp
    );
    
    /**
     * @dev Emitted when AI processes a message judgment
     * @param messageId Message that was judged
     * @param author Original message author
     * @param judgment AI judgment result
     * @param tokenDelta Change in token supply (positive for mint, negative for burn)
     * @param newTotalSupply New total token supply after judgment
     */
    event AIJudgmentProcessed(
        uint256 indexed messageId,
        address indexed author,
        AIJudgment judgment,
        int256 tokenDelta,
        uint256 newTotalSupply
    );
    
    /**
     * @dev Emitted when tokenomics parameters are updated
     * @param admin Address that updated parameters
     * @param messageFee New message fee amount
     * @param likeReward New like reward amount
     * @param dislikePenalty New dislike penalty amount
     * @param judgmentProbability New probability for AI judgment (basis points)
     */
    event TokenomicsUpdated(
        address indexed admin,
        uint256 messageFee,
        uint256 likeReward,
        uint256 dislikePenalty,
        uint256 judgmentProbability
    );
    
    /**
     * @dev Emitted when AI parameters are updated
     * @param admin Address that updated parameters
     * @param judgmentProbability Probability that a message gets judged (0-10000 basis points)
     * @param minimumMessageLength Minimum character length for messages
     * @param maximumMessageLength Maximum character length for messages
     */
    event AIParametersUpdated(
        address indexed admin,
        uint256 judgmentProbability,
        uint256 minimumMessageLength,
        uint256 maximumMessageLength
    );

    // ============ CORE FUNCTIONS ============
    
    /**
     * @dev Send a message to the AI chatbot
     * @param content Message text content
     * @notice Requires prior approval of message fee in $CBT tokens
     * @notice Fee is burned immediately, potential rewards come from AI judgment
     */
    function sendMessage(string calldata content) external;
    
    /**
     * @dev Process AI judgment for a specific message
     * @param messageId ID of the message to judge
     * @param judgment AI judgment result (NONE, LIKED, DISLIKED)
     * @notice Only callable by authorized AI processor role
     * @notice Triggers token minting/burning and bonding curve notifications
     */
    function processAIResponse(uint256 messageId, AIJudgment judgment) external;

    // ============ VIEW FUNCTIONS ============
    
    /**
     * @dev Get $CBT token balance for a user
     * @param user Address to check balance for
     * @return balance User's current $CBT token balance
     */
    function getUserBalance(address user) external view returns (uint256 balance);
    
    /**
     * @dev Get total number of messages sent
     * @return count Total message count across all users
     */
    function getMessageCount() external view returns (uint256 count);
    
    /**
     * @dev Get total number of messages that received AI judgment
     * @return count Number of messages judged (liked or disliked)
     */
    function getJudgedMessageCount() external view returns (uint256 count);
    
    /**
     * @dev Get message details by ID
     * @param messageId Message identifier
     * @return message Complete message data structure
     */
    function getMessage(uint256 messageId) external view returns (Message memory message);
    
    /**
     * @dev Get messages by author with pagination
     * @param author Address of message author
     * @param offset Starting index for pagination
     * @param limit Maximum number of messages to return
     * @return messages Array of message IDs authored by the address
     * @return totalCount Total number of messages by this author
     */
    function getMessagesByAuthor(
        address author, 
        uint256 offset, 
        uint256 limit
    ) external view returns (uint256[] memory messages, uint256 totalCount);
    
    /**
     * @dev Get recent messages with pagination
     * @param offset Starting index (0 = most recent)
     * @param limit Maximum number of messages to return
     * @return messages Array of message IDs in reverse chronological order
     */
    function getRecentMessages(
        uint256 offset, 
        uint256 limit
    ) external view returns (uint256[] memory messages);

    // ============ STATISTICS FUNCTIONS ============
    
    /**
     * @dev Get comprehensive chatbot statistics
     * @return stats Array containing:
     *   [0] Total messages sent
     *   [1] Total messages judged
     *   [2] Total likes received
     *   [3] Total dislikes received
     *   [4] Total fees collected (burned)
     *   [5] Total rewards distributed
     *   [6] Total penalties applied
     *   [7] Current judgment probability (basis points)
     */
    function getChatbotStatistics() external view returns (uint256[8] memory stats);
    
    /**
     * @dev Get user-specific statistics
     * @param user Address to get statistics for
     * @return userStats Array containing:
     *   [0] Messages sent by user
     *   [1] Likes received by user
     *   [2] Dislikes received by user
     *   [3] Total fees paid by user
     *   [4] Total rewards earned by user
     *   [5] Net token change for user (rewards - fees - penalties)
     */
    function getUserStatistics(address user) external view returns (uint256[6] memory userStats);
    
    /**
     * @dev Get current tokenomics parameters
     * @return parameters Array containing:
     *   [0] Message fee amount (in $CBT)
     *   [1] Like reward amount (in $CBT) 
     *   [2] Dislike penalty amount (in $CBT)
     *   [3] Judgment probability (basis points, 0-10000)
     */
    function getTokenomicsParameters() external view returns (uint256[4] memory parameters);

    // ============ ADMIN FUNCTIONS ============
    
    /**
     * @dev Update tokenomics parameters
     * @param messageFee New fee amount for sending messages
     * @param likeReward New reward amount for liked messages
     * @param dislikePenalty New penalty amount for disliked messages
     * @notice Only callable by admin role
     */
    function updateTokenomics(
        uint256 messageFee,
        uint256 likeReward, 
        uint256 dislikePenalty
    ) external;
    
    /**
     * @dev Update AI judgment parameters
     * @param judgmentProbability Probability that messages get judged (0-10000 basis points)
     * @param minLength Minimum message length in characters
     * @param maxLength Maximum message length in characters
     * @notice Only callable by admin role
     */
    function updateAIParameters(
        uint256 judgmentProbability,
        uint256 minLength,
        uint256 maxLength
    ) external;

    // ============ EMERGENCY FUNCTIONS ============
    
    /**
     * @dev Emergency pause message submissions
     * @notice Only callable by admin role
     */
    function pause() external;
    
    /**
     * @dev Unpause message submissions
     * @notice Only callable by admin role
     */
    function unpause() external;
    
    /**
     * @dev Check if contract is paused
     * @return paused True if contract is paused
     */
    function paused() external view returns (bool paused);
}