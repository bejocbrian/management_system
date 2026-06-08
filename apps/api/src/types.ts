import type { Request } from 'express';
import type { Role } from '@prisma/client';

export type AuthedUser = {
  id: string;
  role: Role;
  email: string;
};

export type AuthedRequest = Request & { user?: AuthedUser };
