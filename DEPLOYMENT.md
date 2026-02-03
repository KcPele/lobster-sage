# LobsterSage Deployment Guide

> Deploy your autonomous AI agent to Base Sepolia

## Prerequisites

- Node.js 20+ installed
- GitHub account
- CDP API key from Coinbase
- Base Sepolia ETH (from faucet)

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/kcpele/lobster-sage.git
cd lobster-sage
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Network
BASE_SEPOLIA_RPC=https://sepolia.base.org
BASE_MAINNET_RPC=https://mainnet.base.org

# CDP API (get from https://portal.cdp.coinbase.com)
CDP_API_KEY_NAME=your_key_name
CDP_API_KEY_PRIVATE_KEY=your_private_key

# X/Twitter API (get from https://developer.x.com)
X_API_KEY=your_key
X_API_SECRET=your_secret
X_ACCESS_TOKEN=your_token
X_ACCESS_TOKEN_SECRET=your_token_secret

# Farcaster/Neynar (get from https://neynar.com)
NEYNAR_API_KEY=your_key
FARCASTER_SIGNER_UUID=your_signer
FARCASTER_FID=your_fid

# Wallet (will be created if not exists)
WALLET_ADDRESS=
WALLET_PRIVATE_KEY=
```

### 4. Get Base Sepolia ETH

Get test ETH from these faucets:
- https://www.coinbase.com/faucets/base-sepolia-faucet
- https://alchemy.com/faucets/base-sepolia

Send at least 0.1 ETH to your deployer wallet.

## Deploy Contracts

### 1. Compile Contracts

```bash
pnpm hardhat compile
```

### 2. Deploy to Sepolia

```bash
pnpm hardhat run scripts/deploy-sepolia.ts --network baseSepolia
```

This will:
- Deploy ProphecyNFT contract
- Deploy Reputation contract
- Save addresses to `deployments/sepolia.json`

### 3. Verify Contracts

```bash
pnpm hardhat run scripts/verify-sepolia.ts --network baseSepolia
```

## Configure Agent

### 1. Update Config

Edit `config/sage.json`:

```json
{
  "network": "base-sepolia",
  "contracts": {
    "prophecyNFT": "0xYOUR_PROPHECY_NFT_ADDRESS",
    "reputation": "0xYOUR_REPUTATION_ADDRESS"
  },
  "wallet": {
    "type": "cdp"
  },
  "sage": {
    "mode": "autonomous",
    "predictionInterval": 21600000,
    "yieldRebalanceInterval": 3600000,
    "minConfidence": 65
  }
}
```

### 2. Set Up Social Accounts

**X/Twitter:**
- Create developer account at https://developer.x.com
- Create app with Read/Write permissions
- Generate API keys

**Farcaster:**
- Create account at https://warpcast.com
- Get API key from https://neynar.com
- Create signer UUID

## Run Agent

### Test Mode

```bash
pnpm start:test
```

Runs with mocked external APIs, safe for testing.

### Autonomous Mode (Sepolia)

```bash
pnpm start:autonomous
```

Agent will:
- Generate predictions every 6 hours
- Optimize yields every hour
- Post to social daily
- Trade based on predictions

### Interactive Mode

```bash
pnpm start:interactive
```

Manual control via command line.

## Monitor

### View Logs

```bash
pnpm logs
```

### Check Status

```bash
pnpm status
```

### Emergency Stop

```bash
pnpm emergency:stop
```

## Deploy to Mainnet

**⚠️ Only after thorough Sepolia testing**

### 1. Get Mainnet ETH

Purchase ETH on Base mainnet.

### 2. Update Config

```json
{
  "network": "base-mainnet",
  "rpcUrl": "https://mainnet.base.org"
}
```

### 3. Deploy

```bash
pnpm hardhat run scripts/deploy-mainnet.ts --network baseMainnet
```

### 4. Start

```bash
pnpm start:autonomous
```

## Troubleshooting

### Insufficient Funds

Get more ETH from faucet or reduce prediction stakes.

### Rate Limited

Increase intervals in config or upgrade API tiers.

### Contract Errors

Verify contracts are deployed correctly and addresses match config.

### Social Posting Fails

Check API keys and rate limits.

## Support

- GitHub Issues: https://github.com/kcpele/lobster-sage/issues
- Base Docs: https://docs.base.org
- CDP Docs: https://docs.cdp.coinbase.com

## Security

- Never commit `.env` file
- Use separate API keys for dev/prod
- Monitor wallet balance
- Set transaction limits in config

---

**Ready to deploy?** Start with Step 1 above!
