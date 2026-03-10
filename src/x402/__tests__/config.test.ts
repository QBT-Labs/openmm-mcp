import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  getToolPricing,
  isX402Enabled,
  getActiveNetworks,
  buildPaymentRequirements,
  PRICING_TIERS,
  USDC_CONTRACTS,
} from '../config.js';

describe('x402 Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getToolPricing', () => {
    it('returns correct pricing for read tier tools', () => {
      const pricing = getToolPricing('get_ticker');
      expect(pricing.tier).toBe('read');
      expect(pricing.price).toBe(PRICING_TIERS.read);
    });

    it('returns correct pricing for analysis tier tools', () => {
      const pricing = getToolPricing('cardano_price');
      expect(pricing.tier).toBe('analysis');
      expect(pricing.price).toBe(PRICING_TIERS.analysis);
    });

    it('returns correct pricing for write tier tools', () => {
      const pricing = getToolPricing('place_order');
      expect(pricing.tier).toBe('write');
      expect(pricing.price).toBe(PRICING_TIERS.write);
    });

    it('returns free tier for unknown tools', () => {
      const pricing = getToolPricing('unknown_tool');
      expect(pricing.tier).toBe('free');
      expect(pricing.price).toBe(0);
    });
  });

  describe('isX402Enabled', () => {
    it('returns false when no addresses configured', () => {
      delete process.env.X402_EVM_ADDRESS;
      delete process.env.X402_SOLANA_ADDRESS;
      expect(isX402Enabled()).toBe(false);
    });

    it('returns true when EVM address configured', () => {
      process.env.X402_EVM_ADDRESS = '0x1234567890123456789012345678901234567890';
      expect(isX402Enabled()).toBe(true);
    });

    it('returns true when Solana address configured', () => {
      process.env.X402_SOLANA_ADDRESS = 'SoLAddressHere123456789012345678901234567890';
      expect(isX402Enabled()).toBe(true);
    });
  });

  describe('getActiveNetworks', () => {
    it('returns Base mainnet when EVM address set', () => {
      process.env.X402_EVM_ADDRESS = '0x1234567890123456789012345678901234567890';
      const networks = getActiveNetworks();
      expect(networks).toContain('eip155:8453');
    });

    it('returns Base Sepolia when testnet mode', () => {
      process.env.X402_EVM_ADDRESS = '0x1234567890123456789012345678901234567890';
      process.env.X402_TESTNET = 'true';
      const networks = getActiveNetworks();
      expect(networks).toContain('eip155:84532');
    });

    it('returns Solana mainnet when Solana address set', () => {
      process.env.X402_SOLANA_ADDRESS = 'SoLAddressHere123456789012345678901234567890';
      const networks = getActiveNetworks();
      expect(networks).toContain('solana:mainnet');
    });

    it('returns Solana devnet when testnet mode', () => {
      process.env.X402_SOLANA_ADDRESS = 'SoLAddressHere123456789012345678901234567890';
      process.env.X402_TESTNET = 'true';
      const networks = getActiveNetworks();
      expect(networks).toContain('solana:devnet');
    });
  });

  describe('buildPaymentRequirements', () => {
    beforeEach(() => {
      process.env.X402_EVM_ADDRESS = '0x1234567890123456789012345678901234567890';
    });

    it('builds correct payment requirements for $0.01', () => {
      const requirements = buildPaymentRequirements(0.01);
      expect(requirements.accepts).toHaveLength(1);
      expect(requirements.accepts[0].network).toBe('eip155:8453');
      expect(requirements.accepts[0].amount).toBe('10000'); // $0.01 * 1e6
      expect(requirements.accepts[0].asset).toBe(USDC_CONTRACTS['eip155:8453']);
    });

    it('includes both networks when both addresses set', () => {
      process.env.X402_SOLANA_ADDRESS = 'SoLAddressHere123456789012345678901234567890';
      const requirements = buildPaymentRequirements(0.001);
      expect(requirements.accepts).toHaveLength(2);
      expect(requirements.accepts.map((a) => a.network)).toContain('eip155:8453');
      expect(requirements.accepts.map((a) => a.network)).toContain('solana:mainnet');
    });

    it('correctly converts micro-units', () => {
      const requirements = buildPaymentRequirements(0.005);
      expect(requirements.accepts[0].amount).toBe('5000');
    });
  });
});
