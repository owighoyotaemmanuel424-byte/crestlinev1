# Crestline Capital

A comprehensive banking application with double-entry ledger accounting, role-based access control (RBAC), and production-ready financial operations.

## Status

✅ **Production Ready** - Decimal arithmetic fixes applied across all monetary operations

## Features

- **Customer Portal** - Full banking functionality for customers
- **Admin Portal** - Administrative dashboard and management
- **Double-Entry Ledger** - Accurate financial tracking with journal entries
- **RBAC** - Role-based access control with 6 user roles
- **Financial Operations** - Deposits, withdrawals, transfers, transactions
- **Security** - JWT authentication, input validation, rate limiting
- **Compliance** - AML checks, fraud detection, audit logging

## Architecture

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT-based sessions
- **Validation**: Zod schemas
- **Styling**: Tailwind CSS
- **Package Manager**: pnpm

## Prerequisites

- Node.js v24.20.0 or higher
- pnpm v11.24.0 or higher
- PostgreSQL 14+ (for production)
- Git

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/owighoyotaemmanuel424-byte/crestlinev1.git
cd crestlinev1
```

### 2. Install Dependencies

```bash
# Use frozen lockfile for deterministic installation
pnpm install --frozen-lockfile
```

### 3. Configure Environment

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
# Edit .env with your actual values
```

**Required Environment Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:password@localhost:5432/crestline?schema=public` |
| `JWT_SECRET` | JWT signing secret | `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | Data encryption key | `openssl rand -base64 32` |
| `NEXT_PUBLIC_PROVIDER_MODE` | Provider mode | `sandbox` or `production` |
| `JWT_EXPIRES_IN` | JWT expiration | `1h` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `900000` (15 minutes) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |
| `WEBHOOK_SECRET` | Webhook verification | Your secret key |

### 4. Initialize Database

```bash
# Validate Prisma schema
pnpm exec prisma validate

# Generate Prisma client
pnpm exec prisma generate

# Push schema to database (development)
pnpm db:push

# Or run migrations (production)
pnpm db:migrate

# Optional: Seed database with test data
pnpm db:seed
```

### 5. Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Running Tests

### Unit Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific test suites
pnpm test:unit      # Unit tests only
pnpm test:integration  # Integration tests only

# Run in watch mode
pnpm test:watch
```

### Test Configuration

Tests are located in:
- `tests/unit/` - Unit tests for services and middleware
- `tests/integration/` - Integration tests for financial operations
- `tests/setup.ts` - Jest setup file with mocks

## Production Build

### Build for Production

```bash
# Install dependencies with frozen lockfile
pnpm install --frozen-lockfile

# Validate Prisma schema
pnpm exec prisma validate

# Generate Prisma client
pnpm exec prisma generate

# Run type checking
pnpm type-check

# Run linting
pnpm lint

# Run tests
pnpm test

# Build the application
pnpm build
```

The production build will be created in the `.next/` directory.

## Deployment

### Option 1: Vercel (Recommended)

Crestline Capital is configured for seamless deployment on Vercel.

#### Prerequisites

- [Vercel account](https://vercel.com)
- [Vercel CLI](https://vercel.com/docs/cli) installed

#### Deploy

```bash
# Install Vercel CLI globally
pnpm add -g vercel

# Deploy to Vercel
vercel
```

#### Production Deployment

1. Push your code to GitHub
2. Import the repository in Vercel dashboard
3. Configure environment variables in Vercel:
   - `DATABASE_URL` - Your production PostgreSQL connection string
   - `JWT_SECRET` - Generate with: `openssl rand -base64 32`
   - `ENCRYPTION_KEY` - Generate with: `openssl rand -base64 32`
   - `NEXT_PUBLIC_PROVIDER_MODE` - `production`
   - `NEXT_PUBLIC_APP_URL` - Your production URL

4. Deploy!

Vercel automatically:
- Uses `pnpm install --frozen-lockfile` for installation
- Runs `pnpm build` for building
- Handles serverless functions for API routes

#### vercel.json Configuration

The repository includes a `vercel.json` file with:
- Node.js version: 24
- pnpm version: 11
- Build command: `pnpm build`
- Install command: `pnpm install --frozen-lockfile`

### Option 2: Docker

#### Build Docker Image

```bash
# Build the image
docker build -t crestlinev1 .

# Or use docker-compose
docker-compose build
```

#### Run Container

```bash
# Run with Docker
docker run -p 3000:3000 crestlinev1

# Or with docker-compose
docker-compose up -d
```

#### Docker Compose Configuration

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:password@db:5432/crestline?schema=public
      - JWT_SECRET=your-jwt-secret
      - ENCRYPTION_KEY=your-encryption-key
      - NEXT_PUBLIC_PROVIDER_MODE=production
    depends_on:
      - db

  db:
    image: postgres:15
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=crestline
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
```

### Option 3: Manual Deployment

For any Node.js hosting (AWS, Render, Railway, etc.):

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Generate Prisma client
pnpm exec prisma generate

# Build the application
pnpm build

# Start the server
pnpm start
```

The application will run on port 3000 by default.

## Database Management

### Prisma Commands

| Command | Description |
|---------|-------------|
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:push` | Push schema to database (dev) |
| `pnpm db:migrate` | Create and apply migrations (dev) |
| `pnpm db:migrate:deploy` | Apply migrations (production) |
| `pnpm db:studio` | Open Prisma Studio GUI |
| `pnpm db:seed` | Seed database with test data |
| `pnpm db:clean` | Reset database (DANGER: destructive) |

### Production Database

For production deployments:

1. **Use connection pooling**: Configure your PostgreSQL connection pooler (PgBouncer)
2. **Use migrations**: Always use `pnpm db:migrate:deploy` in production, never `pnpm db:push`
3. **Separate credentials**: Use different database credentials for each environment
4. **Backup**: Ensure regular backups are configured

### Database Schema

The application uses a comprehensive schema with:
- Users and authentication
- Accounts and transactions
- Transfers and deposits
- KYC and compliance
- Audit logging
- Notifications
- And more...

## Project Structure

```
crestlinev1/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes
│   │   │   ├── accounts/
│   │   │   ├── transactions/
│   │   │   ├── transfers/
│   │   │   ├── deposits/
│   │   │   ├── withdrawals/
│   │   │   └── ...
│   │   ├── (auth)/            # Auth pages
│   │   ├── dashboard/         # Dashboard pages
│   │   └── ...
│   ├── lib/
│   │   ├── api/               # API client files
│   │   ├── middleware/         # Express-style middleware
│   │   ├── services/          # Business logic services
│   │   ├── utils/             # Utility functions
│   │   └── prisma.ts          # Prisma client singleton
│   └── styles/                # Global styles
├── prisma/
│   ├── schema.prisma          # Prisma schema
│   └── seed.ts                # Database seeding
├── tests/
│   ├── unit/                  # Unit tests
│   │   ├── services/
│   │   └── middleware/
│   ├── integration/           # Integration tests
│   └── setup.ts               # Jest setup
├── .env.example               # Environment variables template
├── .gitignore                 # Git ignore rules
├── jest.config.js             # Jest configuration
├── next.config.js             # Next.js configuration
├── package.json               # Project configuration
├── tsconfig.json              # TypeScript configuration
└── vercel.json                # Vercel deployment configuration
```

## Security Considerations

### Authentication & Authorization

- All API endpoints are protected with JWT authentication
- Role-based access control (RBAC) with 6 roles:
  - CUSTOMER: Regular users
  - SUPPORT: Support staff
  - OPERATOR: Operations staff
  - COMPLIANCE: Compliance officers
  - ADMIN: Administrators
  - SUPER_ADMIN: Full access

- Server-side authorization checks on all protected routes
- Never trust client-side validation alone

### Data Protection

- Sensitive data is encrypted at rest
- Passwords are hashed with bcrypt
- JWT tokens are signed and have expiration
- Rate limiting prevents brute force attacks

### Input Validation

- All inputs are validated with Zod schemas
- Decimal arithmetic prevents floating-point precision errors
- Sanitization on all user inputs

## Financial Operations

All monetary values use **Decimal** from `@prisma/client/runtime/library` to ensure:

- **Precision**: No floating-point rounding errors
- **Accuracy**: Exact decimal arithmetic (0.1 + 0.2 = 0.3, not 0.30000000000000004)
- **Consistency**: All financial calculations use the same Decimal type

### Supported Operations

- **Deposits**: Add funds to accounts
- **Withdrawals**: Remove funds from accounts
- **Transfers**: Move funds between accounts
- **Transactions**: Record financial activities
- **Ledger**: Double-entry accounting with journal entries

### Decimal Usage Examples

```typescript
import { Decimal } from '@prisma/client/runtime/library';

// Creating Decimal values
const amount = new Decimal('100.50');
const fee = new Decimal('5.00');

// Arithmetic operations
const total = amount.plus(fee); // 105.50
const net = amount.minus(fee); // 95.50
const product = amount.times(2); // 201.00
const ratio = amount.div(2); // 50.25

// Comparison
if (amount.greaterThan(new Decimal('50.00'))) {
  // Do something
}

// In Prisma operations
await prisma.account.update({
  where: { id: 'account-1' },
  data: { balance: new Decimal('1500.00') }
});
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register new user |
| POST | /api/auth/login | Login and get token |
| POST | /api/auth/logout | Logout and invalidate session |
| GET | /api/auth/me | Get current user |

### Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/accounts | List user accounts |
| GET | /api/accounts/:id | Get account details |
| POST | /api/accounts | Create new account |
| PUT | /api/accounts/:id | Update account |
| DELETE | /api/accounts/:id | Close account |

### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/transactions | List transactions |
| GET | /api/transactions/:id | Get transaction details |
| POST | /api/transactions | Create transaction |

### Transfers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/transfers | List transfers |
| GET | /api/transfers/:id | Get transfer details |
| POST | /api/transfers | Create transfer |

### Deposits

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/deposits | List deposits |
| GET | /api/deposits/:id | Get deposit details |
| POST | /api/deposits | Create deposit |

### Withdrawals

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/withdrawals | List withdrawals |
| GET | /api/withdrawals/:id | Get withdrawal details |
| POST | /api/withdrawals | Create withdrawal |

## Demo Credentials

For local development and testing:

| Role | Email | Password |
|------|-------|----------|
| Customer | john.doe@crestline.capital | Demo@123456 |
| Admin | admin@crestline.capital | Admin@123456 |

## Monitoring & Logging

### Health Check

```bash
# Check application health
curl http://localhost:3000/api/health
```

### Logging

- Application logs are written to stdout
- Error logs include stack traces
- Request logging for debugging

## Troubleshooting

### Common Issues

#### Prisma Build Errors

If you see `ERR_PNPM_IGNORED_BUILDS`:

```bash
# Approve Prisma builds
pnpm approve-builds

# Or install with:
pnpm install --ignore-scripts
```

#### Database Connection Issues

1. Verify your `DATABASE_URL` is correct
2. Ensure PostgreSQL is running
3. Check firewall settings
4. Test connection with: `psql -h localhost -U user -d crestline`

#### Test Failures

```bash
# Run tests with verbose output
pnpm test --verbose

# Run specific test
pnpm test tests/unit/services/auth.service.test.ts
```

#### Build Failures

```bash
# Clean and rebuild
rm -rf .next node_modules
pnpm install --frozen-lockfile
pnpm build
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `pnpm test`
5. Run lint: `pnpm lint`
6. Run type-check: `pnpm type-check`
7. Submit a pull request

## License

Private - All rights reserved.

## Support

For issues or questions:
- Check the README and documentation
- Review the test files for usage examples
- Inspect the Prisma schema for database structure
- Check the API endpoints for integration

## Changelog

### Recent Changes

- ✅ Fixed Jest configuration to use existing test directory
- ✅ Added comprehensive unit tests for critical services
- ✅ Added integration tests for financial operations
- ✅ Updated package.json with packageManager field
- ✅ Added vercel.json for Vercel deployment
- ✅ Updated .env.example with all required variables
- ✅ Updated .gitignore with comprehensive patterns
- ✅ Updated CI workflow with correct Node.js and pnpm versions
- ✅ Applied Decimal arithmetic fixes across all monetary operations
- ✅ Verified Prisma configuration and schema

---

**Built with Next.js, Prisma, and TypeScript**

For production use, ensure all environment variables are properly configured and database connections are secured.
