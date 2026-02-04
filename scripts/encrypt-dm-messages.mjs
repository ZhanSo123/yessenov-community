import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const parseKeyMaterial = (value, label) => {
  const cleaned = value.trim();
  let key;
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

const resolveKey = () => {
  const keyringEnv = process.env.ENCRYPTION_MASTER_KEYS;
  if (keyringEnv && keyringEnv.trim().length > 0) {
    const entries = keyringEnv
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const keys = new Map();
    for (const entry of entries) {
      const [keyId, material] = entry.split(":");
      if (!keyId || !material) {
        throw new Error("ENCRYPTION_MASTER_KEYS format must be keyId:base64, keyId:hex");
      }
      keys.set(keyId, parseKeyMaterial(material, `ENCRYPTION_MASTER_KEYS:${keyId}`));
    }
    const activeKeyId = process.env.ENCRYPTION_ACTIVE_KEY_ID ?? entries[0].split(":")[0];
    const key = keys.get(activeKeyId);
    if (!key) {
      throw new Error("ENCRYPTION_ACTIVE_KEY_ID must exist in ENCRYPTION_MASTER_KEYS");
    }
    return { key, keyId: activeKeyId };
  }

  const raw = process.env.ENCRYPTION_MASTER_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_MASTER_KEY is required");
  }
  const keyId = process.env.ENCRYPTION_MASTER_KEY_ID ?? "v1";
  const key = parseKeyMaterial(raw, "ENCRYPTION_MASTER_KEY");
  return { key, keyId };
};

const encryptText = (plaintext, key) => {
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
    dekWrapped: dekWrapped.toString("base64"),
    dekIv: dekIv.toString("base64"),
    dekTag: dekTag.toString("base64"),
  };
};

const batchSize = Number(process.env.BATCH_SIZE ?? 100);

const run = async () => {
  const { key, keyId } = resolveKey();

  let total = 0;
  while (true) {
    const rows = await prisma.message.findMany({
      where: {
        content: { not: null },
        contentCiphertext: null,
      },
      take: batchSize,
      select: { id: true, content: true },
    });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const encrypted = encryptText(row.content ?? "", key);
      await prisma.message.update({
        where: { id: row.id },
        data: {
          content: null,
          contentCiphertext: encrypted.ciphertext,
          contentIv: encrypted.iv,
          contentTag: encrypted.tag,
          contentKeyId: keyId,
          contentDekWrapped: encrypted.dekWrapped,
          contentDekIv: encrypted.dekIv,
          contentDekTag: encrypted.dekTag,
        },
      });
      total += 1;
    }
  }

  console.log(`Encrypted ${total} messages.`);
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
