import { prisma } from "@/lib/prisma";

export type E2eDeviceListResult =
  | {
      ok: true;
      payload: {
        data: Array<{
          deviceId: string;
          label: string | null;
          createdAt: Date;
          lastSeenAt: Date;
          identityKey: string | null;
        }>;
      };
    }
  | { ok: false; code: "NOT_FOUND"; status: 404 };

export class E2eDeviceListService {
  async listDevices(params: {
    userId: string;
  }): Promise<E2eDeviceListResult> {
    const { userId } = params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    const devices = await prisma.userDevice.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        label: true,
        createdAt: true,
        lastSeenAt: true,
        identityKey: {
          select: { publicKey: true },
        },
      },
    });

    return {
      ok: true,
      payload: {
        data: devices.map((device) => ({
          deviceId: device.id,
          label: device.label,
          createdAt: device.createdAt,
          lastSeenAt: device.lastSeenAt,
          identityKey: device.identityKey?.publicKey ?? null,
        })),
      },
    };
  }
}
