# LobsterSage OpenClaw Integration Guide

This guide explains how to integrate LobsterSage as an OpenClaw skill for the **Builder Quest hackathon**.

## Overview

**OpenClaw is the orchestrator** - it handles:
- User interactions (Telegram, Discord, Farcaster)
- Scheduling via cron jobs
- Social posting
- Decision making

**LobsterSage API just executes** - it handles:
- Making predictions
- Minting NFTs onchain (REAL transactions!)
- **Real DeFi trading** (wrap ETH, supply to Aave V3)
- Querying portfolio/reputation
- Interacting with Base blockchain

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway (ORCHESTRATOR)                        │
│                                                                           │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐             │
│  │ Telegram  │  │  Discord  │  │ Farcaster │  │    X      │             │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘             │
│        └───────────────┴───────────────┴───────────────┘                 │
│                          │                                                │
│                          │ User: "make a prediction"                      │
│                          │ Cron: "every 6 hours"                          │
│                          ▼                                                │
│                  ┌───────────────┐                                        │
│                  │  LobsterSage  │  ← OpenClaw Skill                      │
│                  │    Skill      │    (calls HTTP API)                    │
│                  └───────┬───────┘                                        │
│                          │                                                │
│                          │ curl https://lobster.up.railway.app/...        │
│                          ▼                                                │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │              LobsterSage API (Railway - EXECUTOR)                  │   │
│  │                                                                    │   │
│  │   POST /predict-and-mint     → Mint NFT onchain (0.011 ETH)       │   │
│  │   POST /yields/supply-weth   → Wrap ETH + supply to Aave V3       │   │
│  │   GET  /status               → Wallet balance, address             │   │
│  │   GET  /portfolio            → Holdings, predictions               │   │
│  │   GET  /reputation           → Accuracy score                      │   │
│  │   GET  /yields               → DeFi yield opportunities            │   │
│  └────────────────────────────────┬──────────────────────────────────┘   │
│                                   │                                       │
│                                   ▼                                       │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │                    Base Sepolia Blockchain                         │   │
│  │                                                                    │   │
│  │  ProphecyNFT: 0xa358df3fea45be4f23825b8074e156c55a1cfda2          │   │
│  │  Reputation:  0x17ccdc2dfa3f8297048d16ef069cb3c77030bb32          │   │
│  │  Aave V3:     0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27          │   │
│  │  WETH:        0x4200000000000000000000000000000000000006          │   │
│  │  Agent Wallet: 0xf4030DdD79fc7Fd49b25C976C5021D07568B4F91         │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

## Live Deployment

**LobsterSage API:** https://lobster.up.railway.app

Test it now:
```bash
# Health check
curl https://lobster.up.railway.app/health

# Get status (wallet info)
curl https://lobster.up.railway.app/status

# Make prediction + mint NFT (REAL TX!)
curl -X POST https://lobster.up.railway.app/predict-and-mint \
  -H "Content-Type: application/json" \
  -d '{"market": "ETH"}'

# ===== DeFi TRADING =====

# View yield opportunities (real Aave data)
curl https://lobster.up.railway.app/yields

# Supply WETH to Aave V3 (REAL TXs: wrap + supply)
curl -X POST https://lobster.up.railway.app/yields/supply-weth \
  -H "Content-Type: application/json" \
  -d '{"amount": "0.1"}'

# Auto-enter best yield opportunity
curl -X POST https://lobster.up.railway.app/yields/auto-enter \
  -H "Content-Type: application/json" \
  -d '{"amountEth": "0.1", "minApy": 2}'

# Swap tokens (ETH ↔ WETH ↔ USDC)
curl -X POST https://lobster.up.railway.app/swap \
  -H "Content-Type: application/json" \
  -d '{"tokenIn": "ETH", "tokenOut": "USDC", "amount": "0.1"}'

# Withdraw from Aave
curl -X POST https://lobster.up.railway.app/yields/withdraw \
  -H "Content-Type: application/json" \
  -d '{"token": "WETH", "amount": "all"}'

# ===== TRADING STRATEGY =====
 
# Get trading strategy config
curl https://lobster.up.railway.app/trading/strategy
 
# Configure take-profit/stop-loss
curl -X POST https://lobster.up.railway.app/trading/strategy \
  -H "Content-Type: application/json" \
  -d '{"takeProfitPercent": 15, "stopLossPercent": 5, "enabled": true}'
 
# Switch Mode (conservative / aggressive / capitulation-fishing)
curl -X POST https://lobster.up.railway.app/trading/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "capitulation-fishing"}'
 
# Check manual capitulation signals
curl https://lobster.up.railway.app/trading/capitulation-check
 
# Run a complete trading cycle (scans opportunities, checks P&L, executes)
curl -X POST https://lobster.up.railway.app/trading/run-cycle

# Run pure DeFi cycle (No NFTs - Competition Mode)
curl -X POST https://lobster.up.railway.app/trading/pure-cycle
 
# View trading history
curl https://lobster.up.railway.app/trading/history



## Option 1: Skill with HTTP API Server (Recommended)

This approach runs LobsterSage as an HTTP API server that OpenClaw can call via custom tools.

### Step 1: Create the LobsterSage API Server

Create `src/api/server.ts`:

```typescript
import express from 'express';
import { LobsterSage } from '../LobsterSage';

const app = express();
app.use(express.json());

let sage: LobsterSage | null = null;

// Initialize on startup
async function initSage() {
  sage = new LobsterSage();
  await sage.initialize();
  console.log('🦞 LobsterSage API Server ready');
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', initialized: sage !== null });
});

// Get portfolio summary
app.get('/portfolio', async (req, res) => {
  try {
    const summary = await sage?.getPortfolioSummary();
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Make a prediction
app.post('/predict', async (req, res) => {
  try {
    const { market, direction, confidence } = req.body;
    const prediction = await sage?.makePrediction(market);
    res.json(prediction);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get market analysis
app.get('/analysis', async (req, res) => {
  try {
    const analysis = await sage?.getMarketAnalysis();
    res.json(analysis);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get yield opportunities
app.get('/yields', async (req, res) => {
  try {
    const yields = await sage?.getYieldOpportunities();
    res.json(yields);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Optimize yields
app.post('/yields/optimize', async (req, res) => {
  try {
    const result = await sage?.optimizeYields();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get reputation
app.get('/reputation', async (req, res) => {
  try {
    const reputation = await sage?.getReputation();
    res.json(reputation);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.LOBSTER_SAGE_PORT || 3847;
initSage().then(() => {
  app.listen(PORT, () => {
    console.log(`🦞 LobsterSage API running on http://localhost:${PORT}`);
  });
});

export default app;
```

### Step 2: Add API script to package.json

```json
{
  "scripts": {
    "api": "tsx src/api/server.ts",
    "api:watch": "tsx watch src/api/server.ts"
  }
}
```

### Step 3: Create the OpenClaw Skill

Create the skill directory and files on your OpenClaw server:

```bash
mkdir -p ~/.openclaw/workspace/skills/lobster-sage
```

Create `~/.openclaw/workspace/skills/lobster-sage/SKILL.md`:

```markdown
---
name: lobster_sage
description: Autonomous crypto prediction and DeFi yield farming agent for Base blockchain. Makes predictions, mints Prophecy NFTs, optimizes yields, and builds onchain reputation.
version: 1.0.0
author: KcPele
tools:
  - exec
  - web_fetch
---

# LobsterSage - Autonomous Prediction & Yield Agent 🦞

You are LobsterSage, an autonomous AI agent that predicts crypto markets and optimizes DeFi yields on Base blockchain.

## Your Capabilities

1. **Make Predictions**: Analyze markets and make confident predictions
2. **Mint Prophecy NFTs**: Turn predictions into collectible onchain assets
3. **Optimize Yields**: Find and manage the best DeFi opportunities
4. **Track Reputation**: Build credibility through accurate predictions

## How to Use LobsterSage

The LobsterSage API server runs at `https://lobster.up.railway.app`. Use curl commands to interact with it.

### Available Commands

When the user asks about:

**Portfolio/Balance/Status:**
```bash
curl -s https://lobster.up.railway.app/portfolio
```

**Make a Prediction:**
```bash
curl -s -X POST https://lobster.up.railway.app/predict \
  -H "Content-Type: application/json" \
  -d '{"market": "ETH"}'
```

**Market Analysis:**
```bash
curl -s https://lobster.up.railway.app/analysis
```

**Yield Opportunities:**
```bash
curl -s https://lobster.up.railway.app/yields
```

**Optimize Yields:**
```bash
curl -s -X POST https://lobster.up.railway.app/yields/optimize
```

**Reputation Score:**
```bash
curl -s https://lobster.up.railway.app/reputation
```

**Supply WETH to Aave (DeFi Trading):**
```bash
curl -s -X POST https://lobster.up.railway.app/yields/supply-weth \
  -H "Content-Type: application/json" \
  -d '{"amount": "0.1"}'
```

**View Yield Positions:**
```bash
curl -s https://lobster.up.railway.app/yields/positions
```

## Response Formatting

Always format responses in a friendly, engaging way:
- Use 🦞 emoji for LobsterSage branding
- Use 📈📉 for market movements
- Use 💰 for financial info
- Use ⭐ for reputation
- Use 🔮 for predictions

## Example Interactions

User: "What's my portfolio?"
→ Execute: `curl -s https://lobster.up.railway.app/portfolio`
→ Format the JSON response nicely

User: "Make a prediction for ETH"
→ Execute: `curl -s -X POST https://lobster.up.railway.app/predict -H "Content-Type: application/json" -d '{"market": "ETH"}'`
→ Present the prediction with confidence level

User: "Find me good yields"
→ Execute: `curl -s https://lobster.up.railway.app/yields`
→ List opportunities sorted by APY

User: "Deposit 0.1 ETH to Aave"
→ Execute: `curl -s -X POST https://lobster.up.railway.app/yields/supply-weth -H "Content-Type: application/json" -d '{"amount": "0.1"}'`
→ Show the two transaction hashes (wrap + supply)

User: "Show my yield positions"
→ Execute: `curl -s https://lobster.up.railway.app/yields/positions`
→ Display active DeFi positions with APY
```

### Step 4: Configure OpenClaw to Use the Skill

Add to your `~/.openclaw/openclaw.json`:

```json5
{
  // ... existing config ...
  
  skills: {
    enabled: true,
    directory: "~/.openclaw/workspace/skills"
  },
  
  agents: {
    list: [
      {
        id: "main",
        skills: ["lobster_sage"],
        tools: {
          allow: [
            "exec",
            "web_fetch",
            "read",
            "write"
          ]
        }
      }
    ]
  }
}
```

### Step 5: Start Everything

On your server:

```bash
# Terminal 1: Start LobsterSage API
cd /path/to/lobster-sage
pnpm run api

# Terminal 2: Restart OpenClaw Gateway
openclaw gateway --restart
```

---

## Option 2: Skill with Direct exec Tool (Simpler)

This approach uses OpenClaw's `exec` tool to run LobsterSage CLI commands directly.

### Step 1: Create CLI Commands

Add to `src/cli.ts`:

```typescript
#!/usr/bin/env node
import { LobsterSage } from './LobsterSage';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  const sage = new LobsterSage();
  await sage.initialize();

  switch (command) {
    case 'portfolio':
      console.log(JSON.stringify(await sage.getPortfolioSummary(), null, 2));
      break;
    case 'predict':
      const market = args[1] || 'ETH';
      console.log(JSON.stringify(await sage.makePrediction(market), null, 2));
      break;
    case 'analysis':
      console.log(JSON.stringify(await sage.getMarketAnalysis(), null, 2));
      break;
    case 'yields':
      console.log(JSON.stringify(await sage.getYieldOpportunities(), null, 2));
      break;
    case 'reputation':
      console.log(JSON.stringify(await sage.getReputation(), null, 2));
      break;
    default:
      console.log('Usage: lobster-sage <command> [args]');
      console.log('Commands: portfolio, predict, analysis, yields, reputation');
  }
}

main().catch(console.error);
```

### Step 2: Create Simpler SKILL.md

```markdown
---
name: lobster_sage
description: Crypto prediction and DeFi yield agent for Base
---

# LobsterSage 🦞

Use the `exec` tool to run LobsterSage commands:

**Portfolio:** `cd /path/to/lobster-sage && pnpm exec tsx src/cli.ts portfolio`
**Predict:** `cd /path/to/lobster-sage && pnpm exec tsx src/cli.ts predict ETH`
**Analysis:** `cd /path/to/lobster-sage && pnpm exec tsx src/cli.ts analysis`
**Yields:** `cd /path/to/lobster-sage && pnpm exec tsx src/cli.ts yields`
**Reputation:** `cd /path/to/lobster-sage && pnpm exec tsx src/cli.ts reputation`
```

---

## Option 3: OpenClaw Plugin (Advanced)

For deeper integration, create an OpenClaw plugin with TypeScript tools.

### Step 1: Create Plugin Structure

```
~/.openclaw/plugins/lobster-sage/
├── package.json
├── index.ts
└── tools/
    ├── predict.ts
    ├── portfolio.ts
    ├── yields.ts
    └── reputation.ts
```

### Step 2: Plugin Entry Point

`~/.openclaw/plugins/lobster-sage/index.ts`:

```typescript
import { Type } from "@sinclair/typebox";

export default function (api: any) {
  // Portfolio tool
  api.registerTool({
    name: "lobster_portfolio",
    description: "Get LobsterSage portfolio summary including balance, predictions, and yields",
    parameters: Type.Object({}),
    async execute() {
      const response = await fetch('https://lobster.up.railway.app/portfolio');
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  // Predict tool
  api.registerTool({
    name: "lobster_predict",
    description: "Make a market prediction with LobsterSage",
    parameters: Type.Object({
      market: Type.String({ description: "Market to predict (e.g., ETH, BTC)" }),
    }),
    async execute(_id: string, params: { market: string }) {
      const response = await fetch('https://lobster.up.railway.app/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market: params.market }),
      });
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  // Yields tool
  api.registerTool({
    name: "lobster_yields",
    description: "Get current DeFi yield opportunities on Base",
    parameters: Type.Object({}),
    async execute() {
      const response = await fetch('https://lobster.up.railway.app/yields');
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  // Reputation tool
  api.registerTool({
    name: "lobster_reputation",
    description: "Get LobsterSage reputation score and prediction history",
    parameters: Type.Object({}),
    async execute() {
      const response = await fetch('https://lobster.up.railway.app/reputation');
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  // Supply WETH to Aave - DeFi Trading tool
  api.registerTool({
    name: "lobster_supply_weth",
    description: "Supply WETH to Aave V3 for yield farming. Wraps ETH to WETH and deposits to Aave.",
    parameters: Type.Object({
      amount: Type.String({ description: "Amount of ETH to wrap and supply (e.g., '0.1')" }),
    }),
    async execute(_id: string, params: { amount: string }) {
      const response = await fetch('https://lobster.up.railway.app/yields/supply-weth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: params.amount }),
      });
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  // Get yield positions tool
  api.registerTool({
    name: "lobster_positions",
    description: "Get active DeFi yield positions",
    parameters: Type.Object({}),
    async execute() {
      const response = await fetch('https://lobster.up.railway.app/yields/positions');
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });
}
```

### Step 3: Enable Plugin

Add to `~/.openclaw/openclaw.json`:

```json5
{
  plugins: {
    list: [
      {
        id: "lobster-sage",
        path: "~/.openclaw/plugins/lobster-sage",
        enabled: true
      }
    ]
  },
  
  agents: {
    list: [
      {
        id: "main",
        tools: {
          allow: [
            "lobster_portfolio",
            "lobster_predict", 
            "lobster_yields",
            "lobster_reputation",
            "lobster_supply_weth",  // NEW: DeFi trading
            "lobster_positions"     // NEW: View positions
          ]
        }
      }
    ]
  }
}
```

---

## Testing via Telegram

Once everything is set up:

1. **Start LobsterSage API** on your server
2. **Restart OpenClaw Gateway** to load the skill
3. **Send messages via Telegram:**

```
You: What's my crypto portfolio?
Bot: 🦞 LobsterSage Portfolio Summary
     💰 Total Value: $192.05
     📈 Active Predictions: 0
     ⭐ Reputation Score: 847
     🌾 Yield Positions: 2

You: Make a prediction for ETH
Bot: 🔮 LobsterSage Prediction
     Market: ETH
     Direction: BULLISH 📈
     Confidence: 73%
     Target: $2,800 in 7 days
     
     Mint as Prophecy NFT? Reply "mint" to confirm.

You: Find yield opportunities
Bot: 🌾 Best Yields on Base
     1. Aave WETH Supply: 2.1% APY (low risk)
     2. Aave USDC Supply: 4.2% APY (low risk)
     
You: Deposit 0.1 ETH to Aave
Bot: 🏦 Executing DeFi Trade...
     
     ✅ Step 1: Wrapped 0.1 ETH → WETH
     TX: https://sepolia.basescan.org/tx/0xde27...
     
     ✅ Step 2: Supplied WETH to Aave V3
     TX: https://sepolia.basescan.org/tx/0xbbbd...
     
     🎉 Now earning 2.1% APY on 0.1 WETH!

You: Show my positions
Bot: 📊 Active Yield Positions
     1. Aave V3 - WETH Supply
        Amount: 0.1 WETH
        APY: 2.1%
        Earning: ~0.0021 WETH/year
```

---

## For the Builder Quest Competition

### What Makes This Submission Strong

1. **✅ OpenClaw Agent**: Runs as an OpenClaw skill
2. **✅ Transacts on Base**: Smart contracts deployed and verified
3. **✅ Autonomous**: No human in the loop for predictions
4. **✅ Novel Use Case**: Prediction + reputation + yield farming
5. **✅ Live on Telegram**: Test and demo via messaging

### Recommended Demo Flow

1. Show the agent running via Telegram
2. Make a live prediction
3. Show the Prophecy NFT minted on Basescan
4. Display reputation score building over time
5. Show yield optimization in action

### Submission Checklist

- [ ] LobsterSage API running on server
- [ ] OpenClaw skill configured
- [ ] Telegram bot responding
- [ ] Smart contracts verified on Basescan
- [ ] Demo video recorded
- [ ] X/Farcaster profile created for agent
- [ ] Submit profile link in BBQ comments

---

## Quick Setup Commands

```bash
# On your server with OpenClaw

# 1. Clone LobsterSage
git clone <your-repo> lobster-sage
cd lobster-sage
pnpm install
pnpm run build

# 2. Configure environment
cp .env.example .env
# Edit .env with your CDP credentials

# 3. Create skill directory
mkdir -p ~/.openclaw/workspace/skills/lobster-sage

# 4. Copy SKILL.md (create from template above)
nano ~/.openclaw/workspace/skills/lobster-sage/SKILL.md

# 5. Start LobsterSage API (in tmux/screen)
pnpm run api

# 6. Restart OpenClaw
openclaw gateway --restart

# 7. Test via Telegram
# Send: "Hey, what can LobsterSage do?"
```

---

## Troubleshooting

### Skill Not Loading
```bash
openclaw skills list  # Check if skill is recognized
openclaw doctor       # Run diagnostics
```

### API Connection Issues
```bash
curl https://lobster.up.railway.app/health  # Test API directly
```

### Telegram Not Responding
```bash
openclaw channels status  # Check channel connection
openclaw logs tail        # View recent logs
```

---

_Built for Base Builder Quest 🦞_
