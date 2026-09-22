import { jest } from '@jest/globals';

// ============================================
// JEST TEST SETUP
// ============================================

// Mock environment variables for testing
Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: true });
process.env.DATABASE_URL = 'file:./dev.db';
process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_EXPIRES_IN = '1h';

// Mock Prisma client for unit tests
jest.mock('../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    transaction: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    transfer: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    deposit: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    withdrawal: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    kYCProfile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    kYCDocument: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    auditLog: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    notification: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    journal: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    ledgerEntry: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    session: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

// Global test utilities
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Helper to mock Prisma responses.
// Writes must go through the SAME mock instance the services receive — i.e.
// the factory registered above — so re-read it lazily on every helper call.
type MockablePrisma = Record<string, Record<string, any>>;

function getMockPrisma(): MockablePrisma {
  return (jest.requireMock('../src/lib/prisma') as { prisma: MockablePrisma }).prisma;
}

function ensureModel(model: string): Record<string, any> {
  const prisma = getMockPrisma();
  if (!prisma[model]) prisma[model] = {};
  return prisma[model];
}

export function mockPrismaFindUnique(model: string, data: unknown) {
  const mock = jest.fn(async () => data);
  ensureModel(model).findUnique = mock;
  return mock;
}

export function mockPrismaFindMany(model: string, data: unknown[]) {
  const mock = jest.fn(async () => data);
  ensureModel(model).findMany = mock;
  return mock;
}

export function mockPrismaCreate(model: string, data: unknown) {
  const mock = jest.fn(async () => data);
  ensureModel(model).create = mock;
  return mock;
}

export function mockPrismaUpdate(model: string, data: unknown) {
  const mock = jest.fn(async () => data);
  ensureModel(model).update = mock;
  return mock;
}

export function mockPrismaCount(model: string, count: number) {
  const mock = jest.fn(async () => count);
  ensureModel(model).count = mock;
  return mock;
}

/** Proxy to the mocked prisma client for ad-hoc assertions in tests */
export const mockPrisma: MockablePrisma = new Proxy({} as MockablePrisma, {
  get: (_target, prop) => (getMockPrisma() as any)[prop as string],
});

// Mock date for consistent testing
export const TEST_DATE = new Date('2024-01-15T10:00:00Z');

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(TEST_DATE);
});

afterAll(() => {
  jest.useRealTimers();
});
