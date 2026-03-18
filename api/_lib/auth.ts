import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { UserProfile, UserTier } from '../../src/types';
import { loadJsonFile, saveJsonFile } from './blobStore.js';

const USERS_PATH = '_meta/users.json';
const SESSION_COOKIE_NAME = 'dj_mix_dash_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

interface StoredAccount {
  profile: UserProfile;
  passwordHash: string;
  passwordSalt: string;
  signedOutAt?: number;
}

interface SessionPayload {
  uid: string;
  exp: number;
  iat: number;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getSessionSecret() {
  const secret = process.env.APP_SESSION_SECRET || process.env.BLOB_READ_WRITE_TOKEN;
  if (!secret) {
    throw new Error('Missing APP_SESSION_SECRET or BLOB_READ_WRITE_TOKEN');
  }
  return secret;
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex');
}

function signTokenPayload(payload: string) {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function parseCookie(request: Request, name: string) {
  const headers = (request as Request & { headers?: { get?: (name: string) => string | null } | Record<string, string | string[] | undefined> }).headers;
  const cookieHeader = typeof headers?.get === 'function'
    ? headers.get('cookie')
    : Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === 'cookie')?.[1];
  const resolvedCookieHeader = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;
  if (!resolvedCookieHeader) return null;

  for (const segment of resolvedCookieHeader.split(';')) {
    const [rawKey, ...rest] = segment.trim().split('=');
    if (rawKey === name) {
      return rest.join('=');
    }
  }

  return null;
}

async function readAccounts() {
  return loadJsonFile<StoredAccount[]>(USERS_PATH, []);
}

async function writeAccounts(accounts: StoredAccount[]) {
  await saveJsonFile(USERS_PATH, accounts);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function authError(code: string, message: string, status = 400) {
  return Response.json({ code, error: message }, { status });
}

export async function createAccount(input: { email: string; password: string; djName: string; tier: UserTier }) {
  const email = normalizeEmail(input.email);
  const djName = input.djName.trim();

  if (!isValidEmail(email)) {
    throw { code: 'auth/invalid-email', message: 'Invalid email address', status: 400 };
  }

  if (input.password.length < 6) {
    throw { code: 'auth/weak-password', message: 'Password must be at least 6 characters', status: 400 };
  }

  if (!djName) {
    throw { code: 'auth/invalid-dj-name', message: 'DJ name is required', status: 400 };
  }

  const accounts = await readAccounts();
  if (accounts.some(account => account.profile.email.toLowerCase() === email)) {
    throw { code: 'auth/email-already-in-use', message: 'Email already in use', status: 409 };
  }

  const salt = randomBytes(16).toString('hex');
  const profile: UserProfile = {
    uid: crypto.randomUUID(),
    email,
    djName,
    tier: input.tier,
    createdAt: Date.now(),
  };

  const account: StoredAccount = {
    profile,
    passwordSalt: salt,
    passwordHash: hashPassword(input.password, salt),
  };

  accounts.push(account);
  await writeAccounts(accounts);

  return profile;
}

export async function validateCredentials(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const accounts = await readAccounts();
  const account = accounts.find(entry => entry.profile.email.toLowerCase() === normalizedEmail);
  if (!account) {
    throw { code: 'auth/user-not-found', message: 'Invalid email or password', status: 401 };
  }

  const actualHash = hashPassword(password, account.passwordSalt);
  const expectedBuffer = Buffer.from(account.passwordHash, 'hex');
  const actualBuffer = Buffer.from(actualHash, 'hex');
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw { code: 'auth/wrong-password', message: 'Invalid email or password', status: 401 };
  }

  return account.profile;
}

export function buildSessionCookie(profile: UserProfile) {
  const payload = Buffer.from(JSON.stringify({
    uid: profile.uid,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    iat: Date.now(),
  } satisfies SessionPayload)).toString('base64url');
  const signature = signTokenPayload(payload);
  return `${SESSION_COOKIE_NAME}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function buildClearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

export async function getSessionProfile(request: Request): Promise<UserProfile | null> {
  const token = parseCookie(request, SESSION_COOKIE_NAME);
  if (!token) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expectedSignature = signTokenPayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionPayload;
    if (decoded.exp <= Date.now()) {
      return null;
    }

    const accounts = await readAccounts();
    const account = accounts.find(entry => entry.profile.uid === decoded.uid);
    if (!account) return null;

    // Reject tokens issued before the last signout
    if (account.signedOutAt && decoded.iat < account.signedOutAt) {
      return null;
    }

    return account.profile;
  } catch {
    return null;
  }
}

export async function invalidateAllSessions(uid: string): Promise<void> {
  const accounts = await readAccounts();
  const index = accounts.findIndex(account => account.profile.uid === uid);
  if (index === -1) return;
  accounts[index] = { ...accounts[index], signedOutAt: Date.now() };
  await writeAccounts(accounts);
}

export async function updateUserTier(uid: string, tier: UserTier) {
  const accounts = await readAccounts();
  const index = accounts.findIndex(account => account.profile.uid === uid);
  if (index === -1) return null;

  const updatedProfile = { ...accounts[index].profile, tier };
  accounts[index] = { ...accounts[index], profile: updatedProfile };
  await writeAccounts(accounts);

  return updatedProfile;
}