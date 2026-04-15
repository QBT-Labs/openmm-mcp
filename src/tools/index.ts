import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMarketDataTools } from './market-data.js';
import { registerAccountTools } from './account.js';
import { registerTradingTools } from './trading.js';
import { registerCardanoTools } from './cardano.js';
import { registerStrategyTools } from './strategy.js';

const SUPPORTED_EXCHANGES = [
  {
    id: 'mexc',
    name: 'MEXC',
    features: ['spot trading', 'market data'],
    credentials: ['MEXC_API_KEY', 'MEXC_SECRET'],
  },
  {
    id: 'gateio',
    name: 'Gate.io',
    features: ['spot trading', 'market data'],
    credentials: ['GATEIO_API_KEY', 'GATEIO_SECRET'],
  },
  {
    id: 'bitget',
    name: 'Bitget',
    features: ['spot trading', 'market data'],
    credentials: ['BITGET_API_KEY', 'BITGET_SECRET', 'BITGET_PASSPHRASE'],
  },
  {
    id: 'kraken',
    name: 'Kraken',
    features: ['spot trading', 'market data', 'fiat pairs'],
    credentials: ['KRAKEN_API_KEY', 'KRAKEN_SECRET'],
  },
];

export function registerTools(server: McpServer): void {
  server.tool(
    'list_exchanges',
    'List all supported exchanges with their IDs, features, and required credentials',
    {},
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ exchanges: SUPPORTED_EXCHANGES }, null, 2),
        },
      ],
    })
  );

  registerMarketDataTools(server);
  registerAccountTools(server);
  registerTradingTools(server);
  registerCardanoTools(server);
  registerStrategyTools(server);
}
