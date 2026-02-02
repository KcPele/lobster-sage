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

## Phase 1 Status ✅

- [x] Project structure
- [x] TypeScript + Hardhat setup
- [x] CDP SDK dependencies
- [x] ProphecyNFT contract
- [x] Reputation contract
- [x] Wallet manager
- [x] Deployment scripts
- [x] Configuration system

## Roadmap

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 | Core infrastructure | ✅ Complete |
| 2 | DeFi integration (Aave, Uniswap) | 🚧 Pending |
| 3 | Strategy engine | 📋 Planned |
| 4 | Social integration | 📋 Planned |
| 5 | OpenClaw skill | 📋 Planned |
| 6 | Mainnet launch | 📋 Planned |

## License

MIT — Free as a lobster in the ocean 🦞

---

Built for the Base BBQ Builder Quest
