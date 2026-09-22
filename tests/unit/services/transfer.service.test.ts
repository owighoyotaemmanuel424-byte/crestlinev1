/**
 * @jest-environment node
 */

import { TransferService } from '../../../src/lib/services/transfer-service';
import { prisma } from '../../../src/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

// Mock the prisma client
jest.mock('../../../src/lib/prisma', () => ({
  prisma: {
    transfer: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
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
    },
    $transaction: jest.fn((callback: any) => callback({})),
  },
}));

const mockPrisma = prisma as any;

describe('TransferService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createTransfer', () => {
    it('should create transfer between accounts with Decimal amounts', async () => {
      const senderAccount = {
        id: 'account-1',
        balance: new Decimal('1000.00'),
        currency: 'USD',
        userId: 'user-1',
        status: 'ACTIVE',
      };

      const recipientAccount = {
        id: 'account-2',
        balance: new Decimal('500.00'),
        currency: 'USD',
        userId: 'user-2',
        status: 'ACTIVE',
      };

      const mockTransfer = {
        id: 'transfer-1',
        reference: 'TRF-001',
        fromAccountId: 'account-1',
        toAccountId: 'account-2',
        amount: new Decimal('200.00'),
        currency: 'USD',
        status: 'COMPLETED',
        fee: new Decimal('0.00'),
        totalAmount: new Decimal('200.00'),
        createdAt: new Date(),
      };

      mockPrisma.account.findUnique
        .mockImplementation((args: any) => {
          if (args.where.id === 'account-1') return Promise.resolve(senderAccount);
          if (args.where.id === 'account-2') return Promise.resolve(recipientAccount);
          return Promise.resolve(null);
        });
      
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const result = await callback(mockPrisma);
        return result;
      });
      
      mockPrisma.transfer.create.mockResolvedValue(mockTransfer);
      mockPrisma.journal.create.mockResolvedValue({ id: 'journal-1' });
      mockPrisma.ledgerEntry.create.mockResolvedValue({ id: 'ledger-1' });
      mockPrisma.account.update
        .mockImplementation((args: any) => {
          if (args.where.id === 'account-1') {
            return Promise.resolve({
              ...senderAccount,
              balance: new Decimal('800.00'),
            });
          }
          if (args.where.id === 'account-2') {
            return Promise.resolve({
              ...recipientAccount,
              balance: new Decimal('700.00'),
            });
          }
          return Promise.resolve(null);
        });

      const result = await TransferService.createTransfer({
        fromUserId: 'user-1',
        fromAccountId: 'account-1',
        toUserId: 'user-2',
        toAccountId: 'account-2',
        amount: new Decimal('200.00'),
        currency: 'USD',
        description: 'Test transfer',
      }, 'user-1');

      expect(mockPrisma.transfer.create).toHaveBeenCalled();
    });

    it('should reject transfer with insufficient funds', async () => {
      const senderAccount = {
        id: 'account-1',
        balance: new Decimal('100.00'),
        currency: 'USD',
        userId: 'user-1',
        status: 'ACTIVE',
      };

      const recipientAccount = {
        id: 'account-2',
        balance: new Decimal('500.00'),
        currency: 'USD',
        userId: 'user-2',
        status: 'ACTIVE',
      };

      mockPrisma.account.findUnique
        .mockImplementation((args: any) => {
          if (args.where.id === 'account-1') return Promise.resolve(senderAccount);
          if (args.where.id === 'account-2') return Promise.resolve(recipientAccount);
          return Promise.resolve(null);
        });

      await expect(
        TransferService.createTransfer({
          fromUserId: 'user-1',
          fromAccountId: 'account-1',
          toUserId: 'user-2',
          toAccountId: 'account-2',
          amount: new Decimal('150.00'),
          currency: 'USD',
          description: 'Test transfer',
        }, 'user-1')
      ).rejects.toThrow();
    });

    it('should reject transfer to same account', async () => {
      await expect(
        TransferService.createTransfer({
          fromUserId: 'user-1',
          fromAccountId: 'account-1',
          toUserId: 'user-1',
          toAccountId: 'account-1',
          amount: new Decimal('100.00'),
          currency: 'USD',
          description: 'Self transfer',
        }, 'user-1')
      ).rejects.toThrow();
    });

    it('should reject transfer with zero amount', async () => {
      await expect(
        TransferService.createTransfer({
          fromUserId: 'user-1',
          fromAccountId: 'account-1',
          toUserId: 'user-2',
          toAccountId: 'account-2',
          amount: new Decimal('0.00'),
          currency: 'USD',
          description: 'Zero amount',
        }, 'user-1')
      ).rejects.toThrow();
    });
  });

  describe('getById', () => {
    it('should return transfer', async () => {
      const mockTransfer = {
        id: 'transfer-1',
        amount: new Decimal('250.00'),
        fee: new Decimal('5.00'),
        totalAmount: new Decimal('255.00'),
        currency: 'USD',
        fromAccount: { id: 'account-1' },
        toAccount: { id: 'account-2' },
      };

      mockPrisma.transfer.findUnique.mockResolvedValue(mockTransfer);

      const result = await TransferService.getById('transfer-1');

      expect(mockPrisma.transfer.findUnique).toHaveBeenCalled();
    });
  });
});
