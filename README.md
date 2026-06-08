# School Inventory + Store Management MVP

Greenfield MVP for a **single-campus school** with:
- Admin + Storekeeper web operations
- Teacher web + phase-1 mobile usage
- Request → approve/reject → issue workflow
- Return tracking for returnables
- Immutable stock ledger + audit trail
- CSV imports (opening stock one-time + invoice stock-in ongoing)
- Configurable limits + operational reports

## Monorepo Structure

```text
apps/
  api/               Express + Prisma backend
  web/               Role-aware React web app
  mobile-teacher/    Expo React Native teacher app (phase-1)
packages/
  shared/            Shared enums/validation DTOs
```

## Core Design

### 1) Immutable inventory ledger
Stock is never updated directly. Every change is append-only via `StockLedgerEntry`.
- Stock-in: `OPENING_STOCK`, `IMPORT_STOCK`, `RETURN_IN`, `ADJUSTMENT_IN`
- Stock-out: `ISSUE_OUT`, `ADJUSTMENT_OUT`
- Loss trace entries: `LOSS_DAMAGED`, `LOSS_LOST`

Current stock is computed from `SUM(quantityDelta)` per item.

### 2) Workflow lifecycle
1. Teacher submits request (`SUBMITTED`)
2. Admin/Storekeeper approves or rejects
3. Storekeeper issues stock (re-validates stock and limits at issue time)
   - Request-linked issues support partial fulfillment (`PARTIALLY_ISSUED`) and full fulfillment (`FULLY_ISSUED`)
4. Return desk processes returns for returnables (`GOOD` / `DAMAGED` / `LOST`)

### 3) Controls and governance
- Opening stock CSV import is **lockable one-time** via system setting key
- Invoice CSV imports are idempotent by `invoice_no + line_hash`
- Limit rules with precedence:
  1. user+item
  2. user
  3. item
  4. global
- Admin override path is audited (request approvals, issues beyond limits, and negative adjustments)
- Audit logs capture actor/action/entity/time/IP

## Tech Stack

- API: Node.js + TypeScript + Express + Prisma + PostgreSQL
- Web: React + Vite (single role-aware app)
- Mobile: React Native (Expo)
- Auth: JWT (simple and replaceable)

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker

### 1) Start database

```bash
docker compose up -d
```

### 2) Install dependencies

```bash
pnpm install
```

### 3) Configure environment

```bash
cp .env.example .env
```

### 4) Run Prisma migration + seed

```bash
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate
pnpm --filter api seed
```

### 5) Run API

```bash
pnpm --filter api dev
```

### 6) Run web

```bash
pnpm --filter web dev
```

### 7) Run teacher mobile (Expo)

```bash
pnpm --filter mobile-teacher start
```

## Seed Users

After `seed`:
- `admin@school.local` / `Admin@123`
- `storekeeper@school.local` / `Store@123`
- `teacher@school.local` / `Teacher@123`

## Important API Endpoints (MVP)

- `POST /auth/login`
- `GET /users` / `POST /users` / `PATCH /users/:userId`
- `GET /departments` / `POST /departments`
- `GET /inventory/stock`
- `POST /inventory/adjustments`
- `POST /imports/opening-stock`
- `POST /imports/opening-stock/confirm-lock` (admin confirmation)
- `POST /imports/invoice-stock`
- `POST /requests`
- `GET /requests`
- `POST /requests/:requestId/decision`
- `POST /issues`
- `GET /issues`
- `POST /returns`
- `GET /reports/current-stock`
- `GET /reports/low-stock`
- `GET /reports/user-wise-issued`
- `GET /reports/department-wise-consumption`
- `GET /reports/monthly-usage-loss`

Add `?format=csv` to report endpoints for CSV exports.

## Scope Notes

This is an MVP implementation optimized for correctness of stock/audit workflows and rapid operations. Non-MVP features (notifications, SSO, procurement workflow, multi-campus partitioning, advanced analytics) are intentionally deferred.
