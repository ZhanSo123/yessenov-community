import { type Prisma } from "@prisma/client";

type AuditContext = {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
};

const getClientIp = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }

  return request.headers.get("x-real-ip");
};

export const getAuditContext = (request: Request): AuditContext => {
  const requestId =
    request.headers.get("x-request-id") ??
    request.headers.get("x-vercel-id") ??
    crypto.randomUUID();

  return {
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent"),
    requestId,
  };
};

export const createAuditLog = (
  tx: Prisma.TransactionClient,
  request: Request,
  data: Prisma.AuditLogCreateInput
) => {
  const context = getAuditContext(request);
  return tx.auditLog.create({
    data: {
      ...data,
      ...context,
    },
  });
};
