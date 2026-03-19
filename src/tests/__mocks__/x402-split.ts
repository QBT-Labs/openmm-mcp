export function wrapWithSplitPayment() {}
export function createSplitClient() {
  return {
    requestJWT: async () => ({ jwt: '' }),
    verifyJWT: async () => ({}),
    clearKeyCache: () => {},
  };
}
export function verifyJWT() {}
export function fetchPublicKey() {}
export function clearPublicKeyCache() {}
