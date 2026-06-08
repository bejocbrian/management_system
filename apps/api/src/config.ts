import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'replace-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  openingImportLockKey: process.env.OPENING_IMPORT_LOCK_KEY || 'OPENING_STOCK_IMPORT_LOCKED'
};
