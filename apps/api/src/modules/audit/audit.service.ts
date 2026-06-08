import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

type AuditInput = {
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  payload?: Prisma.InputJsonValue;
  ipAddress?: string;
  requestId?: string;
};

export const writeAuditLog = async (input: AuditInput) => {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: input.payload,
      ipAddress: input.ipAddress,
      requestId: input.requestId
    }
  });
};
