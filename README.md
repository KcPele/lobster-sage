# 🦞 LobsterSage

> Autonomous OpenClaw agent for predictions and yield farming on Base

## Overview

LobsterSage is an autonomous AI agent that combines **novel prediction markets** with **practical DeFi yield farming** — all while building an onchain reputation on Base.

### Key Features

- 🔮 **Prediction Engine** - Mint predictions as collectible NFTs (Prophecies)
- 🏦 **Yield Optimizer** - Auto-rebalance across Aave, Uniswap V3
- 📊 **Reputation System** - Onchain scoring for prediction accuracy
- 💰 **Skin in the Game** - Trade based on own predictions
- 🐦 **Social Layer** - X/Farcaster integration for transparency

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       OpenClaw Gateway                       │
│                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐               │
│  │ Telegram │    │ Discord  │    │    X     │               │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘               │
│       └────────────────┼────────────────┘                    │
│                        │                                     │
│               ┌────────▼────────┐                            │
│               │  LobsterSage    │                            │
│               │  (Main Agent)   │                            │
│               └────────┬────────┘                            │
│                        │                                     │
│       ┌────────────────┼────────────────┐                   │
│       ▼                ▼                ▼                   │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                 │
│  │ Predictor│   │  Yield   │   │Reputation│                 │
│  │  Engine  │   │ Optimizer│   │  System  │                 │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘                 │
│       └──────────────┼──────────────┘                        │
│                      │                                       │
│             ┌────────▼────────┐                              │
│             │  Base Chain     │                              │
│             │ (Sepolia/Main)  │                              │
│             └─────────────────┘                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Smart Contracts

### ProphecyNFT.sol
ERC-721 contract for prediction NFTs:
- Mint predictions as collectible NFTs
- Stake ETH on predictions
- Earn rewards for accurate predictions
- Burn failed predictions for reputation recovery

### Reputation.sol
Onchain reputation scoring:
- 40% Accuracy (correct predictions)
- 25% Volume (total prediction value)
- 20% Consistency (daily activity)
- 15% Yield (profits from farming)
- Leaderboard of top predictors

## Quick Start

### Prerequisites

- Node.js 20+
- CDP API credentials from [Coinbase Developer Platform](https://cdp.coinbase.com/)
- Base Sepolia ETH (from [faucet](https://www.coinbase.com/faucets/base-sepolia-faucet))

### Installation

```bash
# Clone and install
cd lobster-sage
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your CDP credentials

# Build
pnpm build
```

### Deploy Contracts (Base Sepolia)

```bash
# Deploy to Base Sepolia
pnpm run deploy:sepolia

# Update .env with deployed addresses
```

### Test Contracts

```bash
# Run test prophecy
pnpm hardhat run scripts/test-prophecy.ts --network baseSepolia
```

### Run Agent

```bash
# Initialize and check wallet
pnpm dev init

# Start autonomous mode (Phase 2+)
pnpm dev start
```

## Project Structure

```
lobster-sage/
├── contracts/           # Solidity contracts
│   ├── ProphecyNFT.sol  # Prediction NFTs
│   ├── Reputation.sol   # Reputation scoring
│   └── MockTokens.sol   # Test tokens
├── scripts/             # Deployment & testing
│   ├── deploy.ts        # Deploy contracts
│   └── test-prophecy.ts # Test script
├── src/                 # TypeScript source
│   ├── wallet/          # CDP wallet manager
│   ├── config/          # Configuration
│   ├── utils/           # Utilities
│   └── index.ts         # Main entry
├── test/                # Test suite
├── deployments/         # Deployment info
└── config/              # Agent config
```

## Environment Variables

```bash
# Required: CDP SDK
CDP_API_KEY_NAME=your_key_name
CDP_API_KEY_PRIVATE_KEY=your_private_key

# Network (base-sepolia or base-mainnet)
NETWORK_ID=base-sepolia

# Contract addresses (fill after deploy)
PROPHECY_NFT_CONTRACT=0x...
REPUTATION_CONTRACT=0x...

# Agent config
AGENT_MODE=manual
PREDICTION_INTERVAL=21600
MIN_CONFIDENCE=65
```

## Phase 1 Status ✅ COMPLETE

- [x] Project structure
- [x] TypeScript + Hardhat setup
- [x] CDP SDK dependencies
- [x] ProphecyNFT contract
- [x] Reputation contract
- [x] Wallet manager
- [x] Deployment scripts
- [x] Configuration system
- [x] Reputation system (50 tests passing)
- [x] Test suite (50+ tests)

## Test Status ✅

```
Test Files  3 passed (3)
     Tests  50 passed | 3 skipped (53)
  Duration  1.47s
```

All core tests passing. 3 skipped = CDP integration (requires credentials).

## Proof of Work (Real Onchain Activity)

### 1. Autonomous Prediction & Minting
- **Market**: OP (Bullish) at $0.20
- **Action**: Minted Prophecy NFT #prophecy_1770439723401_0x6b50a516
- **Transaction**: [0x6b50a516...](https://sepolia.basescan.org/tx/0x6b50a51612d9e54637db3f8a1c80302154e588d08e6e04bb226f80c2bf4d0b0b)
- **Social Proof**: Posted to Farcaster (Hash: 0x33a7...)

### 2. Real DeFi Yield Farming
- **Action**: Supply 0.001 WETH to Aave V3
- **Step 1 (Wrap ETH)**: [0x349ce9f0...](https://sepolia.basescan.org/tx/0x349ce9f09005d6ffa6c6d66224b6ec1207ac517cf752efa56d3e00822ffa2da0)
- **Step 2 (Supply Aave)**: [0x3129cd21...](https://sepolia.basescan.org/tx/0x3129cd213cf046700021c759cafc860e008a03d50f4afdec07c20d6805b44f91)

---

## Roadmap

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 | Core infrastructure | ✅ **COMPLETE** |
| 2 | DeFi integration (Aave, Uniswap) | ✅ **COMPLETE** |
| 3 | Strategy engine | ✅ **COMPLETE** |
| 4 | Social integration (Farcaster) | ✅ **COMPLETE** |
| 5 | OpenClaw skill | ✅ **READY** |
| 6 | Mainnet launch | 📋 Planned |

## License

MIT — Free as a lobster in the ocean 🦞

---

Built for the Base BBQ Builder Quest
