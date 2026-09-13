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
    },
    transfer: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    deposit: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
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

describe('Financial Operations Integration', () => {
  let accountService: AccountService;
  let transactionService: TransactionService;
  let transferService: TransferService;
  let depositService: DepositService;

  beforeEach(() => {
    accountService = new AccountService();
    transactionService = new TransactionService();
    transferService = new TransferService();
    depositService = new DepositService();
    jest.clearAllMocks();
  });

  describe('Decimal Arithmetic Verification', () => {
    it('should maintain Decimal precision across all financial operations', async () => {
      // Create an account with initial balance
      const initialBalance = new Decimal('10000.00');
      const mockAccount = {
        id: 'account-1',
        balance: initialBalance,
        currency: 'USD',
        userId: 'user-1',
      };

      // Mock the prisma client to return our test data
      const mockPrisma: any = {
        account: {
          findUnique: jest.fn().mockResolvedValue(mockAccount),
          update: jest.fn().mockImplementation((args: any) => {
            return Promise.resolve({
              ...mockAccount,
              balance: args.data.balance,
            });
          }),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
        },
        transaction: {
          create: jest.fn().mockResolvedValue({
            id: 'txn-1',
            amount: new Decimal('100.00'),
          }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        deposit: {
          create: jest.fn().mockResolvedValue({
            id: 'dep-1',
            amount: new Decimal('500.00'),
          }),
        },
        transfer: {
          create: jest.fn().mockResolvedValue({
            id: 'trf-1',
            amount: new Decimal('200.00'),
          }),
        },
        journal: {
          create: jest.fn().mockResolvedValue({ id: 'journal-1' }),
        },
        ledgerEntry: {
          create: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        $transaction: jest.fn().mockImplementation(async (callback: any) => {
          return await callback(mockPrisma);
        }),
      };

      // Replace the mock
      (prisma as any).mockImplementation(() => mockPrisma);

      // Test deposit
      await depositService.createDeposit({
        accountId: 'account-1',
        userId: 'user-1',
        amount: new Decimal('500.00'),
        currency: 'USD',
        method: 'BANK_TRANSFER',
        description: 'Deposit',
      });

      // Test transaction
      await transactionService.createTransaction({
        accountId: 'account-1',
        userId: 'user-1',
        amount: new Decimal('100.00'),
        type: 'DEBIT',
        description: 'Purchase',
        currency: 'USD',
      });

      // Test another deposit
      await depositService.createDeposit({
        accountId: 'account-1',
        userId: 'user-1',
        amount: new Decimal('250.00'),
        currency: 'USD',
        method: 'BANK_TRANSFER',
        description: 'Second deposit',
      });

      // Verify all amounts were Decimal instances
      const depositCalls = (prisma.deposit.create as jest.Mock).mock.calls;
      const transactionCalls = (prisma.transaction.create as jest.Mock).mock.calls;

      expect(depositCalls.length).toBeGreaterThan(0);
      expect(transactionCalls.length).toBeGreaterThan(0);

      // Verify Decimal was used in all calls
      for (const call of depositCalls) {
        expect(call[0].data.amount).toBeInstanceOf(Decimal);
      }
      for (const call of transactionCalls) {
        expect(call[0].data.amount).toBeInstanceOf(Decimal);
      }
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

      expect(total.toString()).toBe('350.60');
      expect(total).toBeInstanceOf(Decimal);
    });
  });

  describe('End-to-End Financial Flow', () => {
    it('should process deposit, transaction, and transfer with consistent Decimal usage', async () => {
      const mockPrisma: any = {
        account: {
          findUnique: jest.fn().mockImplementation((args: any) => {
            if (args.where.id === 'account-1') {
              return Promise.resolve({
                id: 'account-1',
                balance: new Decimal('1000.00'),
                currency: 'USD',
                userId: 'user-1',
              });
            }
            if (args.where.id === 'account-2') {
              return Promise.resolve({
                id: 'account-2',
                balance: new Decimal('500.00'),
                currency: 'USD',
                userId: 'user-2',
              });
            }
            return Promise.resolve(null);
          }),
          update: jest.fn().mockImplementation((args: any) => {
            return Promise.resolve({
              id: args.where.id,
              balance: args.data.balance,
            });
          }),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
        },
        deposit: {
          create: jest.fn().mockResolvedValue({
            id: 'dep-1',
            amount: new Decimal('500.00'),
          }),
          findUnique: jest.fn(),
          findMany: jest.fn(),
        },
        transaction: {
          create: jest.fn().mockResolvedValue({
            id: 'txn-1',
            amount: new Decimal('200.00'),
          }),
          findUnique: jest.fn(),
          findMany: jest.fn(),
        },
        transfer: {
          create: jest.fn().mockResolvedValue({
            id: 'trf-1',
            amount: new Decimal('300.00'),
          }),
          findUnique: jest.fn(),
          findMany: jest.fn(),
        },
        journal: {
          create: jest.fn().mockResolvedValue({ id: 'journal-1' }),
        },
        ledgerEntry: {
          create: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        $transaction: jest.fn().mockImplementation(async (callback: any) => {
          return await callback(mockPrisma);
        }),
      };

      (prisma as any).mockImplementation(() => mockPrisma);

      // Execute financial operations
      await depositService.createDeposit({
        accountId: 'account-1',
        userId: 'user-1',
        amount: new Decimal('500.00'),
        currency: 'USD',
        method: 'BANK_TRANSFER',
        description: 'Initial deposit',
      });

      await transactionService.createTransaction({
        accountId: 'account-1',
        userId: 'user-1',
        amount: new Decimal('200.00'),
        type: 'DEBIT',
        description: 'Withdrawal',
        currency: 'USD',
      });

      await transferService.createTransfer({
        senderAccountId: 'account-1',
        recipientAccountId: 'account-2',
        amount: new Decimal('300.00'),
        currency: 'USD',
        description: 'Transfer to friend',
        userId: 'user-1',
      });

      // Verify all operations used Decimal
      const depositCalls = (prisma.deposit.create as jest.Mock).mock.calls;
      const transactionCalls = (prisma.transaction.create as jest.Mock).mock.calls;
      const transferCalls = (prisma.transfer.create as jest.Mock).mock.calls;

      expect(depositCalls.length).toBeGreaterThan(0);
      expect(transactionCalls.length).toBeGreaterThan(0);
      expect(transferCalls.length).toBeGreaterThan(0);

      for (const call of [...depositCalls, ...transactionCalls, ...transferCalls]) {
        expect(call[0].data.amount).toBeInstanceOf(Decimal);
      }
    });
  });
});
