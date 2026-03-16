/**
 * Payment Gate
 *
 * Wraps ALL tool handlers (except free tools) with the JWT payment flow:
 *   1. Request JWT from payment server (triggers x402 payment)
 *   2. Verify JWT locally (ES256)
 *   3. Execute the original tool handler
 *
 * Pricing (set on Worker side):
 *   - Free ($0): list_exchanges
 *   - Read ($0.001): get_ticker, get_orderbook, get_trades, get_balance, etc.
 *   - Write ($0.01): create_order, cancel_order, start_grid_strategy, etc.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { requestPaymentJWT, isPaymentClientEnabled } from './payment-client.js';
import { verifyJWT, type JWTClaims } from './jwt-verify.js';

const FREE_TOOLS = new Set(['list_exchanges']);

export function requiresPayment(name: string): boolean {
  return !FREE_TOOLS.has(name);
}

function injectPaymentMeta(
  result: { content: Array<{ type: string; text?: string }> },
  claims: JWTClaims,
): typeof result {
  if (!result.content?.[0] || result.content[0].type !== 'text' || !result.content[0].text) {
    return result;
  }

  try {
    const parsed = JSON.parse(result.content[0].text);
    parsed._payment = {
      payment_tx: claims.payment_tx,
      tool: claims.tool,
      exchange: claims.exchange,
      issued_at: new Date(claims.issued_at * 1000).toISOString(),
    };
    result.content[0] = { type: 'text', text: JSON.stringify(parsed, null, 2) };
  } catch {
    // Parse failed, leave result as-is
  }
  return result;
}

/**
 * Wrap a McpServer so that tool handlers go through the JWT payment flow.
 * Call BEFORE registerTools().
 */
export function wrapServerWithPayment(server: McpServer): void {
  const originalTool = server.tool.bind(server);

  (server as any).tool = function (...allArgs: any[]) {
    const name: string = allArgs[0];

    if (requiresPayment(name) && isPaymentClientEnabled()) {
      const handlerIdx = allArgs.length - 1;
      const originalHandler = allArgs[handlerIdx] as (...a: any[]) => Promise<any>;

      allArgs[handlerIdx] = async function (args: Record<string, unknown>, extra: unknown) {
        const exchange = (args.exchange as string) ?? '';

        const { jwt } = await requestPaymentJWT({ exchange, tool: name });
        const claims = await verifyJWT(jwt);

        if (claims.tool !== name) {
          throw new Error(`JWT tool mismatch: expected ${name}, got ${claims.tool}`);
        }
        if (exchange && claims.exchange !== exchange) {
          throw new Error(`JWT exchange mismatch: expected ${exchange}, got ${claims.exchange}`);
        }

        const result = await originalHandler(args, extra);
        return injectPaymentMeta(result, claims);
      };
    }

    return (originalTool as any)(...allArgs);
  };
}
