const hre = require('hardhat');

async function main() {
  const network = hre.network.name;
  console.log(`\n🧪 Testing ProphecyNFT on ${network}\n`);

  const [deployer, user1] = await hre.viem.getWalletClients();
  
  // Load deployment info
  const deploymentInfo = require(`../deployments/${network}.json`);
  const prophecyNFTAddress = deploymentInfo.contracts.ProphecyNFT.address;
  const reputationAddress = deploymentInfo.contracts.Reputation.address;

  // Get contract instances
  const ProphecyNFT = await hre.viem.getContractAt('ProphecyNFT', prophecyNFTAddress);
  const Reputation = await hre.viem.getContractAt('Reputation', reputationAddress);

  console.log('Contract addresses:');
  console.log(`  ProphecyNFT: ${prophecyNFTAddress}`);
  console.log(`  Reputation:  ${reputationAddress}`);

  // Test 1: Get initial state
  console.log('\n📊 Initial State:');
  const currentTokenId = await ProphecyNFT.read.getCurrentTokenId();
  console.log(`  Current Token ID: ${currentTokenId}`);
  console.log(`  Mint Fee: ${await ProphecyNFT.read.mintFee()} wei`);
  console.log(`  Min Stake: ${await ProphecyNFT.read.minStake()} wei`);

  // Test 2: Mint a prophecy
  console.log('\n🔮 Minting Prophecy...');
  
  const mintFee = await ProphecyNFT.read.mintFee();
  const minStake = await ProphecyNFT.read.minStake();
  const totalValue = mintFee + minStake;

  const tx = await ProphecyNFT.write.mintProphecy(
    [
      'ETH Price',                  // target
      0,                            // predictionType (0=Price)
      'ETH will reach $4000',       // prediction
      75,                           // confidence
      BigInt(Math.floor(Date.now() / 1000) + 86400), // resolvesAt (1 day)
      'ipfs://QmTest/1',            // uri
    ],
    { value: totalValue }
  );

  console.log(`  Transaction: ${tx}`);
  console.log(`  Minted with ${hre.ethers.formatEther(totalValue)} ETH`);

  // Test 3: Check prophecy details
  const newTokenId = await ProphecyNFT.read.getCurrentTokenId();
  console.log(`\n📜 Prophecy #${Number(newTokenId) - 1} Details:`);
  
  const prophecy = await ProphecyNFT.read.getProphecy([newTokenId - 1n]);
  console.log(`  Prophet:      ${prophecy.prophet}`);
  console.log(`  Target:       ${prophecy.target}`);
  console.log(`  Prediction:   ${prophecy.prediction}`);
  console.log(`  Confidence:   ${prophecy.confidence}%`);
  console.log(`  Stake:        ${hre.ethers.formatEther(prophecy.stakeAmount)} ETH`);
  console.log(`  Resolved:     ${prophecy.resolved}`);

  // Test 4: Check user's prophecies
  const userProphecies = await ProphecyNFT.read.getPropheciesByProphet([deployer.account.address]);
  console.log(`\n👤 User Prophecies: ${userProphecies.length}`);
  console.log(`  Token IDs: ${userProphecies.join(', ')}`);

  // Test 5: Check reputation
  console.log('\n📊 Reputation Data:');
  const rep = await Reputation.read.getReputation([deployer.account.address]);
  console.log(`  Total Score:        ${rep.totalScore}`);
  console.log(`  Predictions Made:   ${rep.predictionsMade}`);
  console.log(`  Correct:            ${rep.predictionsCorrect}`);

  console.log('\n✅ All tests passed!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
