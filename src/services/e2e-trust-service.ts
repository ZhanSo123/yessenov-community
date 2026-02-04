import { prisma } from "@/lib/prisma";
import { hashIdentityKey } from "@/lib/crypto/fingerprint";

export type E2eTrustStatusResult =
  | {
      ok: true;
      payload: {
        data: {
          verified: boolean;
          mismatch: boolean;
          verifiedAt: Date | null;
        };
      };
    }
  | { ok: false; code: "NOT_FOUND"; status: 404 };

export type E2eTrustMarkResult =
  | { ok: true; payload: { data: { verifiedAt: Date } } }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN"; status: 404 | 403 };

export class E2eTrustService {
  async getStatus(params: {
    userId: string;
    peerDeviceId: string;
    peerIdentityKey: string;
  }): Promise<E2eTrustStatusResult> {
    const { userId, peerDeviceId, peerIdentityKey } = params;
    const device = await prisma.userDevice.findUnique({
      where: { id: peerDeviceId },
      select: { id: true },
    });
    if (!device) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    const trust = await prisma.e2eTrust.findUnique({
      where: { userId_peerDeviceId: { userId, peerDeviceId } },
      select: { peerIdentityKeyHash: true, verifiedAt: true, revokedAt: true },
    });

    const currentHash = hashIdentityKey(peerIdentityKey);
    if (!trust || trust.revokedAt) {
      return {
        ok: true,
        payload: {
          data: { verified: false, mismatch: false, verifiedAt: null },
        },
      };
    }

    const mismatch = trust.peerIdentityKeyHash !== currentHash;
    return {
      ok: true,
      payload: {
        data: {
          verified: !mismatch,
          mismatch,
          verifiedAt: mismatch ? null : trust.verifiedAt,
        },
      },
    };
  }

  async markTrusted(params: {
    userId: string;
    peerDeviceId: string;
    peerIdentityKey: string;
  }): Promise<E2eTrustMarkResult> {
    const { userId, peerDeviceId, peerIdentityKey } = params;

    const device = await prisma.userDevice.findUnique({
      where: { id: peerDeviceId },
      select: { id: true, userId: true },
    });
    if (!device) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }
    if (device.userId === userId) {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    const now = new Date();
    const trust = await prisma.e2eTrust.upsert({
      where: { userId_peerDeviceId: { userId, peerDeviceId } },
      create: {
        userId,
        peerDeviceId,
        peerIdentityKeyHash: hashIdentityKey(peerIdentityKey),
        verifiedAt: now,
        revokedAt: null,
      },
      update: {
        peerIdentityKeyHash: hashIdentityKey(peerIdentityKey),
        verifiedAt: now,
        revokedAt: null,
      },
      select: { verifiedAt: true },
    });

    return { ok: true, payload: { data: { verifiedAt: trust.verifiedAt } } };
  }
}
