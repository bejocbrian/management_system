import { IssueLineStatus, ItemType, LedgerEntryType, ReturnCondition } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import type { AuthedRequest } from '../../types.js';
import { appendLedgerEntry } from '../inventory-ledger/inventory-ledger.service.js';
import { writeAuditLog } from '../audit/audit.service.js';

const returnLineSchema = z.object({
  issueLineId: z.string().uuid(),
  quantity: z.number().int().positive(),
  condition: z.nativeEnum(ReturnCondition),
  note: z.string().trim().optional()
});

const createReturnSchema = z.object({
  issueId: z.string().uuid(),
  notes: z.string().trim().optional(),
  lines: z.array(returnLineSchema).min(1)
});

export const returnsRouter = Router();

returnsRouter.post('/', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = createReturnSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const issue = await prisma.issue.findUnique({
    where: { id: parsed.data.issueId },
    include: {
      lines: {
        include: {
          item: true
        }
      }
    }
  });

  if (!issue) {
    return res.status(404).json({ error: 'Issue not found' });
  }

  const lineIds = parsed.data.lines.map((line) => line.issueLineId);
  const uniqueLineIds = new Set(lineIds);
  if (uniqueLineIds.size !== lineIds.length) {
    return res.status(409).json({ error: 'Duplicate issueLineId found in return payload' });
  }

  const lineMap = new Map(issue.lines.map((line) => [line.id, line]));

  for (const line of parsed.data.lines) {
    const issueLine = lineMap.get(line.issueLineId);
    if (!issueLine) {
      return res.status(404).json({ error: `Issue line ${line.issueLineId} not found` });
    }

    if (issueLine.issueId !== issue.id) {
      return res.status(409).json({ error: `Issue line ${line.issueLineId} does not belong to issue ${issue.id}` });
    }

    if (issueLine.item.type !== ItemType.RETURNABLE) {
      return res.status(409).json({ error: `Item ${issueLine.item.name} is not returnable` });
    }

    if (line.condition !== ReturnCondition.GOOD && !line.note) {
      return res.status(409).json({
        error: `Reason note is required for ${line.condition.toLowerCase()} return on line ${line.issueLineId}`
      });
    }

    const pending = issueLine.quantityIssued - issueLine.quantityReturned;
    if (line.quantity > pending) {
      return res.status(409).json({
        error: `Return quantity ${line.quantity} exceeds pending quantity ${pending} for line ${line.issueLineId}`
      });
    }
  }

  const createdReturn = await prisma.$transaction(async (tx) => {
    const record = await tx.returnRecord.create({
      data: {
        issueId: issue.id,
        returnedById: issue.issuedToId,
        receivedById: req.user!.id,
        notes: parsed.data.notes,
        lines: {
          create: parsed.data.lines
        }
      },
      include: {
        lines: true
      }
    });

    for (const returnLine of parsed.data.lines) {
      const issueLine = lineMap.get(returnLine.issueLineId)!;
      const nextReturned = issueLine.quantityReturned + returnLine.quantity;
      const fullyResolved = nextReturned >= issueLine.quantityIssued;

      let nextStatus: IssueLineStatus = IssueLineStatus.PARTIAL_RETURNED;
      if (fullyResolved) {
        if (returnLine.condition === ReturnCondition.DAMAGED) {
          nextStatus = IssueLineStatus.DAMAGED;
        } else if (returnLine.condition === ReturnCondition.LOST) {
          nextStatus = IssueLineStatus.LOST;
        } else {
          nextStatus = IssueLineStatus.RETURNED;
        }
      }

      await tx.issueLine.update({
        where: { id: returnLine.issueLineId },
        data: {
          quantityReturned: nextReturned,
          status: nextStatus
        }
      });

      if (returnLine.condition === ReturnCondition.GOOD) {
        await appendLedgerEntry(
          {
            itemId: issueLine.itemId,
            type: LedgerEntryType.RETURN_IN,
            quantityDelta: returnLine.quantity,
            referenceType: 'RETURN',
            referenceId: record.id,
            createdById: req.user!.id,
            notes: returnLine.note
          },
          tx
        );
      } else {
        await appendLedgerEntry(
          {
            itemId: issueLine.itemId,
            type:
              returnLine.condition === ReturnCondition.DAMAGED
                ? LedgerEntryType.LOSS_DAMAGED
                : LedgerEntryType.LOSS_LOST,
            quantityDelta: 0,
            referenceType: 'RETURN_LOSS',
            referenceId: record.id,
            createdById: req.user!.id,
            notes: `${returnLine.condition} qty=${returnLine.quantity} reason=${returnLine.note}`
          },
          tx
        );
      }
    }

    return record;
  });

  await writeAuditLog({
    actorId: req.user.id,
    action: 'RETURN_PROCESSED',
    entityType: 'ReturnRecord',
    entityId: createdReturn.id,
    payload: createdReturn,
    ipAddress: req.ip
  });

  return res.status(201).json(createdReturn);
});

returnsRouter.get('/', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const returns = await prisma.returnRecord.findMany({
    include: {
      issue: true,
      returnedBy: true,
      receivedBy: true,
      lines: {
        include: {
          issueLine: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return res.json(returns);
});
