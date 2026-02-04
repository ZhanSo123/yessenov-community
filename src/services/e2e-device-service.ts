import { prisma } from "@/lib/prisma";
import { createSecurityNotification } from "@/lib/notifications";

export type E2eDeviceRegisterResult =
  | { ok: true; payload: { data: { deviceId: string } } }
  | { ok: false; code: "BAD_REQUEST"; status: 400 };

export class E2eDeviceService {
  async registerDevice(params: {
    userId: string;
    deviceLabel?: string | null;
    identityKey: string;
  }): Promise<E2eDeviceRegisterResult> {
    const { userId, deviceLabel, identityKey } = params;

    if (!userId || !identityKey) {
      return { ok: false, code: "BAD_REQUEST", status: 400 };
    }

    const result = await prisma.$transaction(async (tx) => {
      const device = await tx.userDevice.create({
        data: {
          userId,
          label: deviceLabel?.trim() || null,
          lastSeenAt: new Date(),
        },
        select: { id: true },
      });

      await tx.userIdentityKey.create({
        data: {
          deviceId: device.id,
          publicKey: identityKey,
        },
      });

      return device.id;
    });

    await createSecurityNotification({ userId });

    return { ok: true, payload: { data: { deviceId: result } } };
  }
}
