import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { prisma } from './db.js';
import { config } from './config.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { authenticate } from './modules/auth/auth.middleware.js';
import { requireRoles } from './modules/auth/rbac.js';
import { usersRouter } from './modules/users/users.routes.js';
import { departmentsRouter } from './modules/departments/departments.routes.js';
import { itemsRouter } from './modules/items/items.routes.js';
import { inventoryRouter } from './modules/inventory-ledger/inventory-ledger.routes.js';
import { importsRouter } from './modules/imports/imports.routes.js';
import { requestsRouter } from './modules/requests/requests.routes.js';
import { issuesRouter } from './modules/issues/issues.routes.js';
import { returnsRouter } from './modules/returns/returns.routes.js';
import { limitsRouter } from './modules/limits/limits.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';

const app = express();

app.use(cors({
  origin: [
    'https://powderblue-caterpillar-585125.hostingersite.com',
    'http://localhost:5173',
    'http://localhost:4173',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'school-inventory-api' });
});

app.use('/auth', authRouter);
app.use(authenticate);

app.use('/users', requireRoles('ADMIN'), usersRouter);
app.use('/departments', requireRoles('ADMIN', 'STOREKEEPER'), departmentsRouter);
app.use('/items', requireRoles('ADMIN', 'STOREKEEPER'), itemsRouter);
app.use('/inventory', requireRoles('ADMIN', 'STOREKEEPER', 'TEACHER'), inventoryRouter);
app.use('/imports', requireRoles('ADMIN', 'STOREKEEPER'), importsRouter);
app.use('/requests', requireRoles('ADMIN', 'STOREKEEPER', 'TEACHER'), requestsRouter);
app.use('/issues', requireRoles('ADMIN', 'STOREKEEPER', 'TEACHER'), issuesRouter);
app.use('/returns', requireRoles('ADMIN', 'STOREKEEPER'), returnsRouter);
app.use('/limits', requireRoles('ADMIN'), limitsRouter);
app.use('/reports', requireRoles('ADMIN', 'STOREKEEPER'), reportsRouter);
app.use('/audit', requireRoles('ADMIN'), auditRouter);

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: error.message || 'Internal server error' });
});

const start = async () => {
  await prisma.$connect();

  app.listen(config.port, () => {
    console.log(`API running on port ${config.port}`);
  });
};

start().catch((error) => {
  console.error('Failed to start API', error);
  process.exit(1);
});
