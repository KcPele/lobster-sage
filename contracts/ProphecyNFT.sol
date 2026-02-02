// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ProphecyNFT
 * @notice ERC-721 contract for minting prediction NFTs
 * @dev Each prediction becomes a collectible "Prophecy" NFT
 */
contract ProphecyNFT is ERC721, ERC721Enumerable, ERC721URIStorage, Ownable, ReentrancyGuard, Pausable {
    
    // ============ Structs ============
    
    struct Prophecy {
        address prophet;           // Who made the prediction
        string target;             // What is being predicted (token, event, etc.)
        uint256 predictionType;    // 0=Price, 1=Event, 2=Yield, 3=Other
        string prediction;         // The actual prediction text
        uint256 confidence;        // Confidence score (0-100)
        uint256 stakeAmount;       // Amount staked on prediction
        uint256 createdAt;         // Timestamp
        uint256 resolvesAt;        // When prediction resolves
        bool resolved;             // Has it been resolved
        bool successful;           // Was the prediction correct
        uint256 accuracyScore;     // Calculated accuracy (0-10000 for precision)
    }
    
    // ============ State Variables ============
    
    uint256 private _nextTokenId;
    uint256 public mintFee = 0.001 ether;
    uint256 public minStake = 0.01 ether;
    uint256 public maxStake = 10 ether;
    
    // tokenId => Prophecy
    mapping(uint256 => Prophecy) public prophecies;
    
    // prophet => tokenIds
    mapping(address => uint256[]) public prophetProphecies;
    
    // target => tokenIds (for tracking predictions on same target)
    mapping(string => uint256[]) public targetProphecies;
    
    // Reputation contract address
    address public reputationContract;
    
    // Authorized resolvers (oracle addresses)
    mapping(address => bool) public authorizedResolvers;
    
    // ============ Events ============
    
    event ProphecyMinted(
        uint256 indexed tokenId,
        address indexed prophet,
        string target,
        string prediction,
        uint256 confidence,
        uint256 stakeAmount
    );
    
    event ProphecyResolved(
        uint256 indexed tokenId,
        bool successful,
        uint256 accuracyScore
    );
    
    event StakeClaimed(
        uint256 indexed tokenId,
        address indexed prophet,
        uint256 amount,
        uint256 reward
    );
    
    event MintFeeUpdated(uint256 newFee);
    event MinStakeUpdated(uint256 newMinStake);
    event MaxStakeUpdated(uint256 newMaxStake);
    event ReputationContractSet(address reputationContract);
    event ResolverAuthorized(address resolver);
    event ResolverRevoked(address resolver);
    
    // ============ Modifiers ============
    
    modifier onlyResolver() {
        require(authorizedResolvers[msg.sender] || msg.sender == owner(), "Not authorized resolver");
        _;
    }
    
    // ============ Constructor ============
    
    constructor(address initialOwner) ERC721("Prophecy NFT", "PROPHECY") Ownable(initialOwner) {}
    
    // ============ Core Functions ============
    
    /**
     * @notice Mint a new Prophecy NFT
     * @param target What is being predicted
     * @param predictionType 0=Price, 1=Event, 2=Yield, 3=Other
     * @param prediction The prediction text
     * @param confidence Confidence score (0-100)
     * @param resolvesAt When prediction resolves (timestamp)
     * @param uri Metadata URI
     */
    function mintProphecy(
        string calldata target,
        uint256 predictionType,
        string calldata prediction,
        uint256 confidence,
        uint256 resolvesAt,
        string calldata uri
    ) external payable nonReentrant whenNotPaused returns (uint256) {
        require(msg.value >= mintFee + minStake, "Insufficient payment");
        require(msg.value <= mintFee + maxStake, "Stake exceeds maximum");
        require(confidence <= 100, "Confidence must be 0-100");
        require(resolvesAt > block.timestamp, "Resolution must be in future");
        require(bytes(target).length > 0, "Target cannot be empty");
        require(bytes(prediction).length > 0, "Prediction cannot be empty");
        
        uint256 tokenId = _nextTokenId++;
        uint256 stakeAmount = msg.value - mintFee;
        
        Prophecy memory newProphecy = Prophecy({
            prophet: msg.sender,
            target: target,
            predictionType: predictionType,
            prediction: prediction,
            confidence: confidence,
            stakeAmount: stakeAmount,
            createdAt: block.timestamp,
            resolvesAt: resolvesAt,
            resolved: false,
            successful: false,
            accuracyScore: 0
        });
        
        prophecies[tokenId] = newProphecy;
        prophetProphecies[msg.sender].push(tokenId);
        targetProphecies[target].push(tokenId);
        
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, uri);
        
        emit ProphecyMinted(tokenId, msg.sender, target, prediction, confidence, stakeAmount);
        
        return tokenId;
    }
    
    /**
     * @notice Resolve a prophecy (called by authorized resolver or owner)
     * @param tokenId The prophecy to resolve
     * @param successful Whether the prediction was correct
     * @param accuracyScore Precision score (0-10000)
     */
    function resolveProphecy(
        uint256 tokenId,
        bool successful,
        uint256 accuracyScore
    ) external onlyResolver nonReentrant {
        require(_exists(tokenId), "Prophecy does not exist");
        Prophecy storage prophecy = prophecies[tokenId];
        require(!prophecy.resolved, "Already resolved");
        require(block.timestamp >= prophecy.resolvesAt, "Resolution time not reached");
        require(accuracyScore <= 10000, "Accuracy score must be 0-10000");
        
        prophecy.resolved = true;
        prophecy.successful = successful;
        prophecy.accuracyScore = accuracyScore;
        
        // Calculate reward based on accuracy and confidence
        uint256 reward = _calculateReward(prophecy, accuracyScore);
        
        emit ProphecyResolved(tokenId, successful, accuracyScore);
        
        // Update reputation if contract is set
        if (reputationContract != address(0)) {
            (bool success, ) = reputationContract.call(
                abi.encodeWithSignature(
                    "recordPrediction(address,bool,uint256,uint256)",
                    prophecy.prophet,
                    successful,
                    prophecy.confidence,
                    accuracyScore
                )
            );
            // Don't revert if reputation update fails
            (success); // silence warning
        }
        
        // Transfer stake + reward back to prophet if successful
        // If failed, stake goes to treasury (contract)
        if (successful && reward > 0) {
            uint256 totalReturn = prophecy.stakeAmount + reward;
            (bool sent, ) = payable(prophecy.prophet).call{value: totalReturn}("");
            require(sent, "Failed to send reward");
            
            emit StakeClaimed(tokenId, prophecy.prophet, prophecy.stakeAmount, reward);
        }
    }
    
    /**
     * @notice Burn a failed prophecy to recover partial reputation
     * @param tokenId The prophecy to burn
     */
    function burnFailedProphecy(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        Prophecy storage prophecy = prophecies[tokenId];
        require(prophecy.resolved, "Not yet resolved");
        require(!prophecy.successful, "Cannot burn successful prophecy");
        
        // Give partial reputation recovery
        if (reputationContract != address(0)) {
            (bool success, ) = reputationContract.call(
                abi.encodeWithSignature(
                    "recordBurn(address)",
                    msg.sender
                )
            );
            (success);
        }
        
        _burn(tokenId);
    }
    
    /**
     * @notice Get all prophecies by a prophet
     */
    function getPropheciesByProphet(address prophet) external view returns (uint256[] memory) {
        return prophetProphecies[prophet];
    }
    
    /**
     * @notice Get all prophecies for a target
     */
    function getPropheciesByTarget(string calldata target) external view returns (uint256[] memory) {
        return targetProphecies[target];
    }
    
    /**
     * @notice Get prophecy details
     */
    function getProphecy(uint256 tokenId) external view returns (Prophecy memory) {
        require(_exists(tokenId), "Prophecy does not exist");
        return prophecies[tokenId];
    }
    
    /**
     * @notice Get current token ID counter
     */
    function getCurrentTokenId() external view returns (uint256) {
        return _nextTokenId;
    }
    
    // ============ Admin Functions ============
    
    function setMintFee(uint256 newFee) external onlyOwner {
        mintFee = newFee;
        emit MintFeeUpdated(newFee);
    }
    
    function setMinStake(uint256 newMinStake) external onlyOwner {
        minStake = newMinStake;
        emit MinStakeUpdated(newMinStake);
    }
    
    function setMaxStake(uint256 newMaxStake) external onlyOwner {
        maxStake = newMaxStake;
        emit MaxStakeUpdated(newMaxStake);
    }
    
    function setReputationContract(address _reputationContract) external onlyOwner {
        reputationContract = _reputationContract;
        emit ReputationContractSet(_reputationContract);
    }
    
    function authorizeResolver(address resolver) external onlyOwner {
        authorizedResolvers[resolver] = true;
        emit ResolverAuthorized(resolver);
    }
    
    function revokeResolver(address resolver) external onlyOwner {
        authorizedResolvers[resolver] = false;
        emit ResolverRevoked(resolver);
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool sent, ) = payable(owner()).call{value: balance}("");
        require(sent, "Withdrawal failed");
    }
    
    // ============ Internal Functions ============
    
    function _calculateReward(Prophecy memory prophecy, uint256 accuracyScore) internal pure returns (uint256) {
        if (!prophecy.successful) return 0;
        
        // Base reward: 10% of stake
        uint256 baseReward = prophecy.stakeAmount / 10;
        
        // Confidence bonus: higher confidence = higher risk = higher reward
        // Max 50% bonus for 100% confidence
        uint256 confidenceBonus = (baseReward * prophecy.confidence) / 200;
        
        // Accuracy bonus: more precise predictions get more
        // Max 50% bonus for perfect accuracy
        uint256 accuracyBonus = (baseReward * accuracyScore) / 20000;
        
        return baseReward + confidenceBonus + accuracyBonus;
    }
    
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
    
    // ============ Override Functions ============
    
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }
    
    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }
    
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
    
    receive() external payable {}
}
