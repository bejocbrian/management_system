import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import type { AuthedRequest } from '../../types.js';

export const authenticate = (req: AuthedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const [, token] = authHeader.split(' ');

  if (!token) {
    return res.status(401).json({ error: 'Invalid authorization header' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      sub: string;
      role: 'ADMIN' | 'STOREKEEPER' | 'TEACHER';
      email: string;
    };

    req.user = {
      id: decoded.sub,
      role: decoded.role,
      email: decoded.email
    };

    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
