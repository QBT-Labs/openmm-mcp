/**
 * x402 Facilitator Client
 *
 * Direct HTTP client for Coinbase's x402 facilitator service.
 * Handles verification and settlement of payments.
 */

import type { PaymentPayload } from './verify.js';
import { PAYMENT_ADDRESSES, USDC_CONTRACTS, getToolPricing } from './config.js';

// Facilitator endpoints
const FACILITATOR_BASE_URL = process.env.X402_FACILITATOR_URL || 'https://x402.org';

// Supported networks
const BASE_MAINNET = 'eip155:8453';
const BASE_SEPOLIA = 'eip155:84532';
const SOLANA_MAINNET = 'solana:mainnet';
const SOLANA_DEVNET = 'solana:devnet';

/**
 * Build payment requirements for a tool
 */
export function buildPaymentRequirements(toolName: string): {
  accepts: Array<{
    scheme: string;
    network: string;
    asset: string;
    maxAmountRequired: string;
    resource: string;
    payTo: string;
    description: string;
    extra?: Record<string, unknown>;
  }>;
} {
  const isTestnet = process.env.X402_TESTNET === 'true';
  const evmNetwork = isTestnet ? BASE_SEPOLIA : BASE_MAINNET;
  const solanaNetwork = isTestnet ? SOLANA_DEVNET : SOLANA_MAINNET;

  const pricing = getToolPricing(toolName);
  const amountMicro = Math.ceil(pricing.price * 1_000_000).toString();

  const accepts: Array<{
    scheme: string;
    network: string;
    asset: string;
    maxAmountRequired: string;
    resource: string;
    payTo: string;
    description: string;
    extra?: Record<string, unknown>;
  }> = [];

  // Add EVM option if configured
  if (PAYMENT_ADDRESSES.evm) {
    accepts.push({
      scheme: 'exact',
      network: evmNetwork,
      asset: USDC_CONTRACTS[evmNetwork],
      maxAmountRequired: amountMicro,
      resource: `mcp:tool:${toolName}`,
      payTo: PAYMENT_ADDRESSES.evm,
      description: `Payment for ${toolName}`,
      extra: {
        name: 'USD Coin',
        version: '2',
      },
    });
  }

  // Add Solana option if configured
  if (PAYMENT_ADDRESSES.solana) {
    accepts.push({
      scheme: 'exact',
      network: solanaNetwork,
      asset: USDC_CONTRACTS[solanaNetwork],
      maxAmountRequired: amountMicro,
      resource: `mcp:tool:${toolName}`,
      payTo: PAYMENT_ADDRESSES.solana,
      description: `Payment for ${toolName}`,
    });
  }

  return { accepts };
}

/**
 * Verify payment via the facilitator
 */
export async function verifyWithFacilitator(
  payment: PaymentPayload,
  toolName: string
): Promise<{ valid: boolean; error?: string }> {
  const requirements = buildPaymentRequirements(toolName);

  // Find matching requirement
  const acceptedNetwork = payment.accepted?.network;
  const matchingRequirement = requirements.accepts.find((r) => r.network === acceptedNetwork);

  if (!matchingRequirement) {
    return { valid: false, error: `Unsupported network: ${acceptedNetwork}` };
  }

  try {
    const response = await fetch(`${FACILITATOR_BASE_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        x402Version: payment.x402Version || 2,
        payload: payment.payload,
        paymentRequirements: matchingRequirement,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { valid: false, error: `Facilitator error: ${response.status} ${errorText}` };
    }

    const result = (await response.json()) as {
      isValid?: boolean;
      valid?: boolean;
      invalidReason?: string;
      error?: string;
    };

    // Handle both response formats
    const isValid = result.isValid ?? result.valid ?? false;

    if (!isValid) {
      return { valid: false, error: result.invalidReason || result.error || 'Verification failed' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Facilitator connection error: ${error}` };
  }
}

/**
 * Settle payment via the facilitator
 */
export async function settleWithFacilitator(
  payment: PaymentPayload,
  toolName: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const requirements = buildPaymentRequirements(toolName);

  // Find matching requirement
  const acceptedNetwork = payment.accepted?.network;
  const matchingRequirement = requirements.accepts.find((r) => r.network === acceptedNetwork);

  if (!matchingRequirement) {
    return { success: false, error: `Unsupported network: ${acceptedNetwork}` };
  }

  try {
    const response = await fetch(`${FACILITATOR_BASE_URL}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        x402Version: payment.x402Version || 2,
        payload: payment.payload,
        paymentRequirements: matchingRequirement,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Settlement error: ${response.status} ${errorText}` };
    }

    const result = (await response.json()) as {
      success?: boolean;
      settled?: boolean;
      txHash?: string;
      transactionHash?: string;
      error?: string;
    };

    // Handle both response formats
    const success = result.success ?? result.settled ?? false;
    const txHash = result.txHash ?? result.transactionHash;

    if (!success) {
      return { success: false, error: result.error || 'Settlement failed' };
    }

    return { success: true, txHash };
  } catch (error) {
    return { success: false, error: `Settlement connection error: ${error}` };
  }
}

/**
 * Full payment flow: verify → execute → settle
 */
export async function processPayment(
  payment: PaymentPayload,
  toolName: string,
  executeHandler: () => Promise<unknown>
): Promise<{
  success: boolean;
  result?: unknown;
  txHash?: string;
  error?: string;
}> {
  // 1. Verify
  const verifyResult = await verifyWithFacilitator(payment, toolName);
  if (!verifyResult.valid) {
    return { success: false, error: verifyResult.error };
  }

  // 2. Execute
  let result: unknown;
  try {
    result = await executeHandler();
  } catch (error) {
    return { success: false, error: `Execution error: ${error}` };
  }

  // 3. Settle
  const settleResult = await settleWithFacilitator(payment, toolName);
  if (!settleResult.success) {
    // Log but don't fail - tool already executed
    console.error(`Settlement failed: ${settleResult.error}`);
  }

  return {
    success: true,
    result,
    txHash: settleResult.txHash,
  };
}

/**
 * Check if facilitator is healthy
 */
export async function checkFacilitatorHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${FACILITATOR_BASE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
