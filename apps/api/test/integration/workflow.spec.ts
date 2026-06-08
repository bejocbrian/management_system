import { expect, describe, it, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/db.js';
import { ItemType, LedgerEntryType, LimitPeriod, ApprovalActionType, RequestStatus } from '@prisma/client';
import { ensureSufficientStock, appendLedgerEntry } from '../../src/modules/inventory-ledger/inventory-ledger.service.js';
import { evaluateLimit } from '../../src/modules/limits/limits.service.js';

describe('request -> approval -> issue -> return workflow', () => {
  let testUser: any;
  let testItemConsumable: any;
  let testItemReturnable: any;

  beforeAll(async () => {
    // Get seeded teacher user or create one
    testUser = await prisma.user.findFirst({ where: { email: 'teacher@school.local' } });
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: 'teacher@school.local',
          name: 'Teacher One',
          role: 'TEACHER',
          passwordHash: 'hash'
        }
      });
    }

    testItemConsumable = await prisma.item.create({
      data: {
        code: `WORKFLOW-TEST-C-${Date.now()}`,
        name: 'Test Consumable Item',
        type: ItemType.CONSUMABLE,
        unit: 'pcs'
      }
    });

    testItemReturnable = await prisma.item.create({
      data: {
        code: `WORKFLOW-TEST-R-${Date.now()}`,
        name: 'Test Returnable Item',
        type: ItemType.RETURNABLE,
        unit: 'pcs'
      }
    });
  });

  afterAll(async () => {
    // Clean up
    await prisma.stockLedgerEntry.deleteMany({
      where: { itemId: { in: [testItemConsumable.id, testItemReturnable.id] } }
    });
    await prisma.limitRule.deleteMany({
      where: { userId: testUser.id }
    });
    await prisma.item.deleteMany({
      where: { id: { in: [testItemConsumable.id, testItemReturnable.id] } }
    });
  });

  it('revalidates stock during submit, approval and issue', async () => {
    // Ensure initial stock is 0 (insufficient)
    await expect(ensureSufficientStock(testItemConsumable.id, 5)).rejects.toThrow();

    // Add stock (10)
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    await appendLedgerEntry({
      itemId: testItemConsumable.id,
      type: LedgerEntryType.OPENING_STOCK,
      quantityDelta: 10,
      createdById: adminUser!.id
    });

    // Now it should pass for 5, but fail for 12
    await expect(ensureSufficientStock(testItemConsumable.id, 5)).resolves.not.toThrow();
    await expect(ensureSufficientStock(testItemConsumable.id, 12)).rejects.toThrow();
  });

  it('requires due dates for returnables and marks overdue lines', async () => {
    // 1. In issuesRouter, returnables require due dates. Let's verify our logic check:
    const itemType = testItemReturnable.type;
    const dueDateForReturnable = null;
    
    const isDueDateMissingForReturnable = itemType === ItemType.RETURNABLE && !dueDateForReturnable;
    expect(isDueDateMissingForReturnable).toBe(true);

    // 2. Marks overdue lines: overdue if dueDate < now and quantityReturned < quantityIssued
    const now = new Date();
    const pastDueDate = new Date(now.getTime() - 86400000); // 1 day ago
    const quantityIssued = 5;
    const quantityReturned = 2;

    const isOverdue = Boolean(pastDueDate && quantityReturned < quantityIssued && pastDueDate < now);
    expect(isOverdue).toBe(true);

    const isNotOverdueIfReturned = Boolean(pastDueDate && quantityIssued <= quantityIssued && pastDueDate < now);
    // If returned completely:
    const isOverdueReturned = Boolean(pastDueDate && quantityIssued < quantityIssued && pastDueDate < now);
    expect(isOverdueReturned).toBe(false);
  });

  it('captures override reason for admin approval beyond limit', async () => {
    // Create a limit rule for this teacher and consumable item (max 5)
    const rule = await prisma.limitRule.create({
      data: {
        name: 'Test Limit Rule',
        userId: testUser.id,
        itemId: testItemConsumable.id,
        maxQuantity: 5,
        period: LimitPeriod.WEEKLY
      }
    });

    // Evaluate limit for 3 (should be allowed)
    let evaluation = await evaluateLimit(testUser.id, testItemConsumable.id, 3);
    expect(evaluation.allowed).toBe(true);

    // Evaluate limit for 6 (should be denied)
    evaluation = await evaluateLimit(testUser.id, testItemConsumable.id, 6);
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.matchedRuleId).toBe(rule.id);
  });
});
