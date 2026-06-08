import { Router } from 'express';
import { z } from 'zod';
import { LimitPeriod } from '@prisma/client';
import { prisma } from '../../db.js';
import type { AuthedRequest } from '../../types.js';
import { writeAuditLog } from '../audit/audit.service.js';

const createRuleSchema = z.object({
  name: z.string().trim().min(1),
  userId: z.string().uuid().nullable().optional(),
  itemId: z.string().uuid().nullable().optional(),
  maxQuantity: z.number().int().positive(),
  period: z.nativeEnum(LimitPeriod)
});

export const limitsRouter = Router();

limitsRouter.get('/', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const rules = await prisma.limitRule.findMany({
    where: { isActive: true },
    include: {
      user: true,
      item: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return res.json(rules);
});

limitsRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = createRuleSchema.safeParse(req.body);
  if (!parsed.success || !req.user) {
    return res.status(400).json({ error: parsed.success ? 'Unauthorized' : parsed.error.flatten() });
  }

  const rule = await prisma.limitRule.create({
    data: {
      ...parsed.data,
      userId: parsed.data.userId ?? null,
      itemId: parsed.data.itemId ?? null
    }
  });

  await writeAuditLog({
    actorId: req.user.id,
    action: 'LIMIT_RULE_CREATED',
    entityType: 'LimitRule',
    entityId: rule.id,
    payload: rule,
    ipAddress: req.ip
  });

  return res.status(201).json(rule);
});

limitsRouter.patch('/:ruleId/deactivate', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const rule = await prisma.limitRule.update({
    where: { id: req.params.ruleId },
    data: { isActive: false }
  });

  await writeAuditLog({
    actorId: req.user.id,
    action: 'LIMIT_RULE_DEACTIVATED',
    entityType: 'LimitRule',
    entityId: rule.id,
    ipAddress: req.ip
  });

  return res.json(rule);
});
