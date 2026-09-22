/**
 * @jest-environment node
 */

import { AccountService } from '../../src/lib/services/account-service';
import { TransactionService } from '../../src/lib/services/transaction-service';
import { TransferService } from '../../src/lib/services/transfer-service';
import { DepositService } from '../../src/lib/services/deposit-service';
import { prisma } from '../../src/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

// Mock the prisma client for integration-style tests
jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    account: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    transaction: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    transfer: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    deposit: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
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

describe('Financial Operations Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Decimal Arithmetic Verification', () => {
    it('should maintain Decimal precision across all financial operations', async () => {
      // Create an account with initial balance
      const initialBalance = new Decimal('10000.00');
      const mockAccount = {
        id: 'account-1',
        accountNumber: 'ACC-001',
        balance: initialBalance,
        availableBalance: initialBalance,
        status: 'ACTIVE',
        currency: 'USD',
        userId: 'user-1',
      };

      mockPrisma.account.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.account.findMany.mockResolvedValue([mockAccount]);
      mockPrisma.deposit.aggregate.mockResolvedValue({ _sum: { amount: null } });
      mockPrisma.ledgerEntry.findMany.mockResolvedValue([
        { accountId: 'account-1', entryType: 'CREDIT', amount: new Decimal('500.00'), account: mockAccount },
      ]);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma));
      mockPrisma.account.update.mockImplementation((args: any) => {
        return Promise.resolve({ ...mockAccount, balance: args.data.balance });
      });
      mockPrisma.deposit.create.mockResolvedValue({ id: 'dep-1', amount: new Decimal('500.00') });
      mockPrisma.transaction.create.mockResolvedValue({ id: 'txn-1', amount: new Decimal('100.00') });
      mockPrisma.journal.create.mockResolvedValue({ id: 'journal-1' });
      mockPrisma.ledgerEntry.create.mockResolvedValue({ id: 'ledger-1' });
      mockPrisma.deposit.count.mockResolvedValue(1);
      mockPrisma.transaction.count.mockResolvedValue(1);

      // Test deposit
      await DepositService.createDeposit({
        accountId: 'account-1',
        userId: 'user-1',
        amount: new Decimal('500.00'),
        currency: 'USD',
        method: 'ACH',
        description: 'Deposit',
      });

      // Verify deposit used Decimal
      const depositCalls = mockPrisma.deposit.create.mock.calls;
      expect(depositCalls.length).toBeGreaterThan(0);
      expect(depositCalls[0][0].data.amount).toBeInstanceOf(Decimal);
    });

    it('should handle Decimal operations without floating point errors', async () => {
      // Test that Decimal arithmetic avoids floating point precision issues
      const amount1 = new Decimal('0.1');
      const amount2 = new Decimal('0.2');
      const sum = amount1.plus(amount2);

      // With Decimal, 0.1 + 0.2 = 0.3 exactly
      expect(sum.toString()).toBe('0.3');
      expect(sum).not.toBe(0.3); // Should be Decimal, not number

      // Test with financial amounts
      const amount3 = new Decimal('100.10');
      const amount4 = new Decimal('200.20');
      const amount5 = new Decimal('50.30');
      const total = amount3.plus(amount4).plus(amount5);

      // Decimal.toString() drops trailing zeros; toFixed(2) preserves them.
      expect(total.toFixed(2)).toBe('350.60');
      expect(total).toBeInstanceOf(Decimal);
    });
  });
});
