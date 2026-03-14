import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ExchangeParam, OptionalSymbolParam } from '../utils/index.js';
import { validateExchange, getConnectorSafe } from '../exchange/exchange-manager.js';
import { executeWithPayment } from '../x402-setup.js';

const PaymentParam = z.string().optional().describe('x402 payment signature (base64)');

export function registerAccountTools(server: McpServer): void {
  server.tool(
    'get_balance',
    'Get account balances for all assets (or a specific asset) on a supported exchange',
    {
      exchange: ExchangeParam,
      asset: z
        .string()
        .optional()
        .describe('Optional asset to filter by (e.g., USDT, BTC). Returns all assets if omitted.'),
      payment: PaymentParam,
    },
    async ({ exchange, asset, payment }) => {
      return executeWithPayment('get_balance', payment, async () => {
      const validExchange = validateExchange(exchange);
      const connector = await getConnectorSafe(exchange);
      const balances = await connector.getBalance();

      let entries = Object.values(balances);
      if (asset) {
        const upperAsset = asset.toUpperCase();
        entries = entries.filter((b) => b.asset.toUpperCase() === upperAsset);
        if (entries.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    asset: upperAsset,
                    message: `No balance found for asset: ${upperAsset}`,
                    exchange: validExchange,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                balances: entries,
                totalAssets: entries.length,
                exchange: validExchange,
              },
              null,
              2
            ),
          },
        ],
      };
      });
    }
  );

  server.tool(
    'list_orders',
    'List open orders on a supported exchange, optionally filtered by trading pair symbol',
    {
      exchange: ExchangeParam,
      symbol: OptionalSymbolParam,
      payment: PaymentParam,
    },
    async ({ exchange, symbol, payment }) => {
      return executeWithPayment('list_open_orders', payment, async () => {
      const validExchange = validateExchange(exchange);
      const connector = await getConnectorSafe(exchange);
      const orders = await connector.getOpenOrders(symbol);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                orders,
                totalOrders: orders.length,
                ...(symbol ? { symbol } : {}),
                exchange: validExchange,
              },
              null,
              2
            ),
          },
        ],
      };
      });
    }
  );
}
