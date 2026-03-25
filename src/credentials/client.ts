/**
 * OpenMM Credentials Client
 * 
 * Connects to the credentials server to get exchange credentials.
 */

import { createConnection, Socket } from 'net';
import { existsSync } from 'fs';
import type { CredentialsRequest, CredentialsResponse, ExchangeCredentials } from './types.js';
import { DEFAULT_SOCKET_PATH } from './types.js';

export class CredentialsClient {
  private socketPath: string;
  private socket: Socket | null = null;
  private requestCounter = 0;
  private pendingRequests: Map<string, {
    resolve: (value: CredentialsResponse) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor(socketPath?: string) {
    this.socketPath = socketPath || process.env.OPENMM_CREDS_SOCKET || DEFAULT_SOCKET_PATH;
  }

  /**
   * Check if credentials server is available
   */
  isAvailable(): boolean {
    return existsSync(this.socketPath);
  }

  /**
   * Connect to the credentials server
   */
  async connect(): Promise<void> {
    if (this.socket) return;

    return new Promise((resolve, reject) => {
      this.socket = createConnection(this.socketPath);
      
      let buffer = '';

      this.socket.on('connect', () => {
        resolve();
      });

      this.socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response: CredentialsResponse = JSON.parse(line);
              const pending = this.pendingRequests.get(response.id);
              if (pending) {
                this.pendingRequests.delete(response.id);
                pending.resolve(response);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      });

      this.socket.on('error', (err) => {
        reject(err);
      });

      this.socket.on('close', () => {
        this.socket = null;
        // Reject all pending requests
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error('Connection closed'));
        }
        this.pendingRequests.clear();
      });
    });
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }

  /**
   * Send a request and wait for response
   */
  private async request(action: CredentialsRequest['action'], exchange?: string): Promise<CredentialsResponse> {
    if (!this.socket) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const id = `req-${++this.requestCounter}`;
      const request: CredentialsRequest = { id, action, exchange };

      this.pendingRequests.set(id, { resolve, reject });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 5000);

      this.socket!.write(JSON.stringify(request) + '\n');
    });
  }

  /**
   * Check server health
   */
  async health(): Promise<boolean> {
    try {
      const response = await this.request('health');
      return response.success;
    } catch {
      return false;
    }
  }

  /**
   * List available exchanges
   */
  async listExchanges(): Promise<string[]> {
    const response = await this.request('list');
    if (!response.success) {
      throw new Error(response.error || 'Failed to list exchanges');
    }
    return (response.data as { exchanges: string[] }).exchanges;
  }

  /**
   * Get credentials for an exchange
   */
  async getCredentials(exchange: string): Promise<ExchangeCredentials | null> {
    const response = await this.request('get', exchange);
    if (!response.success) {
      return null;
    }
    return response.data as ExchangeCredentials;
  }
}

/**
 * Singleton client instance
 */
let clientInstance: CredentialsClient | null = null;

export function getCredentialsClient(): CredentialsClient {
  if (!clientInstance) {
    clientInstance = new CredentialsClient();
  }
  return clientInstance;
}
