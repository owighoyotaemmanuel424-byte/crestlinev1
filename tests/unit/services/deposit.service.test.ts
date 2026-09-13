/**
 * @jest-environment node
 */

import { DepositService } from '../../../../src/lib/services/deposit-service';
import { prisma } from '../../../../src/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

// Mock the prisma client
jest.mock('../../../../src/lib/prisma', () => ({
  prisma: {
    deposit: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
    },
    $transaction: jest.fn((callback) => callback({})),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('DepositService', () => {
  let depositService: DepositService;

  beforeEach(() => {
    depositService = new DepositService();
    jest.clearAllMocks();
  });

  describe('createDeposit', () => {
    it('should create deposit with Decimal amount and update account balance', async () => {
      const mockAccount = {
        id: 'account-1',
        balance: new Decimal('1000.00'),
        currency: 'USD',
        userId: 'user-1',
      };

      const mockDeposit = {
        id: 'deposit-1',
        reference: 'DEP-001',
        accountId: 'account-1',
        userId: 'user-1',
        amount: new Decimal('500.00'),
        currency: 'USD',
        method: 'BANK_TRANSFER',
        status: 'PENDING',
        description: 'Initial deposit',
        createdAt: new Date(),
      };

      mockPrisma.account.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
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

      const result = await depositService.createDeposit({
        accountId: 'account-1',
        userId: 'user-1',
        amount: new Decimal('500.00'),
        currency: 'USD',
        method: 'BANK_TRANSFER',
        description: 'Initial deposit',
      });

      expect(mockPrisma.deposit.create).toHaveBeenCalled();
      expect(result.amount).toBeInstanceOf(Decimal);
      expect(result.amount).toEqual(new Decimal('500.00'));
    });

    it('should reject deposit with zero amount', async () => {
      await expect(
        depositService.createDeposit({
          accountId: 'account-1',
          userId: 'user-1',
          amount: new Decimal('0.00'),
          currency: 'USD',
          method: 'BANK_TRANSFER',
          description: 'Zero deposit',
        })
      ).rejects.toThrow('Deposit amount must be greater than zero');
    });

    it('should reject deposit with negative amount', async () => {
      await expect(
        depositService.createDeposit({
          accountId: 'account-1',
          userId: 'user-1',
          amount: new Decimal('-100.00'),
          currency: 'USD',
          method: 'BANK_TRANSFER',
          description: 'Negative deposit',
        })
      ).rejects.toThrow('Deposit amount must be positive');
    });

    it('should reject deposit to non-existent account', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      await expect(
        depositService.createDeposit({
          accountId: 'nonexistent',
          userId: 'user-1',
          amount: new Decimal('500.00'),
          currency: 'USD',
          method: 'BANK_TRANSFER',
          description: 'Deposit to non-existent account',
        })
      ).rejects.toThrow('Account not found');
    });
  });

  describe('getDepositById', () => {
    it('should return deposit with Decimal amount', async () => {
      const mockDeposit = {
        id: 'deposit-1',
        amount: new Decimal('750.00'),
        currency: 'USD',
      };

      mockPrisma.deposit.findUnique.mockResolvedValue(mockDeposit);

      const result = await depositService.getDepositById('deposit-1');

      expect(result.amount).toBeInstanceOf(Decimal);
      expect(result.amount).toEqual(new Decimal('750.00'));
    });
  });

  describe('getAccountDeposits', () => {
    it('should return deposits with Decimal amounts', async () => {
      const mockDeposits = [
        { id: 'dep-1', amount: new Decimal('100.00'), currency: 'USD' },
        { id: 'dep-2', amount: new Decimal('200.00'), currency: 'USD' },
        { id: 'dep-3', amount: new Decimal('300.00'), currency: 'USD' },
      ];

      mockPrisma.deposit.findMany.mockResolvedValue(mockDeposits);

      const result = await depositService.getAccountDeposits('account-1', {
        page: 1,
        limit: 10,
      });

      expect(result.deposits.length).toBe(3);
      expect(result.deposits[0].amount).toBeInstanceOf(Decimal);
      expect(result.deposits[1].amount).toBeInstanceOf(Decimal);
      expect(result.deposits[2].amount).toBeInstanceOf(Decimal);
    });
  });
});
