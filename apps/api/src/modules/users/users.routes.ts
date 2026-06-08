import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../../db.js';
import type { AuthedRequest } from '../../types.js';
import { writeAuditLog } from '../audit/audit.service.js';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1),
  role: z.nativeEnum(Role),
  departmentId: z.string().uuid().optional()
});

const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    role: z.nativeEnum(Role).optional(),
    departmentId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required'
  });

export const usersRouter = Router();

usersRouter.get('/', async (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const users = await prisma.user.findMany({
    include: { department: true },
    orderBy: { createdAt: 'desc' }
  });

  return res.json(users.map(({ passwordHash, ...user }) => user));
});

usersRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      ...parsed.data,
      passwordHash
    },
    include: {
      department: true
    }
  });

  await writeAuditLog({
    actorId: req.user?.id,
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: user.id,
    payload: { ...user, passwordHash: undefined },
    ipAddress: req.ip
  });

  const { passwordHash: _, ...safeUser } = user;
  return res.status(201).json(safeUser);
});

usersRouter.patch('/:userId', async (req: AuthedRequest, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success || !req.user) {
    return res.status(400).json({ error: parsed.success ? 'Unauthorized' : parsed.error.flatten() });
  }

  if (req.user.id === req.params.userId && parsed.data.isActive === false) {
    return res.status(409).json({ error: 'You cannot deactivate your own account' });
  }

  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: {
      name: parsed.data.name,
      role: parsed.data.role,
      departmentId: parsed.data.departmentId,
      isActive: parsed.data.isActive
    },
    include: { department: true }
  });

  await writeAuditLog({
    actorId: req.user.id,
    action: 'USER_UPDATED',
    entityType: 'User',
    entityId: user.id,
    payload: parsed.data,
    ipAddress: req.ip
  });

  const { passwordHash: _, ...safeUser } = user;
  return res.json(safeUser);
});
