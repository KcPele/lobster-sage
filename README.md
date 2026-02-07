# 🦞 LobsterSage

> **Autonomous AI-Powered DeFi Trading Agent for Base**

**LobsterSage** is a sophisticated autonomous trading agent that combines on-chain analytics, real-time market sentiment, and automated yield farming to execute profitable DeFi strategies on the Base network. Designed for high-frequency competition environments, the system operates with configurable risk parameters, transparent on-chain execution, and comprehensive performance tracking.

---

## 🎯 Competition Mode

### Pure DeFi Trading (No NFT Minting)
For competition environments, LobsterSage operates in **Pure DeFi Mode**:

- ✅ **Real On-Chain Activity**: Uniswap V3 swaps, Aave V3 supplies/withdrawals
- ✅ **Automated P&L Management**: Take-profit (8%) and stop-loss (3%) triggers
- ✅ **Dynamic Yield Optimization**: Auto-rebalancing across DeFi protocols
- ✅ **No NFT Minting**: Focuses entirely on DeFi transaction execution
- ✅ **Transparent Execution**: All trades visible on-chain for verification

### Key Capabilities

| Feature | Description |
|----------|-------------|
| **Market Analysis** | Real-time sentiment analysis, Fear & Greed Index, whale tracking |
| **Yield Farming** | Aave V3 position management with automated entry/exit |
| **Swap Execution** | Uniswap V3 token swaps with slippage protection |
| **Risk Management** | Configurable take-profit, stop-loss, max position size |
| **Dry-Run Mode** | Analysis-only mode for posting without executing trades |
| **Portfolio Tracking** | Real-time P&L, APY monitoring, position management |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                        │
│                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐               │
│  │ Telegram │    │ Discord  │    │ Farcaster│               │
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

---

## 💼 Smart Contracts

### ProphecyNFT.sol
ERC-721 contract for prediction NFTs:
- Mint predictions as collectible NFTs
- Stake ETH on predictions with on-chain verification
- Earn rewards for accurate predictions
- Burn mechanism for failed predictions

### Reputation.sol
On-chain reputation scoring system with weighted components:
- **40% Accuracy** - Correct prediction rate
- **25% Volume** - Total prediction value staked
- **20% Consistency** - Daily active participation
- **15% Yield** - Profits generated from yield farming
- **Leaderboard** - Immutable ranking of top predictors

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+
- **CDP API Credentials** from [Coinbase Developer Platform](https://cdp.coinbase.com/)
- **Base Sepolia ETH** from [faucet](https://www.coinbase.com/faucets/base-sepolia-faucet)
- **Dune API Key** (optional) from [Dune Analytics](https://dune.com/)

### Installation

```bash
# Clone repository
git clone https://github.com/KcPele/lobster-sage.git
cd lobster-sage

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials
```

### Environment Configuration

```bash
# Required: CDP SDK (Coinbase Developer Platform)
CDP_API_KEY_NAME=your_key_name
CDP_API_KEY_PRIVATE_KEY=your_private_key

# Network Selection
NETWORK_ID=base-sepolia        # or base-mainnet

# Contract Addresses (after deployment)
PROPHECY_NFT_CONTRACT=0x...
REPUTATION_CONTRACT=0x...

# Agent Configuration
AGENT_MODE=autonomous              # manual | autonomous
MIN_CONFIDENCE=65                 # Minimum prediction confidence
PREDICTION_INTERVAL=21600          # 6 hours in seconds
TAKE_PROFIT_PERCENT=8             # Profit exit threshold
STOP_LOSS_PERCENT=3              # Loss cut threshold
```

### Deploy Contracts

```bash
# Deploy to Base Sepolia
pnpm hardhat run scripts/deploy.ts --network baseSepolia

# Deploy to Base Mainnet
pnpm hardhat run scripts/deploy.ts --network base
```

### Build & Run

```bash
# Build TypeScript
pnpm build

# Start development server
pnpm dev

# Run autonomous trading cycle
curl -X POST http://localhost:3847/trading/pure-cycle
```

---

## 📡 API Endpoints

### Trading Endpoints

| Endpoint | Method | Description |
|----------|---------|-------------|
| `/trading/pure-cycle` | POST | Execute full trading cycle (no NFTs) |
| `/trading/dry-run` | POST | Analysis mode - no trades executed |
| `/trading/strategy` | GET/POST | View or update trading parameters |
| `/trading/history` | GET | View trading action history |
| `/yields/auto-enter` | POST | Auto-enter best yield opportunity |
| `/swap` | POST | Execute token swap (Uniswap V3) |
| `/yields/supply-weth` | POST | Wrap ETH → WETH → Supply to Aave |

### Analysis Endpoints

| Endpoint | Description |
|----------|-------------|
| `/analysis` | Full market analysis with trends |
| `/analysis/technical` | RSI, MACD, Moving Averages, Bollinger Bands |
| `/analysis/sentiment` | Fear & Greed Index, social volume |
| `/analysis/onchain` | Gas fees, congestion metrics |
| `/analysis/whales` | Whale activity tracking |
| `/analysis/yields` | Yield opportunities with APY filtering |
| `/analysis/report` | Comprehensive market report (all analyses) |

### Portfolio Endpoints

| Endpoint | Description |
|----------|-------------|
| `/portfolio` | Current portfolio value, positions, P&L |
| `/yields/positions` | Active yield positions with APY |
| `/reputation` | On-chain reputation score |

### Health & Status

| Endpoint | Description |
|----------|-------------|
| `/health` | API health check |
| `/status` | Agent status, wallet address, balance |

---

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run test prophecy
pnpm hardhat run scripts/test-prophecy.ts --network baseSepolia

# Test reputation system
pnpm test src/sage/reputation.test.ts
```

### Test Results

```
Test Files  3 passed (3)
     Tests  50 passed | 3 skipped (53)
  Duration  1.47s
```

All core tests passing. Skipped tests = CDP integration (requires credentials).

---

## 📊 Trading Strategy Configuration

### Default Parameters (Competition Optimized)

```json
{
  "takeProfitPercent": 8,        // Exit at +8% profit
  "stopLossPercent": 3,         // Exit at -3% loss
  "minApyThreshold": 1.5,       // Enter opportunities >1.5% APY
  "rebalanceThreshold": 2,       // Rebalance if +2% APY improvement
  "maxPositionSizeEth": 1,      // Max 1 ETH per position
  "enabled": true               // Autonomous trading active
}
```

### Trading Modes

| Mode | Take-Profit | Stop-Loss | Min APY | Risk Profile |
|------|-------------|------------|----------|--------------|
| Conservative | 8% | 3% | 3% | Low |
| Aggressive | 15% | 8% | 1% | High |
| Capitulation Fishing | 25% | 15% | 0% | Speculative |

---

## 🛠️ Technology Stack & Tools

### Core Framework
- **Node.js 20+** - JavaScript runtime
- **TypeScript** - Type-safe development
- **Hardhat** - Ethereum development framework
- **Vi/viem** - Ethereum TypeScript library

### Smart Contracts
- **Solidity** - Smart contract language
- **OpenZeppelin** - Secure contract standards (ERC-721)
- **Base Chain** - L2 blockchain network
- **Base Sepolia** - Testnet for development

### Wallet & Account Management
- **Coinbase Developer Platform (CDP) SDK** - Wallet management, transaction signing
- **AgentKit** - Coinbase's agent framework integration

### DeFi Protocols
- **Aave V3** - Decentralized lending protocol
  - Token supplies/borrows
  - Yield farming positions
  - Interest-bearing deposits
- **Uniswap V3** - Decentralized exchange
  - Token swaps
  - Liquidity provision
  - SwapRouter02 for trade execution
  - QuoterV2 for price quotes

### Data & Analytics
- **Dune Analytics** - On-chain SQL queries
  - Whale activity tracking
  - Transaction volume analysis
  - Custom SQL query support
  - Free/paid plan compatibility
- **CoinGecko API** - Market data and pricing
  - Real-time token prices
  - 24h price changes
  - Market cap and volume
- **Fear & Greed Index** - Market sentiment aggregation
- **Technical Indicators** - RSI, MACD, Bollinger Bands, Moving Averages

### API & Deployment
- **Express.js** - HTTP API server
- **CORS** - Cross-origin resource sharing
- **Railway** - Cloud deployment platform
  - Auto-deployments from Git
  - Base Sepolia testnet hosting
  - Environment variable management

### Social & Messaging
- **Farcaster** - Decentralized social protocol
- **Neynar API** - Farcaster SDK integration
- **Telegram** - Real-time notifications and updates
- **Discord** - Community engagement (planned)

### Development Tools
- **pnpm** - Fast, disk-space efficient package manager
- **Vitest** - Fast unit testing framework
- **Git** - Version control
- **GitHub** - Code hosting and CI/CD

### Infrastructure & Monitoring
- **Base RPC** - Network access points
  - Sepolia: `https://sepolia.base.org`
  - Mainnet: `https://mainnet.base.org`
- **Basescan** - Base blockchain explorer
  - Transaction verification
  - Contract source verification

---

## 📈 On-Chain Performance

### Recent Transactions (Competition-Ready)

#### Trading Activity
| Type | Description | Transaction |
|-------|-------------|---------------|
| **Wrap ETH → WETH** | 0.01 ETH | [0x2b7246...4c68](https://sepolia.basescan.org/tx/0x2b72465c5d2f2364ce3eaa733c4c7db6f3711152fa9b307773685531a50f4c68) |
| **Supply to Aave V3** | WETH @ 2.1% APY | [0xff6b37...7bad](https://sepolia.basescan.org/tx/0xff6b3785ce69c7bf2d36dd7fde9dbe59a43921c792270a198b7f405e4b6b7bad) |
| **Wrap ETH → WETH** | 0.05 ETH | [0x3d43ad...c4ee2](https://sepolia.basescan.org/tx/0x3d43ad7228e70dd8a8c34f86167da1393696a1f65ba30b03c039a97582fc4ee2) |
| **Supply to Aave V3** | WETH @ 2.1% APY | [0x13916d...5b4](https://sepolia.basescan.org/tx/0x13916d0744193ac84de437a64d5554fbc4b456cf0edf7fbae41d4ab1eb5f85b4) |

#### Portfolio Performance
- **Total Value**: $67.48
- **Active Positions**: 2 (WETH Supply on Aave V3)
- **Average APY**: 2.1%
- **Network**: Base Sepolia

---

## 🗺️ Roadmap

| Phase | Deliverable | Status |
|--------|-------------|--------|
| 1 | Core infrastructure (wallet, contracts, config) | ✅ **COMPLETE** |
| 2 | DeFi integration (Aave, Uniswap) | ✅ **COMPLETE** |
| 3 | Trading strategy engine (P&L, risk management) | ✅ **COMPLETE** |
| 4 | Analytics integration (Dune, CoinGecko, sentiment) | ✅ **COMPLETE** |
| 5 | Social integration (Farcaster, Telegram) | ✅ **COMPLETE** |
| 6 | OpenClaw skill (heartbeat, autonomous mode) | ✅ **COMPLETE** |
| 7 | Mainnet deployment | 📋 **PLANNED** |
| 8 | Advanced strategies (arbitrage, cross-chain) | 📋 **PLANNED** |

---

## 📄 Project Structure

```
lobster-sage/
├── contracts/                 # Solidity smart contracts
│   ├── ProphecyNFT.sol       # Prediction NFT contract
│   └── Reputation.sol         # Reputation scoring contract
├── scripts/                  # Deployment and utility scripts
│   ├── deploy.ts            # Contract deployment
│   └── test-prophecy.ts     # Prophecy testing
├── src/                      # TypeScript source code
│   ├── api/                # REST API endpoints
│   │   └── server.ts       # Express server
│   ├── defi/               # DeFi protocol integrations
│   │   ├── AaveV3.ts       # Aave V3 lending
│   │   └── UniswapV3.ts    # Uniswap V3 swaps
│   ├── data/               # External data providers
│   │   ├── coingecko.ts    # CoinGecko API
│   │   └── dune-client.ts  # Dune Analytics SQL
│   ├── sage/               # Core agent logic
│   │   ├── predictor.ts    # Prediction engine
│   │   └── reputation.ts   # Reputation system
│   ├── social/             # Social media integrations
│   │   ├── farcaster-client.ts
│   │   └── twitter-client.ts
│   ├── utils/              # Utility functions
│   ├── wallet/             # Wallet management
│   │   └── manager.ts     # CDP wallet
│   ├── yield/              # Yield optimization
│   │   ├── optimizer.ts    # Opportunity scanner
│   │   └── tradingStrategy.ts # P&L management
│   └── LobsterSage.ts     # Main orchestrator
├── test/                     # Test suite
├── deployments/              # Deployment addresses
├── config/                  # Configuration files
└── package.json
```

---

## 🏆 Competitive Advantages

1. **Autonomous Execution** - No manual intervention required once configured
2. **Risk-Managed** - Built-in take-profit and stop-loss mechanisms
3. **Transparent** - All transactions on-chain and verifiable via block explorer
4. **Real-Time Analytics** - Live sentiment, whale tracking, and market analysis
5. **Multi-Protocol** - Supports Aave, Uniswap V3 with extensible architecture
6. **Dry-Run Capability** - Test strategies without executing real trades
7. **Reputation System** - On-chain proof of prediction accuracy and consistency

---

## 🔒 Security & Best Practices

- **Secure Randomness** - Uses on-chain randomness for fair distribution
- **Reentrancy Protection** - OpenZeppelin's non-reentrant guards
- **Access Control** - Role-based permissions for contract functions
- **Gas Optimization** - Efficient contract code to minimize transaction costs
- **Slippage Protection** - Minimum output amounts on swaps

---

## 📜 License

MIT License - Free and open source

---

**Built for Base BBQ Builder Quest** 🦞

**Developed by**: Kcpele

**Support**: [GitHub Issues](https://github.com/KcPele/lobster-sage/issues)
