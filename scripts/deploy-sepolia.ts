import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Deploy LobsterSage contracts to Base Sepolia
 */
async function main() {
  console.log('🦞 Deploying LobsterSage to Base Sepolia...\n');

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH\n`);

  const deployments: any = {
    network: 'base-sepolia',
    chainId: 84532,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {}
  };

  // Deploy ProphecyNFT
  console.log('📜 Deploying ProphecyNFT...');
  const ProphecyNFT = await ethers.getContractFactory('ProphecyNFT');
  const prophecyNFT = await ProphecyNFT.deploy(
    'LobsterSage Prophecies',
    'PROPHET',
    deployer.address // Initial owner
  );
  await prophecyNFT.waitForDeployment();
  const prophecyNFTAddress = await prophecyNFT.getAddress();
  deployments.contracts.prophecyNFT = prophecyNFTAddress;
  console.log(`✅ ProphecyNFT deployed: ${prophecyNFTAddress}`);

  // Deploy Reputation
  console.log('\n⭐ Deploying Reputation...');
  const Reputation = await ethers.getContractFactory('Reputation');
  const reputation = await Reputation.deploy(deployer.address);
  await reputation.waitForDeployment();
  const reputationAddress = await reputation.getAddress();
  deployments.contracts.reputation = reputationAddress;
  console.log(`✅ Reputation deployed: ${reputationAddress}`);

  // Set up contract relationships
  console.log('\n🔗 Configuring contracts...');
  
  // Authorize reputation contract to record scores
  await prophecyNFT.setReputationContract(reputationAddress);
  console.log('✅ Set Reputation contract in ProphecyNFT');

  // Save deployments
  const deploymentsDir = path.join(__dirname, '..', 'deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentsPath = path.join(deploymentsDir, 'sepolia.json');
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));

  console.log(`\n💾 Deployments saved to: ${deploymentsPath}`);
  
  console.log('\n═══════════════════════════════════════');
  console.log('🎉 Deployment Complete!');
  console.log('═══════════════════════════════════════');
  console.log('\nContract Addresses:');
  console.log(`  ProphecyNFT: ${prophecyNFTAddress}`);
  console.log(`  Reputation:  ${reputationAddress}`);
  console.log('\nNext steps:');
  console.log('  1. Verify contracts on Basescan');
  console.log('  2. Update .env with contract addresses');
  console.log('  3. Run: pnpm run verify:sepolia');
  console.log('═══════════════════════════════════════\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
