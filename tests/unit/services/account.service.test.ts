/**
 * @jest-environment node
 */

import { AccountService } from '../../../../src/lib/services/account-service';
import { prisma } from '../../../../src/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

// Mock the prisma client
jest.mock('../../../../src/lib/prisma', () => ({
  prisma: {
    account: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    ledgerEntry: {
      create: jest.fn(),
    },
    journal: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback({})),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('AccountService', () => {
  let accountService: AccountService;

  beforeEach(() => {
    accountService = new AccountService();
    jest.clearAllMocks();
  });

  describe('createAccount', () => {
    it('should create a new account with Decimal balance', async () => {
      const mockAccount = {
        id: 'account-1',
        accountNumber: 'ACC-001',
        userId: 'user-1',
        name: 'Primary Account',
        balance: new Decimal('1000.00'),
        currency: 'USD',
        type: 'CHECKING',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.account.create.mockResolvedValue(mockAccount);
      mockPrisma.journal.create.mockResolvedValue({ id: 'journal-1' });
      mockPrisma.ledgerEntry.create.mockResolvedValue({ id: 'ledger-1' });

      const result = await accountService.createAccount({
        userId: 'user-1',
        name: 'Primary Account',
        type: 'CHECKING',
        initialBalance: new Decimal('1000.00'),
        currency: 'USD',
      });

      expect(mockPrisma.account.create).toHaveBeenCalled();
      expect(result).toEqual(mockAccount);
    });

    it('should throw error if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        accountService.createAccount({
          userId: 'nonexistent',
          name: 'Primary Account',
          type: 'CHECKING',
          initialBalance: new Decimal('1000.00'),
          currency: 'USD',
        })
      ).rejects.toThrow('User not found');
    });
  });

  describe('getAccountBalance', () => {
    it('should return account balance as Decimal', async () => {
      const mockAccount = {
        id: 'account-1',
        balance: new Decimal('1500.50'),
        currency: 'USD',
      };

      mockPrisma.account.findUnique.mockResolvedValue(mockAccount);

      const balance = await accountService.getAccountBalance('account-1');

      expect(balance).toEqual(new Decimal('1500.50'));
      expect(balance).toBeInstanceOf(Decimal);
    });

    it('should throw error if account not found', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      await expect(
        accountService.getAccountBalance('nonexistent')
      ).rejects.toThrow('Account not found');
    });
  });

  describe('updateAccountBalance', () => {
    it('should update balance using Decimal arithmetic', async () => {
      const mockAccount = {
        id: 'account-1',
        balance: new Decimal('1000.00'),
        currency: 'USD',
      };

      mockPrisma.account.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.account.update.mockResolvedValue({
        ...mockAccount,
        balance: new Decimal('1100.00'),
      });
      mockPrisma.ledgerEntry.create.mockResolvedValue({ id: 'ledger-1' });

      const result = await accountService.updateAccountBalance(
        'account-1',
        new Decimal('100.00'),
        'CREDIT'
      );

      expect(mockPrisma.account.update).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: { balance: expect.any(Decimal) },
      });
    });

    it('should prevent negative balance for DEBIT operations', async () => {
      const mockAccount = {
        id: 'account-1',
        balance: new Decimal('100.00'),
        currency: 'USD',
      };

      mockPrisma.account.findUnique.mockResolvedValue(mockAccount);

      await expect(
        accountService.updateAccountBalance(
          'account-1',
          new Decimal('150.00'),
          'DEBIT'
        )
      ).rejects.toThrow('Insufficient funds');
    });
  });
});
