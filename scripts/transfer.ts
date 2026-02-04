#!/usr/bin/env npx tsx
/**
 * Transfer funds from CDP wallet "Lobster" to another address
 */

import { CdpClient } from '@coinbase/cdp-sdk';
import { createPublicClient, http, formatEther, parseEther } from 'viem';
import { baseSepolia } from 'viem/chains';
import 'dotenv/config';

const FROM_ADDRESS = '0xD7476C17Cfd60f67bdB15B235EeD963DaFAB9353';
const TO_ADDRESS = '0xf4030DdD79fc7Fd49b25C976C5021D07568B4F91';
const ACCOUNT_NAME = 'Lobster';

async function main() {
  console.log('💸 CDP Fund Transfer Script');
  console.log('============================');
  console.log(`From: ${FROM_ADDRESS} (account: "${ACCOUNT_NAME}")`);
  console.log(`To:   ${TO_ADDRESS}`);
  console.log('');

  const cdp = new CdpClient({
    apiKeyId: process.env.CDP_API_KEY_ID,
    apiKeySecret: process.env.CDP_API_KEY_SECRET,
    walletSecret: process.env.CDP_WALLET_SECRET,
  });

  // Get the Lobster account
  console.log(`🔍 Getting CDP account "${ACCOUNT_NAME}"...`);
  const account = await cdp.evm.getOrCreateAccount({ name: ACCOUNT_NAME });
  console.log(`   Address: ${account.address}`);

  if (account.address.toLowerCase() !== FROM_ADDRESS.toLowerCase()) {
    console.log('❌ Account address does not match expected!');
    console.log(`   Expected: ${FROM_ADDRESS}`);
    console.log(`   Got: ${account.address}`);
    process.exit(1);
  }

  console.log('   ✅ Address matches!');

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http('https://sepolia.base.org'),
  });

  // Get current balance
  const balance = await publicClient.getBalance({ address: FROM_ADDRESS as `0x${string}` });
  console.log(`💰 Balance: ${formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.log('❌ No funds to transfer');
    process.exit(0);
  }

  // Calculate amount to send (leave some for gas)
  const gasBuffer = parseEther('0.002');
  const amountToSend = balance - gasBuffer;

  if (amountToSend <= 0n) {
    console.log('❌ Balance too low to cover gas');
    process.exit(0);
  }

  console.log(`📤 Sending: ${formatEther(amountToSend)} ETH`);
  console.log('');

  // Get network-scoped account for transfers
  const networkAccount = await account.useNetwork('base-sepolia');
  
  // Send transfer
  console.log('🔄 Sending transaction via CDP...');
  const result = await networkAccount.transfer({
    to: TO_ADDRESS as `0x${string}`,
    amount: amountToSend,
    token: 'eth',
  });

  console.log(`✅ Transaction sent!`);
  console.log(`📜 Hash: ${result.transactionHash}`);
  console.log(`🔗 View: https://sepolia.basescan.org/tx/${result.transactionHash}`);

  // Check new balance
  console.log('⏳ Waiting for confirmation...');
  await new Promise(r => setTimeout(r, 5000));
  
  const newBalance = await publicClient.getBalance({ address: TO_ADDRESS as `0x${string}` });
  console.log(`💰 New balance at destination: ${formatEther(newBalance)} ETH`);
}

main().catch(console.error);
