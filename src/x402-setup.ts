/**
 * x402 Setup for OpenMM MCP
 *
 * Configures payment protocol using @qbtlabs/x402
 */

type X402Module = typeof import('@qbtlabs/x402');
let x402Module: X402Module | null = null;
let x402Loaded = false;

async function loadX402(): Promise<X402Module | null> {
  if (x402Loaded) return x402Module;
  x402Loaded = true;

  try {
    x402Module = await import('@qbtlabs/x402');
    return x402Module;
  } catch {
    console.error('[x402] @qbtlabs/x402 not installed - payment features disabled');
    return null;
  }
}

/**
 * Initialize x402 with OpenMM tool pricing
 */
export async function setupX402(): Promise<void> {
  const mod = await loadX402();
  if (!mod) return;

  const { configure, setToolPrices, isEnabled } = mod;

  configure({
    evm: process.env.X402_EVM_ADDRESS ? { address: process.env.X402_EVM_ADDRESS } : undefined,
    solana: process.env.X402_SOLANA_ADDRESS
      ? { address: process.env.X402_SOLANA_ADDRESS }
      : undefined,
    testnet: process.env.X402_TESTNET === 'true',
    verifyMode: (process.env.X402_VERIFY_MODE as 'basic' | 'full') ?? 'basic',
  });

  setToolPrices({
    list_exchanges: 'free',
    get_ticker: 'read',
    get_orderbook: 'read',
    get_trades: 'read',
    get_ohlcv: 'read',
    get_balance: 'read',
    list_open_orders: 'read',
    cardano_price: 'read',
    discover_pools: 'read',
    get_portfolio: 'analysis',
    compare_prices: 'analysis',
    place_order: 'write',
    cancel_order: 'write',
    cancel_all_orders: 'write',
    setup_grid: 'write',
    cancel_grid: 'write',
  });

  if (isEnabled()) {
    console.error('[x402] Payment protocol enabled');
    console.error(`[x402] EVM: ${process.env.X402_EVM_ADDRESS ?? 'not set'}`);
    console.error(`[x402] Solana: ${process.env.X402_SOLANA_ADDRESS ?? 'not set'}`);
    console.error(`[x402] Testnet: ${process.env.X402_TESTNET ?? 'false'}`);
  }
}

export function isEnabled(): boolean {
  return x402Module?.isEnabled() ?? false;
}

export async function checkPayment(
  toolName: string,
  paymentSignature?: string
): Promise<{ content: Array<{ type: string; text: string }> } | null> {
  const mod = await loadX402();
  return mod?.checkPayment(toolName, paymentSignature) ?? null;
}
