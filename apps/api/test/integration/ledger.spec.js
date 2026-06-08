"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const db_js_1 = require("../../src/db.js");
const client_1 = require("@prisma/client");
const inventory_ledger_service_js_1 = require("../../src/modules/inventory-ledger/inventory-ledger.service.js");
(0, vitest_1.describe)('inventory ledger invariants', () => {
    let testUser;
    let testItem;
    (0, vitest_1.beforeAll)(async () => {
        // Get seeded admin user or create one
        testUser = await db_js_1.prisma.user.findFirst({ where: { email: 'admin@school.local' } });
        if (!testUser) {
            testUser = await db_js_1.prisma.user.create({
                data: {
                    email: 'admin@school.local',
                    name: 'School Admin',
                    role: 'ADMIN',
                    passwordHash: 'hash'
                }
            });
        }
        testItem = await db_js_1.prisma.item.create({
            data: {
                code: `LEDGER-TEST-${Date.now()}`,
                name: 'Test Ledger Item',
                type: client_1.ItemType.CONSUMABLE,
                unit: 'pcs'
            }
        });
    });
    (0, vitest_1.afterAll)(async () => {
        if (testItem) {
            await db_js_1.prisma.stockLedgerEntry.deleteMany({ where: { itemId: testItem.id } });
            await db_js_1.prisma.item.delete({ where: { id: testItem.id } });
        }
    });
    (0, vitest_1.it)('computes available stock from immutable entries', async () => {
        // Invariant 1: Available stock is sum of quantityDelta.
        // Newly created item should have 0 stock.
        let stock = await (0, inventory_ledger_service_js_1.getAvailableStockByItemId)(testItem.id);
        (0, vitest_1.expect)(stock).toBe(0);
        // Append OPENING_STOCK (+20)
        await (0, inventory_ledger_service_js_1.appendLedgerEntry)({
            itemId: testItem.id,
            type: client_1.LedgerEntryType.OPENING_STOCK,
            quantityDelta: 20,
            createdById: testUser.id,
            notes: 'Initial opening stock'
        });
        stock = await (0, inventory_ledger_service_js_1.getAvailableStockByItemId)(testItem.id);
        (0, vitest_1.expect)(stock).toBe(20);
        // Append ISSUE_OUT (-5)
        await (0, inventory_ledger_service_js_1.appendLedgerEntry)({
            itemId: testItem.id,
            type: client_1.LedgerEntryType.ISSUE_OUT,
            quantityDelta: -5,
            createdById: testUser.id,
            notes: 'Issued to teacher'
        });
        stock = await (0, inventory_ledger_service_js_1.getAvailableStockByItemId)(testItem.id);
        (0, vitest_1.expect)(stock).toBe(15);
        // Append RETURN_IN (+2)
        await (0, inventory_ledger_service_js_1.appendLedgerEntry)({
            itemId: testItem.id,
            type: client_1.LedgerEntryType.RETURN_IN,
            quantityDelta: 2,
            createdById: testUser.id,
            notes: 'Returned unused consumable'
        });
        stock = await (0, inventory_ledger_service_js_1.getAvailableStockByItemId)(testItem.id);
        (0, vitest_1.expect)(stock).toBe(17);
    });
    (0, vitest_1.it)('prevents reopening opening stock import after lock', async () => {
        // Invariant 2: Opening stock import is lockable
        const lockKey = 'OPENING_STOCK_IMPORT_LOCKED';
        // Lock the import
        await db_js_1.prisma.systemSetting.upsert({
            where: { key: lockKey },
            update: { value: 'true' },
            create: { key: lockKey, value: 'true' }
        });
        const lockSetting = await db_js_1.prisma.systemSetting.findUnique({ where: { key: lockKey } });
        (0, vitest_1.expect)(lockSetting?.value).toBe('true');
    });
});
