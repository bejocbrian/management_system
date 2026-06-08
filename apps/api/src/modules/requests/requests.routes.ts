import { Router } from 'express';
import { ApprovalActionType, RequestStatus, Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import type { AuthedRequest } from '../../types.js';
import { ensureSufficientStock, appendLedgerEntry } from '../inventory-ledger/inventory-ledger.service.js';
import { evaluateLimit } from '../limits/limits.service.js';
import { writeAuditLog } from '../audit/audit.service.js';
import { LedgerEntryType } from '@prisma/client';

const createRequestSchema = z.object({
  notes: z.string().trim().optional(),
  lines: z.array(z.object({ itemId: z.string().uuid(), quantityRequested: z.number().int().positive() })).min(1)
});

const decisionSchema = z.object({
  approved: z.boolean(),
  notes: z.string().trim().optional(),
  overrideReason: z.string().trim().min(3).optional()
});

const aggregateLineQuantities = (lines: Array<{ itemId: string; quantityRequested: number }>) => {
  const totals = new Map<string, number>();

  for (const line of lines) {
    totals.set(line.itemId, (totals.get(line.itemId) ?? 0) + line.quantityRequested);
  }

  return [...totals.entries()].map(([itemId, quantityRequested]) => ({ itemId, quantityRequested }));
};

export const requestsRouter = Router();

requestsRouter.post('/', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.user.role !== Role.TEACHER) {
    return res.status(403).json({ error: 'Only teachers can submit requests' });
  }

  const parsed = createRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const requesterId = req.user.id;
  const requestLines = aggregateLineQuantities(parsed.data.lines);

  for (const line of requestLines) {
    try {
      await ensureSufficientStock(line.itemId, line.quantityRequested);
    } catch (error) {
      return res.status(409).json({ error: error instanceof Error ? error.message : 'Stock validation failed' });
    }

    const limitEvaluation = await evaluateLimit(requesterId, line.itemId, line.quantityRequested);
    if (!limitEvaluation.allowed) {
      return res.status(409).json({
        error: limitEvaluation.message,
        ruleId: limitEvaluation.matchedRuleId,
        remainingQty: limitEvaluation.remainingQty
      });
    }
  }

  const requestEntity = await prisma.request.create({
    data: {
      requesterId,
      notes: parsed.data.notes,
      status: RequestStatus.SUBMITTED,
      lines: {
        create: requestLines
      }
    },
    include: {
      lines: true
    }
  });

  await writeAuditLog({
    actorId: requesterId,
    action: 'REQUEST_SUBMITTED',
    entityType: 'Request',
    entityId: requestEntity.id,
    payload: requestEntity,
    ipAddress: req.ip,
    requestId: requestEntity.id
  });

  return res.status(201).json(requestEntity);
});

requestsRouter.get('/', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const where = req.user.role === Role.TEACHER ? { requesterId: req.user.id } : {};

  const requests = await prisma.request.findMany({
    where,
    include: {
      requester: true,
      lines: { include: { item: true } },
      approvals: true,
      issues: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return res.json(requests);
});

requestsRouter.post('/:requestId/decision', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.user.role === Role.TEACHER) {
    return res.status(403).json({ error: 'Teachers cannot approve or reject requests' });
  }

  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const requestEntity = await prisma.request.findUnique({
    where: { id: req.params.requestId },
    include: { lines: true }
  });

  if (!requestEntity) {
    return res.status(404).json({ error: 'Request not found' });
  }

  if (requestEntity.status !== RequestStatus.SUBMITTED) {
    return res.status(409).json({ error: `Cannot decide a request in ${requestEntity.status} status` });
  }

  if (!parsed.data.approved) {
    const [updated] = await prisma.$transaction([
      prisma.request.update({
        where: { id: requestEntity.id },
        data: {
          status: RequestStatus.REJECTED,
          notes: parsed.data.notes ?? requestEntity.notes
        }
      }),
      prisma.approvalAction.create({
        data: {
          actorId: req.user.id,
          requestId: requestEntity.id,
          action: ApprovalActionType.REJECTED,
          notes: parsed.data.notes
        }
      })
    ]);

    await writeAuditLog({
      actorId: req.user.id,
      action: 'REQUEST_REJECTED',
      entityType: 'Request',
      entityId: requestEntity.id,
      payload: parsed.data,
      ipAddress: req.ip,
      requestId: requestEntity.id
    });

    return res.json(updated);
  }

  let approvalType: ApprovalActionType = ApprovalActionType.APPROVED;
  for (const line of requestEntity.lines) {
    try {
      await ensureSufficientStock(line.itemId, line.quantityRequested);
    } catch (error) {
      return res.status(409).json({ error: error instanceof Error ? error.message : 'Stock validation failed at approval' });
    }

    const limitEvaluation = await evaluateLimit(requestEntity.requesterId, line.itemId, line.quantityRequested);
    if (!limitEvaluation.allowed) {
      if (req.user.role !== Role.ADMIN || !parsed.data.overrideReason) {
        return res.status(409).json({
          error: limitEvaluation.message,
          requiresAdminOverrideReason: true,
          ruleId: limitEvaluation.matchedRuleId,
          remainingQty: limitEvaluation.remainingQty
        });
      }

      approvalType = ApprovalActionType.OVERRIDE_APPROVED;
    }
  }

  const [updated] = await prisma.$transaction([
    prisma.request.update({
      where: { id: requestEntity.id },
      data: {
        status: RequestStatus.APPROVED,
        notes: parsed.data.notes ?? requestEntity.notes
      }
    }),
    prisma.approvalAction.create({
      data: {
        actorId: req.user!.id,
        requestId: requestEntity.id,
        action: approvalType,
        notes: parsed.data.overrideReason ?? parsed.data.notes
      }
    })
  ]);

  await writeAuditLog({
    actorId: req.user.id,
    action: approvalType === ApprovalActionType.OVERRIDE_APPROVED ? 'REQUEST_APPROVED_WITH_OVERRIDE' : 'REQUEST_APPROVED',
    entityType: 'Request',
    entityId: requestEntity.id,
    payload: parsed.data,
    ipAddress: req.ip,
    requestId: requestEntity.id
  });

  // Automatically create issue when storekeeper approves (no need for separate step)
  if (
    parsed.data.approved &&
    req.user!.role === Role.STOREKEEPER
  ) {
    try {
      // Prepare issue lines with due dates for returnable items
      const issueLines: { itemId: string; quantityIssued: number; dueDate: Date | null }[] = [];
      const now = new Date();
      const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days from now

      for (const line of requestEntity.lines) {
        const item = await prisma.item.findUnique({ where: { id: line.itemId } });
        if (!item) {
          throw new Error(`Item ${line.itemId} not found`);
        }

        issueLines.push({
          itemId: line.itemId,
          quantityIssued: line.quantityRequested,
          dueDate: item.type === 'RETURNABLE' ? dueDate : null
        });
      }

      // Create the issue and related ledger entries
      const createdIssue = await prisma.$transaction(async (tx) => {
        const issue = await tx.issue.create({
          data: {
            requestId: requestEntity.id,
            issuedToId: requestEntity.requesterId,
            issuedById: req.user!.id,
            notes: 'Auto-issued upon approval by storekeeper',
            lines: {
              create: issueLines.map(line => ({
                itemId: line.itemId,
                quantityIssued: line.quantityIssued,
                dueDate: line.dueDate
              }))
            }
          },
          include: { lines: true }
        });

        // Create ledger entries for the issued stock
        for (const line of issueLines) {
          await appendLedgerEntry(
            {
              itemId: line.itemId,
              type: LedgerEntryType.ISSUE_OUT,
              quantityDelta: -Math.trunc(line.quantityIssued),
              referenceType: 'ISSUE',
              referenceId: issue.id,
              createdById: req.user!.id,
              notes: 'Auto-issued upon approval'
            },
            tx
          );
        }

        // Update request status to FULLY_ISSUED since we're issuing everything
        await tx.request.update({
          where: { id: requestEntity.id },
          data: { status: RequestStatus.FULLY_ISSUED }
        });

        return issue;
      });

      // Audit log for the auto-issue
      await writeAuditLog({
        actorId: req.user!.id,
        action: 'ISSUE_AUTO_CREATED_UPON_APPROVAL',
        entityType: 'Issue',
        entityId: createdIssue.id,
        payload: {
          requestId: requestEntity.id,
          autoIssue: true
        },
        ipAddress: req.ip,
        requestId: requestEntity.id
      });
    } catch (error) {
      // If auto-issue fails, we still return the approved request
      // The storekeeper can manually create the issue later
      console.warn('Failed to auto-create issue upon approval:', error);
      // Don't fail the approval if auto-issue fails
    }
  }

  return res.json(updated);
});
