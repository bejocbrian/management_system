import type { NextFunction, Response } from 'express';
import type { Role } from '@prisma/client';
import type { AuthedRequest } from '../../types.js';

export const requireRoles = (...roles: Role[]) => {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return next();
  };
};
