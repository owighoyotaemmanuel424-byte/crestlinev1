import { prisma } from '../prisma';
import { generateReference } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  InsufficientBalanceError,
  WithdrawalError,
  DailyLimitExceededError,
  MonthlyLimitExceededError,
} from '../utils/errors';
import { AccountService } from './account-service';
import { LedgerService } from './ledger-service';
import { Decimal } from '@prisma/client/runtime/library';
import type {
  User,
  Account,
  Withdrawal,
  WithdrawalStatus,
  WithdrawalMethod,
  Role,
  Currency,
  Journal,
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

const WITHDRAWAL_CONFIG = {
  MIN_WITHDRAWAL_AMOUNT: new Decimal(1),
  MAX_WITHDRAWAL_AMOUNT: new Decimal(1000000),
  DAILY_LIMIT: new Decimal(50000),
  MONTHLY_LIMIT: new Decimal(500000),
  MAX_DESCRIPTION_LENGTH: 500,
  DEFAULT_CURRENCY: 'USD' as Currency,
  SUPPORTED_METHODS: ['BANK_TRANSFER', 'CASH', 'ATM', 'MOBILE_MONEY', 'CHECK'] as WithdrawalMethod[],
  FEE_PERCENTAGE: new Decimal(0.005), // 0.5%
  FEE_MINIMUM: new Decimal(1),
  FEE_MAXIMUM: new Decimal(50),
} as const;

export interface CreateWithdrawalData {
  userId: string;
  accountId: string;
  amount: number | string | Decimal;
  currency?: Currency;
  method: WithdrawalMethod;
  destinationAccount?: string;
  destinationBank?: string;
  reference?: string;
  description?: string;
  transactionReference?: string;
  metadata?: Record<string, unknown>;
}

export interface WithdrawalResult {
  withdrawal: Withdrawal & {
    user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
    account: Pick<Account, 'id' | 'accountNumber' | 'balance' | 'availableBalance'>;
    journal?: Journal | null;
  };
}

export interface WithdrawalListResult {
  withdrawals: Withdrawal[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface WithdrawalStats {
  totalWithdrawals: number;
  totalAmount: number;
  byStatus: Record<WithdrawalStatus, number>;
  byMethod: Record<WithdrawalMethod, number>;
  byCurrency: Record<Currency, number>;
  averageAmount: number;
  pendingApproval: number;
  totalFees: number;
}

export class WithdrawalService {
  /**
   * Create a new withdrawal
   */
  static async createWithdrawal(
    data: CreateWithdrawalData,
    actingUserId?: string
  ): Promise<WithdrawalResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    // Authorization check
    if (actingUserId && actingUserId !== data.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You can only withdraw from your own account');
      }
    }

    const account = await prisma.account.findUnique({ where: { id: data.accountId } });
    if (!account) throw new NotFoundError('Account', data.accountId);
    if (account.userId !== data.userId) {
      throw new ForbiddenError('Account does not belong to user');
    }

    // Check account status
    if (account.status !== 'ACTIVE') {
      throw new ValidationError(`Account is ${account.status.toLowerCase()}`);
    }

    // Validate amount using Decimal
    const amount = toDecimal(data.amount);
    if (amount.lessThanOrEqual(new Decimal(0))) {
      throw new ValidationError('Amount must be positive');
    }
    if (amount.lessThan(WITHDRAWAL_CONFIG.MIN_WITHDRAWAL_AMOUNT)) {
      throw new ValidationError(
        `Amount must be at least ${WITHDRAWAL_CONFIG.MIN_WITHDRAWAL_AMOUNT.toString()}`
      );
    }
    if (amount.greaterThan(WITHDRAWAL_CONFIG.MAX_WITHDRAWAL_AMOUNT)) {
      throw new ValidationError(
        `Amount cannot exceed ${WITHDRAWAL_CONFIG.MAX_WITHDRAWAL_AMOUNT.toString()}`
      );
    }

    // Validate method
    if (!WITHDRAWAL_CONFIG.SUPPORTED_METHODS.includes(data.method)) {
      throw new ValidationError(
        `Unsupported withdrawal method. Supported: ${WITHDRAWAL_CONFIG.SUPPORTED_METHODS.join(', ')}`
      );
    }

    // Validate currency
    const currency = data.currency || account.currency;

    // Check sufficient balance using Decimal comparison
    const availableBalance = toDecimal(account.availableBalance);
    if (availableBalance.lessThan(amount)) {
      throw new InsufficientBalanceError(
        account.id,
        amount.toNumber(),
        availableBalance.toNumber()
      );
    }

    // Check daily limit using Decimal arithmetic
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyWithdrawals = await prisma.withdrawal.aggregate({
      where: {
        userId: data.userId,
        createdAt: { gte: today },
        status: { in: ['PENDING', 'COMPLETED', 'APPROVED'] as WithdrawalStatus[] },
      },
      _sum: { amount: true },
    });

    const dailyTotal = toDecimal(dailyWithdrawals._sum.amount || 0);
    const newDailyTotal = dailyTotal.plus(amount);

    if (newDailyTotal.greaterThan(WITHDRAWAL_CONFIG.DAILY_LIMIT)) {
      throw new DailyLimitExceededError(
        data.userId,
        WITHDRAWAL_CONFIG.DAILY_LIMIT.toNumber(),
        newDailyTotal.toNumber()
      );
    }

    // Check monthly limit using Decimal arithmetic
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const monthlyWithdrawals = await prisma.withdrawal.aggregate({
      where: {
        userId: data.userId,
        createdAt: { gte: thisMonth },
        status: { in: ['PENDING', 'COMPLETED', 'APPROVED'] as WithdrawalStatus[] },
      },
      _sum: { amount: true },
    });

    const monthlyTotal = toDecimal(monthlyWithdrawals._sum.amount || 0);
    const newMonthlyTotal = monthlyTotal.plus(amount);

    if (newMonthlyTotal.greaterThan(WITHDRAWAL_CONFIG.MONTHLY_LIMIT)) {
      throw new MonthlyLimitExceededError(
        data.userId,
        WITHDRAWAL_CONFIG.MONTHLY_LIMIT.toNumber(),
        newMonthlyTotal.toNumber()
      );
    }

    // Calculate fee using Decimal arithmetic
    const feeAmount = amount.times(WITHDRAWAL_CONFIG.FEE_PERCENTAGE);
    const fee = feeAmount.lessThan(WITHDRAWAL_CONFIG.FEE_MINIMUM)
      ? WITHDRAWAL_CONFIG.FEE_MINIMUM
      : feeAmount.greaterThan(WITHDRAWAL_CONFIG.FEE_MAXIMUM)
        ? WITHDRAWAL_CONFIG.FEE_MAXIMUM
        : feeAmount;

    const totalDeduction = amount.plus(fee);

    // Check if user has enough for amount + fee using Decimal comparison
    if (availableBalance.lessThan(totalDeduction)) {
      throw new InsufficientBalanceError(
        account.id,
        totalDeduction.toNumber(),
        availableBalance.toNumber()
      );
    }

    // Generate reference
    const reference = data.reference || generateReference('WDR');

    // Create withdrawal
    return await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.create({
        data: {
          reference,
          userId: data.userId,
          accountId: data.accountId,
          amount: amount,
          fee: fee,
          totalAmount: totalDeduction,
          currency,
          method: data.method,
          destinationAccount: data.destinationAccount || null,
          destinationBank: data.destinationBank || null,
          transactionReference: data.transactionReference || null,
          description: data.description || null,
          status: 'COMPLETED' as WithdrawalStatus,
          metadata: data.metadata || null,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          account: {
            select: {
              id: true,
              accountNumber: true,
              balance: true,
              availableBalance: true,
            },
          },
          journal: true,
        },
      });

      // Create ledger entry using Decimal
      await LedgerService.createJournal({
        reference: generateReference('WDR-JNL'),
        description: `Withdrawal ${reference} - ${amount.toString()} ${currency}`,
        entries: [
          {
            accountId: data.accountId,
            entryType: 'DEBIT',
            amount: totalDeduction,
            description: `Withdrawal via ${data.method} - Amount: ${amount.toString()}, Fee: ${fee.toString()}`,
            transactionId: withdrawal.id,
          },
        ],
        withdrawalId: withdrawal.id,
        metadata: {
          withdrawalId: withdrawal.id,
          accountId: data.accountId,
          amount: amount.toString(),
          fee: fee.toString(),
          currency,
          method: data.method,
        },
      }, actingUserId);

      // Update account balance using Decimal arithmetic
      await AccountService.updateBalance({
        accountId: data.accountId,
        amount: totalDeduction,
        operation: 'WITHDRAWAL',
        reference: withdrawal.reference,
        description: `Withdrawal via ${data.method}`,
        metadata: { withdrawalId: withdrawal.id },
      }, actingUserId);

      // Log audit event
      await tx.auditLog.create({
        data: {
          actorId: actingUserId || data.userId,
          action: 'CREATE',
          resourceType: 'WITHDRAWAL',
          resourceId: withdrawal.id,
          newValues: {
            reference,
            userId: data.userId,
            accountId: data.accountId,
            amount: amount.toString(),
            fee: fee.toString(),
            totalAmount: totalDeduction.toString(),
            currency,
            method: data.method,
          },
          metadata: data.metadata,
          status: 'SUCCESS',
        },
      });

      // Send notification
      await tx.notification.create({
        data: {
          userId: data.userId,
          title: 'Withdrawal Completed',
          message: `Your withdrawal of ${amount.toString()} ${currency} via ${data.method} has been completed. Fee: ${fee.toString()} ${currency}. Reference: ${reference}`,
          type: 'SUCCESS',
          category: 'WITHDRAWAL',
          isRead: false,
          metadata: { withdrawalId: withdrawal.id },
        },
      });

      return { withdrawal };
    });
  }

  /**
   * Get withdrawal by ID
   */
  static async getById(id: string, actingUserId?: string): Promise<WithdrawalResult> {
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        account: {
          select: {
            id: true,
            accountNumber: true,
            balance: true,
            availableBalance: true,
          },
        },
        journal: true,
      },
    });

    if (!withdrawal) throw new NotFoundError('Withdrawal', id);

    // Authorization check
    if (actingUserId && actingUserId !== withdrawal.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this withdrawal');
      }
    }

    return { withdrawal };
  }

  /**
   * List withdrawals for a user
   */
  static async listByUser(
    userId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: WithdrawalStatus,
    method?: WithdrawalMethod,
    startDate?: Date,
    endDate?: Date
  ): Promise<WithdrawalListResult> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    // Authorization check
    if (actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these withdrawals');
      }
    }

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    if (method) where.method = method;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const withdrawals = await prisma.withdrawal.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        account: true,
      },
    });

    const total = await prisma.withdrawal.count({ where });

    return {
      withdrawals,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * List all withdrawals (admin only)
   */
  static async listAll(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: WithdrawalStatus,
    method?: WithdrawalMethod,
    startDate?: Date,
    endDate?: Date,
    userId?: string
  ): Promise<WithdrawalListResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view all withdrawals');
    }

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (method) where.method = method;
    if (userId) where.userId = userId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const withdrawals = await prisma.withdrawal.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        account: true,
      },
    });

    const total = await prisma.withdrawal.count({ where });

    return {
      withdrawals,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get withdrawal statistics
   */
  static async getStats(actingUserId: string): Promise<WithdrawalStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view withdrawal statistics');
    }

    const totalWithdrawals = await prisma.withdrawal.count();

    // Group by status
    const byStatus: Record<WithdrawalStatus, number> = {
      PENDING: 0,
      COMPLETED: 0,
      APPROVED: 0,
      REJECTED: 0,
      FAILED: 0,
    };

    const statusCounts = await prisma.withdrawal.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    for (const group of statusCounts) {
      byStatus[group.status as WithdrawalStatus] = group._count._all;
    }

    // Group by method
    const byMethod: Record<WithdrawalMethod, number> = {
      BANK_TRANSFER: 0,
      CASH: 0,
      ATM: 0,
      MOBILE_MONEY: 0,
      CHECK: 0,
    };

    const methodCounts = await prisma.withdrawal.groupBy({
      by: ['method'],
      _count: { _all: true },
    });

    for (const group of methodCounts) {
      byMethod[group.method as WithdrawalMethod] = group._count._all;
    }

    // Group by currency
    const byCurrency: Record<Currency, number> = {
      USD: 0,
      NGN: 0,
      EUR: 0,
      GBP: 0,
    };

    const currencyCounts = await prisma.withdrawal.groupBy({
      by: ['currency'],
      _count: { _all: true },
    });

    for (const group of currencyCounts) {
      byCurrency[group.currency as Currency] = group._count._all;
    }

    // Calculate total amount using Decimal arithmetic
    const allWithdrawals = await prisma.withdrawal.findMany({
      where: { status: { in: ['COMPLETED', 'APPROVED'] as WithdrawalStatus[] } },
      select: { amount: true, fee: true, currency: true },
    });

    const totalAmount = allWithdrawals
      .reduce((sum, w) => sum.plus(toDecimal(w.amount)), new Decimal(0))
      .toNumber();

    // Calculate total fees using Decimal arithmetic
    const totalFees = allWithdrawals
      .reduce((sum, w) => sum.plus(toDecimal(w.fee || 0)), new Decimal(0))
      .toNumber();

    // Calculate average amount using Decimal arithmetic
    const averageAmount = allWithdrawals.length > 0
      ? allWithdrawals.reduce((sum, w) => sum.plus(toDecimal(w.amount)), new Decimal(0)).div(allWithdrawals.length).toNumber()
      : 0;

    // Count pending approval
    const pendingApproval = await prisma.withdrawal.count({
      where: { status: 'PENDING' },
    });

    return {
      totalWithdrawals,
      totalAmount,
      byStatus,
      byMethod,
      byCurrency,
      averageAmount,
      pendingApproval,
      totalFees,
    };
  }
}
