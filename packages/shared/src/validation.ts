import { z } from 'zod';
import { ItemType, LimitPeriod, ReturnCondition } from './types';

export const requestLineSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive()
});

export const createItemSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  unit: z.string().trim().min(1),
  type: z.nativeEnum(ItemType),
  lowStockThreshold: z.number().int().min(0).default(0)
});

export const approvalSchema = z.object({
  approved: z.boolean(),
  notes: z.string().trim().optional(),
  overrideReason: z.string().trim().optional()
});

export const issueLineSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  dueDate: z.string().datetime().optional()
});

export const returnLineSchema = z.object({
  issueLineId: z.string().uuid(),
  quantity: z.number().int().positive(),
  condition: z.nativeEnum(ReturnCondition),
  note: z.string().trim().optional()
});

export const createLimitRuleSchema = z.object({
  name: z.string().trim().min(1),
  userId: z.string().uuid().optional(),
  itemId: z.string().uuid().optional(),
  maxQuantity: z.number().int().positive(),
  period: z.nativeEnum(LimitPeriod)
});
