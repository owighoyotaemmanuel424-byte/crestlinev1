# Crestline Capital - Session 2

A comprehensive banking application with double-entry ledger, RBAC, and modern financial features.

## Overview

Crestline Capital is a full-stack banking application built with Next.js 14, TypeScript, Tailwind CSS, Prisma ORM, and PostgreSQL.

**Current Status**: Session 2 - 100% Complete (Sandbox/Demo Mode)

## Important Notice

> This application currently operates in SANDBOX/DEMO mode.
> No real banking operations are performed. All financial data is simulated.

## Features

- Customer Dashboard
- Account Management
- Transactions
- Transfers
- Deposits & Withdrawals
- Cards
- Beneficiaries
- KYC Verification
- Admin Portal
- Double-Entry Ledger

## Installation

```bash
git clone https://github.com/owighoyotaemmanuel424-byte/crestlinev1.git
cd crestlinev1
npm install
cp .env.example .env
npx prisma generate
npx prisma db push
npx prisma db seed
npm run dev
```

## Demo Credentials

- Customer: john.doe@crestline.capital / Demo@123456
- Admin: admin@crestline.capital / Admin@123456
- Compliance: compliance@crestline.capital / Compliance@123

## License
Proprietary - All rights reserved.