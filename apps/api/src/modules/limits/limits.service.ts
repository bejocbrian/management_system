import { LimitPeriod } from '@prisma/client';
import { prisma } from '../../db.js';

const getPeriodStart = (period: LimitPeriod): Date => {
  const now = new Date();

  if (period === LimitPeriod.WEEKLY) {
    const day = now.getDay() || 7;
    const date = new Date(now);
    date.setDate(now.getDate() - day + 1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  if (period === LimitPeriod.MONTHLY) {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const termStartMonth = now.getMonth() < 6 ? 0 : 6;
  return new Date(now.getFullYear(), termStartMonth, 1);
};

export type LimitEvaluationResult = {
  allowed: boolean;
  message?: string;
  matchedRuleId?: string;
  remainingQty?: number;
};

export const evaluateLimit = async (
  userId: string,
  itemId: string,
  requestedQty: number
): Promise<LimitEvaluationResult> => {
  const rules = await prisma.limitRule.findMany({
    where: {
      isActive: true,
      OR: [
        { userId, itemId },
        { userId, itemId: null },
        { userId: null, itemId },
        { userId: null, itemId: null }
      ]
    }
  });

  const rankedRules = rules.sort((a, b) => {
    const score = (rule: { userId: string | null; itemId: string | null }) => {
      if (rule.userId && rule.itemId) return 4;
      if (rule.userId) return 3;
      if (rule.itemId) return 2;
      return 1;
    };

    return score(b) - score(a);
  });

  const matchedRule = rankedRules[0];
  if (!matchedRule) {
    return { allowed: true };
  }

  const periodStart = getPeriodStart(matchedRule.period);
  const consumed = await prisma.issueLine.aggregate({
    _sum: { quantityIssued: true },
    where: {
      itemId,
      issue: {
        issuedToId: userId,
        issuedAt: {
          gte: periodStart
        }
      }
    }
  });

  const alreadyConsumed = consumed._sum.quantityIssued ?? 0;
  const remainingQty = matchedRule.maxQuantity - alreadyConsumed;

  if (requestedQty > remainingQty) {
    return {
      allowed: false,
      matchedRuleId: matchedRule.id,
      remainingQty,
      message: `Limit exceeded. Remaining allowance is ${Math.max(0, remainingQty)}.`
    };
  }

  return {
    allowed: true,
    matchedRuleId: matchedRule.id,
    remainingQty
  };
};
