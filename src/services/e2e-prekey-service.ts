import { prisma } from "@/lib/prisma";

export type E2ePreKeyUploadResult =
  | {
      ok: true;
      payload: { data: { createdOneTime: number; signedPreKeyId: string } };
    }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN"; status: 404 | 403 };

export class E2ePreKeyService {
  async uploadPreKeys(params: {
    userId: string;
    deviceId: string;
    signedPreKey: {
      keyId: string;
      publicKey: string;
      signature: string;
      expiresAt?: Date | null;
    };
    oneTimePreKeys: Array<{ keyId: string; publicKey: string }>;
  }): Promise<E2ePreKeyUploadResult> {
    const { userId, deviceId, signedPreKey, oneTimePreKeys } = params;

    const device = await prisma.userDevice.findUnique({
      where: { id: deviceId },
      select: { userId: true },
    });
    if (!device) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }
    if (device.userId !== userId) {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    const result = await prisma.$transaction(async (tx) => {
      const signed = await tx.userSignedPreKey.upsert({
        where: {
          deviceId_keyId: { deviceId, keyId: signedPreKey.keyId },
        },
        create: {
          deviceId,
          keyId: signedPreKey.keyId,
          publicKey: signedPreKey.publicKey,
          signature: signedPreKey.signature,
          expiresAt: signedPreKey.expiresAt ?? null,
        },
        update: {
          publicKey: signedPreKey.publicKey,
          signature: signedPreKey.signature,
          expiresAt: signedPreKey.expiresAt ?? null,
        },
        select: { id: true },
      });

      const created = await tx.userOneTimePreKey.createMany({
        data: oneTimePreKeys.map((item) => ({
          deviceId,
          keyId: item.keyId,
          publicKey: item.publicKey,
        })),
        skipDuplicates: true,
      });

      await tx.userDevice.update({
        where: { id: deviceId },
        data: { lastSeenAt: new Date() },
      });

      return { signedPreKeyId: signed.id, createdOneTime: created.count };
    });

    return { ok: true, payload: { data: result } };
  }
}
