import { Router } from 'express';
import { prisma } from '../../db.js';
import { getCurrentStock } from '../inventory-ledger/inventory-ledger.service.js';
import type { AuthedRequest } from '../../types.js';

const toCsv = (rows: Array<Record<string, unknown>>) => {
  if (!rows.length) {
    return '';
  }

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];

  for (const row of rows) {
    lines.push(
      headers
        .map((header) => {
          const value = row[header] ?? '';
          const serialized = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
          return `"${serialized.replaceAll('"', '""')}"`;
        })
        .join(',')
    );
  }

  return lines.join('\n');
};

export const reportsRouter = Router();

reportsRouter.get('/current-stock', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const report = await getCurrentStock();

  if (req.query.format === 'csv') {
    res.header('Content-Type', 'text/csv');
    return res.send(toCsv(report));
  }

  return res.json(report);
});

reportsRouter.get('/low-stock', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const report = (await getCurrentStock()).filter((row) => row.isLowStock);

  if (req.query.format === 'csv') {
    res.header('Content-Type', 'text/csv');
    return res.send(toCsv(report));
  }

  return res.json(report);
});

reportsRouter.get('/user-wise-issued', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const issueLines = await prisma.issueLine.findMany({
    include: {
      item: true,
      issue: {
        include: {
          issuedTo: true
        }
      }
    }
  });

  const aggregate = new Map<string, { userId: string; userName: string; itemCode: string; itemName: string; quantityIssued: number }>();

  for (const line of issueLines) {
    const key = `${line.issue.issuedToId}:${line.itemId}`;
    const current = aggregate.get(key) || {
      userId: line.issue.issuedToId,
      userName: line.issue.issuedTo.name,
      itemCode: line.item.code,
      itemName: line.item.name,
      quantityIssued: 0
    };
    current.quantityIssued += line.quantityIssued;
    aggregate.set(key, current);
  }

  const report = [...aggregate.values()].sort((a, b) => a.userName.localeCompare(b.userName));

  if (req.query.format === 'csv') {
    res.header('Content-Type', 'text/csv');
    return res.send(toCsv(report));
  }

  return res.json(report);
});

reportsRouter.get('/department-wise-consumption', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const issueLines = await prisma.issueLine.findMany({
    include: {
      item: true,
      issue: {
        include: {
          issuedTo: {
            include: {
              department: true
            }
          }
        }
      }
    }
  });

  const aggregate = new Map<string, { departmentId: string; departmentName: string; itemCode: string; itemName: string; quantityIssued: number }>();

  for (const line of issueLines) {
    const departmentId = line.issue.issuedTo.departmentId;
    if (!departmentId || !line.issue.issuedTo.department) {
      continue;
    }

    const key = `${departmentId}:${line.itemId}`;
    const current = aggregate.get(key) || {
      departmentId,
      departmentName: line.issue.issuedTo.department.name,
      itemCode: line.item.code,
      itemName: line.item.name,
      quantityIssued: 0
    };
    current.quantityIssued += line.quantityIssued;
    aggregate.set(key, current);
  }

  const report = [...aggregate.values()].sort((a, b) => a.departmentName.localeCompare(b.departmentName));

  if (req.query.format === 'csv') {
    res.header('Content-Type', 'text/csv');
    return res.send(toCsv(report));
  }

  return res.json(report);
});

reportsRouter.get('/monthly-usage-loss', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const [issued, losses] = await Promise.all([
    prisma.issueLine.findMany({
      include: {
        item: true,
        issue: true
      }
    }),
    prisma.returnLine.findMany({
      where: {
        condition: {
          in: ['DAMAGED', 'LOST']
        }
      },
      include: {
        returnRecord: true,
        issueLine: {
          include: {
            item: true
          }
        }
      }
    })
  ]);

  const aggregate = new Map<string, { month: string; itemCode: string; itemName: string; issuedQty: number; damagedQty: number; lostQty: number }>();

  for (const line of issued) {
    const month = `${line.issue.issuedAt.getUTCFullYear()}-${String(line.issue.issuedAt.getUTCMonth() + 1).padStart(2, '0')}`;
    const key = `${month}:${line.itemId}`;
    const current = aggregate.get(key) || {
      month,
      itemCode: line.item.code,
      itemName: line.item.name,
      issuedQty: 0,
      damagedQty: 0,
      lostQty: 0
    };

    current.issuedQty += line.quantityIssued;
    aggregate.set(key, current);
  }

  for (const loss of losses) {
    const month = `${loss.returnRecord.createdAt.getUTCFullYear()}-${String(loss.returnRecord.createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
    const key = `${month}:${loss.issueLine.itemId}`;
    const current = aggregate.get(key) || {
      month,
      itemCode: loss.issueLine.item.code,
      itemName: loss.issueLine.item.name,
      issuedQty: 0,
      damagedQty: 0,
      lostQty: 0
    };

    if (loss.condition === 'DAMAGED') {
      current.damagedQty += loss.quantity;
    } else {
      current.lostQty += loss.quantity;
    }

    aggregate.set(key, current);
  }

  const report = [...aggregate.values()].sort((a, b) => a.month.localeCompare(b.month));

  if (req.query.format === 'csv') {
    res.header('Content-Type', 'text/csv');
    return res.send(toCsv(report));
  }

  return res.json(report);
});
