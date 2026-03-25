/**
 * Vault Loader
 * 
 * Loads exchange credentials and sets them as env vars
 * for compatibility with the OpenMM SDK (which expects env vars).
 * 
 * Priority:
 * 1. Credentials Server (socket) - most secure
 * 2. Direct vault unlock (password from env) - fallback
 */

import { Vault } from './vault.js';
import type { ExchangeId } from './types.js';

// Map of exchange IDs to env var names
const ENV_VAR_MAP: Record<ExchangeId, { key: string; secret: string; passphrase?: string }> = {
  mexc: { key: 'MEXC_API_KEY', secret: 'MEXC_SECRET' },
  gateio: { key: 'GATEIO_API_KEY', secret: 'GATEIO_SECRET' },
  bitget: { key: 'BITGET_API_KEY', secret: 'BITGET_SECRET', passphrase: 'BITGET_PASSPHRASE' },
  kraken: { key: 'KRAKEN_API_KEY', secret: 'KRAKEN_SECRET' },
  binance: { key: 'BINANCE_API_KEY', secret: 'BINANCE_SECRET' },
  coinbase: { key: 'COINBASE_API_KEY', secret: 'COINBASE_SECRET', passphrase: 'COINBASE_PASSPHRASE' },
  okx: { key: 'OKX_API_KEY', secret: 'OKX_SECRET', passphrase: 'OKX_PASSPHRASE' },
};

/**
 * Load credentials from the credentials server (most secure)
 */
async function loadFromCredentialsServer(): Promise<string[]> {
  const { CredentialsClient } = await import('../credentials/client.js');
  const client = new CredentialsClient();
  
  if (!client.isAvailable()) {
    return [];
  }
  
  try {
    await client.connect();
    
    const exchanges = await client.listExchanges();
    const loaded: string[] = [];
    
    for (const exchangeId of exchanges) {
      const creds = await client.getCredentials(exchangeId);
      if (!creds) continue;
      
      const envVars = ENV_VAR_MAP[exchangeId as ExchangeId];
      if (!envVars) continue;
      
      // Set env vars
      process.env[envVars.key] = creds.apiKey;
      process.env[envVars.secret] = creds.secret;
      
      if (envVars.passphrase && creds.passphrase) {
        process.env[envVars.passphrase] = creds.passphrase;
      }
      
      loaded.push(exchangeId);
    }
    
    client.disconnect();
    
    if (loaded.length > 0) {
      console.error(`🔐 Loaded credentials from server: ${loaded.join(', ')}`);
    }
    
    return loaded;
  } catch (error) {
    console.error('⚠️  Credentials server connection failed:', (error as Error).message);
    return [];
  }
}

/**
 * Load credentials directly from vault (fallback, requires password in env)
 */
async function loadFromVaultDirect(password: string): Promise<string[]> {
  const vault = new Vault();
  
  if (!vault.exists()) {
    return [];
  }
  
  try {
    await vault.unlock(password);
  } catch (error) {
    console.error('❌ Failed to unlock vault:', (error as Error).message);
    return [];
  }
  
  const loaded: string[] = [];
  const exchanges = vault.listExchanges();
  
  for (const exchangeId of exchanges) {
    const creds = vault.getExchange(exchangeId);
    if (!creds) continue;
    
    const envVars = ENV_VAR_MAP[exchangeId];
    if (!envVars) continue;
    
    // Set env vars
    process.env[envVars.key] = creds.apiKey;
    process.env[envVars.secret] = creds.secret;
    
    if (envVars.passphrase && creds.passphrase) {
      process.env[envVars.passphrase] = creds.passphrase;
    }
    
    loaded.push(exchangeId);
  }
  
  vault.lock();
  
  if (loaded.length > 0) {
    console.error(`🔐 Loaded credentials from vault: ${loaded.join(', ')}`);
  }
  
  return loaded;
}

/**
 * Load credentials (tries credentials server first, then vault direct)
 */
export async function loadVaultCredentials(password?: string): Promise<string[]> {
  // Try credentials server first (most secure)
  const fromServer = await loadFromCredentialsServer();
  if (fromServer.length > 0) {
    return fromServer;
  }
  
  // Fallback to direct vault (less secure, needs password in env)
  const vaultPassword = password || process.env.OPENMM_VAULT_PASSWORD;
  if (vaultPassword) {
    return loadFromVaultDirect(vaultPassword);
  }
  
  console.error('⚠️  No credentials loaded');
  console.error('   Option 1: Start credentials server:');
  console.error('             node dist/scripts/credentials-cli.js start');
  console.error('   Option 2: Set OPENMM_VAULT_PASSWORD env var');
  
  return [];
}

/**
 * Check if vault or credentials server is available
 */
export function isVaultAvailable(): boolean {
  const vault = new Vault();
  return vault.exists();
}
