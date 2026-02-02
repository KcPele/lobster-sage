// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDC
 * @notice Mock USDC token for testing on Base Sepolia
 */
contract MockUSDC is ERC20, Ownable {
    uint8 private constant DECIMALS = 6;
    
    constructor(address initialOwner) ERC20("USD Coin", "USDC") Ownable(initialOwner) {
        // Mint 1 million USDC to deployer
        _mint(initialOwner, 1_000_000 * 10**DECIMALS);
    }
    
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }
    
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
    
    function faucet() external {
        // Drip 1000 USDC per call for testing
        _mint(msg.sender, 1000 * 10**DECIMALS);
    }
}

/**
 * @title MockWETH
 * @notice Mock WETH token for testing on Base Sepolia
 */
contract MockWETH is ERC20, Ownable {
    uint8 private constant DECIMALS = 18;
    
    constructor(address initialOwner) ERC20("Wrapped Ether", "WETH") Ownable(initialOwner) {
        _mint(initialOwner, 1000 * 10**DECIMALS);
    }
    
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }
    
    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }
    
    function withdraw(uint256 amount) external {
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        _burn(msg.sender, amount);
        payable(msg.sender).transfer(amount);
    }
    
    function faucet() external {
        _mint(msg.sender, 1 * 10**DECIMALS);
    }
    
    receive() external payable {
        _mint(msg.sender, msg.value);
    }
}
