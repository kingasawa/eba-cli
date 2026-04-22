import pkg from '@expo/apple-utils';

const { Keys } = pkg;

/**
 * List App Store Connect API keys using @expo/apple-utils.
 */
export async function listApiKeys(authState) {
  const keys = await Keys.getKeysAsync(authState);
  return keys;
}

/**
 * Create a new App Store Connect API key.
 */
export async function createApiKey(authState, name) {
  const key = await Keys.createKeyAsync(authState, { name });
  return key;
}

/**
 * Download the private key (.p8) for a key ID.
 * Only available once — immediately after creation.
 */
export async function downloadPrivateKey(authState, keyId) {
  const content = await Keys.downloadKeyAsync(authState, { id: keyId });
  return content;
}
