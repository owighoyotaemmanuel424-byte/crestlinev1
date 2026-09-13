import { prisma } from '../prisma';
import { generateReference } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  InsufficientBalanceError,
  AccountError,
} from '../utils/errors';
import { Decimal } from '@prisma/client/runtime/library';
import type {
  User,
  Account,
  AccountType,
  AccountStatus,
  Role,
  Currency,
} from '@prisma/client';

// ============================================
// DECIMAL UTILITIES
// ============================================

/**
 * Convert amount to Decimal for safe financial arithmetic
 * Accepts number, string, or Decimal
 */
function toDecimal(amount: number | string | Decimal): Decimal {
  if (amount instanceof Decimal) {
    return amount;
  }
  if (typeof amount === 'string') {
    return new Decimal(amount);
  }
  // For numbers, convert to string first to avoid floating point precision loss
  return new Decimal(amount.toString());
}

// ============================================
// CONSTANTS
// ============================================

const ACCOUNT_CONFIG = {
  MIN_OPENING_BALANCE: new Decimal(0),
  MAX_OPENING_BALANCE: new Decimal(10000000),
  MIN_BALANCE: new Decimal(0),
  MAX_BALANCE: new Decimal(100000000),
  DEFAULT_CURRENCY: 'USD' as Currency,
  SUPPORTED_CURRENCIES: ['USD', 'NGN', 'EUR', 'GBP'] as Currency[],
  MAX_DESCRIPTION_LENGTH: 500,
  DEFAULT_ACCOUNT_TYPE: 'SAVINGS' as AccountType,
  DEFAULT_STATUS: 'ACTIVE' as AccountStatus,
} as const;

export interface CreateAccountData {
  userId: string;
  accountType?: AccountType;
  currency?: Currency;
  openingBalance?: number | string | Decimal;
  accountNumber?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateAccountData {
  id: string;
  accountType?: AccountType;
  status?: AccountStatus;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface AccountBalanceUpdate {
  accountId: string;
  amount: number | string | Decimal;
  operation: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'FEE' | 'INTEREST' | 'ADJUSTMENT';
  reference?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface AccountResult {
  account: Account;
  balance: Decimal;
  availableBalance: Decimal;
}

export interface AccountListResult {
  accounts: Account[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AccountStats {
  totalAccounts: number;
  totalBalance: number;
  byType: Record<AccountType, number>;
  byStatus: Record<AccountStatus, number>;
  byCurrency: Record<Currency, number>;
  activeAccounts: number;
  frozenAccounts: number;
  averageBalance: number;
}

export class AccountService {
  /**
   * Create a new account
   */
  static async createAccount(
    data: CreateAccountData,
    actingUserId?: string
  ): Promise<AccountResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    // Authorization check
    if (actingUserId && actingUserId !== data.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You can only create accounts for yourself');
      }
    }

    // Validate opening balance using Decimal
    const openingBalance = toDecimal(data.openingBalance || 0);
    if (openingBalance.lessThan(ACCOUNT_CONFIG.MIN_OPENING_BALANCE)) {
      throw new ValidationError(
        `Opening balance must be at least ${ACCOUNT_CONFIG.MIN_OPENING_BALANCE.toString()}`
      );
    }
    if (openingBalance.greaterThan(ACCOUNT_CONFIG.MAX_OPENING_BALANCE)) {
      throw new ValidationError(
        `Opening balance cannot exceed ${ACCOUNT_CONFIG.MAX_OPENING_BALANCE.toString()}`
      );
    }

    // Validate currency
    const currency = data.currency || ACCOUNT_CONFIG.DEFAULT_CURRENCY;
    if (!ACCOUNT_CONFIG.SUPPORTED_CURRENCIES.includes(currency)) {
      throw new ValidationError(
        `Unsupported currency. Supported: ${ACCOUNT_CONFIG.SUPPORTED_CURRENCIES.join(', ')}`
      );
    }

    // Generate account number if not provided
    const accountNumber = data.accountNumber || generateReference('ACC');

    // Create account
    const account = await prisma.account.create({
      data: {
        userId: data.userId,
        accountNumber,
        accountType: data.accountType || ACCOUNT_CONFIG.DEFAULT_ACCOUNT_TYPE,
        currency,
        balance: openingBalance,
        availableBalance: openingBalance,
        status: ACCOUNT_CONFIG.DEFAULT_STATUS,
        description: data.description || null,
        metadata: data.metadata || null,
      },
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId || data.userId,
        action: 'CREATE',
        resourceType: 'ACCOUNT',
        resourceId: account.id,
        newValues: {
          accountNumber,
          accountType: account.accountType,
          currency,
          openingBalance: openingBalance.toString(),
          status: account.status,
        },
        metadata: data.metadata,
        status: 'SUCCESS',
      },
    });

    // Send notification
    await prisma.notification.create({
      data: {
        userId: data.userId,
        title: 'Account Created',
        message: `Your ${account.accountType} account (${accountNumber}) has been created with opening balance of ${openingBalance.toString()} ${currency}`,
        type: 'SUCCESS',
        category: 'ACCOUNT',
        isRead: false,
        metadata: { accountId: account.id, accountNumber },
      },
    });

    return {
      account,
      balance: openingBalance,
      availableBalance: openingBalance,
    };
  }

  /**
   * Get account by ID
   */
  static async getById(id: string, actingUserId?: string): Promise<AccountResult> {
    const account = await prisma.account.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!account) throw new NotFoundError('Account', id);

    // Authorization check
    if (actingUserId && actingUserId !== account.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this account');
      }
    }

    return {
      account,
      balance: toDecimal(account.balance),
      availableBalance: toDecimal(account.availableBalance),
    };
  }

  /**
   * Get account by account number
   */
  static async getByAccountNumber(
    accountNumber: string,
    actingUserId?: string
  ): Promise<AccountResult> {
    const account = await prisma.account.findUnique({
      where: { accountNumber },
      include: { user: true },
    });

    if (!account) throw new NotFoundError('Account', accountNumber);

    // Authorization check
    if (actingUserId && actingUserId !== account.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this account');
      }
    }

    return {
      account,
      balance: toDecimal(account.balance),
      availableBalance: toDecimal(account.availableBalance),
    };
  }

  /**
   * List accounts for a user
   */
  static async listByUser(
    userId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    accountType?: AccountType,
    status?: AccountStatus,
    currency?: Currency
  ): Promise<AccountListResult> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    // Authorization check
    if (actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these accounts');
      }
    }

    const where: Record<string, unknown> = { userId };
    if (accountType) where.accountType = accountType;
    if (status) where.status = status;
    if (currency) where.currency = currency;

    const accounts = await prisma.account.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: true },
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

  /**
   * List all accounts (admin only)
   */
  static async listAll(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    accountType?: AccountType,
    status?: AccountStatus,
    currency?: Currency,
    userId?: string
  ): Promise<AccountListResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view all accounts');
    }

    const where: Record<string, unknown> = {};
    if (accountType) where.accountType = accountType;
    if (status) where.status = status;
    if (currency) where.currency = currency;
    if (userId) where.userId = userId;

    const accounts = await prisma.account.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: true },
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

  /**
   * Update account status
   */
  static async updateStatus(
    id: string,
    status: AccountStatus,
    actingUserId: string,
    reason?: string
  ): Promise<AccountResult> {
    const account = await prisma.account.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!account) throw new NotFoundError('Account', id);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can update account status');
    }

    if (account.status === status) {
      throw new ValidationError(`Account is already ${status}`);
    }

    const updatedAccount = await prisma.account.update({
      where: { id },
      data: {
        status,
        statusUpdatedAt: new Date(),
        statusUpdatedById: actingUserId,
        statusUpdateReason: reason || null,
      },
      include: { user: true },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'UPDATE',
        resourceType: 'ACCOUNT',
        resourceId: account.id,
        oldValues: { status: account.status },
        newValues: { status, reason },
        status: 'SUCCESS',
      },
    });

    // Send notification to user
    await prisma.notification.create({
      data: {
        userId: account.userId,
        title: 'Account Status Updated',
        message: `Your account ${account.accountNumber} status has been updated to ${status}${reason ? `. Reason: ${reason}` : ''}`,
        type: 'INFO',
        category: 'ACCOUNT',
        isRead: false,
        metadata: { accountId: account.id, oldStatus: account.status, newStatus: status },
      },
    });

    return {
      account: updatedAccount,
      balance: toDecimal(updatedAccount.balance),
      availableBalance: toDecimal(updatedAccount.availableBalance),
    };
  }

  /**
   * Update account balance using Decimal arithmetic
   */
  static async updateBalance(
    data: AccountBalanceUpdate,
    actingUserId?: string
  ): Promise<AccountResult> {
    const account = await prisma.account.findUnique({ where: { id: data.accountId } });
    if (!account) throw new NotFoundError('Account', data.accountId);

    // Validate amount using Decimal
    const amount = toDecimal(data.amount);
    if (amount.lessThanOrEqual(new Decimal(0))) {
      throw new ValidationError('Amount must be positive');
    }

    // Check for withdrawal operations
    const isWithdrawal = ['WITHDRAWAL', 'TRANSFER_OUT', 'FEE'].includes(data.operation);
    if (isWithdrawal) {
      const availableBalance = toDecimal(account.availableBalance);
      if (availableBalance.lessThan(amount)) {
        throw new InsufficientBalanceError(
          account.id,
          amount.toNumber(),
          availableBalance.toNumber()
        );
      }
    }

    // Calculate new balances using Decimal arithmetic
    let newBalance: Decimal;
    let newAvailableBalance: Decimal;

    const currentBalance = toDecimal(account.balance);
    const currentAvailableBalance = toDecimal(account.availableBalance);

    switch (data.operation) {
      case 'DEPOSIT':
      case 'TRANSFER_IN':
      case 'INTEREST':
        newBalance = currentBalance.plus(amount);
        newAvailableBalance = currentAvailableBalance.plus(amount);
        break;
      case 'WITHDRAWAL':
      case 'TRANSFER_OUT':
      case 'FEE':
        newBalance = currentBalance.minus(amount);
        newAvailableBalance = currentAvailableBalance.minus(amount);
        break;
      case 'ADJUSTMENT':
        newBalance = currentBalance.plus(amount);
        newAvailableBalance = currentAvailableBalance.plus(amount);
        break;
      default:
        throw new ValidationError(`Unknown operation: ${data.operation}`);
    }

    // Validate new balance
    if (newBalance.lessThan(ACCOUNT_CONFIG.MIN_BALANCE)) {
      throw new ValidationError(
        `Balance cannot be less than ${ACCOUNT_CONFIG.MIN_BALANCE.toString()}`
      );
    }
    if (newBalance.greaterThan(ACCOUNT_CONFIG.MAX_BALANCE)) {
      throw new ValidationError(
        `Balance cannot exceed ${ACCOUNT_CONFIG.MAX_BALANCE.toString()}`
      );
    }

    const updatedAccount = await prisma.account.update({
      where: { id: data.accountId },
      data: {
        balance: newBalance,
        availableBalance: newAvailableBalance,
        lastTransactionAt: new Date(),
        lastTransactionReference: data.reference || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId || updatedAccount.userId,
        action: 'UPDATE',
        resourceType: 'ACCOUNT',
        resourceId: account.id,
        oldValues: {
          balance: currentBalance.toString(),
          availableBalance: currentAvailableBalance.toString(),
        },
        newValues: {
          balance: newBalance.toString(),
          availableBalance: newAvailableBalance.toString(),
          operation: data.operation,
          amount: amount.toString(),
        },
        metadata: data.metadata,
        status: 'SUCCESS',
      },
    });

    return {
      account: updatedAccount,
      balance: newBalance,
      availableBalance: newAvailableBalance,
    };
  }

  /**
   * Freeze account
   */
  static async freezeAccount(
    id: string,
    actingUserId: string,
    reason: string
  ): Promise<AccountResult> {
    return this.updateStatus(id, 'FROZEN' as AccountStatus, actingUserId, reason);
  }

  /**
   * Unfreeze account
   */
  static async unfreezeAccount(
    id: string,
    actingUserId: string,
    reason?: string
  ): Promise<AccountResult> {
    return this.updateStatus(id, 'ACTIVE' as AccountStatus, actingUserId, reason);
  }

  /**
   * Close account
   */
  static async closeAccount(
    id: string,
    actingUserId: string,
    reason: string
  ): Promise<AccountResult> {
    const account = await prisma.account.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!account) throw new NotFoundError('Account', id);

    // Check if balance is zero using Decimal comparison
    const balance = toDecimal(account.balance);
    if (balance.greaterThan(new Decimal(0))) {
      throw new ValidationError(
        `Cannot close account with balance of ${balance.toString()} ${account.currency}. Please withdraw funds first.`
      );
    }

    return this.updateStatus(id, 'CLOSED' as AccountStatus, actingUserId, reason);
  }

  /**
   * Get account statistics
   */
  static async getStats(actingUserId: string): Promise<AccountStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view account statistics');
    }

    const totalAccounts = await prisma.account.count();

    // Group by account type using Decimal arithmetic for calculations
    const byType: Record<AccountType, number> = {
      SAVINGS: 0,
      CURRENT: 0,
      INVESTMENT: 0,
      LOAN: 0,
      FOREIGN: 0,
    };

    const typeCounts = await prisma.account.groupBy({
      by: ['accountType'],
      _count: { _all: true },
    });

    for (const group of typeCounts) {
      byType[group.accountType as AccountType] = group._count._all;
    }

    // Group by status
    const byStatus: Record<AccountStatus, number> = {
      ACTIVE: 0,
      FROZEN: 0,
      CLOSED: 0,
      PENDING: 0,
      SUSPENDED: 0,
    };

    const statusCounts = await prisma.account.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    for (const group of statusCounts) {
      byStatus[group.status as AccountStatus] = group._count._all;
    }

    // Group by currency
    const byCurrency: Record<Currency, number> = {
      USD: 0,
      NGN: 0,
      EUR: 0,
      GBP: 0,
    };

    const currencyCounts = await prisma.account.groupBy({
      by: ['currency'],
      _count: { _all: true },
    });

    for (const group of currencyCounts) {
      byCurrency[group.currency as Currency] = group._count._all;
    }

    // Calculate total balance using Decimal arithmetic
    const allAccounts = await prisma.account.findMany({
      where: { status: 'ACTIVE' as AccountStatus },
      select: { balance: true, currency: true },
    });

    const totalBalance = allAccounts
      .reduce((sum, a) => sum.plus(toDecimal(a.balance)), new Decimal(0))
      .toNumber();

    // Calculate average balance using Decimal arithmetic
    const activeAccounts = await prisma.account.count({
      where: { status: 'ACTIVE' as AccountStatus },
    });

    const averageBalance = activeAccounts > 0
      ? allAccounts.reduce((sum, a) => sum.plus(toDecimal(a.balance)), new Decimal(0)).div(activeAccounts).toNumber()
      : 0;

    return {
      totalAccounts,
      totalBalance,
      byType,
      byStatus,
      byCurrency,
      activeAccounts: byStatus.ACTIVE,
      frozenAccounts: byStatus.FROZEN,
      averageBalance,
    };
  }

  /**
   * Get account balance history
   */
  static async getBalanceHistory(
    accountId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ history: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundError('Account', accountId);

    // Authorization check
    if (actingUserId !== account.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this account balance history');
      }
    }

    // Get transactions for this account
    const transactions = await prisma.transaction.findMany({
      where: { accountId },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        fromAccount: true,
        toAccount: true,
      },
    });

    const total = await prisma.transaction.count({ where: { accountId } });

    // Calculate running balance using Decimal arithmetic
    const history = [];
    let runningBalance = toDecimal(account.balance);

    for (const tx of transactions) {
      const txAmount = toDecimal(tx.amount);
      const isCredit = tx.entryType === 'CREDIT' || tx.toAccountId === accountId;
      const isDebit = tx.entryType === 'DEBIT' || tx.fromAccountId === accountId;

      if (isCredit) {
        runningBalance = runningBalance.plus(txAmount);
      } else if (isDebit) {
        runningBalance = runningBalance.minus(txAmount);
      }

      history.push({
        ...tx,
        runningBalance: runningBalance.toString(),
        amount: txAmount.toString(),
      });
    }

    return {
      history,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
