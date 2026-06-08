import { Router } from 'express';
import { prisma } from '../../db.js';

export const auditRouter = Router();

auditRouter.get('/', async (_req, res) => {
  const logs = await prisma.auditLog.findMany({
    include: {
      actor: true
    },
    orderBy: { createdAt: 'desc' },
    take: 500
  });

  return res.json(logs);
});
