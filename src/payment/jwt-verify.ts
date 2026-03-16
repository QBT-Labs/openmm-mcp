/**
 * JWT Verification Module
 *
 * Verifies ES256 (ECDSA P-256) JWTs issued by mcp.openmm.io.
 * Uses Web Crypto API — no external JWT libraries.
 */

export interface JWTClaims {
  user_id: string;
  exchange: string;
  tool: string;
  issued_at: number;
  expires_at: number;
  payment_tx: string;
}

let cachedPublicKey: CryptoKey | null = null;
let cachedKeyExpiry = 0;
const KEY_CACHE_TTL = 3600_000;

function getPaymentServer(): string {
  return process.env.PAYMENT_SERVER || 'https://mcp.openmm.io';
}

function base64UrlDecode(str: string): Uint8Array {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function pemToBytes(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Fetch and cache the ES256 public key from the payment server.
 */
export async function fetchPublicKey(): Promise<CryptoKey> {
  if (cachedPublicKey && Date.now() < cachedKeyExpiry) {
    return cachedPublicKey;
  }

  const url = `${getPaymentServer()}/jwt-public-key`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch JWT public key: ${res.status}`);
  }

  const body = await res.json();
  let key: CryptoKey;

  if (body.kty) {
    key = await crypto.subtle.importKey(
      'jwk',
      body,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } else {
    const pem: string = body.key ?? body.publicKey ?? (typeof body === 'string' ? body : null);
    if (!pem) throw new Error('Unexpected public key format');

    const der = pemToBytes(pem);
    key = await crypto.subtle.importKey(
      'spki',
      der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  }

  cachedPublicKey = key;
  cachedKeyExpiry = Date.now() + KEY_CACHE_TTL;
  return key;
}

export function clearPublicKeyCache(): void {
  cachedPublicKey = null;
  cachedKeyExpiry = 0;
}

/**
 * Verify an ES256 JWT and return decoded claims.
 */
export async function verifyJWT(token: string): Promise<JWTClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT: expected 3 parts');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
  if (header.alg !== 'ES256') {
    throw new Error(`Unsupported algorithm: ${header.alg}`);
  }

  const publicKey = await fetchPublicKey();
  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);

  const sigBuf = signature.buffer.slice(
    signature.byteOffset,
    signature.byteOffset + signature.byteLength,
  ) as ArrayBuffer;

  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    sigBuf,
    signedData,
  );

  if (!valid) {
    throw new Error('JWT signature verification failed');
  }

  const claims: JWTClaims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));

  const now = Math.floor(Date.now() / 1000);
  if (claims.expires_at && now > claims.expires_at) {
    throw new Error(`JWT expired at ${new Date(claims.expires_at * 1000).toISOString()}`);
  }

  return claims;
}
