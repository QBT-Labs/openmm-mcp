#!/usr/bin/env npx tsx
/**
 * Direct x402 Test - Tests payment flow without MCP transport complexity
 */

import { setupX402, checkPayment, isEnabled } from '../src/x402-setup.js';

async function main() {
  console.log('🧪 x402 Direct Test\n');

  // Initialize x402
  await setupX402();
  console.log(`x402 enabled: ${isEnabled()}\n`);

  // Test 1: Free tool (list_exchanges)
  console.log('Test 1: Free tool (list_exchanges)');
  const freeResult = await checkPayment('list_exchanges', undefined);
  if (freeResult === null) {
    console.log('  ✅ Free tool - no payment needed\n');
  } else {
    console.log('  ❌ Unexpected payment required for free tool\n');
  }

  // Test 2: Read tool without payment (get_ticker)
  console.log('Test 2: Read tool without payment (get_ticker)');
  const readResult = await checkPayment('get_ticker', undefined);
  if (readResult !== null) {
    const parsed = JSON.parse(readResult.content[0].text);
    console.log('  ✅ Payment required!');
    console.log(`  💰 Error: ${parsed.error}`);
    console.log(`  💵 Price: $${parsed.price}`);
    console.log(`  🔗 Networks: ${parsed.accepts?.map((a: any) => a.network).join(', ')}\n`);
  } else {
    console.log('  ⚠️ No payment required (x402 may be disabled)\n');
  }

  // Test 3: Write tool without payment (place_order)
  console.log('Test 3: Write tool without payment (place_order)');
  const writeResult = await checkPayment('place_order', undefined);
  if (writeResult !== null) {
    const parsed = JSON.parse(writeResult.content[0].text);
    console.log('  ✅ Payment required!');
    console.log(`  💰 Error: ${parsed.error}`);
    console.log(`  💵 Price: $${parsed.price}\n`);
  } else {
    console.log('  ⚠️ No payment required (x402 may be disabled)\n');
  }

  console.log('🏁 Tests complete');
}

main().catch(console.error);
