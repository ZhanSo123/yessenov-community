import { prisma } from "@/lib/prisma";
import { buildSafetyNumber } from "@/lib/crypto/fingerprint";

export type E2eSafetyResult =
  | {
      ok: true;
      payload: {
        data: {
          safetyNumber: string;
          deviceId: string;
          peerDeviceId: string;
        };
      };
    }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN"; status: 404 | 403 };

export class E2eSafetyService {
  async getSafety(params: {
    userId: string;
    deviceId: string;
    peerDeviceId: string;
  }): Promise<E2eSafetyResult> {
    const { userId, deviceId, peerDeviceId } = params;

    const device = await prisma.userDevice.findUnique({
      where: { id: deviceId },
      select: {
        userId: true,
        identityKey: { select: { publicKey: true } },
      },
    });
    if (!device || !device.identityKey) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }
    if (device.userId !== userId) {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    const peer = await prisma.userDevice.findUnique({
      where: { id: peerDeviceId },
      select: { identityKey: { select: { publicKey: true } } },
    });
    if (!peer || !peer.identityKey) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    const safetyNumber = buildSafetyNumber(
      device.identityKey.publicKey,
      peer.identityKey.publicKey
    );

    return {
      ok: true,
      payload: {
        data: { safetyNumber, deviceId, peerDeviceId },
      },
    };
  }
}
