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

const ASC_API_BASE = 'https://api.appstoreconnect.apple.com';

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

const CREDS_FILE = join(homedir(), '.eba-cli', 'asc-api-key.json');

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

// ─── HTTP client ──────────────────────────────────────────────────────────────

async function ascApiRequest(path, { method = 'GET', body, jwt } = {}) {
  const res = await fetch(`${ASC_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text().catch(() => '');

  if (!res.ok) {
    const errs = data?.errors?.map(e => e.detail ?? e.title).join('; ') ?? JSON.stringify(data);
    throw new Error(`ASC API ${res.status}: ${errs}`);
  }

  return data;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export async function getCiProduct(jwt, ascAppId) {
  const data = await ascApiRequest(
    `/v1/ciProducts?filter[app]=${ascAppId}&limit=1`,
    { jwt }
  );
  return data?.data?.[0] ?? null;
}

export async function getCiProductRepositories(jwt, productId) {
  const data = await ascApiRequest(
    `/v1/ciProducts/${productId}/additionalRepositories`,
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

export async function createCiWorkflow(jwt, {
  productId,
  repositoryId,
  xcodeVersionId,
  macOsVersionId,
  name,
  scheme,
  platform = 'IOS',
  clean = true,
  branchStartCondition = null,
  tagStartCondition = null,
  pullRequestStartCondition = null,
  manualBranchStartCondition = null,
  postTestFlightInternalTesting = false,
}) {
  const attributes = {
    name,
    description: `Created by eba-cli`,
    isEnabled: true,
    isLockedForEditing: false,
    clean,
    actions: [
      {
        name: 'Archive',
        actionType: 'BUILD_XCODE_CLOUD',
        scheme,
        platform,
        isRequiredToPass: true,
      },
    ],
  };

  if (branchStartCondition) attributes.branchStartCondition = branchStartCondition;
  if (tagStartCondition) attributes.tagStartCondition = tagStartCondition;
  if (pullRequestStartCondition) attributes.pullRequestStartCondition = pullRequestStartCondition;
  if (manualBranchStartCondition) attributes.manualBranchStartCondition = manualBranchStartCondition;

  if (postTestFlightInternalTesting) {
    attributes.actions.push({
      name: 'TestFlight Internal Testing',
      actionType: 'DISTRIBUTE_TO_TESTFLIGHT',
      isRequiredToPass: false,
      destination: 'INTERNAL',
    });
  }

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



