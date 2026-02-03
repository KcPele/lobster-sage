# LobsterSage Agent Lifecycle

> A complete guide to the LobsterSage autonomous prediction agent for the Builder Quest hackathon video.

## What is LobsterSage?

LobsterSage is an **autonomous AI agent** that:
- Makes crypto market predictions
- Mints those predictions as NFTs on Base
- Stakes ETH on its predictions (skin in the game!)
- Builds reputation based on accuracy
- Posts transparently to Farcaster

**Key differentiator:** Unlike other agents, LobsterSage **proves its predictions onchain** by minting NFTs and staking real ETH.

---

## The Complete Prediction Cycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LOBSTERSAGE PREDICTION CYCLE                          │
│                                                                              │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│   │ ANALYZE │───▶│ PREDICT │───▶│  MINT   │───▶│  WAIT   │───▶│ RESOLVE │  │
│   │ MARKET  │    │         │    │   NFT   │    │         │    │         │  │
│   └─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘  │
│                                                                              │
│   Scan Base      Generate       Mint Prophecy   Prediction     Check if     │
│   ecosystem      prediction     NFT + stake     timeframe      prediction   │
│   for trends     with AI        0.011 ETH       (e.g. 7 days)  was correct  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Market Analysis

**What happens:**
- Agent scans Base ecosystem for trends
- Analyzes social sentiment (Farcaster, Twitter)
- Tracks onchain metrics (whale movements, TVL changes)
- Monitors token prices and volume

**Data sources:**
- CoinGecko API (prices)
- Onchain analytics (transactions, addresses)
- Social sentiment analysis

**Output:** Market data object with sentiment scores, trending topics, and metrics.

---

## Step 2: Generate Prediction

**What happens:**
- AI engine processes market data
- Generates prediction with confidence score
- Only proceeds if confidence > 65%

**Prediction includes:**
| Field | Example |
|-------|---------|
| Market | ETH |
| Direction | Bullish / Bearish |
| Target Price | $2,800 |
| Confidence | 73% |
| Timeframe | 7 days |
| Reasoning | "Whale accumulation detected, positive sentiment" |

**Code:**
```typescript
const prediction = {
  market: "ETH",
  direction: "bullish",
  confidence: 73,
  targetPrice: 2800,
  timeframe: "7d",
  reasoning: "Whale accumulation + positive social sentiment"
};
```

---

## Step 3: Mint Prophecy NFT (REAL ONCHAIN TX!)

**What happens:**
1. Agent calls `ProphecyNFT.mintProphecy()` on Base
2. Pays mint fee (0.001 ETH) + stake (0.01 ETH) = **0.011 ETH total**
3. NFT is minted to agent's wallet
4. Prediction data stored onchain

**Smart Contract Call:**
```solidity
function mintProphecy(
    string target,      // "ETH"
    uint256 type,       // 0 = Price prediction
    string prediction,  // "BULLISH: ETH → $2800"
    uint256 confidence, // 73
    uint256 resolvesAt, // timestamp + 7 days
    string uri          // metadata URI
) external payable returns (uint256 tokenId)
```

**Transaction on Basescan:**
- Real ETH is spent
- NFT appears in wallet
- Prediction is immutable onchain

**Example TX:** https://sepolia.basescan.org/tx/0x64ef8b4705448bee6e15de46967861d0bf67aa3825148d132e6bb40bf0cff856

---

## Step 4: Post to Farcaster

**What happens:**
- Agent posts prediction to Farcaster
- Includes transaction link for transparency
- Community can follow and verify

**Example Post:**
```
🔮 New Prophecy from LobsterSage!

BULLISH: ETH → $2,800
Confidence: 73%
Timeframe: 7 days

🔗 TX: https://sepolia.basescan.org/tx/0x64ef...

Built on @base with @coinbase AgentKit 🦞
```

---

## Step 5: Wait for Resolution

**What happens:**
- Prediction has a `resolvesAt` timestamp
- Agent (or anyone) can check if timeframe has passed
- During this time, the stake is locked in the contract

**Status:** ACTIVE

---

## Step 6: Resolve Prediction

**What happens when timeframe ends:**

The agent automatically resolves predictions via the `/resolve` API endpoint.

### API Call:
```bash
curl -X POST https://lobster.up.railway.app/resolve \
  -H "Content-Type: application/json" \
  -d '{"tokenId": 0, "wasCorrect": true, "accuracyScore": 7500}'
```

### If Prediction is CORRECT:
1. Agent calls `resolveProphecy()` with `successful = true`
2. Agent gets stake back (0.01 ETH) + reward (10-20% bonus)
3. Reputation score INCREASES
4. NFT marked as "Successful Prophecy"
5. Agent posts celebration to Farcaster!

### If Prediction is WRONG:
1. Agent calls `resolveProphecy()` with `successful = false`
2. Stake is forfeited (stays in contract treasury)
3. Reputation score DECREASES
4. Agent can "burn" NFT to recover partial reputation

**Smart Contract:**
```solidity
function resolveProphecy(
    uint256 tokenId,
    bool successful,
    uint256 accuracyScore  // 0-10000 for precision
) external onlyResolver
```

**Transaction Example:**
```
Resolving prophecy #0...
Was correct: true
Accuracy score: 75%
✅ Prophecy resolved! TX: 0x1234...
🎉 Prediction was CORRECT! Stake + reward returned.
```

---

## The Reputation System

**Reputation is built from:**

| Component | Weight | Description |
|-----------|--------|-------------|
| Accuracy | 40% | Correct predictions / Total predictions |
| Volume | 25% | Total ETH staked on predictions |
| Consistency | 20% | Daily activity streak |
| Yield | 15% | Profits from DeFi activities |

**Score Range:** 0 - 10,000 points

**Benefits of High Reputation:**
- Higher NFT values
- More community trust
- Potential future features (governance, etc.)

---

## Smart Contracts on Base Sepolia

| Contract | Address | Purpose |
|----------|---------|---------|
| ProphecyNFT | `0xa358df3fea45be4f23825b8074e156c55a1cfda2` | Mint prediction NFTs |
| Reputation | `0x17ccdc2dfa3f8297048d16ef069cb3c77030bb32` | Track agent reputation |

---

## Agent Wallet

| Type | Address | Balance |
|------|---------|---------|
| CDP Wallet | `0xD7476C17Cfd60f67bdB15B235EeD963DaFAB9353` | ~0.1 ETH |

**Using Coinbase Developer Platform (CDP)** for:
- Secure key management
- Transaction signing
- Native Base integration

---

## API Endpoints

**Live Server:** https://lobster.up.railway.app

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/status` | GET | Wallet address, balance, network |
| `/predict-and-mint` | POST | Make prediction + mint NFT (0.011 ETH) |
| `/resolve` | POST | Resolve a prediction (correct/incorrect) |
| `/prophecies/pending` | GET | Get predictions ready to resolve |
| `/portfolio` | GET | Holdings and active predictions |
| `/reputation` | GET | Reputation score breakdown |
| `/analysis` | GET | Current market analysis |
| `/farcaster/post` | POST | Post message to Farcaster |

---

## Demo Flow for Video

### Scene 1: Introduction (30 sec)
- Show LobsterSage logo
- "Autonomous AI agent that predicts and stakes on Base"
- Show the architecture diagram

### Scene 2: Make a Prediction (1 min)
```bash
curl -X POST https://lobster.up.railway.app/predict-and-mint \
  -H "Content-Type: application/json" \
  -d '{"market": "ETH"}'
```
- Show the API response
- Highlight the transaction hash

### Scene 3: Verify on Basescan (30 sec)
- Open Basescan link
- Show the real transaction
- Point out the ETH spent (0.011)
- Show the NFT minted

### Scene 4: Farcaster Post (30 sec)
- Show the prediction posted to Farcaster
- Point out transparency (TX link included)
- Show community can verify

### Scene 5: OpenClaw Integration (1 min)
- Show Telegram/Discord triggering predictions
- "Users can ask the agent to predict"
- "Or it runs autonomously via cron"

### Scene 6: Reputation & Resolution (30 sec)
- Explain reputation system
- "Correct predictions = higher reputation"
- "Wrong predictions = stake forfeited"
- "Skin in the game!"

### Scene 7: Closing (30 sec)
- Recap unique features:
  - Real onchain transactions
  - NFT prophecies
  - Reputation system
  - Coinbase CDP integration
  - OpenClaw orchestration
- "LobsterSage - Predictions with proof 🦞"

---

## Why LobsterSage Wins Builder Quest

| Criteria | How We Deliver |
|----------|----------------|
| **Onchain Primitives** | NFT minting, staking, reputation scoring - all onchain |
| **Novelty** | First prediction agent with skin-in-the-game staking |
| **No Human Loop** | Fully autonomous via OpenClaw scheduling |
| **Live on X/Farcaster** | Posts predictions with TX proof |
| **Base Native** | Built with Coinbase CDP AgentKit |

---

## Technical Stack

- **Runtime:** Node.js + TypeScript
- **Blockchain:** Base Sepolia (testnet) / Base Mainnet (production)
- **Wallet:** Coinbase Developer Platform (CDP) AgentKit
- **Contracts:** Solidity (ERC-721 + custom)
- **API:** Express.js on Railway
- **Orchestration:** OpenClaw
- **Social:** Farcaster (via Neynar API)

---

## Links

- **GitHub:** https://github.com/KcPele/lobster-sage
- **API:** https://lobster.up.railway.app
- **ProphecyNFT Contract:** https://sepolia.basescan.org/address/0xa358df3fea45be4f23825b8074e156c55a1cfda2
- **Reputation Contract:** https://sepolia.basescan.org/address/0x17ccdc2dfa3f8297048d16ef069cb3c77030bb32

---

*Built with 🦞 for the Base Builder Quest*
