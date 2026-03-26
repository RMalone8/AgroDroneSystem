// ── Password hashing ─────────────────────────────────────────────────────────
// Uses Web Crypto PBKDF2 (built into Cloudflare Workers — no npm deps needed)

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(password, salt);
  const hash = await crypto.subtle.exportKey('raw', key);
  return `${b64(salt)}:${b64(new Uint8Array(hash))}`;
}

export async function verifyPassword(password, stored) {
  const [saltB64, hashB64] = stored.split(':');
  const salt = unb64(saltB64);
  const key = await deriveKey(password, salt);
  const hash = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  return timingSafeEqual(hash, unb64(hashB64));
}

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    true,
    ['sign'],
  );
}

// Constant-time byte comparison to prevent timing attacks
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ── JWT (HS256 via Web Crypto HMAC-SHA-256) ──────────────────────────────────

export async function signJWT(payload, secret, ttlSeconds = 86_400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = { ...payload, iat: now, exp: now + ttlSeconds };

  const headerB64 = urlB64(JSON.stringify(header));
  const payloadB64 = urlB64(JSON.stringify(claims));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${urlB64Raw(new Uint8Array(sig))}`;
}

export async function verifyJWT(token, secret) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const [headerB64, payloadB64, sigB64] = parts;
    const key = await importHmacKey(secret);
    const signingInput = `${headerB64}.${payloadB64}`;
    const valid = await crypto.subtle.verify(
      'HMAC', key,
      fromUrlB64(sigB64),
      new TextEncoder().encode(signingInput),
    );
    if (!valid) return null;

    const claims = JSON.parse(new TextDecoder().decode(fromUrlB64(payloadB64)));
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify'],
  );
}

// ── User CRUD via Cloudflare KV ──────────────────────────────────────────────

// KV key: "user:{email}"  →  { userId, email, passwordHash, createdAt }

export async function createUser(kv, { email, passwordHash, userId, role = 'client' }) {
  const existing = await kv.get(`user:${email}`);
  if (existing) throw new Error('EMAIL_TAKEN');
  await kv.put(`user:${email}`, JSON.stringify({
    userId,
    email,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
  }));
}

export async function getUserByEmail(kv, email) {
  const raw = await kv.get(`user:${email}`);
  return raw ? JSON.parse(raw) : null;
}

export async function listAllUsers(kv) {
  const list = await kv.list({ prefix: 'user:' });
  const users = [];
  for (const key of list.keys) {
    const raw = await kv.get(key.name);
    if (!raw) continue;
    const { userId, email, role, createdAt } = JSON.parse(raw);
    users.push({ userId, email, role: role ?? 'client', createdAt });
  }
  return users.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function deleteUser(usersKv, devicesKv, userId) {
  // Find and delete all device tokens owned by this user
  const deviceList = await devicesKv.list({ prefix: 'device:' });
  for (const key of deviceList.keys) {
    const raw = await devicesKv.get(key.name);
    if (!raw) continue;
    if (JSON.parse(raw).userId === userId) {
      await devicesKv.delete(key.name);
    }
  }
  // Delete the user record (KV key is user:{email}, so scan to find it)
  const userList = await usersKv.list({ prefix: 'user:' });
  for (const key of userList.keys) {
    const raw = await usersKv.get(key.name);
    if (!raw) continue;
    if (JSON.parse(raw).userId === userId) {
      await usersKv.delete(key.name);
      return;
    }
  }
}

// ── Base64 helpers ────────────────────────────────────────────────────────────

function b64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function unb64(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

function urlB64(str) {
  return urlB64Raw(new TextEncoder().encode(str));
}

function urlB64Raw(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromUrlB64(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Uint8Array.from(atob(padded + pad), (c) => c.charCodeAt(0));
}

// ── Device token (long-lived credential for edge nodes) ──────────────────────
// KV key: "device:{deviceId}"  →  { deviceId, userId, tokenHash, createdAt }

export async function createDeviceToken(kv, { deviceId, userId }) {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const plainToken = Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('');
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plainToken));
  const tokenHash = b64(new Uint8Array(hashBuf));
  await kv.put(`device:${deviceId}`, JSON.stringify({
    deviceId,
    userId,
    tokenHash,
    createdAt: new Date().toISOString(),
  }));
  return plainToken;
}

export async function verifyDeviceToken(kv, deviceId, plainToken) {
  if (!deviceId || !plainToken) return null;
  const raw = await kv.get(`device:${deviceId}`);
  if (!raw) return null;
  const record = JSON.parse(raw);
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plainToken));
  const computed = b64(new Uint8Array(hashBuf));
  if (computed !== record.tokenHash) return null;
  return { userId: record.userId, deviceId };
}

export async function listDevicesForUser(kv, userId) {
  // KV list with prefix scan — returns all device records for a given user
  const list = await kv.list({ prefix: 'device:' });
  const devices = [];
  for (const key of list.keys) {
    const raw = await kv.get(key.name);
    if (!raw) continue;
    const record = JSON.parse(raw);
    if (record.userId === userId) {
      devices.push({ deviceId: record.deviceId, createdAt: record.createdAt });
    }
  }
  return devices;
}

export async function listAllDevices(kv) {
  // Returns every registered device with its owning userId — token is never returned
  const list = await kv.list({ prefix: 'device:' });
  const devices = [];
  for (const key of list.keys) {
    const raw = await kv.get(key.name);
    if (!raw) continue;
    const { deviceId, userId, createdAt } = JSON.parse(raw);
    devices.push({ deviceId, userId, createdAt });
  }
  return devices;
}

// ── Access token management (pre-issued tokens for account creation) ──────────
// KV key: "access_token:{value}"  →  { role, usedAt? }

export async function storeAccessToken(kv, token, role = 'client') {
  await kv.put(`access_token:${token}`, JSON.stringify({ role, createdAt: new Date().toISOString() }));
}

export async function validateAndConsumeAccessToken(kv, token, validEnvTokens, adminEnvTokens) {
  // Check env-var lists first (static dev tokens — multi-use)
  const envClients = (validEnvTokens ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  const envAdmins  = (adminEnvTokens ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  if (envAdmins.includes(token))  return 'admin';
  if (envClients.includes(token)) return 'client';

  // Check dynamic KV tokens (admin-issued, single-use)
  const raw = await kv.get(`access_token:${token}`);
  if (!raw) return null;
  const record = JSON.parse(raw);
  if (record.usedAt) return null; // already consumed
  // Mark as used
  await kv.put(`access_token:${token}`, JSON.stringify({ ...record, usedAt: new Date().toISOString() }));
  return record.role;
}

// ── Access token stub (future: sends via email) ───────────────────────────────

// eslint-disable-next-line no-unused-vars
export async function sendAccessTokenEmail(email, token) {
  // TODO: integrate email provider (SendGrid, Resend, etc.)
  console.log(`[STUB] Would send access token ${token} to ${email}`);
}
