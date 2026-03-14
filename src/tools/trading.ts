import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ExchangeParam, SymbolParam, validateSymbol } from '../utils/index.js';
import { validateExchange, getConnectorSafe } from '../exchange/exchange-manager.js';
import type { X402Wrappers } from '../x402-setup.js';

const identity = (fn: any) => fn;

export function registerTradingTools(server: McpServer, wrappers: X402Wrappers | null): void {
  const wrap = wrappers?.paidWrite ?? identity;

  server.tool(
    'create_order',
    'Create a new order (limit or market) on a supported exchange',
    {
      exchange: ExchangeParam,
      symbol: SymbolParam,
      type: z.enum(['limit', 'market']).describe('Order type: limit or market'),
      side: z.enum(['buy', 'sell']).describe('Order side: buy or sell'),
      amount: z.number().positive().describe('Order amount in base currency'),
      price: z
        .number()
        .positive()
        .optional()
        .describe('Order price (required for limit orders, ignored for market orders)'),
    },
    wrap(async (args: { exchange: string; symbol: string; type: 'limit' | 'market'; side: 'buy' | 'sell'; amount: number; price?: number }) => {
      const validExchange = validateExchange(args.exchange);
      const validSymbol = validateSymbol(args.symbol);

      if (args.type === 'limit' && args.price === undefined) {
        throw new Error('Price is required for limit orders');
      }

      const connector = await getConnectorSafe(args.exchange);
      const order = await connector.createOrder(validSymbol, args.type, args.side, args.amount, args.price);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                order,
                exchange: validExchange,
              },
              null,
              2
            ),
          },
        ],
      };
    })
  );

  server.tool(
    'cancel_order',
    'Cancel a specific order by ID on a supported exchange',
    {
      exchange: ExchangeParam,
      symbol: SymbolParam,
      orderId: z.string().describe('The order ID to cancel'),
    },
    wrap(async (args: { exchange: string; symbol: string; orderId: string }) => {
      const validExchange = validateExchange(args.exchange);
      const validSymbol = validateSymbol(args.symbol);

      const connector = await getConnectorSafe(args.exchange);
      const result = await connector.cancelOrder(args.orderId, validSymbol);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                cancelled: result,
                orderId: args.orderId,
                symbol: validSymbol,
                exchange: validExchange,
              },
              null,
              2
            ),
          },
        ],
      };
    })
  );

  server.tool(
    'cancel_all_orders',
    'Cancel all open orders for a trading pair on a supported exchange',
    {
      exchange: ExchangeParam,
      symbol: SymbolParam,
    },
    wrap(async (args: { exchange: string; symbol: string }) => {
      const validExchange = validateExchange(args.exchange);
      const validSymbol = validateSymbol(args.symbol);

      const connector = await getConnectorSafe(args.exchange);
      const result = await connector.cancelAllOrders(validSymbol);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                cancelled: result,
                symbol: validSymbol,
                exchange: validExchange,
              },
              null,
              2
            ),
          },
        ],
      };
    })
  );
}
