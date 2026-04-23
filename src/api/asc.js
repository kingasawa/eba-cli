import pkg from '@expo/apple-utils';

const { Keys, CookieFileCache } = pkg;

const ASC_BASE_URL = 'https://appstoreconnect.apple.com';

function getSessionCookieHeader() {
  const { cookies } = CookieFileCache.getCookiesJSON();
  if (!cookies?.length) {
    throw new Error('No App Store Connect session cookies found. Please login again.');
  }
  return cookies.map(cookie => `${cookie.key}=${cookie.value}`).join('; ');
}

export async function ascFetch(path, { method = 'GET', body } = {}) {
  const cookieHeader = getSessionCookieHeader();

  const response = await fetch(`${ASC_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  if (!response.ok) {
    const details = typeof payload === 'string' ? payload : JSON.stringify(payload);
    throw new Error(`App Store Connect API error ${response.status}: ${details}`);
  }

  return payload;
}

export async function findCiProductByAppId(ascAppId) {
  const data = await ascFetch(`/iris/v1/ciProducts?filter[app]=${ascAppId}`);
  return data?.data?.[0] ?? null;
}

export async function listWorkflows(productId) {
  const data = await ascFetch(`/iris/v1/ciProducts/${productId}/workflows`);
  return data?.data ?? [];
}

export async function triggerBuildRun(workflowId) {
  return ascFetch('/iris/v1/ciBuildRuns', {
    method: 'POST',
    body: {
      data: {
        type: 'ciBuildRuns',
        relationships: {
          workflow: { data: { type: 'ciWorkflows', id: workflowId } },
        },
      },
    },
  });
}


export function getAscAppPageUrl(ascAppId) {
  return `${ASC_BASE_URL}/apps/${ascAppId}/xcode-cloud`;
}

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
