/**
 * @jest-environment node
 */

import { TransactionService } from '../../../src/lib/services/transaction-service';
import { prisma } from '../../../src/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

// Mock the prisma client
jest.mock('../../../src/lib/prisma', () => ({
  prisma: {
    transaction: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
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
    $transaction: jest.fn((callback: any) => callback({})),
  },
}));

const mockPrisma = prisma as any;

describe('TransactionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createTransaction', () => {
    it('should create transaction with Decimal amount', async () => {
      const mockAccount = {
        id: 'account-1',
        userId: 'user-1',
        status: 'ACTIVE',
        balance: new Decimal('1000.00'),
        currency: 'USD',
      };

      const mockTransaction = {
        id: 'txn-1',
        reference: 'TXN-001',
        accountId: 'account-1',
        userId: 'user-1',
        amount: new Decimal('100.00'),
        type: 'WITHDRAWAL',
        description: 'Test transaction',
        status: 'COMPLETED',
        balanceAfter: new Decimal('900.00'),
        createdAt: new Date(),
      };

      mockPrisma.account.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const result = await callback(mockPrisma);
        return result;
      });
      mockPrisma.transaction.create.mockResolvedValue(mockTransaction);
      mockPrisma.journal.create.mockResolvedValue({ id: 'journal-1' });
      mockPrisma.ledgerEntry.create.mockResolvedValue({ id: 'ledger-1' });
      mockPrisma.account.update.mockResolvedValue({
        ...mockAccount,
        balance: new Decimal('900.00'),
      });

      const result = await TransactionService.createTransaction({
        accountId: 'account-1',
        userId: 'user-1',
        amount: new Decimal('100.00'),
        type: 'WITHDRAWAL',
        description: 'Test transaction',
      }, 'user-1');

      expect(mockPrisma.transaction.create).toHaveBeenCalled();
    });

    it('should reject transaction with zero amount', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.account.findUnique.mockResolvedValue({
        id: 'account-1',
        userId: 'user-1',
        status: 'ACTIVE',
        balance: new Decimal('1000.00'),
        currency: 'USD',
      });

      await expect(
        TransactionService.createTransaction({
          accountId: 'account-1',
          userId: 'user-1',
          amount: new Decimal('0.00'),
          type: 'WITHDRAWAL',
          description: 'Zero amount',
        }, 'user-1')
      ).rejects.toThrow();
    });

    it('should reject transaction with negative amount', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.account.findUnique.mockResolvedValue({
        id: 'account-1',
        userId: 'user-1',
        status: 'ACTIVE',
        balance: new Decimal('1000.00'),
        currency: 'USD',
      });

      await expect(
        TransactionService.createTransaction({
          accountId: 'account-1',
          userId: 'user-1',
          amount: new Decimal('-100.00'),
          type: 'WITHDRAWAL',
          description: 'Negative amount',
        }, 'user-1')
      ).rejects.toThrow();
    });
  });

  describe('getAccountTransactions', () => {
    it('should return transactions', async () => {
      const mockTransactions = [
        {
          id: 'txn-1',
          amount: new Decimal('100.00'),
          type: 'WITHDRAWAL',
          description: 'Transaction 1',
        },
        {
          id: 'txn-2',
          amount: new Decimal('200.00'),
          type: 'DEPOSIT',
          description: 'Transaction 2',
        },
      ];

      mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions);
      mockPrisma.transaction.count.mockResolvedValue(2);

      const result = await TransactionService.getAccountTransactions(
        'account-1',
        1,
        10,
        'user-1'
      );

      expect(result).toBeDefined();
    });
  });

  describe('getUserTransactions', () => {
    it('should return user transactions', async () => {
      const mockTransactions = [
        {
          id: 'txn-1',
          amount: new Decimal('100.00'),
          type: 'WITHDRAWAL',
          description: 'Transaction 1',
        },
      ];

      mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions);
      mockPrisma.transaction.count.mockResolvedValue(1);

      const result = await TransactionService.getUserTransactions('user-1');

      expect(result).toBeDefined();
    });
  });
});
