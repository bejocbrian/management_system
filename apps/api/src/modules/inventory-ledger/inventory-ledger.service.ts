import { LedgerEntryType, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

export type LedgerInput = {
  itemId: string;
  type: LedgerEntryType;
  quantityDelta: number;
  unitPrice?: number;
  referenceType?: string;
  referenceId?: string;
  invoiceNo?: string;
  notes?: string;
  importBatchId?: string;
  createdById: string;
};

const toPrismaDecimal = (value?: number) => {
  if (value === undefined || value === null) return undefined;
  return new Prisma.Decimal(value);
};

export const appendLedgerEntry = async (
  input: LedgerInput,
  tx: Prisma.TransactionClient = prisma
) => {
  if (
    input.quantityDelta === 0 &&
    input.type !== LedgerEntryType.LOSS_DAMAGED &&
    input.type !== LedgerEntryType.LOSS_LOST
  ) {
    throw new Error('Ledger quantity delta cannot be zero for stock-affecting entries');
  }

  return tx.stockLedgerEntry.create({
    data: {
      itemId: input.itemId,
      type: input.type,
      quantityDelta: input.quantityDelta,
      unitPrice: toPrismaDecimal(input.unitPrice),
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      invoiceNo: input.invoiceNo,
      notes: input.notes,
      importBatchId: input.importBatchId,
      createdById: input.createdById
    }
  });
};

export const getAvailableStockByItemId = async (
  itemId: string,
  tx: Prisma.TransactionClient = prisma
) => {
  const aggregate = await tx.stockLedgerEntry.aggregate({
    _sum: { quantityDelta: true },
    where: { itemId }
  });

  return aggregate._sum.quantityDelta ?? 0;
};

export const getCurrentStock = async () => {
  const grouped = await prisma.stockLedgerEntry.groupBy({
    by: ['itemId'],
    _sum: { quantityDelta: true }
  });

  const items = await prisma.item.findMany();
  const stockMap = new Map(grouped.map((entry) => [entry.itemId, entry._sum.quantityDelta ?? 0]));

  return items.map((item) => ({
    itemId: item.id,
    itemCode: item.code,
    itemName: item.name,
    type: item.type,
    unit: item.unit,
    lowStockThreshold: item.lowStockThreshold,
    availableQty: stockMap.get(item.id) ?? 0,
    isLowStock: (stockMap.get(item.id) ?? 0) <= item.lowStockThreshold
  }));
};

export const ensureSufficientStock = async (
  itemId: string,
  requestedQty: number,
  tx: Prisma.TransactionClient = prisma
) => {
  const available = await getAvailableStockByItemId(itemId, tx);
  if (available < requestedQty) {
    throw new Error(`Insufficient stock for item ${itemId}. Available: ${available}, requested: ${requestedQty}`);
  }
};

export const mapConditionToLedgerLossType = (condition: 'DAMAGED' | 'LOST') => {
  return condition === 'DAMAGED' ? LedgerEntryType.LOSS_DAMAGED : LedgerEntryType.LOSS_LOST;
};
