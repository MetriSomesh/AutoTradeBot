import { DeltaApiError, type DeltaCredentialContext } from "./delta";
import { getDeltaCredential } from "./db";
import { decryptCredential } from "./security";

export async function getUserDeltaCredentials(ownerId: number): Promise<DeltaCredentialContext> {
  const credential = await getDeltaCredential(ownerId);
  if (!credential) throw new DeltaApiError("Connect a Delta API key in Account Settings before using account-specific Delta actions.");
  return {
    apiKey: decryptCredential({ ciphertext: credential.apiKeyCiphertext, iv: credential.apiKeyIv, tag: credential.apiKeyTag }),
    apiSecret: decryptCredential({ ciphertext: credential.apiSecretCiphertext, iv: credential.apiSecretIv, tag: credential.apiSecretTag }),
    baseUrl: credential.baseUrl,
    mode: credential.environment,
  };
}

export async function getUserDeltaCredentialStatus(ownerId: number) {
  const credential = await getDeltaCredential(ownerId);
  if (!credential) return { configured: false, environment: null, baseUrl: null, keyFingerprint: null, updatedAt: null };
  return {
    configured: true,
    environment: credential.environment,
    baseUrl: credential.baseUrl,
    keyFingerprint: credential.keyFingerprint,
    updatedAt: credential.updatedAt,
  };
}
