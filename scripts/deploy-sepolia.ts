import hre from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';
import { formatEther } from 'viem';

/**
 * Verify a contract on Basescan
 */
async function verifyContract(address: string, constructorArgs: any[], contractName: string) {
  console.log(`\n🔍 Verifying ${contractName}...`);
  try {
    await hre.run('verify:verify', {
      address,
      constructorArguments: constructorArgs,
    });
    console.log(`✅ ${contractName} verified on Basescan!`);
    return true;
  } catch (error: any) {
    if (error.message.includes('Already Verified')) {
      console.log(`✅ ${contractName} already verified`);
      return true;
    }
    console.log(`⚠️  ${contractName} verification failed: ${error.message}`);
    return false;
  }
}

/**
 * Deploy LobsterSage contracts to Base Sepolia
 */
async function main() {
  console.log('🦞 Deploying LobsterSage to Base Sepolia...\n');

  const [deployer] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();
  
  const deployerAddress = deployer.account.address;
  const balance = await publicClient.getBalance({ address: deployerAddress });
  
  console.log(`Deploying with account: ${deployerAddress}`);
  console.log(`Account balance: ${formatEther(balance)} ETH\n`);

  if (balance === 0n) {
    console.log('❌ Error: Account has no ETH. Please fund it first.');
    console.log('   Get Sepolia ETH from: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet');
    process.exit(1);
  }

  const deployments: any = {
    network: 'base-sepolia',
    chainId: 84532,
    deployer: deployerAddress,
    timestamp: new Date().toISOString(),
    contracts: {}
  };

  // Deploy ProphecyNFT
  console.log('📜 Deploying ProphecyNFT...');
  const prophecyNFT = await hre.viem.deployContract('ProphecyNFT', [
    deployerAddress // Initial owner
  ]);
  deployments.contracts.prophecyNFT = prophecyNFT.address;
  console.log(`✅ ProphecyNFT deployed: ${prophecyNFT.address}`);

  // Deploy Reputation
  console.log('\n⭐ Deploying Reputation...');
  const reputation = await hre.viem.deployContract('Reputation', [deployerAddress]);
  deployments.contracts.reputation = reputation.address;
  console.log(`✅ Reputation deployed: ${reputation.address}`);

  // Set up contract relationships
  console.log('\n🔗 Configuring contracts...');
  
  // Authorize reputation contract to record scores
  const hash = await prophecyNFT.write.setReputationContract([reputation.address]);
  console.log(`✅ Set Reputation contract in ProphecyNFT (tx: ${hash})`);

  // Save deployments
  const deploymentsDir = path.join(__dirname, '..', 'deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentsPath = path.join(deploymentsDir, 'sepolia.json');
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));

  console.log(`\n💾 Deployments saved to: ${deploymentsPath}`);

  // ============ Verify Contracts ============
  console.log('\n═══════════════════════════════════════');
  console.log('📋 Verifying Contracts on Basescan...');
  console.log('═══════════════════════════════════════');

  // Wait a bit for the contracts to be indexed
  console.log('\n⏳ Waiting 30 seconds for block explorer to index contracts...');
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Verify ProphecyNFT
  const prophecyVerified = await verifyContract(
    prophecyNFT.address,
    [deployerAddress],
    'ProphecyNFT'
  );

  // Verify Reputation
  const reputationVerified = await verifyContract(
    reputation.address,
    [deployerAddress],
    'Reputation'
  );

  // Update deployments with verification status
  deployments.verified = {
    prophecyNFT: prophecyVerified,
    reputation: reputationVerified,
  };
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  
  console.log('\n═══════════════════════════════════════');
  console.log('🎉 Deployment & Verification Complete!');
  console.log('═══════════════════════════════════════');
  console.log('\nContract Addresses:');
  console.log(`  ProphecyNFT: ${prophecyNFT.address} ${prophecyVerified ? '✅ Verified' : '⚠️ Not verified'}`);
  console.log(`  Reputation:  ${reputation.address} ${reputationVerified ? '✅ Verified' : '⚠️ Not verified'}`);
  console.log('\n🔗 View on Basescan:');
  console.log(`  ProphecyNFT: https://sepolia.basescan.org/address/${prophecyNFT.address}`);
  console.log(`  Reputation:  https://sepolia.basescan.org/address/${reputation.address}`);
  console.log('\n📝 Update your .env file with:');
  console.log(`  PROPHECY_NFT_CONTRACT=${prophecyNFT.address}`);
  console.log(`  REPUTATION_CONTRACT=${reputation.address}`);
  console.log('\nNext steps:');
  console.log('  1. Update .env with contract addresses above');
  console.log('  2. Run agent: pnpm run dev');
  console.log('═══════════════════════════════════════\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
