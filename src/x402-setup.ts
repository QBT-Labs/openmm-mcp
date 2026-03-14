/**
 * x402 Setup for OpenMM MCP
 *
 * Uses the official @x402/mcp, @x402/core, and @x402/evm packages
 * to integrate payment-gated tools via the Coinbase x402 protocol.
 */

import { createPaymentWrapper, x402ResourceServer } from '@x402/mcp';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

export type PaymentWrapper = ReturnType<typeof createPaymentWrapper>;

export interface X402Wrappers {
  paidRead: PaymentWrapper;
  paidAnalysis: PaymentWrapper;
  paidWrite: PaymentWrapper;
}

const TOOL_TIERS: Record<string, 'free' | 'read' | 'analysis' | 'write'> = {
  list_exchanges: 'free',
  get_ticker: 'read',
  get_orderbook: 'read',
  get_trades: 'read',
  get_ohlcv: 'read',
  get_balance: 'read',
  list_open_orders: 'read',
  get_cardano_price: 'read',
  discover_pools: 'read',
  get_strategy_status: 'read',
  get_portfolio: 'analysis',
  compare_prices: 'analysis',
  create_order: 'write',
  cancel_order: 'write',
  cancel_all_orders: 'write',
  start_grid_strategy: 'write',
  stop_strategy: 'write',
};

let x402Enabled = false;

export function isX402Enabled(): boolean {
  return x402Enabled;
}

export function getToolTier(toolName: string): 'free' | 'read' | 'analysis' | 'write' {
  return TOOL_TIERS[toolName] ?? 'read';
}

/**
 * Initialize x402 payment protocol using the official SDK.
 * Returns payment wrappers for each tier, or null if x402 is not configured.
 */
export async function setupX402(): Promise<X402Wrappers | null> {
  const evmAddress = process.env.X402_EVM_ADDRESS as `0x${string}` | undefined;
  if (!evmAddress) {
    console.error('[x402] X402_EVM_ADDRESS not set - payment features disabled');
    return null;
  }

  const testnet = process.env.X402_TESTNET === 'true';
  const network = testnet ? 'eip155:84532' : 'eip155:8453';
  const facilitatorUrl = process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitator';

  try {
    const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
    const resourceServer = new x402ResourceServer(facilitatorClient);
    resourceServer.register(network, new ExactEvmScheme());
    await resourceServer.initialize();

    const buildAccepts = async (price: string) =>
      resourceServer.buildPaymentRequirements({
        scheme: 'exact',
        network,
        payTo: evmAddress,
        price,
        extra: { name: 'USDC', version: '2' },
      });

    const [readAccepts, analysisAccepts, writeAccepts] = await Promise.all([
      buildAccepts('$0.001'),
      buildAccepts('$0.005'),
      buildAccepts('$0.01'),
    ]);

    const paidRead = createPaymentWrapper(resourceServer, { accepts: readAccepts });
    const paidAnalysis = createPaymentWrapper(resourceServer, { accepts: analysisAccepts });
    const paidWrite = createPaymentWrapper(resourceServer, { accepts: writeAccepts });

    x402Enabled = true;
    console.error('[x402] Payment protocol enabled');
    console.error(`[x402] EVM: ${evmAddress}`);
    console.error(`[x402] Network: ${network}`);
    console.error(`[x402] Facilitator: ${facilitatorUrl}`);
    console.error(`[x402] Testnet: ${testnet}`);

    return { paidRead, paidAnalysis, paidWrite };
  } catch (err) {
    console.error('[x402] Failed to initialize:', err);
    return null;
  }
}
