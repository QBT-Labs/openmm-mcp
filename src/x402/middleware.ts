/**
 * x402 Payment Middleware for MCP Tools
 *
 * Wraps MCP tool handlers with payment requirements.
 * Returns HTTP 402 with payment options if not paid.
 *
 * Modes:
 * - local: Use local verification (fast, for dev/testing)
 * - facilitator: Use Coinbase x402 facilitator (production)
 *
 * Set X402_MODE=facilitator for production.
 */

import {
  getToolPricing,
  isX402Enabled,
  buildPaymentRequirements,
} from './config.js';
import { verifyPayment, parsePaymentSignature } from './verify.js';
import { verifyWithFacilitator, settleWithFacilitator } from './facilitator.js';

// Execution mode
const X402_MODE = process.env.X402_MODE || 'local';

// MCP tool handler type
type ToolHandler<T = unknown> = (
  params: T,
  extra?: { _meta?: { paymentSignature?: string } }
) => Promise<{ content: Array<{ type: string; text: string }> }>;

// Extended params with payment metadata
interface ParamsWithPayment {
  _meta?: {
    paymentSignature?: string;
  };
  [key: string]: unknown;
}

/**
 * Create a 402 Payment Required response
 */
function createPaymentRequiredResponse(
  toolName: string,
  priceUsd: number
): { content: Array<{ type: string; text: string }> } {
  const requirements = buildPaymentRequirements(priceUsd);

  const response = {
    error: 'Payment Required',
    code: 402,
    tool: toolName,
    price: priceUsd,
    priceFormatted: `$${priceUsd.toFixed(4)}`,
    ...requirements,
    message: `This tool requires payment of $${priceUsd.toFixed(4)} USDC. ` +
      `Include a Payment-Signature header with your request.`,
    docs: 'https://docs.cdp.coinbase.com/x402/welcome',
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}

/**
 * Create a payment verification error response
 */
function createPaymentErrorResponse(
  toolName: string,
  error: string
): { content: Array<{ type: string; text: string }> } {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            error: 'Payment Verification Failed',
            code: 402,
            tool: toolName,
            reason: error,
            message: 'Your payment could not be verified. Please try again.',
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Wrap a tool handler with x402 payment middleware
 */
export function withX402<T extends ParamsWithPayment>(
  toolName: string,
  handler: ToolHandler<T>
): ToolHandler<T> {
  return async (params: T, extra?: { _meta?: { paymentSignature?: string } }) => {
    // Skip if x402 is not enabled
    if (!isX402Enabled()) {
      return handler(params, extra);
    }

    // Get pricing for this tool
    const pricing = getToolPricing(toolName);

    // Free tools pass through
    if (pricing.tier === 'free' || pricing.price === 0) {
      return handler(params, extra);
    }

    // Check for payment signature in params or extra metadata
    const paymentSignature =
      params._meta?.paymentSignature ||
      extra?._meta?.paymentSignature;

    // No payment provided - return 402
    if (!paymentSignature) {
      return createPaymentRequiredResponse(toolName, pricing.price);
    }

    // Parse the payment signature
    const payment = parsePaymentSignature(paymentSignature);
    if (!payment) {
      return createPaymentErrorResponse(toolName, 'Invalid payment signature format');
    }

    // Verify payment (local or via facilitator)
    let verification: { valid: boolean; error?: string };

    if (X402_MODE === 'facilitator') {
      // Production: Use Coinbase x402 facilitator
      verification = await verifyWithFacilitator(payment, toolName);
    } else {
      // Development: Use local verification
      verification = await verifyPayment(paymentSignature, pricing.price);
    }

    if (!verification.valid) {
      return createPaymentErrorResponse(toolName, verification.error || 'Unknown error');
    }

    // Payment verified - execute the tool
    const result = await handler(params, extra);

    // Settle payment via facilitator (production only)
    if (X402_MODE === 'facilitator') {
      const settlement = await settleWithFacilitator(payment, toolName);
      if (!settlement.success) {
        console.error(`Payment settlement failed for ${toolName}:`, settlement.error);
        // Don't fail the request - log and continue
      } else if (settlement.txHash) {
        console.log(`Payment settled for ${toolName}: ${settlement.txHash}`);
      }
    }

    return result;
  };
}

/**
 * Create a wrapped tool registration function
 */
export function createX402ToolRegistrar(
  server: { tool: (name: string, description: string, schema: unknown, handler: ToolHandler) => void }
) {
  return function registerTool<T extends ParamsWithPayment>(
    name: string,
    description: string,
    schema: unknown,
    handler: ToolHandler<T>
  ): void {
    const wrappedHandler = withX402(name, handler);
    server.tool(name, description, schema, wrappedHandler as ToolHandler);
  };
}

/**
 * Get pricing info for all tools (for documentation)
 */
export function getAllToolPricing(): Record<
  string,
  { tier: string; price: number; priceFormatted: string }
> {
  const tools = [
    'get_ticker',
    'get_orderbook',
    'get_trades',
    'get_balance',
    'list_orders',
    'cardano_price',
    'discover_pools',
    'place_order',
    'cancel_order',
    'grid_status',
  ];

  const result: Record<string, { tier: string; price: number; priceFormatted: string }> = {};

  for (const tool of tools) {
    const pricing = getToolPricing(tool);
    result[tool] = {
      tier: pricing.tier,
      price: pricing.price,
      priceFormatted: pricing.price === 0 ? 'Free' : `$${pricing.price.toFixed(4)}`,
    };
  }

  return result;
}
