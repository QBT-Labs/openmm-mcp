export { verifyJWT, fetchPublicKey, clearPublicKeyCache, type JWTClaims } from './jwt-verify.js';
export { initPaymentClient, isPaymentClientEnabled, requestPaymentJWT } from './payment-client.js';
export { requiresPayment, wrapServerWithPayment } from './payment-gate.js';

export const TOOL_PRICING: Record<string, number> = {
  list_exchanges: 0,
  get_ticker: 0.001,
  get_orderbook: 0.001,
  get_trades: 0.001,
  get_ohlcv: 0.001,
  get_balance: 0.001,
  list_orders: 0.001,
  get_cardano_price: 0.001,
  discover_pools: 0.001,
  get_strategy_status: 0.001,
  create_order: 0.01,
  cancel_order: 0.01,
  cancel_all_orders: 0.01,
  start_grid_strategy: 0.01,
  stop_strategy: 0.01,
};

export function isX402Enabled(): boolean {
  return !!process.env.X402_EVM_ADDRESS;
}
