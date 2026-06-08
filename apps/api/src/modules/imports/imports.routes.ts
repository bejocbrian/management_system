import crypto from 'crypto';
import { Router } from 'express';
import { ImportStatus, ImportType, ItemType, LedgerEntryType, Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import type { AuthedRequest } from '../../types.js';
import { appendLedgerEntry } from '../inventory-ledger/inventory-ledger.service.js';
import { parseCsv } from './csv.js';
import { writeAuditLog } from '../audit/audit.service.js';

const importSchema = z.object({
  fileName: z.string().min(1),
  csvData: z.string().min(1)
});

const confirmLockSchema = z.object({
  confirm: z.literal(true)
});

const openingRequiredColumns = ['item_code', 'item_name', 'qty', 'unit', 'type'];
const invoiceRequiredColumns = [
  'invoice_no',
  'invoice_date',
  'supplier_name',
  'item_code',
  'item_name',
  'qty',
  'unit_price'
];

const ensureColumns = (rows: Record<string, string>[], columns: string[]) => {
  const first = rows[0] ?? {};
  const missing = columns.filter((column) => !(column in first));
  if (missing.length > 0) {
    throw new Error(`Missing CSV columns: ${missing.join(', ')}`);
  }
};

const findOrCreateItem = async (row: Record<string, string>, createdById: string) => {
  const code = row.item_code.trim();
  const existing = await prisma.item.findUnique({ where: { code } });
  if (existing) {
    return existing;
  }

  return prisma.item.create({
    data: {
      code,
      name: row.item_name.trim(),
      unit: row.unit?.trim() || 'unit',
      type: row.type?.trim().toUpperCase() === 'RETURNABLE' ? ItemType.RETURNABLE : ItemType.CONSUMABLE,
      lowStockThreshold: 0
    }
  });
};

const lineHash = (row: Record<string, string>) => {
  const payload = [
    row.invoice_no,
    row.invoice_date,
    row.supplier_name,
    row.item_code,
    row.qty,
    row.unit_price
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
};

export const importsRouter = Router();

importsRouter.post('/opening-stock', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const lockSetting = await prisma.systemSetting.findUnique({ where: { key: config.openingImportLockKey } });
  if (lockSetting?.value === 'true') {
    return res.status(409).json({ error: 'Opening stock import is already locked' });
  }

  const rows = parseCsv(parsed.data.csvData);
  if (!rows.length) {
    return res.status(400).json({ error: 'CSV has no data rows' });
  }

  try {
    ensureColumns(rows, openingRequiredColumns);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid CSV' });
  }

  const summary = {
    totalRows: rows.length,
    successRows: 0,
    failedRows: 0
  };

  const errors: Array<{ row: number; message: string }> = [];

  const batch = await prisma.importBatch.create({
    data: {
      type: ImportType.OPENING_STOCK,
      fileName: parsed.data.fileName,
      checksum: crypto.createHash('sha256').update(parsed.data.csvData).digest('hex'),
      createdById: req.user.id
    }
  });

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];

    try {
      const quantity = Number(row.qty);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('qty must be > 0');
      }

      const item = await findOrCreateItem(row, req.user.id);
      await appendLedgerEntry({
        itemId: item.id,
        type: LedgerEntryType.OPENING_STOCK,
        quantityDelta: Math.trunc(quantity),
        referenceType: 'OPENING_IMPORT',
        referenceId: batch.id,
        importBatchId: batch.id,
        createdById: req.user.id,
        notes: 'Opening stock import'
      });

      summary.successRows += 1;
    } catch (error) {
      summary.failedRows += 1;
      errors.push({ row: index + 2, message: error instanceof Error ? error.message : 'Unknown row error' });
    }
  }

  const status =
    summary.failedRows === 0 ? ImportStatus.SUCCESS : summary.successRows > 0 ? ImportStatus.PARTIAL_SUCCESS : ImportStatus.FAILED;

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { status, summary, errors }
  });

  if (summary.successRows > 0) {
    await prisma.systemSetting.upsert({
      where: { key: config.openingImportLockKey },
      update: { value: 'true' },
      create: { key: config.openingImportLockKey, value: 'true' }
    });
  }

  await writeAuditLog({
    actorId: req.user.id,
    action: 'OPENING_STOCK_IMPORTED',
    entityType: 'ImportBatch',
    entityId: batch.id,
    payload: { summary, errors },
    ipAddress: req.ip
  });

  return res.status(201).json({ batchId: batch.id, status, summary, errors });
});

importsRouter.post('/opening-stock/confirm-lock', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.user.role !== Role.ADMIN) {
    return res.status(403).json({ error: 'Only admins can confirm opening stock lock' });
  }

  const parsed = confirmLockSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const lockSetting = await prisma.systemSetting.upsert({
    where: { key: config.openingImportLockKey },
    update: { value: 'true' },
    create: { key: config.openingImportLockKey, value: 'true' }
  });

  await writeAuditLog({
    actorId: req.user.id,
    action: 'OPENING_STOCK_LOCK_CONFIRMED',
    entityType: 'SystemSetting',
    entityId: lockSetting.key,
    payload: lockSetting,
    ipAddress: req.ip
  });

  return res.json({
    message: 'Opening stock import lock confirmed',
    key: lockSetting.key,
    value: lockSetting.value
  });
});

importsRouter.post('/invoice-stock', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const rows = parseCsv(parsed.data.csvData);
  if (!rows.length) {
    return res.status(400).json({ error: 'CSV has no data rows' });
  }

  try {
    ensureColumns(rows, invoiceRequiredColumns);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid CSV' });
  }

  const summary = {
    totalRows: rows.length,
    importedRows: 0,
    duplicateRows: 0,
    failedRows: 0
  };

  const errors: Array<{ row: number; message: string }> = [];

  const batch = await prisma.importBatch.create({
    data: {
      type: ImportType.INVOICE_STOCK,
      fileName: parsed.data.fileName,
      checksum: crypto.createHash('sha256').update(parsed.data.csvData).digest('hex'),
      createdById: req.user.id
    }
  });

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];

    try {
      const fingerprint = lineHash(row);
      const invoiceNo = row.invoice_no.trim();
      const existingFingerprint = await prisma.invoiceLineFingerprint.findUnique({
        where: {
          invoiceNo_lineHash: {
            invoiceNo,
            lineHash: fingerprint
          }
        }
      });

      if (existingFingerprint) {
        summary.duplicateRows += 1;
        continue;
      }

      const quantity = Number(row.qty);
      const unitPrice = Number(row.unit_price);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('qty must be > 0');
      }

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error('unit_price must be >= 0');
      }

      const item = await findOrCreateItem(
        {
          ...row,
          unit: row.unit || 'unit',
          type: row.type || 'CONSUMABLE'
        },
        req.user.id
      );

      await prisma.$transaction(async (tx) => {
        await tx.invoiceLineFingerprint.create({
          data: {
            invoiceNo,
            lineHash: fingerprint
          }
        });

        await appendLedgerEntry(
          {
            itemId: item.id,
            type: LedgerEntryType.IMPORT_STOCK,
            quantityDelta: Math.trunc(quantity),
            unitPrice,
            referenceType: 'INVOICE_IMPORT',
            referenceId: batch.id,
            invoiceNo,
            importBatchId: batch.id,
            createdById: req.user!.id,
            notes: `Supplier: ${row.supplier_name}`
          },
          tx
        );
      });

      summary.importedRows += 1;
    } catch (error) {
      summary.failedRows += 1;
      errors.push({ row: index + 2, message: error instanceof Error ? error.message : 'Unknown row error' });
    }
  }

  const status =
    summary.failedRows === 0 ? ImportStatus.SUCCESS : summary.importedRows > 0 ? ImportStatus.PARTIAL_SUCCESS : ImportStatus.FAILED;

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status,
      summary,
      errors
    }
  });

  await writeAuditLog({
    actorId: req.user.id,
    action: 'INVOICE_STOCK_IMPORTED',
    entityType: 'ImportBatch',
    entityId: batch.id,
    payload: { summary, errors },
    ipAddress: req.ip
  });

  return res.status(201).json({ batchId: batch.id, status, summary, errors });
});
