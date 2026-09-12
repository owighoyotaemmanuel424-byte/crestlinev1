import { prisma } from '../src/lib/prisma';
import { jest } from '@jest/globals';

// ============================================
// JEST TEST SETUP
// ============================================

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./dev.db';
process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_EXPIRES_IN = '1h';

// Mock Prisma client for unit tests
jest.mock('../src/lib/prisma', () => ({
  prisma: {
    // Mock all Prisma methods
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

// Helper to mock Prisma responses
export function mockPrismaFindUnique(model: string, data: any) {
  const mock = jest.fn().mockResolvedValue(data);
  (prisma as any)[model].findUnique = mock;
  return mock;
}

export function mockPrismaFindMany(model: string, data: any[]) {
  const mock = jest.fn().mockResolvedValue(data);
  (prisma as any)[model].findMany = mock;
  return mock;
}

export function mockPrismaCreate(model: string, data: any) {
  const mock = jest.fn().mockResolvedValue(data);
  (prisma as any)[model].create = mock;
  return mock;
}

export function mockPrismaUpdate(model: string, data: any) {
  const mock = jest.fn().mockResolvedValue(data);
  (prisma as any)[model].update = mock;
  return mock;
}

export function mockPrismaCount(model: string, count: number) {
  const mock = jest.fn().mockResolvedValue(count);
  (prisma as any)[model].count = mock;
  return mock;
}

// Mock date for consistent testing
export const TEST_DATE = new Date('2024-01-15T10:00:00Z');

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(TEST_DATE);
});

afterAll(() => {
  jest.useRealTimers();
});
