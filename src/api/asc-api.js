/**
 * App Store Connect REST API client (public API).
 * Uses JWT authentication with an App Store Connect API Key.
 *
 * Docs: https://developer.apple.com/documentation/appstoreconnectapi
 */

import { createSign } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import https from 'https';

const ASC_API_BASE = 'https://api.appstoreconnect.apple.com';

// Use Node https module as fallback for reliable TLS on Windows
function httpsRequest(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        ...headers,
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── JWT ──────────────────────────────────────────────────────────────────────

function base64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function generateJwt({ issuerId, keyId, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: issuerId,
    iat: now,
    exp: now + 1200, // 20 min max
    aud: 'appstoreconnect-v1',
  }));

  const sign = createSign('SHA256');
  sign.update(`${header}.${payload}`);
  const sig = base64url(sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }));

  return `${header}.${payload}.${sig}`;
}

// ─── Credentials store ────────────────────────────────────────────────────────

const CREDS_FILE = join(homedir(), '.eba-cli', 'eba-workflow.json');

export function loadApiKeyCreds() {
  try {
    if (!existsSync(CREDS_FILE)) return null;
    const data = JSON.parse(readFileSync(CREDS_FILE, 'utf8'));
    if (!data.issuerId || !data.keyId || !data.privateKeyPath) return null;
    if (!existsSync(data.privateKeyPath)) return null;
    return {
      issuerId: data.issuerId,
      keyId: data.keyId,
      privateKey: readFileSync(data.privateKeyPath, 'utf8'),
    };
  } catch { return null; }
}

export function saveApiKeyCreds({ issuerId, keyId, privateKeyPath }) {
  const dir = join(homedir(), '.eba-cli');
  mkdirSync(dir, { recursive: true });
  writeFileSync(CREDS_FILE, JSON.stringify({ issuerId, keyId, privateKeyPath }, null, 2));
}

export function getCredsFilePath() { return CREDS_FILE; }

// ─── HTTP client ──────────────────────────────────────────────────────────────

async function ascApiRequest(path, { method = 'GET', body, jwt } = {}) {
  const url = `${ASC_API_BASE}${path}`;
  if (process.env.DEBUG) console.log(`→ ${method} ${url}`);

  const bodyStr = body ? JSON.stringify(body) : undefined;
  const headers = {
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const { status, body: rawBody } = await httpsRequest(url, { method, headers, body: bodyStr });

  let data;
  try { data = JSON.parse(rawBody); } catch { data = rawBody; }

  if (process.env.DEBUG) console.log(`← ${status}`, JSON.stringify(data, null, 2));

  if (status < 200 || status >= 300) {
    const errs = data?.errors?.map(e => e.detail ?? e.title).join('; ') ?? JSON.stringify(data);
    throw new Error(`ASC API ${status}: ${errs}`);
  }

  return data;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export async function getCiProduct(jwt, ascAppId) {
  const data = await ascApiRequest(`/v1/ciProducts?filter[app]=${ascAppId}&limit=1`, { jwt });
  return data?.data?.[0] ?? null;
}

export async function getCiWorkflows(jwt, productId) {
  const data = await ascApiRequest(
    `/v1/ciProducts/${productId}/workflows?limit=50`,
    { jwt }
  );
  return data?.data ?? [];
}

export async function getScmRepositories(jwt) {
  const data = await ascApiRequest('/v1/scmRepositories?limit=50', { jwt });
  return data?.data ?? [];
}

export async function getXcodeVersions(jwt) {
  const data = await ascApiRequest('/v1/ciXcodeVersions', { jwt });
  return data?.data ?? [];
}

export async function getMacOsVersions(jwt) {
  const data = await ascApiRequest('/v1/ciMacOsVersions', { jwt });
  return data?.data ?? [];
}

export async function getScmProviders(jwt) {
  const data = await ascApiRequest('/v1/scmProviders?limit=50', { jwt });
  return data?.data ?? [];
}

/**
 * Poll /v1/scmRepositories until a repo that was NOT in `knownIds` appears,
 * or until timeout. Returns the new repo object or null on timeout.
 */
export async function pollForNewRepository(jwt, knownIds = new Set(), { intervalMs = 3000, timeoutMs = 120000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs));
    const repos = await getScmRepositories(jwt);
    const newRepo = repos.find(r => !knownIds.has(r.id));
    if (newRepo) return newRepo;
  }
  return null;
}

export async function createCiWorkflow(jwt, {
  productId,
  repositoryId,
  xcodeVersionId,
  macOsVersionId,
  name,
  scheme,
  platform = 'IOS',
  clean = true,
  containerFilePath,
  buildDistributionAudience = null,
  branchStartCondition = null,
  tagStartCondition = null,
  pullRequestStartCondition = null,
  manualBranchStartCondition = null,
}) {
  const archiveAction = {
    name: 'Archive',
    actionType: 'ARCHIVE',
    scheme,
    platform,
    isRequiredToPass: true,
  };
  if (buildDistributionAudience) {
    archiveAction.buildDistributionAudience = buildDistributionAudience;
  }

  const attributes = {
    name,
    description: 'Created by eba-cli',
    isEnabled: true,
    isLockedForEditing: false,
    clean,
    containerFilePath,
    actions: [archiveAction],
  };

  // Start conditions — patternType is NOT a valid field, use only pattern + isPrefix
  if (branchStartCondition) attributes.branchStartCondition = branchStartCondition;
  if (tagStartCondition) attributes.tagStartCondition = tagStartCondition;
  if (pullRequestStartCondition) attributes.pullRequestStartCondition = pullRequestStartCondition;
  if (manualBranchStartCondition) attributes.manualBranchStartCondition = manualBranchStartCondition;


  const body = {
    data: {
      type: 'ciWorkflows',
      attributes,
      relationships: {
        product: { data: { type: 'ciProducts', id: productId } },
        repository: { data: { type: 'scmRepositories', id: repositoryId } },
        xcodeVersion: { data: { type: 'ciXcodeVersions', id: xcodeVersionId } },
        macOsVersion: { data: { type: 'ciMacOsVersions', id: macOsVersionId } },
      },
    },
  };

  const result = await ascApiRequest('/v1/ciWorkflows', { method: 'POST', body, jwt });
  return result?.data ?? null;
}





