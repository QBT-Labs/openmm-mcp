#!/usr/bin/env npx tsx
/**
 * x402 Live Integration Test
 *
 * Tests the full payment flow with real (or testnet) funds.
 *
 * Prerequisites:
 * - Node.js 20+
 * - pnpm or npm
 * - A funded wallet on Base (mainnet or Sepolia)
 *
 * Usage:
 *   # Testnet (safe for testing)
 *   X402_EVM_PRIVATE_KEY=0x... X402_TESTNET=true npx tsx scripts/test-x402-live.ts
 *
 *   # Mainnet (real money!)
 *   X402_EVM_PRIVATE_KEY=0x... npx tsx scripts/test-x402-live.ts
 */

import { createServer } from '../src/index.js';

// Dynamically import x402 packages (optional dependencies)
async function loadX402() {
  try {
    const { x402Client, wrapAxiosWithPayment } = await import('@x402/axios');
    const { registerExactEvmScheme } = await import('@x402/evm/exact/client');
    const { privateKeyToAccount } = await import('viem/accounts');
    return { x402Client, wrapAxiosWithPayment, registerExactEvmScheme, privateKeyToAccount };
  } catch {
    console.error('x402 packages not installed. Run: pnpm add @x402/axios @x402/evm viem');
    process.exit(1);
  }
}

async function main() {
  const privateKey = process.env.X402_EVM_PRIVATE_KEY as `0x${string}`;
  const isTestnet = process.env.X402_TESTNET === 'true';

  if (!privateKey) {
    console.error('X402_EVM_PRIVATE_KEY required');
    console.error('Usage: X402_EVM_PRIVATE_KEY=0x... npx tsx scripts/test-x402-live.ts');
    process.exit(1);
  }

  console.log('🧪 x402 Live Integration Test');
  console.log(`📡 Network: ${isTestnet ? 'Base Sepolia (testnet)' : 'Base Mainnet'}`);
  console.log('');

  // Load x402 packages
  const { x402Client, wrapAxiosWithPayment, registerExactEvmScheme, privateKeyToAccount } =
    await loadX402();

  // Create wallet signer
  const signer = privateKeyToAccount(privateKey);
  console.log(`💳 Wallet: ${signer.address}`);

  // Create x402 client
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });

  // Import axios and wrap with payment
  const axios = (await import('axios')).default;
  const api = wrapAxiosWithPayment(
    axios.create({
      baseURL: 'http://localhost:3000',
    }),
    client
  );

  // Start the MCP server in HTTP mode
  console.log('🚀 Starting MCP server...');
  process.env.MCP_TRANSPORT = 'http';
  process.env.PORT = '3000';

  // Set a test receiver address (your own wallet)
  if (!process.env.X402_EVM_ADDRESS) {
    process.env.X402_EVM_ADDRESS = signer.address; // Pay yourself for testing
    console.log(`📨 Payment receiver: ${signer.address} (self)`);
  }

  const server = createServer();

  // Wait for server to start
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('');
  console.log('📋 Running tests...');
  console.log('');

  // Test 1: Health check
  console.log('Test 1: Health check');
  try {
    const health = await axios.get('http://localhost:3000/health');
    console.log(`  ✅ Server healthy: ${JSON.stringify(health.data)}`);
  } catch (error) {
    console.log(`  ❌ Health check failed: ${error}`);
    process.exit(1);
  }

  // Test 2: Call paid tool without payment (should get 402)
  console.log('');
  console.log('Test 2: Call tool without payment (expect 402)');
  try {
    // Note: MCP over HTTP uses a different protocol
    // This is a simplified test - real MCP clients use the SDK
    const response = await axios.post('http://localhost:3000/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'get_ticker',
        arguments: { exchange: 'mexc', symbol: 'BTC/USDT' },
      },
    });

    const result = response.data;
    if (result.result?.content?.[0]?.text?.includes('Payment Required')) {
      console.log('  ✅ Got 402 Payment Required as expected');
      const paymentInfo = JSON.parse(result.result.content[0].text);
      console.log(`  💰 Price: ${paymentInfo.priceFormatted}`);
      console.log(`  🔗 Networks: ${paymentInfo.accepts.map((a: { network: string }) => a.network).join(', ')}`);
    } else {
      console.log(`  ⚠️ Unexpected response: ${JSON.stringify(result)}`);
    }
  } catch (error) {
    console.log(`  ❌ Request failed: ${error}`);
  }

  // Test 3: Call tool with x402 auto-payment
  console.log('');
  console.log('Test 3: Call tool with x402 auto-payment');
  console.log('  ⏳ This will sign and submit a payment...');
  try {
    // Use the x402-wrapped client
    const response = await api.post('/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'get_ticker',
        arguments: { exchange: 'mexc', symbol: 'BTC/USDT' },
      },
    });

    const result = response.data;
    if (result.result?.content?.[0]?.text?.includes('symbol')) {
      console.log('  ✅ Payment successful! Got ticker data:');
      const ticker = JSON.parse(result.result.content[0].text);
      console.log(`  📈 ${ticker.symbol}: $${ticker.last}`);
    } else {
      console.log(`  ⚠️ Response: ${JSON.stringify(result)}`);
    }
  } catch (error) {
    console.log(`  ❌ Payment failed: ${error}`);
    console.log('  ℹ️ Make sure your wallet has USDC on Base');
  }

  console.log('');
  console.log('🏁 Tests complete');
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
