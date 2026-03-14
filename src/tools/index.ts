import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { X402Wrappers } from '../x402-setup.js';
import { registerMarketDataTools } from './market-data.js';
import { registerAccountTools } from './account.js';
import { registerTradingTools } from './trading.js';
import { registerCardanoTools } from './cardano.js';
import { registerStrategyTools } from './strategy.js';

export function registerTools(server: McpServer, wrappers: X402Wrappers | null): void {
  registerMarketDataTools(server, wrappers);
  registerAccountTools(server, wrappers);
  registerTradingTools(server, wrappers);
  registerCardanoTools(server, wrappers);
  registerStrategyTools(server, wrappers);
}
