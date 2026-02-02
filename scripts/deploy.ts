const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const network = hre.network.name;
  console.log(`\n🦞 LobsterSage Contract Deployment`);
  console.log(`====================================`);
  console.log(`Network: ${network}\n`);

  const [deployer] = await hre.viem.getWalletClients();
  const deployerAddress = deployer.account.address;
  
  console.log(`Deployer: ${deployerAddress}`);

  // Deploy Reputation contract first (no dependencies)
  console.log('\n📜 Deploying Reputation contract...');
  const Reputation = await hre.viem.deployContract('Reputation', [deployerAddress]);
  console.log(`✅ Reputation deployed: ${Reputation.address}`);

  // Deploy ProphecyNFT contract
  console.log('\n📜 Deploying ProphecyNFT contract...');
  const ProphecyNFT = await hre.viem.deployContract('ProphecyNFT', [deployerAddress]);
  console.log(`✅ ProphecyNFT deployed: ${ProphecyNFT.address}`);

  // Link contracts
  console.log('\n🔗 Linking contracts...');
  await ProphecyNFT.write.setReputationContract([Reputation.address]);
  console.log('✅ ProphecyNFT linked to Reputation');

  // Authorize ProphecyNFT to update reputation
  await Reputation.write.authorizeRecorder([ProphecyNFT.address]);
  console.log('✅ ProphecyNFT authorized as reputation recorder');

  // Deploy mock tokens if on Sepolia
  let mockUSDC, mockWETH;
  if (network === 'baseSepolia') {
    console.log('\n🧪 Deploying mock tokens for testing...');
    
    mockUSDC = await hre.viem.deployContract('MockUSDC', [deployerAddress]);
    console.log(`✅ MockUSDC deployed: ${mockUSDC.address}`);
    
    mockWETH = await hre.viem.deployContract('MockWETH', [deployerAddress]);
    console.log(`✅ MockWETH deployed: ${mockWETH.address}`);
  }

  // Save deployment info
  const deploymentInfo = {
    network,
    chainId: network === 'baseSepolia' ? 84532 : 8453,
    deployedAt: new Date().toISOString(),
    deployer: deployerAddress,
    contracts: {
      Reputation: {
        address: Reputation.address,
        abi: 'Reputation',
      },
      ProphecyNFT: {
        address: ProphecyNFT.address,
        abi: 'ProphecyNFT',
      },
      ...(network === 'baseSepolia' && {
        MockUSDC: {
          address: mockUSDC!.address,
          abi: 'MockUSDC',
        },
        MockWETH: {
          address: mockWETH!.address,
          abi: 'MockWETH',
        },
      }),
    },
  };

  // Create deployments directory
  const deploymentsDir = path.join(__dirname, '..', 'deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  // Save to file
  const deploymentFile = path.join(deploymentsDir, `${network}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n💾 Deployment info saved to: ${deploymentFile}`);

  // Print summary
  console.log('\n📋 Deployment Summary');
  console.log('=====================');
  console.log(`Reputation:    ${Reputation.address}`);
  console.log(`ProphecyNFT:   ${ProphecyNFT.address}`);
  if (network === 'baseSepolia') {
    console.log(`MockUSDC:      ${mockUSDC!.address}`);
    console.log(`MockWETH:      ${mockWETH!.address}`);
  }

  // Print verification command
  console.log('\n🔍 Verification Commands:');
  console.log('-------------------------');
  console.log(`npx hardhat verify --network ${network} ${Reputation.address} ${deployerAddress}`);
  console.log(`npx hardhat verify --network ${network} ${ProphecyNFT.address} ${deployerAddress}`);

  // Update .env.example with deployed addresses
  console.log('\n📝 Update your .env file with:');
  console.log('------------------------------');
  console.log(`REPUTATION_CONTRACT=${Reputation.address}`);
  console.log(`PROPHECY_NFT_CONTRACT=${ProphecyNFT.address}`);
  if (network === 'baseSepolia') {
    console.log(`USDC_CONTRACT=${mockUSDC!.address}`);
    console.log(`WETH_CONTRACT=${mockWETH!.address}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Deployment failed:', error);
    process.exit(1);
  });
