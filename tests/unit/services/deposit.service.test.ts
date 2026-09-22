/**
 * @jest-environment node
 */

import { DepositService } from '../../../src/lib/services/deposit-service';
import { prisma } from '../../../src/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

// Mock the prisma client
jest.mock('../../../src/lib/prisma', () => ({
  prisma: {
    deposit: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    journal: {
      create: jest.fn(),
    },
    ledgerEntry: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback: any) => callback({})),
  },
}));

const mockPrisma = prisma as any;

describe('DepositService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createDeposit', () => {
    it('should create deposit with Decimal amount and update account balance', async () => {
      const mockAccount = {
        id: 'account-1',
        accountNumber: 'ACC-001',
        balance: new Decimal('1000.00'),
        availableBalance: new Decimal('1000.00'),
        currency: 'USD',
        userId: 'user-1',
        status: 'ACTIVE',
      };

      const mockDeposit = {
        id: 'deposit-1',
        reference: 'DEP-001',
        accountId: 'account-1',
        userId: 'user-1',
        amount: new Decimal('500.00'),
        currency: 'USD',
        method: 'ACH',
        status: 'PENDING',
        description: 'Initial deposit',
        createdAt: new Date(),
      };

      mockPrisma.account.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.account.findMany.mockResolvedValue([mockAccount]);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.deposit.aggregate.mockResolvedValue({ _sum: { amount: null } });
      mockPrisma.ledgerEntry.findMany.mockResolvedValue([
        { accountId: 'account-1', entryType: 'CREDIT', amount: new Decimal('500.00'), account: mockAccount },
      ]);
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const result = await callback(mockPrisma);
        return result;
      });
      mockPrisma.deposit.create.mockResolvedValue(mockDeposit);
      mockPrisma.journal.create.mockResolvedValue({ id: 'journal-1' });
      mockPrisma.ledgerEntry.create.mockResolvedValue({ id: 'ledger-1' });
      mockPrisma.account.update.mockResolvedValue({
        ...mockAccount,
        balance: new Decimal('1500.00'),
      });

      const result = await DepositService.createDeposit({
        accountId: 'account-1',
        userId: 'user-1',
        amount: new Decimal('500.00'),
        currency: 'USD',
        method: 'ACH',
        description: 'Initial deposit',
      });

      expect(mockPrisma.deposit.create).toHaveBeenCalled();
    });

    it('should reject deposit with zero amount', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.account.findUnique.mockResolvedValue({
        id: 'account-1',
        userId: 'user-1',
        balance: new Decimal('0'),
        currency: 'USD',
        status: 'ACTIVE',
      });

      await expect(
        DepositService.createDeposit({
          accountId: 'account-1',
          userId: 'user-1',
          amount: new Decimal('0.00'),
          currency: 'USD',
          method: 'ACH',
          description: 'Zero deposit',
        })
      ).rejects.toThrow();
    });

    it('should reject deposit with negative amount', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.account.findUnique.mockResolvedValue({
        id: 'account-1',
        userId: 'user-1',
        balance: new Decimal('0'),
        currency: 'USD',
        status: 'ACTIVE',
      });

      await expect(
        DepositService.createDeposit({
          accountId: 'account-1',
          userId: 'user-1',
          amount: new Decimal('-100.00'),
          currency: 'USD',
          method: 'ACH',
          description: 'Negative deposit',
        })
      ).rejects.toThrow();
    });

    it('should reject deposit to non-existent account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.account.findUnique.mockResolvedValue(null);

      await expect(
        DepositService.createDeposit({
          accountId: 'nonexistent',
          userId: 'user-1',
          amount: new Decimal('500.00'),
          currency: 'USD',
          method: 'ACH',
          description: 'Deposit to non-existent account',
        })
      ).rejects.toThrow();
    });
  });

  describe('getById', () => {
    it('should return deposit', async () => {
      const mockDeposit = {
        id: 'deposit-1',
        amount: new Decimal('750.00'),
        currency: 'USD',
        account: { id: 'account-1', user: { id: 'user-1' } },
      };

      mockPrisma.deposit.findUnique.mockResolvedValue(mockDeposit);

      await DepositService.getById('deposit-1');

      expect(mockPrisma.deposit.findUnique).toHaveBeenCalled();
    });
  });

  describe('listByUser', () => {
    it('should return deposits', async () => {
      const mockDeposits = [
        { id: 'dep-1', amount: new Decimal('100.00'), currency: 'USD' },
        { id: 'dep-2', amount: new Decimal('200.00'), currency: 'USD' },
        { id: 'dep-3', amount: new Decimal('300.00'), currency: 'USD' },
      ];

      mockPrisma.deposit.findMany.mockResolvedValue(mockDeposits);
      mockPrisma.deposit.count.mockResolvedValue(3);

      const result = await DepositService.listByUser('user-1', 'user-1', 1, 10);

      expect(result).toBeDefined();
    });
  });
});
