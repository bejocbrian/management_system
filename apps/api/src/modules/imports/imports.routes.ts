import crypto from 'crypto';
import { Router } from 'express';
import { ImportStatus, ImportType, ItemType, LedgerEntryType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import type { AuthedRequest } from '../../types.js';
import { appendLedgerEntry } from '../inventory-ledger/inventory-ledger.service.js';
import { parseCsv } from './csv.js';
import { writeAuditLog } from '../audit/audit.service.js';

const importSchema = z.object({
  fileName: z.string().min(1),
  csvData: z.string().min(1)
});

// Only these 3 are required — everything else is optional
const REQUIRED_COLUMNS = ['item_code', 'item_name', 'qty'];

const ensureRequiredColumns = (rows: Record<string, string>[]) => {
  const first = rows[0] ?? {};
  const missing = REQUIRED_COLUMNS.filter((col) => !(col in first));
  if (missing.length > 0) {
    throw new Error(`Missing required CSV columns: ${missing.join(', ')}`);
  }
};

/**
 * Find existing item by code, or create it if not found.
 * If item exists — just return it (stock will be added via ledger entry).
 * Optional fields: unit, type, low_stock_threshold, description
 */
const findOrCreateItem = async (row: Record<string, string>) => {
  const code = row.item_code?.trim();
  if (!code) throw new Error('item_code is empty');

  const existing = await prisma.item.findUnique({ where: { code } });
  if (existing) return existing;

  // Create with optional fields falling back to sensible defaults
  const rawType = row.type?.trim().toUpperCase();
  return prisma.item.create({
    data: {
      code,
      name: row.item_name?.trim() || code,
      unit: row.unit?.trim() || 'pcs',
      type: rawType === 'RETURNABLE' ? ItemType.RETURNABLE : ItemType.CONSUMABLE,
      lowStockThreshold: Number(row.low_stock_threshold) || 0,
      description: row.description?.trim() || null,
    }
  });
};

export const importsRouter = Router();

/**
 * POST /imports/stock
 * Universal stock import — adds stock to existing items or creates new ones.
 * Required CSV columns: item_code, item_name, qty
 * Optional: unit, type, unit_price, invoice_no, supplier_name, description, low_stock_threshold
 */
importsRouter.post('/stock', async (req: AuthedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const rows = parseCsv(parsed.data.csvData);
  if (!rows.length) {
    return res.status(400).json({ error: 'CSV has no data rows' });
  }

  try {
    ensureRequiredColumns(rows);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid CSV' });
  }

  const summary = { totalRows: rows.length, successRows: 0, skippedRows: 0, failedRows: 0 };
  const errors: Array<{ row: number; item_code: string; message: string }> = [];
  const results: Array<{ row: number; item_code: string; item_name: string; qty: number; status: 'created' | 'updated' }> = [];

  const batch = await prisma.importBatch.create({
    data: {
      type: ImportType.INVOICE_STOCK,
      fileName: parsed.data.fileName,
      checksum: crypto.createHash('sha256').update(parsed.data.csvData).digest('hex'),
      createdById: req.user.id
    }
  });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 because row 1 is headers

    try {
      const qty = Number(row.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error(`qty must be a positive number, got "${row.qty}"`);
      }

      const wasNew = !(await prisma.item.findUnique({ where: { code: row.item_code?.trim() } }));
      const item = await findOrCreateItem(row);

      const unitPrice = row.unit_price ? Number(row.unit_price) : undefined;

      await appendLedgerEntry({
        itemId: item.id,
        type: LedgerEntryType.IMPORT_STOCK,
        quantityDelta: Math.trunc(qty),
        unitPrice: unitPrice && Number.isFinite(unitPrice) ? unitPrice : undefined,
        referenceType: 'CSV_IMPORT',
        referenceId: batch.id,
        invoiceNo: row.invoice_no?.trim() || undefined,
        importBatchId: batch.id,
        createdById: req.user!.id,
        notes: row.supplier_name?.trim()
          ? `Supplier: ${row.supplier_name.trim()}`
          : 'CSV stock import'
      });

      summary.successRows += 1;
      results.push({
        row: rowNum,
        item_code: item.code,
        item_name: item.name,
        qty: Math.trunc(qty),
        status: wasNew ? 'created' : 'updated'
      });
    } catch (error) {
      summary.failedRows += 1;
      errors.push({
        row: rowNum,
        item_code: row.item_code ?? '',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  const status =
    summary.failedRows === 0
      ? ImportStatus.SUCCESS
      : summary.successRows > 0
        ? ImportStatus.PARTIAL_SUCCESS
        : ImportStatus.FAILED;

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { status, summary, errors }
  });

  await writeAuditLog({
    actorId: req.user.id,
    action: 'STOCK_IMPORTED',
    entityType: 'ImportBatch',
    entityId: batch.id,
    payload: { summary, errors },
    ipAddress: req.ip
  });

  return res.status(201).json({ batchId: batch.id, status, summary, results, errors });
});

/**
 * Keep old routes working so existing code doesn't break
 */
importsRouter.post('/opening-stock', async (req: AuthedRequest, res) => {
  return res.redirect(307, '/imports/stock');
});

importsRouter.post('/invoice-stock', async (req: AuthedRequest, res) => {
  return res.redirect(307, '/imports/stock');
});

/**
 * GET /imports/template
 * Download a sample CSV template
 */
importsRouter.get('/template', (_req, res) => {
  const csv = [
    'item_code,item_name,qty,unit,type,unit_price,supplier_name,invoice_no,description',
    'CHALK-001,White Chalk Box,50,box,CONSUMABLE,120,ABC Suppliers,INV-001,White chalk for classrooms',
    'MARK-001,Whiteboard Marker,30,pcs,CONSUMABLE,25,ABC Suppliers,INV-001,',
    'CALC-001,Scientific Calculator,10,pcs,RETURNABLE,450,,,'
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="stock_import_template.csv"');
  return res.send(csv);
});
