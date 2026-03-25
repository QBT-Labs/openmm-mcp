/**
 * OpenMM Credentials Module
 * 
 * Isolated credentials server for secure API key management.
 */

export { CredentialsServer } from './server.js';
export { CredentialsClient, getCredentialsClient } from './client.js';
export { DEFAULT_SOCKET_PATH } from './types.js';
export type { CredentialsRequest, CredentialsResponse, ExchangeCredentials } from './types.js';
