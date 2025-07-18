// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title ChatbotToken (CBT)
 * @dev ERC20 token with controlled minting/burning for AI Chatbot Bonding Curve system
 * @notice Only authorized contracts (bonding curve) can mint/burn tokens
 */
contract ChatbotToken is ERC20, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // Events for tracking token operations
    event TokensMinted(address indexed to, uint256 amount, string reason);
    event TokensBurned(address indexed from, uint256 amount, string reason);

    /**
     * @dev Constructor sets up the token with initial supply and roles
     * @param name Token name
     * @param symbol Token symbol
     * @param initialSupply Initial token supply (scaled by 18 decimals)
     * @param admin Address that will have admin role
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address admin
    ) ERC20(name, symbol) {
        require(admin != address(0), "CBT: Admin address cannot be zero");
        
        // Grant roles to admin
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        
        // Mint initial supply to admin
        if (initialSupply > 0) {
            _mint(admin, initialSupply);
        }
    }

    /**
     * @dev Mint tokens to a specific address
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     * @param reason Human-readable reason for minting (for tracking)
     */
    function mint(
        address to,
        uint256 amount,
        string calldata reason
    ) external onlyRole(MINTER_ROLE) whenNotPaused {
        require(to != address(0), "CBT: Cannot mint to zero address");
        require(amount > 0, "CBT: Amount must be greater than 0");
        
        _mint(to, amount);
        emit TokensMinted(to, amount, reason);
    }

    /**
     * @dev Burn tokens from a specific address
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     * @param reason Human-readable reason for burning (for tracking)
     */
    function burn(
        address from,
        uint256 amount,
        string calldata reason
    ) external onlyRole(BURNER_ROLE) whenNotPaused {
        require(from != address(0), "CBT: Cannot burn from zero address");
        require(amount > 0, "CBT: Amount must be greater than 0");
        require(balanceOf(from) >= amount, "CBT: Insufficient balance to burn");
        
        _burn(from, amount);
        emit TokensBurned(from, amount, reason);
    }

    /**
     * @dev Burn tokens from caller's balance (standard ERC20 burn)
     * @param amount Amount of tokens to burn
     */
    function burnSelf(uint256 amount) external whenNotPaused {
        require(amount > 0, "CBT: Amount must be greater than 0");
        require(balanceOf(msg.sender) >= amount, "CBT: Insufficient balance to burn");
        
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount, "Self-burn");
    }

    /**
     * @dev Pause token transfers (emergency function)
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause token transfers
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Override transfer to respect pause state
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    /**
     * @dev Get current total supply (convenience function)
     * @return Current total supply of tokens
     */
    function getCurrentSupply() external view returns (uint256) {
        return totalSupply();
    }

    /**
     * @dev Check if address has minter role
     * @param account Address to check
     * @return True if address has minter role
     */
    function isMinter(address account) external view returns (bool) {
        return hasRole(MINTER_ROLE, account);
    }

    /**
     * @dev Check if address has burner role
     * @param account Address to check
     * @return True if address has burner role
     */
    function isBurner(address account) external view returns (bool) {
        return hasRole(BURNER_ROLE, account);
    }
}