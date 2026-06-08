import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import type { AuthedRequest } from '../../types.js';
import { writeAuditLog } from '../audit/audit.service.js';

const createDepartmentSchema = z.object({
  name: z.string().trim().min(1)
});

export const departmentsRouter = Router();

departmentsRouter.get('/', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const departments = await prisma.department.findMany({ orderBy: { name: 'asc' } });
  return res.json(departments);
});

departmentsRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = createDepartmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const department = await prisma.department.create({ data: parsed.data });

  await writeAuditLog({
    actorId: req.user?.id,
    action: 'DEPARTMENT_CREATED',
    entityType: 'Department',
    entityId: department.id,
    payload: department,
    ipAddress: req.ip
  });

  return res.status(201).json(department);
});
