import { prisma } from '../prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { generateReference, generateIdempotencyKey } from '../utils/security';
import type { Account, AccountType, AccountStatus, User, Transaction } from '@prisma/client';

export interface CreateAccountData {
  userId: string;
  name: string;
  accountType: AccountType;
  currency?: string;
  initialDeposit?: number;
}

export interface UpdateAccountData {
  name?: string;
  status?: AccountStatus;
}

export interface AccountResult {
  account: Account & { user?: Partial<User>; transactions?: Transaction[] };
}

export interface AccountListResult {
  accounts: (Account & { user?: Partial<User> })[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class AccountService {
  static async createAccount(data: CreateAccountData, actingUserId?: string): Promise<AccountResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    if (actingUserId && actingUserId !== data.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('Only administrators can create accounts for other users');
      }
    }

    const accountNumber = generateReference('ACC');

    const account = await prisma.account.create({
      data: {
        accountNumber,
        userId: data.userId,
        name: data.name,
        accountType: data.accountType,
        currency: data.currency || 'USD',
        balance: data.initialDeposit || 0,
        availableBalance: data.initialDeposit || 0,
        status: 'ACTIVE' as AccountStatus,
      },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    if (data.initialDeposit && data.initialDeposit > 0) {
      const journal = await prisma.journal.create({
        data: {
          reference: generateReference('JNL'),
          description: `Initial deposit for account ${accountNumber}`,
          status: 'POSTED' as const,
        },
      });

      await prisma.ledgerEntry.create({
        data: {
          journalId: journal.id,
          accountId: account.id,
          entryType: 'CREDIT' as const,
          amount: data.initialDeposit,
          balance: data.initialDeposit,
          description: 'Initial deposit',
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId || data.userId,
        action: 'CREATE',
        resourceType: 'ACCOUNT',
        resourceId: account.id,
        newValues: { accountNumber, name: data.name, accountType: data.accountType },
        status: 'SUCCESS',
      },
    });

    return { account };
  }

  static async getAccountById(id: string, actingUserId?: string): Promise<AccountResult> {
    const account = await prisma.account.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        transactions: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!account) throw new NotFoundError('Account', id);

    if (actingUserId && actingUserId !== account.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this account');
      }
    }

    return { account };
  }

  static async getUserAccounts(
    userId: string,
    page: number = 1,
    limit: number = 20,
    search?: string,
    status?: AccountStatus,
    accountType?: AccountType,
    actingUserId?: string
  ): Promise<AccountListResult> {
    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these accounts');
      }
    }

    const where: any = { userId };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (status) where.status = status;
    if (accountType) where.accountType = accountType;

    const accounts = await prisma.account.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    const total = await prisma.account.count({ where });

    return {
      accounts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getAllAccounts(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    search?: string,
    status?: AccountStatus,
    accountType?: AccountType
  ): Promise<AccountListResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only administrators can view all accounts');
    }

    const where: any = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (status) where.status = status;
    if (accountType) where.accountType = accountType;

    const accounts = await prisma.account.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    const total = await prisma.account.count({ where });

    return {
      accounts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async updateAccount(id: string, data: UpdateAccountData, actingUserId: string): Promise<AccountResult> {
    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundError('Account', id);

    if (actingUserId !== account.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to update this account');
      }
    }

    const updatedAccount = await prisma.account.update({
      where: { id },
      data,
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'UPDATE',
        resourceType: 'ACCOUNT',
        resourceId: account.id,
        oldValues: { name: account.name, status: account.status },
        newValues: { name: data.name || account.name, status: data.status || account.status },
        status: 'SUCCESS',
      },
    });

    return { account: updatedAccount };
  }

  static async freezeAccount(id: string, actingUserId: string): Promise<AccountResult> {
    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundError('Account', id);

    if (account.status === 'FROZEN') {
      throw new ValidationError('Account is already frozen');
    }

    if (account.status === 'CLOSED') {
      throw new ValidationError('Cannot freeze a closed account');
    }

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only administrators or operators can freeze accounts');
    }

    if (actingUserId !== account.userId && !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
      throw new ForbiddenError('Only administrators can freeze accounts of other users');
    }

    const frozenAccount = await prisma.account.update({
      where: { id },
      data: { status: 'FROZEN' as AccountStatus },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'FREEZE',
        resourceType: 'ACCOUNT',
        resourceId: account.id,
        oldValues: { status: account.status },
        newValues: { status: 'FROZEN' },
        status: 'SUCCESS',
      },
    });

    return { account: frozenAccount };
  }

  static async unfreezeAccount(id: string, actingUserId: string): Promise<AccountResult> {
    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundError('Account', id);

    if (account.status !== 'FROZEN') {
      throw new ValidationError('Account is not frozen');
    }

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only administrators or operators can unfreeze accounts');
    }

    if (actingUserId !== account.userId && !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
      throw new ForbiddenError('Only administrators can unfreeze accounts of other users');
    }

    const unfrozenAccount = await prisma.account.update({
      where: { id },
      data: { status: 'ACTIVE' as AccountStatus },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'UNFREEZE',
        resourceType: 'ACCOUNT',
        resourceId: account.id,
        oldValues: { status: account.status },
        newValues: { status: 'ACTIVE' },
        status: 'SUCCESS',
      },
    });

    return { account: unfrozenAccount };
  }

  static async closeAccount(id: string, actingUserId: string): Promise<AccountResult> {
    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundError('Account', id);

    if (account.status === 'CLOSED') {
      throw new ValidationError('Account is already closed');
    }

    if (account.balance !== 0) {
      throw new ValidationError('Cannot close account with non-zero balance');
    }

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
      throw new ForbiddenError('Only administrators can close accounts');
    }

    if (actingUserId !== account.userId && !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
      throw new ForbiddenError('Only administrators can close accounts of other users');
    }

    const closedAccount = await prisma.account.update({
      where: { id },
      data: { status: 'CLOSED' as AccountStatus },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'CLOSE',
        resourceType: 'ACCOUNT',
        resourceId: account.id,
        oldValues: { status: account.status },
        newValues: { status: 'CLOSED' },
        status: 'SUCCESS',
      },
    });

    return { account: closedAccount };
  }

  static async getAccountBalance(id: string, actingUserId?: string): Promise<{ balance: number; availableBalance: number }> {
    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundError('Account', id);

    if (actingUserId && actingUserId !== account.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this account balance');
      }
    }

    return {
      balance: account.balance.toNumber(),
      availableBalance: account.availableBalance.toNumber(),
    };
  }

  static async getAccountStatement(id: string, actingUserId: string, startDate?: Date, endDate?: Date): Promise<any> {
    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundError('Account', id);

    if (actingUserId !== account.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this account statement');
      }
    }

    const where: any = { accountId: id };
    if (startDate) where.createdAt = { ...where.createdAt, gte: startDate };
    if (endDate) where.createdAt = { ...where.createdAt, lte: endDate };

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        journal: true,
        fees: true,
      },
    });

    return {
      account,
      transactions,
      startDate,
      endDate,
    };
  }
}