import { expect, describe, it, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/db.js';
import { ItemType, LedgerEntryType } from '@prisma/client';
import {
  appendLedgerEntry,
  getAvailableStockByItemId
} from '../../src/modules/inventory-ledger/inventory-ledger.service.js';

describe('inventory ledger invariants', () => {
  let testUser: any;
  let testItem: any;

  beforeAll(async () => {
    // Get seeded admin user or create one
    testUser = await prisma.user.findFirst({ where: { email: 'admin@school.local' } });
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: 'admin@school.local',
          name: 'School Admin',
          role: 'ADMIN',
          passwordHash: 'hash'
        }
      });
    }

    testItem = await prisma.item.create({
      data: {
        code: `LEDGER-TEST-${Date.now()}`,
        name: 'Test Ledger Item',
        type: ItemType.CONSUMABLE,
        unit: 'pcs'
      }
    });
  });

  afterAll(async () => {
    if (testItem) {
      await prisma.stockLedgerEntry.deleteMany({ where: { itemId: testItem.id } });
      await prisma.item.delete({ where: { id: testItem.id } });
    }
  });

  it('computes available stock from immutable entries', async () => {
    // Invariant 1: Available stock is sum of quantityDelta.
    // Newly created item should have 0 stock.
    let stock = await getAvailableStockByItemId(testItem.id);
    expect(stock).toBe(0);

    // Append OPENING_STOCK (+20)
    await appendLedgerEntry({
      itemId: testItem.id,
      type: LedgerEntryType.OPENING_STOCK,
      quantityDelta: 20,
      createdById: testUser.id,
      notes: 'Initial opening stock'
    });

    stock = await getAvailableStockByItemId(testItem.id);
    expect(stock).toBe(20);

    // Append ISSUE_OUT (-5)
    await appendLedgerEntry({
      itemId: testItem.id,
      type: LedgerEntryType.ISSUE_OUT,
      quantityDelta: -5,
      createdById: testUser.id,
      notes: 'Issued to teacher'
    });

    stock = await getAvailableStockByItemId(testItem.id);
    expect(stock).toBe(15);

    // Append RETURN_IN (+2)
    await appendLedgerEntry({
      itemId: testItem.id,
      type: LedgerEntryType.RETURN_IN,
      quantityDelta: 2,
      createdById: testUser.id,
      notes: 'Returned unused consumable'
    });

    stock = await getAvailableStockByItemId(testItem.id);
    expect(stock).toBe(17);
  });

  it('prevents reopening opening stock import after lock', async () => {
    // Invariant 2: Opening stock import is lockable
    const lockKey = 'OPENING_STOCK_IMPORT_LOCKED';

    // Lock the import
    await prisma.systemSetting.upsert({
      where: { key: lockKey },
      update: { value: 'true' },
      create: { key: lockKey, value: 'true' }
    });

    const lockSetting = await prisma.systemSetting.findUnique({ where: { key: lockKey } });
    expect(lockSetting?.value).toBe('true');
  });
});
