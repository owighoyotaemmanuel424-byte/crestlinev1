/**
 * @jest-environment node
 */

import { AccountService } from '../../../src/lib/services/account-service';
import { prisma } from '../../../src/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

// Mock the prisma client
jest.mock('../../../src/lib/prisma', () => ({
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
    $transaction: jest.fn((callback: any) => callback({})),
  },
}));

const mockPrisma = prisma as any;

describe('AccountService', () => {
  beforeEach(() => {
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

      const result = await AccountService.createAccount({
        userId: 'user-1',
        name: 'Primary Account',
        accountType: 'CHECKING',
        openingBalance: new Decimal('1000.00'),
        currency: 'USD',
      });

      expect(mockPrisma.account.create).toHaveBeenCalled();
    });

    it('should throw error if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        AccountService.createAccount({
          userId: 'nonexistent',
          name: 'Primary Account',
          accountType: 'CHECKING',
          openingBalance: new Decimal('1000.00'),
          currency: 'USD',
        })
      ).rejects.toThrow('User not found');
    });
  });

  describe('getById', () => {
    it('should return account by id', async () => {
      const mockAccount = {
        id: 'account-1',
        balance: new Decimal('1500.50'),
        currency: 'USD',
        user: { id: 'user-1', firstName: 'John', lastName: 'Doe', email: 'john@test.com' },
      };

      mockPrisma.account.findUnique.mockResolvedValue(mockAccount);

      await AccountService.getById('account-1', 'admin-1');

      expect(mockPrisma.account.findUnique).toHaveBeenCalled();
    });

    it('should throw error if account not found', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      await expect(AccountService.getById('nonexistent', 'admin-1')).rejects.toThrow();
    });
  });

  describe('updateBalance', () => {
    it('should update balance using Decimal arithmetic', async () => {
      const mockAccount = {
        id: 'account-1',
        balance: new Decimal('1000.00'),
        currency: 'USD',
        status: 'ACTIVE',
        userId: 'user-1',
      };

      mockPrisma.account.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.account.update.mockResolvedValue({
        ...mockAccount,
        balance: new Decimal('1100.00'),
      });
      mockPrisma.ledgerEntry.create.mockResolvedValue({ id: 'ledger-1' });
      mockPrisma.journal.create.mockResolvedValue({ id: 'journal-1' });

      await AccountService.updateBalance({
        accountId: 'account-1',
        amount: new Decimal('100.00'),
        operation: 'DEPOSIT',
        reference: 'test-1',
      });

      expect(mockPrisma.account.update).toHaveBeenCalled();
    });

    it('should prevent negative balance for withdrawal operations', async () => {
      const mockAccount = {
        id: 'account-1',
        balance: new Decimal('100.00'),
        currency: 'USD',
        status: 'ACTIVE',
        userId: 'user-1',
      };

      mockPrisma.account.findUnique.mockResolvedValue(mockAccount);

      await expect(
        AccountService.updateBalance({
          accountId: 'account-1',
          amount: new Decimal('150.00'),
          operation: 'WITHDRAWAL',
        })
      ).rejects.toThrow();
    });
  });
});
