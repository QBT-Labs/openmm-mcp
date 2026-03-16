/**
 * Payment Client
 *
 * Handles the x402 payment flow against the remote payment server.
 * Signs EIP-3009 authorizations with the user's wallet private key.
 * Wallet key never leaves the local machine.
 */

import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, base } from 'viem/chains';

export interface PaymentRequestOptions {
  exchange: string;
  tool: string;
}

export interface PaymentJWTResult {
  jwt: string;
}

interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payTo: string;
  extra: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
}

let walletClientInstance: any = null;
let payerAddress: `0x${string}` | null = null;
let isTestnet = false;
let enabled = false;

function getPaymentServer(): string {
  return process.env.PAYMENT_SERVER || 'https://mcp.openmm.io';
}

function randomNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
}

function toBase64(obj: unknown): string {
  return btoa(JSON.stringify(obj));
}

/**
 * Initialize the payment client from environment variables.
 */
export function initPaymentClient(): void {
  const privateKey = process.env.WALLET_PRIVATE_KEY as `0x${string}` | undefined;
  if (!privateKey) {
    return;
  }

  isTestnet = process.env.X402_TESTNET === 'true';
  const chain = isTestnet ? baseSepolia : base;
  const account = privateKeyToAccount(privateKey);
  payerAddress = account.address;
  walletClientInstance = createWalletClient({ account, chain, transport: http() });
  enabled = true;
}

export function isPaymentClientEnabled(): boolean {
  return enabled;
}

/**
 * Request a payment JWT from the remote server.
 */
export async function requestPaymentJWT(options: PaymentRequestOptions): Promise<PaymentJWTResult> {
  if (!enabled || !walletClientInstance || !payerAddress) {
    throw new Error('Payment client not initialized');
  }

  const server = getPaymentServer();
  const body = JSON.stringify({ exchange: options.exchange, tool: options.tool });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const initialRes = await fetch(`${server}/verify-payment`, {
    method: 'POST',
    headers,
    body,
  });

  if (initialRes.ok) {
    const data = await initialRes.json();
    if (data.jwt) return { jwt: data.jwt };
    throw new Error('Server returned 200 but no JWT');
  }

  if (initialRes.status !== 402) {
    const text = await initialRes.text();
    throw new Error(`Unexpected response ${initialRes.status}: ${text}`);
  }

  const requirementsBody = await initialRes.json();
  const accepts: PaymentRequirements[] = requirementsBody.accepts ?? [requirementsBody];
  const req = accepts[0];
  if (!req) throw new Error('No payment requirements in 402 response');

  const paymentHeader = await signPayment(req);

  const paidRes = await fetch(`${server}/verify-payment`, {
    method: 'POST',
    headers: { ...headers, 'X-PAYMENT': paymentHeader },
    body,
  });

  if (!paidRes.ok) {
    const text = await paidRes.text();
    throw new Error(`Payment failed (${paidRes.status}): ${text}`);
  }

  const data = await paidRes.json();
  if (!data.jwt) throw new Error('Server accepted payment but no JWT');

  return { jwt: data.jwt };
}

async function signPayment(req: PaymentRequirements): Promise<string> {
  if (!walletClientInstance || !payerAddress) {
    throw new Error('Wallet not initialised');
  }

  const chainId = req.extra?.chainId ?? (isTestnet ? 84532 : 8453);
  const usdcContract = (req.extra?.verifyingContract ??
    (chainId === 84532
      ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')) as `0x${string}`;

  const value = BigInt(req.maxAmountRequired);
  const validAfter = BigInt(0);
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);
  const nonce = randomNonce();
  const domainName = req.extra?.name ?? (chainId === 84532 ? 'USDC' : 'USD Coin');
  const domainVersion = req.extra?.version ?? '2';

  const signature = await walletClientInstance.signTypedData({
    account: walletClientInstance.account!,
    domain: {
      name: domainName,
      version: domainVersion,
      chainId: BigInt(chainId),
      verifyingContract: usdcContract,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from: payerAddress,
      to: req.payTo as `0x${string}`,
      value,
      validAfter,
      validBefore,
      nonce,
    },
  });

  return toBase64({
    x402Version: 1,
    scheme: req.scheme ?? 'exact',
    network: req.network ?? (isTestnet ? 'base-sepolia' : 'base'),
    payload: {
      signature,
      authorization: {
        from: payerAddress,
        to: req.payTo,
        value: value.toString(),
        validAfter: '0',
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  });
}
