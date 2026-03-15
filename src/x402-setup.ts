/**
 * x402 Setup for OpenMM MCP
 *
 * Configures tool pricing using @qbtlabs/x402 tier system.
 * Payment verification and settlement are handled by the withX402Server middleware.
 */

type PricingTier = 'free' | 'read' | 'analysis' | 'write';

/** Tool-to-tier mapping using @qbtlabs/x402 DEFAULT_TIERS */
export const TOOL_PRICING: Record<string, PricingTier> = {
  // read tier ($0.001)
  get_ticker: 'read',
  get_orderbook: 'read',
  get_trades: 'read',
  get_ohlcv: 'read',
  get_balance: 'read',
  list_orders: 'read',
  get_cardano_price: 'read',
  discover_pools: 'read',
  get_strategy_status: 'read',
  // write tier ($0.01)
  create_order: 'write',
  cancel_order: 'write',
  cancel_all_orders: 'write',
  start_grid_strategy: 'write',
  stop_strategy: 'write',
};

export function isX402Enabled(): boolean {
  return !!process.env.X402_EVM_ADDRESS;
}
