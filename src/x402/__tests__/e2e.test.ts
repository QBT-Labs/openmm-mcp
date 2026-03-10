/**
 * x402 End-to-End Tests
 *
 * These tests require real network access and optionally real funds.
 * Run with: npm run test:e2e
 *
 * Environment variables needed:
 * - X402_EVM_ADDRESS: Your Base wallet address
 * - X402_EVM_PRIVATE_KEY: For client-side payment signing (testing only!)
 * - X402_TESTNET: Set to 'true' for testnet testing
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { buildPaymentRequirements, isX402Enabled, getActiveNetworks } from '../config.js';
import { verifyPayment } from '../verify.js';

// Skip if not in e2e mode
const describeE2E = process.env.TEST_E2E === 'true' ? describe : describe.skip;

describeE2E('x402 E2E Tests', () => {
  beforeAll(() => {
    if (!process.env.X402_EVM_ADDRESS) {
      throw new Error('X402_EVM_ADDRESS required for E2E tests');
    }
  });

  describe('Configuration', () => {
    it('x402 is enabled with configured addresses', () => {
      expect(isX402Enabled()).toBe(true);
    });

    it('active networks match configuration', () => {
      const networks = getActiveNetworks();
      const isTestnet = process.env.X402_TESTNET === 'true';

      if (process.env.X402_EVM_ADDRESS) {
        expect(networks).toContain(isTestnet ? 'eip155:84532' : 'eip155:8453');
      }

      if (process.env.X402_SOLANA_ADDRESS) {
        expect(networks).toContain(isTestnet ? 'solana:devnet' : 'solana:mainnet');
      }
    });
  });

  describe('Payment Requirements', () => {
    it('generates valid USDC payment requirements', () => {
      const requirements = buildPaymentRequirements(0.01);

      expect(requirements.accepts.length).toBeGreaterThan(0);

      for (const accept of requirements.accepts) {
        expect(accept.network).toBeDefined();
        expect(accept.asset).toBeDefined();
        expect(accept.amount).toBe('10000'); // $0.01 in micro-units
        expect(accept.payTo).toBeDefined();
      }
    });
  });

  describe('Payment Verification Flow', () => {
    it('rejects obviously invalid payment', async () => {
      const result = await verifyPayment('invalid-signature', 0.01);
      expect(result.valid).toBe(false);
    });

    // This test would use actual payment signing - for real money testing
    it.skip('accepts valid signed payment', async () => {
      // Would need @x402/evm to create a real signed payment
      // Only run this with test funds!
    });
  });
});

/**
 * Manual E2E Testing Guide
 *
 * For real money testing, follow these steps:
 *
 * 1. Setup testnet wallet:
 *    - Create a new wallet for Base Sepolia
 *    - Get test USDC from a faucet
 *
 * 2. Configure environment:
 *    export X402_EVM_ADDRESS=0x...your_base_sepolia_address
 *    export X402_TESTNET=true
 *    export TEST_E2E=true
 *
 * 3. Run the MCP server:
 *    npm run dev
 *
 * 4. Test with a client:
 *    - Install @coinbase/payments-mcp
 *    - Configure it to point to your MCP server
 *    - Call a paid tool and verify the payment flow
 *
 * 5. For mainnet testing:
 *    - Use a wallet with real USDC on Base
 *    - Set X402_TESTNET=false
 *    - Start with small amounts ($0.01)
 *    - Monitor transactions on basescan.org
 */
