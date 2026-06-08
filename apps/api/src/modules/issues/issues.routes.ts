import { ItemType, LedgerEntryType, RequestStatus, Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import type { AuthedRequest } from '../../types.js';
import { appendLedgerEntry, ensureSufficientStock } from '../inventory-ledger/inventory-ledger.service.js';
import { evaluateLimit } from '../limits/limits.service.js';
import { writeAuditLog } from '../audit/audit.service.js';

const issueLineSchema = z.object({
  itemId: z.string().uuid(),
  quantityIssued: z.number().int().positive(),
  dueDate: z.string().datetime().optional()
});

const createIssueSchema = z.object({
  requestId: z.string().uuid().optional(),
  issuedToId: z.string().uuid().optional(),
  notes: z.string().trim().optional(),
  overrideReason: z.string().trim().min(3).optional(),
  lines: z.array(issueLineSchema).min(1).optional()
});

const sumByItemId = <T extends { itemId: string }>(
  rows: T[],
  getQuantity: (row: T) => number
) => {
  const totals = new Map<string, number>();

  for (const row of rows) {
    totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + getQuantity(row));
  }

  return totals;
};

export const issuesRouter = Router();

issuesRouter.post('/', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.user.role === 'TEACHER') {
    return res.status(403).json({ error: 'Teachers cannot issue stock' });
  }

  const parsed = createIssueSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const requestId = parsed.data.requestId;
  let lines = parsed.data.lines ?? [];
  let issuedToId = parsed.data.issuedToId;
  let requestStatusAfterIssue: RequestStatus | undefined;

  if (requestId) {
    const requestEntity = await prisma.request.findUnique({
      where: { id: requestId },
      include: { lines: true }
    });

    if (!requestEntity) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (!([RequestStatus.APPROVED, RequestStatus.PARTIALLY_ISSUED] as RequestStatus[]).includes(requestEntity.status)) {
      return res.status(409).json({
        error: `Request must be APPROVED or PARTIALLY_ISSUED before issue, got ${requestEntity.status}`
      });
    }

    issuedToId = requestEntity.requesterId;

    const issuedLines = await prisma.issueLine.findMany({
      where: {
        issue: {
          requestId
        }
      },
      select: {
        itemId: true,
        quantityIssued: true
      }
    });

    const requestedByItem = sumByItemId(requestEntity.lines, (line) => line.quantityRequested);
    const alreadyIssuedByItem = sumByItemId(issuedLines, (line) => line.quantityIssued);

    const remainingByItem = new Map<string, number>();
    for (const [itemId, requestedQty] of requestedByItem.entries()) {
      remainingByItem.set(itemId, requestedQty - (alreadyIssuedByItem.get(itemId) ?? 0));
    }

    if (!lines.length) {
      lines = [...remainingByItem.entries()]
        .filter(([, qty]) => qty > 0)
        .map(([itemId, quantityIssued]) => ({ itemId, quantityIssued }));
    }

    if (!lines.length) {
      return res.status(409).json({ error: 'No remaining quantity pending for this request' });
    }

    const issueByItem = sumByItemId(lines, (line) => line.quantityIssued);
    for (const [itemId, issueQty] of issueByItem.entries()) {
      const remaining = remainingByItem.get(itemId);
      if (remaining === undefined) {
        return res.status(409).json({ error: `Item ${itemId} does not belong to request ${requestId}` });
      }

      if (issueQty > remaining) {
        return res.status(409).json({
          error: `Issue quantity ${issueQty} exceeds remaining request quantity ${remaining} for item ${itemId}`
        });
      }
    }

    const remainingAfterThisIssue = [...remainingByItem.entries()].map(([itemId, remainingQty]) => ({
      itemId,
      remainingQty: remainingQty - (issueByItem.get(itemId) ?? 0)
    }));

    requestStatusAfterIssue = remainingAfterThisIssue.every((row) => row.remainingQty <= 0)
      ? RequestStatus.FULLY_ISSUED
      : RequestStatus.PARTIALLY_ISSUED;
  } else if (!lines.length) {
    return res.status(400).json({ error: 'lines are required for direct issues' });
  }

  if (!issuedToId) {
    return res.status(400).json({ error: 'issuedToId is required for direct issues' });
  }

  let hasLimitOverride = false;

  for (const line of lines) {
    try {
      await ensureSufficientStock(line.itemId, line.quantityIssued);
    } catch (error) {
      return res.status(409).json({
        error: error instanceof Error ? error.message : 'Insufficient stock at issue time'
      });
    }

    const limitCheck = await evaluateLimit(issuedToId, line.itemId, line.quantityIssued);
    if (!limitCheck.allowed) {
      if (req.user.role !== Role.ADMIN || !parsed.data.overrideReason) {
        return res.status(409).json({
          error: limitCheck.message,
          requiresAdminOverrideReason: true,
          ruleId: limitCheck.matchedRuleId,
          remainingQty: limitCheck.remainingQty
        });
      }

      hasLimitOverride = true;
    }

    const item = await prisma.item.findUnique({ where: { id: line.itemId } });
    if (!item) {
      return res.status(404).json({ error: `Item ${line.itemId} not found` });
    }

    if (item.type === ItemType.RETURNABLE && !line.dueDate) {
      return res.status(400).json({ error: `Due date is required for returnable item ${item.name}` });
    }
  }

  const issue = await prisma.$transaction(async (tx) => {
    const createdIssue = await tx.issue.create({
      data: {
        requestId,
        issuedToId,
        issuedById: req.user!.id,
        notes: hasLimitOverride
          ? `${parsed.data.notes ?? ''}${parsed.data.notes ? ' | ' : ''}override: ${parsed.data.overrideReason}`
          : parsed.data.notes,
        lines: {
          create: lines.map((line) => ({
            itemId: line.itemId,
            quantityIssued: line.quantityIssued,
            dueDate: line.dueDate ? new Date(line.dueDate) : null
          }))
        }
      },
      include: { lines: true }
    });

    for (const line of lines) {
      await appendLedgerEntry(
        {
          itemId: line.itemId,
          type: LedgerEntryType.ISSUE_OUT,
          quantityDelta: -Math.trunc(line.quantityIssued),
          referenceType: 'ISSUE',
          referenceId: createdIssue.id,
          createdById: req.user!.id,
          notes: parsed.data.notes
        },
        tx
      );
    }

    if (requestId && requestStatusAfterIssue) {
      await tx.request.update({
        where: { id: requestId },
        data: { status: requestStatusAfterIssue }
      });
    }

    return createdIssue;
  });

  await writeAuditLog({
    actorId: req.user.id,
    action: hasLimitOverride ? 'ISSUE_CREATED_WITH_OVERRIDE' : 'ISSUE_CREATED',
    entityType: 'Issue',
    entityId: issue.id,
    payload: {
      issue,
      requestStatusAfterIssue,
      overrideReason: hasLimitOverride ? parsed.data.overrideReason : undefined
    },
    ipAddress: req.ip,
    requestId
  });

  return res.status(201).json(issue);
});

issuesRouter.get('/', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const where = req.user.role === 'TEACHER' ? { issuedToId: req.user.id } : {};

  const issues = await prisma.issue.findMany({
    where,
    include: {
      issuedTo: true,
      issuedBy: true,
      lines: {
        include: {
          item: true
        }
      },
      returns: true
    },
    orderBy: { issuedAt: 'desc' }
  });

  const now = new Date();
  const withOverdue = issues.map((issue) => ({
    ...issue,
    lines: issue.lines.map((line) => ({
      ...line,
      isOverdue: Boolean(line.dueDate && line.quantityReturned < line.quantityIssued && line.dueDate < now)
    }))
  }));

  return res.json(withOverdue);
});
