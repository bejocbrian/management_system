import { Router } from 'express';
import { z } from 'zod';
import { LedgerEntryType, Role } from '@prisma/client';
import { prisma } from '../../db.js';
import type { AuthedRequest } from '../../types.js';
import { appendLedgerEntry, getAvailableStockByItemId, getCurrentStock } from './inventory-ledger.service.js';
import { writeAuditLog } from '../audit/audit.service.js';

const adjustmentSchema = z.object({
  itemId: z.string().uuid(),
  quantityDelta: z.number().int().refine((value) => value !== 0),
  reason: z.string().trim().min(3),
  overrideReason: z.string().trim().min(3).optional()
});

export const inventoryRouter = Router();

inventoryRouter.get('/stock', async (_req, res) => {
  const stock = await getCurrentStock();
  return res.json(stock);
});

inventoryRouter.post('/adjustments', async (req: AuthedRequest, res) => {
  if (req.user?.role === 'TEACHER') {
    return res.status(403).json({ error: 'Teachers cannot create adjustments' });
  }

  const parsed = adjustmentSchema.safeParse(req.body);
  if (!parsed.success || !req.user) {
    return res.status(400).json({ error: parsed.success ? 'Unauthorized' : parsed.error.flatten() });
  }

  const { itemId, quantityDelta, reason, overrideReason } = parsed.data;

  const availableQty = await getAvailableStockByItemId(itemId);
  const wouldGoNegative = availableQty + quantityDelta < 0;

  if (wouldGoNegative && req.user.role !== Role.ADMIN) {
    return res.status(409).json({
      error: `Adjustment would result in negative stock. Available: ${availableQty}, requested delta: ${quantityDelta}`,
      requiresAdminOverride: true
    });
  }

  if (wouldGoNegative && req.user.role === Role.ADMIN && !overrideReason) {
    return res.status(409).json({
      error: 'Admin override reason is required for negative stock adjustments',
      requiresAdminOverrideReason: true
    });
  }

  const entry = await prisma.$transaction(async (tx) => {
    return appendLedgerEntry(
      {
        itemId,
        type: quantityDelta > 0 ? LedgerEntryType.ADJUSTMENT_IN : LedgerEntryType.ADJUSTMENT_OUT,
        quantityDelta,
        notes: wouldGoNegative ? `${reason} | override: ${overrideReason}` : reason,
        referenceType: 'MANUAL_ADJUSTMENT',
        createdById: req.user!.id
      },
      tx
    );
  });

  await writeAuditLog({
    actorId: req.user.id,
    action: wouldGoNegative ? 'STOCK_ADJUSTED_WITH_OVERRIDE' : 'STOCK_ADJUSTED',
    entityType: 'StockLedgerEntry',
    entityId: entry.id,
    payload: {
      entry,
      availableQtyBeforeAdjustment: availableQty,
      overrideReason: wouldGoNegative ? overrideReason : undefined
    },
    ipAddress: req.ip
  });

  return res.status(201).json(entry);
});
