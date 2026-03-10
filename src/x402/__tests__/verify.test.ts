import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  parsePaymentSignature,
  verifyEvmPayment,
  verifySolanaPayment,
  verifyPayment,
  PaymentPayload,
} from '../verify.js';

describe('x402 Verification', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.X402_EVM_ADDRESS = '0x1234567890123456789012345678901234567890';
    process.env.X402_SOLANA_ADDRESS = 'SoLAddressHere123456789012345678901234567890';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const validEvmPayload: PaymentPayload = {
    x402Version: 2,
    payload: {
      authorization: {
        from: '0xaaaa',
        to: '0x1234567890123456789012345678901234567890',
        value: '10000', // $0.01
        validAfter: '0',
        validBefore: String(Math.floor(Date.now() / 1000) + 3600),
        nonce: '0x' + '00'.repeat(32),
      },
      signature: '0x' + 'ab'.repeat(65),
    },
    accepted: {
      network: 'eip155:8453',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amount: '10000',
    },
  };

  const validSolanaPayload: PaymentPayload = {
    x402Version: 2,
    payload: {
      authorization: {
        from: 'SenderAddress',
        to: 'SoLAddressHere123456789012345678901234567890',
        value: '10000',
        validAfter: '0',
        validBefore: String(Math.floor(Date.now() / 1000) + 3600),
        nonce: '0x' + '00'.repeat(32),
      },
      signature: 'base58signature',
    },
    accepted: {
      network: 'solana:mainnet',
      asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: '10000',
    },
  };

  describe('parsePaymentSignature', () => {
    it('parses valid base64-encoded payment', () => {
      const encoded = Buffer.from(JSON.stringify(validEvmPayload)).toString('base64');
      const parsed = parsePaymentSignature(encoded);
      expect(parsed).not.toBeNull();
      expect(parsed?.x402Version).toBe(2);
      expect(parsed?.accepted.network).toBe('eip155:8453');
    });

    it('returns null for invalid base64', () => {
      const parsed = parsePaymentSignature('not-valid-base64!!!');
      expect(parsed).toBeNull();
    });

    it('returns null for non-JSON content', () => {
      const encoded = Buffer.from('not json').toString('base64');
      const parsed = parsePaymentSignature(encoded);
      expect(parsed).toBeNull();
    });
  });

  describe('verifyEvmPayment', () => {
    it('accepts valid payment with sufficient amount', async () => {
      const result = await verifyEvmPayment(validEvmPayload, 0.01);
      expect(result.valid).toBe(true);
    });

    it('rejects payment with insufficient amount', async () => {
      const result = await verifyEvmPayment(validEvmPayload, 0.02); // Expecting $0.02 but got $0.01
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient');
    });

    it('rejects payment to wrong recipient', async () => {
      const wrongRecipient = {
        ...validEvmPayload,
        payload: {
          ...validEvmPayload.payload,
          authorization: {
            ...validEvmPayload.payload.authorization,
            to: '0xwrongaddress',
          },
        },
      };
      const result = await verifyEvmPayment(wrongRecipient, 0.01);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('recipient');
    });

    it('rejects expired payment', async () => {
      const expired = {
        ...validEvmPayload,
        payload: {
          ...validEvmPayload.payload,
          authorization: {
            ...validEvmPayload.payload.authorization,
            validBefore: String(Math.floor(Date.now() / 1000) - 3600), // 1 hour ago
          },
        },
      };
      const result = await verifyEvmPayment(expired, 0.01);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('rejects payment not yet valid', async () => {
      const future = {
        ...validEvmPayload,
        payload: {
          ...validEvmPayload.payload,
          authorization: {
            ...validEvmPayload.payload.authorization,
            validAfter: String(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
          },
        },
      };
      const result = await verifyEvmPayment(future, 0.01);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not yet valid');
    });

    it('rejects non-EVM network', async () => {
      const wrongNetwork = {
        ...validEvmPayload,
        accepted: { ...validEvmPayload.accepted, network: 'solana:mainnet' },
      };
      const result = await verifyEvmPayment(wrongNetwork, 0.01);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('EVM');
    });
  });

  describe('verifySolanaPayment', () => {
    it('accepts valid Solana payment', async () => {
      const result = await verifySolanaPayment(validSolanaPayload, 0.01);
      expect(result.valid).toBe(true);
    });

    it('rejects insufficient amount', async () => {
      const result = await verifySolanaPayment(validSolanaPayload, 0.02);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient');
    });

    it('rejects non-Solana network', async () => {
      const wrongNetwork = {
        ...validSolanaPayload,
        accepted: { ...validSolanaPayload.accepted, network: 'eip155:8453' },
      };
      const result = await verifySolanaPayment(wrongNetwork, 0.01);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Solana');
    });
  });

  describe('verifyPayment', () => {
    it('routes EVM payments correctly', async () => {
      const encoded = Buffer.from(JSON.stringify(validEvmPayload)).toString('base64');
      const result = await verifyPayment(encoded, 0.01);
      expect(result.valid).toBe(true);
    });

    it('routes Solana payments correctly', async () => {
      const encoded = Buffer.from(JSON.stringify(validSolanaPayload)).toString('base64');
      const result = await verifyPayment(encoded, 0.01);
      expect(result.valid).toBe(true);
    });

    it('rejects invalid signature format', async () => {
      const result = await verifyPayment('invalid', 0.01);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('format');
    });

    it('rejects unsupported networks', async () => {
      const unsupported = {
        ...validEvmPayload,
        accepted: { ...validEvmPayload.accepted, network: 'bitcoin:mainnet' },
      };
      const encoded = Buffer.from(JSON.stringify(unsupported)).toString('base64');
      const result = await verifyPayment(encoded, 0.01);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported');
    });
  });
});
