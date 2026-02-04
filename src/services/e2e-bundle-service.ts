import { prisma } from "@/lib/prisma";

export type E2eBundleResult =
  | {
      ok: true;
      payload: {
        data: {
          userId: string;
          deviceId: string;
          identityKey: string;
          signedPreKey: {
            keyId: string;
            publicKey: string;
            signature: string;
            expiresAt: Date | null;
          };
          oneTimePreKey: { keyId: string; publicKey: string } | null;
        };
      };
    }
  | { ok: false; code: "NOT_FOUND" | "NOT_READY"; status: 404 | 409 };

export class E2eBundleService {
  async getBundle(params: {
    userId: string;
    deviceId: string;
  }): Promise<E2eBundleResult> {
    const { userId, deviceId } = params;

    const device = await prisma.userDevice.findUnique({
      where: { id: deviceId },
      select: { userId: true },
    });
    if (!device || device.userId !== userId) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    const result = await prisma.$transaction(async (tx) => {
      const identity = await tx.userIdentityKey.findUnique({
        where: { deviceId },
        select: { publicKey: true },
      });
      const signed = await tx.userSignedPreKey.findFirst({
        where: { deviceId },
        orderBy: { createdAt: "desc" },
        select: {
          keyId: true,
          publicKey: true,
          signature: true,
          expiresAt: true,
        },
      });
      if (!identity || !signed) {
        return null;
      }

      const oneTime = await tx.userOneTimePreKey.findFirst({
        where: { deviceId, consumedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, keyId: true, publicKey: true },
      });
      let oneTimePayload: { keyId: string; publicKey: string } | null = null;
      if (oneTime) {
        await tx.userOneTimePreKey.update({
          where: { id: oneTime.id },
          data: { consumedAt: new Date() },
        });
        oneTimePayload = { keyId: oneTime.keyId, publicKey: oneTime.publicKey };
      }

      await tx.userDevice.update({
        where: { id: deviceId },
        data: { lastSeenAt: new Date() },
      });

      return {
        identityKey: identity.publicKey,
        signedPreKey: signed,
        oneTimePreKey: oneTimePayload,
      };
    });

    if (!result) {
      return { ok: false, code: "NOT_READY", status: 409 };
    }

    return {
      ok: true,
      payload: {
        data: {
          userId,
          deviceId,
          identityKey: result.identityKey,
          signedPreKey: result.signedPreKey,
          oneTimePreKey: result.oneTimePreKey,
        },
      },
    };
  }
}
