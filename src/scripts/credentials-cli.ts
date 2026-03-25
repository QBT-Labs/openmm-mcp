#!/usr/bin/env node
/**
 * OpenMM Credentials Server CLI
 * 
 * Start the credentials server that holds exchange API keys.
 * 
 * Usage:
 *   node dist/scripts/credentials-cli.js start
 *   node dist/scripts/credentials-cli.js status
 */

import { createInterface } from 'readline';
import { existsSync } from 'fs';
import { Vault } from '../vault/vault.js';
import { CredentialsServer } from '../credentials/server.js';
import { CredentialsClient } from '../credentials/client.js';
import { DEFAULT_SOCKET_PATH } from '../credentials/types.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

function questionHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    
    let password = '';
    
    const onData = (char: Buffer) => {
      const c = char.toString();
      
      if (c === '\n' || c === '\r') {
        stdin.removeListener('data', onData);
        stdin.setRawMode?.(wasRaw ?? false);
        process.stdout.write('\n');
        resolve(password);
      } else if (c === '\u0003') {
        // Ctrl+C
        process.exit(0);
      } else if (c === '\u007F' || c === '\b') {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        password += c;
        process.stdout.write('*');
      }
    };
    
    stdin.on('data', onData);
  });
}

async function startServer(): Promise<void> {
  console.log('🔐 OpenMM Credentials Server\n');
  
  const vault = new Vault();
  
  if (!vault.exists()) {
    console.error('❌ No vault found at', vault.getPath());
    console.error('   Create one with: node dist/vault/cli.js init');
    process.exit(1);
  }
  
  // Check if server already running
  if (existsSync(DEFAULT_SOCKET_PATH)) {
    const client = new CredentialsClient();
    try {
      const healthy = await client.health();
      if (healthy) {
        console.log('⚠️  Credentials server already running');
        process.exit(0);
      }
    } catch {
      // Socket exists but no server - will be cleaned up
    }
  }
  
  // Get vault password
  const password = await questionHidden('Vault password: ');
  rl.close();
  
  if (!password) {
    console.error('❌ Password required');
    process.exit(1);
  }
  
  // Unlock vault
  try {
    await vault.unlock(password);
  } catch (error) {
    console.error('❌ Failed to unlock vault:', (error as Error).message);
    process.exit(1);
  }
  
  // Start server
  const server = new CredentialsServer();
  const exchanges = await server.loadFromVault(vault);
  
  // Lock vault (credentials are now in server memory)
  vault.lock();
  
  if (exchanges.length === 0) {
    console.error('⚠️  No exchanges found in vault');
    console.error('   Add some with: node dist/vault/cli.js add <exchange>');
    process.exit(1);
  }
  
  console.log(`📦 Loaded ${exchanges.length} exchange(s): ${exchanges.join(', ')}`);
  
  await server.start();
  
  console.log('\n✅ Server running. Press Ctrl+C to stop.\n');
  
  // Handle shutdown
  const shutdown = () => {
    console.log('\n🛑 Shutting down...');
    server.stop();
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  // Keep process alive
  setInterval(() => {}, 1000);
}

async function checkStatus(): Promise<void> {
  console.log('🔍 Checking credentials server status...\n');
  
  if (!existsSync(DEFAULT_SOCKET_PATH)) {
    console.log('❌ Server not running (socket not found)');
    console.log(`   Socket path: ${DEFAULT_SOCKET_PATH}`);
    process.exit(1);
  }
  
  const client = new CredentialsClient();
  
  try {
    await client.connect();
    const healthy = await client.health();
    
    if (healthy) {
      const exchanges = await client.listExchanges();
      console.log('✅ Server running');
      console.log(`📦 Exchanges: ${exchanges.join(', ') || '(none)'}`);
    } else {
      console.log('❌ Server not healthy');
    }
    
    client.disconnect();
  } catch (error) {
    console.log('❌ Cannot connect to server:', (error as Error).message);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  
  switch (command) {
    case 'start':
      await startServer();
      break;
      
    case 'status':
      await checkStatus();
      rl.close();
      break;
      
    default:
      console.log('OpenMM Credentials Server\n');
      console.log('Usage:');
      console.log('  credentials-cli start   Start the credentials server');
      console.log('  credentials-cli status  Check server status');
      rl.close();
      break;
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  rl.close();
  process.exit(1);
});
