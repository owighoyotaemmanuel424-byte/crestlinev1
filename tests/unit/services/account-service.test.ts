import { AccountService } from '@/lib/services/account-service';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { mockPrismaFindUnique, mockPrismaFindMany, mockPrismaCreate, mockPrismaUpdate, mockPrismaCount, TEST_DATE } from '../../setup';

// ============================================
// ACCOUNT SERVICE UNIT TESTS
// ============================================

describe('AccountService', () => {
  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'USER',
    status: 'ACTIVE',
  };

  describe('createAccount', () => {
    it('should create new account for user', async () => {
      mockPrismaFindUnique('user', mockUser);
      mockPrismaFindUnique('account', null);
      
      const mockAccount = {
        id: 'account-1',
        userId: 'user-1',
        accountNumber: 'ACC-001',
        name: 'Primary Account',
        currency: 'USD',
        accountType: 'SAVINGS',
        balance: new Decimal(0),
        availableBalance: new Decimal(0),
        status: 'ACTIVE',
        createdAt: TEST_DATE,
        updatedAt: TEST_DATE,
      };
      
      mockPrismaCreate('account', mockAccount);
      (prisma as any).auditLog.create = jest.fn().mockResolvedValue({});
      
      const result = await AccountService.createAccount({
        userId: 'user-1',
        name: 'Primary Account',
        currency: 'USD',
        accountType: 'SAVINGS',
      }, 'user-1');
      
      expect(result).toBeDefined();
      expect(result.account).toBeDefined();
      expect(result.account.name).toBe('Primary Account');
    });

    it('should throw NotFoundError for non-existent user', async () => {
      mockPrismaFindUnique('user', null);
      
      await expect(AccountService.createAccount({
        userId: 'nonexistent',
        name: 'Test Account',
        currency: 'USD',
        accountType: 'SAVINGS',
      }, 'user-1')).rejects.toThrow('User not found');
    });

    it('should throw ConflictError for duplicate account number', async () => {
      mockPrismaFindUnique('user', mockUser);
      mockPrismaFindUnique('account', { id: 'account-1', accountNumber: 'ACC-001' });
      
      await expect(AccountService.createAccount({
        userId: 'user-1',
        accountNumber: 'ACC-001',
        name: 'Duplicate Account',
        currency: 'USD',
        accountType: 'SAVINGS',
      }, 'user-1')).rejects.toThrow('Account number already exists');
    });
  });

  describe('getAccountById', () => {
    it('should return account for valid ID and owner', async () => {
      const mockAccount = {
        id: 'account-1',
        userId: 'user-1',
        accountNumber: 'ACC-001',
        name: 'Primary Account',
        currency: 'USD',
        balance: new Decimal(1000),
        availableBalance: new Decimal(1000),
        status: 'ACTIVE',
        user: mockUser,
        transactions: [],
      };
      
      mockPrismaFindUnique('account', mockAccount);
      
      const result = await AccountService.getAccountById('account-1', 'user-1');
      
      expect(result).toBeDefined();
      expect(result.account).toBeDefined();
      expect(result.account.id).toBe('account-1');
    });

    it('should throw NotFoundError for non-existent account', async () => {
      mockPrismaFindUnique('account', null);
      
      await expect(AccountService.getAccountById('nonexistent', 'user-1')).rejects.toThrow('Account not found');
    });

    it('should throw ForbiddenError for non-owner', async () => {
      const mockAccount = {
        id: 'account-1',
        userId: 'user-2',
        name: 'Another User Account',
      };
      
      mockPrismaFindUnique('account', mockAccount);
      
      await expect(AccountService.getAccountById('account-1', 'user-1')).rejects.toThrow('You do not have access to this account');
    });
  });

  describe('listAccounts', () => {
    it('should return paginated list of user accounts', async () => {
      const mockAccounts = [
        { id: 'account-1', userId: 'user-1', name: 'Account 1', balance: new Decimal(1000) },
        { id: 'account-2', userId: 'user-1', name: 'Account 2', balance: new Decimal(2000) },
      ];
      
      mockPrismaFindMany('account', mockAccounts);
      mockPrismaCount('account', 2);
      
      const result = await AccountService.listAccounts('user-1', { page: 1, limit: 20 });
      
      expect(result).toBeDefined();
      expect(result.accounts).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe('updateAccount', () => {
    it('should update account for owner', async () => {
      const mockAccount = {
        id: 'account-1',
        userId: 'user-1',
        name: 'Old Name',
        status: 'ACTIVE',
      };
      
      mockPrismaFindUnique('account', mockAccount);
      mockPrismaUpdate('account', { ...mockAccount, name: 'New Name' });
      (prisma as any).auditLog.create = jest.fn().mockResolvedValue({});
      
      const result = await AccountService.updateAccount('account-1', { name: 'New Name' }, 'user-1');
      
      expect(result).toBeDefined();
      expect(result.account.name).toBe('New Name');
    });

    it('should throw ForbiddenError for non-owner', async () => {
      const mockAccount = {
        id: 'account-1',
        userId: 'user-2',
        name: 'Another User Account',
      };
      
      mockPrismaFindUnique('account', mockAccount);
      
      await expect(AccountService.updateAccount('account-1', { name: 'New Name' }, 'user-1')).rejects.toThrow('You do not have access to this account');
    });
  });

  describe('freezeAccount', () => {
    it('should freeze account for operator/admin', async () => {
      const mockAccount = {
        id: 'account-1',
        userId: 'user-1',
        status: 'ACTIVE',
      };
      
      mockPrismaFindUnique('account', mockAccount);
      mockPrismaUpdate('account', { ...mockAccount, status: 'FROZEN' });
      (prisma as any).auditLog.create = jest.fn().mockResolvedValue({});
      (prisma as any).notification.create = jest.fn().mockResolvedValue({});
      
      const result = await AccountService.freezeAccount('account-1', 'admin-1');
      
      expect(result).toBeDefined();
      expect(result.account.status).toBe('FROZEN');
    });

    it('should throw ForbiddenError for non-operator/admin', async () => {
      const mockUser = {
        id: 'user-1',
        role: 'USER',
      };
      
      mockPrismaFindUnique('user', mockUser);
      
      await expect(AccountService.freezeAccount('account-1', 'user-1')).rejects.toThrow('Only operators or administrators can freeze accounts');
    });
  });

  describe('unfreezeAccount', () => {
    it('should unfreeze account for operator/admin', async () => {
      const mockAccount = {
        id: 'account-1',
        userId: 'user-1',
        status: 'FROZEN',
      };
      
      mockPrismaFindUnique('account', mockAccount);
      mockPrismaUpdate('account', { ...mockAccount, status: 'ACTIVE' });
      (prisma as any).auditLog.create = jest.fn().mockResolvedValue({});
      (prisma as any).notification.create = jest.fn().mockResolvedValue({});
      
      const result = await AccountService.unfreezeAccount('account-1', 'admin-1');
      
      expect(result).toBeDefined();
      expect(result.account.status).toBe('ACTIVE');
    });
  });

  describe('closeAccount', () => {
    it('should close account with zero balance', async () => {
      const mockAccount = {
        id: 'account-1',
        userId: 'user-1',
        balance: new Decimal(0),
        availableBalance: new Decimal(0),
        status: 'ACTIVE',
      };
      
      mockPrismaFindUnique('account', mockAccount);
      mockPrismaUpdate('account', { ...mockAccount, status: 'CLOSED' });
      (prisma as any).auditLog.create = jest.fn().mockResolvedValue({});
      
      const result = await AccountService.closeAccount('account-1', 'user-1');
      
      expect(result).toBeDefined();
      expect(result.account.status).toBe('CLOSED');
    });

    it('should throw ValidationError for non-zero balance', async () => {
      const mockAccount = {
        id: 'account-1',
        userId: 'user-1',
        balance: new Decimal(1000),
        availableBalance: new Decimal(1000),
        status: 'ACTIVE',
      };
      
      mockPrismaFindUnique('account', mockAccount);
      
      await expect(AccountService.closeAccount('account-1', 'user-1')).rejects.toThrow('Cannot close account with non-zero balance');
    });
  });
});