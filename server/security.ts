import { createCipheriv, createDecipheriv, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { ENV } from "./_core/env";

const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

function derivePassword(password: string, salt: Buffer, length: number, n = SCRYPT_N, r = SCRYPT_R, p = SCRYPT_P) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, length, { N: n, r, p, maxmem: 128 * 1024 * 1024 }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

function requireSessionSecret() {
  if (!ENV.cookieSecret || ENV.cookieSecret.length < 32) throw new Error("JWT_SECRET must be a strong server-side secret before local authentication can be used.");
  return ENV.cookieSecret;
}

function encryptionKey() {
  if (!ENV.credentialEncryptionKey) throw new Error("TMT_CREDENTIAL_ENCRYPTION_KEY is required before storing Delta credentials.");
  const source = ENV.credentialEncryptionKey.trim();
  const key = /^[a-f0-9]{64}$/i.test(source) ? Buffer.from(source, "hex") : Buffer.from(source, "base64");
  if (key.length !== 32) throw new Error("TMT_CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex characters or base64-encoded 32 bytes).");
  return key;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt, KEY_LENGTH);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, n, r, p, saltEncoded, expectedEncoded] = encoded.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !saltEncoded || !expectedEncoded) return false;
  const salt = Buffer.from(saltEncoded, "base64url");
  const expected = Buffer.from(expectedEncoded, "base64url");
  const derived = await derivePassword(password, salt, expected.length, Number(n), Number(r), Number(p));
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return createHmac("sha256", requireSessionSecret()).update(token).digest("hex");
}

export function encryptCredential(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function decryptCredential(record: { ciphertext: string; iv: string; tag: string }) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(record.iv, "base64"));
  decipher.setAuthTag(Buffer.from(record.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export function credentialFingerprint(apiKey: string) {
  return createHmac("sha256", requireSessionSecret()).update(apiKey).digest("hex").slice(0, 16);
}
