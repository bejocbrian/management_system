import { Router } from 'express';
import { z } from 'zod';
import { ItemType, LedgerEntryType } from '@prisma/client';
import { prisma } from '../../db.js';
import type { AuthedRequest } from '../../types.js';
import { writeAuditLog } from '../audit/audit.service.js';
import { appendLedgerEntry } from '../inventory-ledger/inventory-ledger.service.js';

const itemSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  unit: z.string().trim().min(1),
  type: z.nativeEnum(ItemType),
  lowStockThreshold: z.number().int().min(0).default(0),
  isActive: z.boolean().optional(),
  initialStock: z.number().int().min(0).default(0)
});

export const itemsRouter = Router();

itemsRouter.get('/', async (_req, res) => {
  const items = await prisma.item.findMany({ orderBy: { name: 'asc' } });
  return res.json(items);
});

itemsRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = itemSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { initialStock, ...itemData } = parsed.data;

  const item = await prisma.item.create({ data: itemData });

  // Create initial stock ledger entry if initialStock > 0
  if (initialStock > 0) {
    await appendLedgerEntry({
      itemId: item.id,
      type: LedgerEntryType.OPENING_STOCK,
      quantityDelta: initialStock,
      referenceType: 'ITEM_CREATION',
      createdById: req.user!.id,
      notes: `Initial stock set during item creation`
    });
  }

  await writeAuditLog({
    actorId: req.user?.id,
    action: 'ITEM_CREATED',
    entityType: 'Item',
    entityId: item.id,
    payload: { ...item, initialStock },
    ipAddress: req.ip
  });

  return res.status(201).json(item);
});

itemsRouter.patch('/:itemId', async (req: AuthedRequest, res) => {
  const parsed = itemSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const item = await prisma.item.update({
    where: { id: req.params.itemId },
    data: parsed.data
  });

  await writeAuditLog({
    actorId: req.user?.id,
    action: 'ITEM_UPDATED',
    entityType: 'Item',
    entityId: item.id,
    payload: parsed.data,
    ipAddress: req.ip
  });

  return res.json(item);
});
