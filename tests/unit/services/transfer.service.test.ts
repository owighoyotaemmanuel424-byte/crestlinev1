/**
 * @jest-environment node
 */

import { TransferService } from '../../../../src/lib/services/transfer-service';
import { prisma } from '../../../../src/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

// Mock the prisma client
jest.mock('../../../../src/lib/prisma', () => ({
  prisma: {
    transfer: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
    $transaction: jest.fn((callback) => callback({})),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('TransferService', () => {
  let transferService: TransferService;

  beforeEach(() => {
    transferService = new TransferService();
    jest.clearAllMocks();
  });

  describe('createTransfer', () => {
    it('should create transfer between accounts with Decimal amounts', async () => {
      const senderAccount = {
        id: 'account-1',
        balance: new Decimal('1000.00'),
        currency: 'USD',
        userId: 'user-1',
      };

      const recipientAccount = {
        id: 'account-2',
        balance: new Decimal('500.00'),
        currency: 'USD',
        userId: 'user-2',
      };

      const mockTransfer = {
        id: 'transfer-1',
        reference: 'TRF-001',
        senderAccountId: 'account-1',
        recipientAccountId: 'account-2',
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

      const result = await transferService.createTransfer({
        senderAccountId: 'account-1',
        recipientAccountId: 'account-2',
        amount: new Decimal('200.00'),
        currency: 'USD',
        description: 'Test transfer',
        userId: 'user-1',
      });

      expect(mockPrisma.transfer.create).toHaveBeenCalled();
      expect(result.amount).toBeInstanceOf(Decimal);
      expect(result.amount).toEqual(new Decimal('200.00'));
    });

    it('should reject transfer with insufficient funds', async () => {
      const senderAccount = {
        id: 'account-1',
        balance: new Decimal('100.00'),
        currency: 'USD',
        userId: 'user-1',
      };

      const recipientAccount = {
        id: 'account-2',
        balance: new Decimal('500.00'),
        currency: 'USD',
        userId: 'user-2',
      };

      mockPrisma.account.findUnique
        .mockImplementation((args: any) => {
          if (args.where.id === 'account-1') return Promise.resolve(senderAccount);
          if (args.where.id === 'account-2') return Promise.resolve(recipientAccount);
          return Promise.resolve(null);
        });

      await expect(
        transferService.createTransfer({
          senderAccountId: 'account-1',
          recipientAccountId: 'account-2',
          amount: new Decimal('150.00'),
          currency: 'USD',
          description: 'Test transfer',
          userId: 'user-1',
        })
      ).rejects.toThrow('Insufficient funds');
    });

    it('should reject transfer to same account', async () => {
      await expect(
        transferService.createTransfer({
          senderAccountId: 'account-1',
          recipientAccountId: 'account-1',
          amount: new Decimal('100.00'),
          currency: 'USD',
          description: 'Self transfer',
          userId: 'user-1',
        })
      ).rejects.toThrow('Cannot transfer to the same account');
    });

    it('should reject transfer with zero amount', async () => {
      await expect(
        transferService.createTransfer({
          senderAccountId: 'account-1',
          recipientAccountId: 'account-2',
          amount: new Decimal('0.00'),
          currency: 'USD',
          description: 'Zero amount',
          userId: 'user-1',
        })
      ).rejects.toThrow('Transfer amount must be greater than zero');
    });
  });

  describe('getTransferById', () => {
    it('should return transfer with Decimal amounts', async () => {
      const mockTransfer = {
        id: 'transfer-1',
        amount: new Decimal('250.00'),
        fee: new Decimal('5.00'),
        totalAmount: new Decimal('255.00'),
        currency: 'USD',
      };

      mockPrisma.transfer.findUnique.mockResolvedValue(mockTransfer);

      const result = await transferService.getTransferById('transfer-1');

      expect(result.amount).toBeInstanceOf(Decimal);
      expect(result.fee).toBeInstanceOf(Decimal);
      expect(result.totalAmount).toBeInstanceOf(Decimal);
    });
  });
});
