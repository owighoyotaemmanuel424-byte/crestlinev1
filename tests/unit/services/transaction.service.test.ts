/**
 * @jest-environment node
 */

import { TransactionService } from '../../../../src/lib/services/transaction-service';
import { prisma } from '../../../../src/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

// Mock the prisma client
jest.mock('../../../../src/lib/prisma', () => ({
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
    $transaction: jest.fn((callback) => callback({})),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('TransactionService', () => {
  let transactionService: TransactionService;

  beforeEach(() => {
    transactionService = new TransactionService();
    jest.clearAllMocks();
  });

  describe('createTransaction', () => {
    it('should create transaction with Decimal amount', async () => {
      const mockAccount = {
        id: 'account-1',
        balance: new Decimal('1000.00'),
        currency: 'USD',
      };

      const mockTransaction = {
        id: 'txn-1',
        reference: 'TXN-001',
        accountId: 'account-1',
        userId: 'user-1',
        amount: new Decimal('100.00'),
        type: 'DEBIT',
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

      const result = await transactionService.createTransaction({
        accountId: 'account-1',
        userId: 'user-1',
        amount: new Decimal('100.00'),
        type: 'DEBIT',
        description: 'Test transaction',
        currency: 'USD',
      });

      expect(mockPrisma.transaction.create).toHaveBeenCalled();
      expect(result.amount).toBeInstanceOf(Decimal);
      expect(result.amount).toEqual(new Decimal('100.00'));
    });

    it('should reject transaction with zero amount', async () => {
      await expect(
        transactionService.createTransaction({
          accountId: 'account-1',
          userId: 'user-1',
          amount: new Decimal('0.00'),
          type: 'DEBIT',
          description: 'Zero amount',
          currency: 'USD',
        })
      ).rejects.toThrow('Transaction amount must be greater than zero');
    });

    it('should reject transaction with negative amount', async () => {
      await expect(
        transactionService.createTransaction({
          accountId: 'account-1',
          userId: 'user-1',
          amount: new Decimal('-100.00'),
          type: 'DEBIT',
          description: 'Negative amount',
          currency: 'USD',
        })
      ).rejects.toThrow('Transaction amount must be positive');
    });
  });

  describe('getAccountTransactions', () => {
    it('should return transactions with Decimal amounts', async () => {
      const mockTransactions = [
        {
          id: 'txn-1',
          amount: new Decimal('100.00'),
          type: 'DEBIT',
          description: 'Transaction 1',
        },
        {
          id: 'txn-2',
          amount: new Decimal('200.00'),
          type: 'CREDIT',
          description: 'Transaction 2',
        },
      ];

      mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions);

      const result = await transactionService.getAccountTransactions(
        'account-1',
        { page: 1, limit: 10 }
      );

      expect(result.transactions.length).toBe(2);
      expect(result.transactions[0].amount).toBeInstanceOf(Decimal);
      expect(result.transactions[1].amount).toBeInstanceOf(Decimal);
    });
  });

  describe('getAccountBalanceFromTransactions', () => {
    it('should calculate balance from transactions using Decimal arithmetic', async () => {
      const mockLedgerEntries = [
        { amount: new Decimal('1000.00'), type: 'CREDIT' },
        { amount: new Decimal('200.00'), type: 'DEBIT' },
        { amount: new Decimal('500.00'), type: 'CREDIT' },
        { amount: new Decimal('150.00'), type: 'DEBIT' },
      ];

      mockPrisma.ledgerEntry.findMany.mockResolvedValue(mockLedgerEntries);

      const balance = await transactionService.getAccountBalanceFromTransactions(
        'account-1'
      );

      // 1000 + 500 - 200 - 150 = 1150
      expect(balance).toEqual(new Decimal('1150.00'));
      expect(balance).toBeInstanceOf(Decimal);
    });
  });
});
