# Seed & Demo Data Record

This document tracks all demo/test data added to the production database for testing purposes.
**Before going live with real data, run the cleanup SQL at the bottom of this file.**

---

## Database: `u853826912_newdatabase`
## Server: `maroon-eland-586562.hostingersite.com`
## Date seeded: 2026-06-09

---

## 1. Departments

Added via SQL on 2026-06-09:

| Name           | Note        |
|----------------|-------------|
| Administration | Demo dept   |
| Science        | Demo dept   |
| Mathematics    | Demo dept   |
| Humanities     | Demo dept   |

---

## 2. Users (Test Accounts)

| Email                        | Password     | Role        | Department     |
|------------------------------|--------------|-------------|----------------|
| admin@school.local           | Admin@123    | ADMIN       | Administration |
| storekeeper@school.local     | Store@123    | STOREKEEPER | Administration |
| teacher@school.local         | Teacher@123  | TEACHER     | Science        |

> ⚠️ These are test accounts with known passwords. Remove before going live.

---

## 3. Items & Opening Stock

| Code       | Name                    | Type        | Unit  | Opening Stock |
|------------|-------------------------|-------------|-------|---------------|
| CHALK-001  | White Chalk Box         | CONSUMABLE  | box   | 50            |
| CHALK-002  | Coloured Chalk Box      | CONSUMABLE  | box   | 30            |
| MARK-001   | Whiteboard Marker       | CONSUMABLE  | pcs   | 80            |
| MARK-002   | Permanent Marker        | CONSUMABLE  | pcs   | 40            |
| DUSTER-001 | Board Duster            | RETURNABLE  | pcs   | 20            |
| SCIS-001   | Scissors                | RETURNABLE  | pcs   | 25            |
| PAPER-001  | A4 Paper Ream           | CONSUMABLE  | ream  | 60            |
| PEN-001    | Ball Point Pen          | CONSUMABLE  | pcs   | 200           |
| RULER-001  | Wooden Ruler 30cm       | RETURNABLE  | pcs   | 30            |
| CALC-001   | Scientific Calculator   | RETURNABLE  | pcs   | 15            |

---

## Cleanup SQL (Run before going live)

Connect via SSH and run:

```bash
mysql -u u853826912_nikhil -p'<password>' -h 127.0.0.1 u853826912_newdatabase << 'EOF'
-- Remove all ledger entries linked to demo items
DELETE FROM StockLedgerEntry WHERE notes = 'Opening stock';

-- Remove demo items
DELETE FROM Item WHERE code IN (
  'CHALK-001','CHALK-002','MARK-001','MARK-002','DUSTER-001',
  'SCIS-001','PAPER-001','PEN-001','RULER-001','CALC-001'
);

-- Remove test users
DELETE FROM User WHERE email IN (
  'admin@school.local',
  'storekeeper@school.local',
  'teacher@school.local'
);

-- Remove demo departments (only if no real users are assigned)
DELETE FROM Department WHERE name IN (
  'Administration','Science','Mathematics','Humanities'
);
EOF
```

> After cleanup, create real admin user, departments, and import actual opening stock via the Imports tab.
