import crypto from "node:crypto";

type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyId: string;
  dekWrapped?: string;
  dekIv?: string;
  dekTag?: string;
};

const DEV_KEY_ID = "dev";

type Keyring = {
  activeKeyId: string;
  keys: Map<string, Buffer>;
};

const parseKeyMaterial = (value: string, label: string) => {
  const cleaned = value.trim();
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(cleaned)) {
    key = Buffer.from(cleaned, "hex");
  } else {
    key = Buffer.from(cleaned, "base64");
  }
  if (key.length !== 32) {
    throw new Error(`${label} must be 32 bytes (base64 or hex)`);
  }
  return key;
};

const resolveKeyring = (): Keyring => {
  const keyringEnv = process.env.ENCRYPTION_MASTER_KEYS;
  if (keyringEnv && keyringEnv.trim().length > 0) {
    const entries = keyringEnv
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const keys = new Map<string, Buffer>();
    for (const entry of entries) {
      const [keyId, material] = entry.split(":");
      if (!keyId || !material) {
        throw new Error("ENCRYPTION_MASTER_KEYS format must be keyId:base64, keyId:hex");
      }
      keys.set(keyId, parseKeyMaterial(material, `ENCRYPTION_MASTER_KEYS:${keyId}`));
    }
    const activeKeyId =
      process.env.ENCRYPTION_ACTIVE_KEY_ID ??
      entries[0].split(":")[0];
    if (!keys.has(activeKeyId)) {
      throw new Error("ENCRYPTION_ACTIVE_KEY_ID must exist in ENCRYPTION_MASTER_KEYS");
    }
    return { activeKeyId, keys };
  }

  const raw = process.env.ENCRYPTION_MASTER_KEY;
  if (raw && raw.trim().length > 0) {
    const keyId = process.env.ENCRYPTION_MASTER_KEY_ID ?? "v1";
    const key = parseKeyMaterial(raw, "ENCRYPTION_MASTER_KEY");
    return { activeKeyId: keyId, keys: new Map([[keyId, key]]) };
  }

  if (process.env.NODE_ENV !== "production") {
    const fallback = process.env.NEXTAUTH_SECRET ?? "dev-secret";
    const key = crypto.createHash("sha256").update(fallback).digest();
    return { activeKeyId: DEV_KEY_ID, keys: new Map([[DEV_KEY_ID, key]]) };
  }

  throw new Error("ENCRYPTION_MASTER_KEY or ENCRYPTION_MASTER_KEYS is required in production");
};

const resolveEncryptionKey = () => {
  const { activeKeyId, keys } = resolveKeyring();
  const key = keys.get(activeKeyId);
  if (!key) {
    throw new Error("Active encryption key is missing");
  }
  return { keyId: activeKeyId, key, keys };
};

export const encryptText = (plaintext: string): EncryptedPayload => {
  const { key, keyId } = resolveEncryptionKey();
  const dek = crypto.randomBytes(32);
  const contentIv = crypto.randomBytes(12);
  const contentCipher = crypto.createCipheriv("aes-256-gcm", dek, contentIv);
  const contentCiphertext = Buffer.concat([
    contentCipher.update(plaintext, "utf8"),
    contentCipher.final(),
  ]);
  const contentTag = contentCipher.getAuthTag();

  const dekIv = crypto.randomBytes(12);
  const dekCipher = crypto.createCipheriv("aes-256-gcm", key, dekIv);
  const dekWrapped = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekTag = dekCipher.getAuthTag();

  return {
    ciphertext: contentCiphertext.toString("base64"),
    iv: contentIv.toString("base64"),
    tag: contentTag.toString("base64"),
    keyId,
    dekWrapped: dekWrapped.toString("base64"),
    dekIv: dekIv.toString("base64"),
    dekTag: dekTag.toString("base64"),
  };
};

export const decryptText = (payload: {
  ciphertext: string;
  iv: string;
  tag: string;
  keyId?: string | null;
  dekWrapped?: string | null;
  dekIv?: string | null;
  dekTag?: string | null;
}): string | null => {
  const { keys, keyId: activeKeyId } = resolveEncryptionKey();
  const keyId = payload.keyId ?? activeKeyId;
  const key = keys.get(keyId);
  if (!key) {
    return null;
  }
  try {
    if (payload.dekWrapped && payload.dekIv && payload.dekTag) {
      const dekIv = Buffer.from(payload.dekIv, "base64");
      const dekTag = Buffer.from(payload.dekTag, "base64");
      const dekWrapped = Buffer.from(payload.dekWrapped, "base64");
      const dekDecipher = crypto.createDecipheriv("aes-256-gcm", key, dekIv);
      dekDecipher.setAuthTag(dekTag);
      const dek = Buffer.concat([
        dekDecipher.update(dekWrapped),
        dekDecipher.final(),
      ]);
      const iv = Buffer.from(payload.iv, "base64");
      const tag = Buffer.from(payload.tag, "base64");
      const ciphertext = Buffer.from(payload.ciphertext, "base64");
      const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return plaintext.toString("utf8");
    }

    const iv = Buffer.from(payload.iv, "base64");
    const tag = Buffer.from(payload.tag, "base64");
    const ciphertext = Buffer.from(payload.ciphertext, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
};
