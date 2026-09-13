import { prisma } from '../prisma';
import { generateReference } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  InsufficientBalanceError,
  DepositError,
} from '../utils/errors';
import { AccountService } from './account-service';
import { LedgerService } from './ledger-service';
import { Decimal } from '@prisma/client/runtime/library';
import type {
  User,
  Account,
  Deposit,
  DepositStatus,
  DepositMethod,
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

const DEPOSIT_CONFIG = {
  MIN_DEPOSIT_AMOUNT: new Decimal(1),
  MAX_DEPOSIT_AMOUNT: new Decimal(1000000),
  DAILY_LIMIT: new Decimal(100000),
  MONTHLY_LIMIT: new Decimal(1000000),
  MAX_DESCRIPTION_LENGTH: 500,
  DEFAULT_CURRENCY: 'USD' as Currency,
  SUPPORTED_METHODS: ['BANK_TRANSFER', 'CASH', 'CHECK', 'MOBILE_MONEY', 'USSD', 'CARD'] as DepositMethod[],
  FEE_PERCENTAGE: new Decimal(0),
  FEE_MINIMUM: new Decimal(0),
  FEE_MAXIMUM: new Decimal(0),
} as const;

export interface CreateDepositData {
  userId: string;
  accountId: string;
  amount: number | string | Decimal;
  currency?: Currency;
  method: DepositMethod;
  reference?: string;
  description?: string;
  transactionReference?: string;
  metadata?: Record<string, unknown>;
}

export interface DepositResult {
  deposit: Deposit & {
    user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
    account: Pick<Account, 'id' | 'accountNumber' | 'balance' | 'availableBalance'>;
    journal?: Journal | null;
  };
}

export interface DepositListResult {
  deposits: Deposit[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DepositStats {
  totalDeposits: number;
  totalAmount: number;
  byStatus: Record<DepositStatus, number>;
  byMethod: Record<DepositMethod, number>;
  byCurrency: Record<Currency, number>;
  averageAmount: number;
  pendingApproval: number;
}

export class DepositService {
  /**
   * Create a new deposit
   */
  static async createDeposit(
    data: CreateDepositData,
    actingUserId?: string
  ): Promise<DepositResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    // Authorization check
    if (actingUserId && actingUserId !== data.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You can only deposit to your own account');
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
    if (amount.lessThan(DEPOSIT_CONFIG.MIN_DEPOSIT_AMOUNT)) {
      throw new ValidationError(
        `Amount must be at least ${DEPOSIT_CONFIG.MIN_DEPOSIT_AMOUNT.toString()}`
      );
    }
    if (amount.greaterThan(DEPOSIT_CONFIG.MAX_DEPOSIT_AMOUNT)) {
      throw new ValidationError(
        `Amount cannot exceed ${DEPOSIT_CONFIG.MAX_DEPOSIT_AMOUNT.toString()}`
      );
    }

    // Validate method
    if (!DEPOSIT_CONFIG.SUPPORTED_METHODS.includes(data.method)) {
      throw new ValidationError(
        `Unsupported deposit method. Supported: ${DEPOSIT_CONFIG.SUPPORTED_METHODS.join(', ')}`
      );
    }

    // Validate currency
    const currency = data.currency || account.currency;

    // Check daily limit using Decimal arithmetic
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyDeposits = await prisma.deposit.aggregate({
      where: {
        userId: data.userId,
        createdAt: { gte: today },
        status: { in: ['PENDING', 'COMPLETED', 'APPROVED'] as DepositStatus[] },
      },
      _sum: { amount: true },
    });

    const dailyTotal = toDecimal(dailyDeposits._sum.amount || 0);
    const newDailyTotal = dailyTotal.plus(amount);

    if (newDailyTotal.greaterThan(DEPOSIT_CONFIG.DAILY_LIMIT)) {
      throw new ValidationError(
        `Daily deposit limit of ${DEPOSIT_CONFIG.DAILY_LIMIT.toString()} ${currency} exceeded`
      );
    }

    // Check monthly limit using Decimal arithmetic
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const monthlyDeposits = await prisma.deposit.aggregate({
      where: {
        userId: data.userId,
        createdAt: { gte: thisMonth },
        status: { in: ['PENDING', 'COMPLETED', 'APPROVED'] as DepositStatus[] },
      },
      _sum: { amount: true },
    });

    const monthlyTotal = toDecimal(monthlyDeposits._sum.amount || 0);
    const newMonthlyTotal = monthlyTotal.plus(amount);

    if (newMonthlyTotal.greaterThan(DEPOSIT_CONFIG.MONTHLY_LIMIT)) {
      throw new ValidationError(
        `Monthly deposit limit of ${DEPOSIT_CONFIG.MONTHLY_LIMIT.toString()} ${currency} exceeded`
      );
    }

    // Calculate fee using Decimal arithmetic (if applicable)
    const feeAmount = amount.times(DEPOSIT_CONFIG.FEE_PERCENTAGE);
    const fee = feeAmount.lessThan(DEPOSIT_CONFIG.FEE_MINIMUM)
      ? DEPOSIT_CONFIG.FEE_MINIMUM
      : feeAmount.greaterThan(DEPOSIT_CONFIG.FEE_MAXIMUM)
        ? DEPOSIT_CONFIG.FEE_MAXIMUM
        : feeAmount;

    const totalAmount = amount.plus(fee);

    // Generate reference
    const reference = data.reference || generateReference('DEP');

    // Create deposit
    return await prisma.$transaction(async (tx) => {
      const deposit = await tx.deposit.create({
        data: {
          reference,
          userId: data.userId,
          accountId: data.accountId,
          amount: amount,
          fee: fee,
          totalAmount: totalAmount,
          currency,
          method: data.method,
          transactionReference: data.transactionReference || null,
          description: data.description || null,
          status: 'COMPLETED' as DepositStatus,
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
        reference: generateReference('DEP-JNL'),
        description: `Deposit ${reference} - ${amount.toString()} ${currency}`,
        entries: [
          {
            accountId: data.accountId,
            entryType: 'CREDIT',
            amount: totalAmount,
            description: `Deposit via ${data.method} - Amount: ${amount.toString()}, Fee: ${fee.toString()}`,
            transactionId: deposit.id,
          },
        ],
        depositId: deposit.id,
        metadata: {
          depositId: deposit.id,
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
        amount: totalAmount,
        operation: 'DEPOSIT',
        reference: deposit.reference,
        description: `Deposit via ${data.method}`,
        metadata: { depositId: deposit.id },
      }, actingUserId);

      // Log audit event
      await tx.auditLog.create({
        data: {
          actorId: actingUserId || data.userId,
          action: 'CREATE',
          resourceType: 'DEPOSIT',
          resourceId: deposit.id,
          newValues: {
            reference,
            userId: data.userId,
            accountId: data.accountId,
            amount: amount.toString(),
            fee: fee.toString(),
            totalAmount: totalAmount.toString(),
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
          title: 'Deposit Completed',
          message: `Your deposit of ${amount.toString()} ${currency} via ${data.method} has been completed. Reference: ${reference}`,
          type: 'SUCCESS',
          category: 'DEPOSIT',
          isRead: false,
          metadata: { depositId: deposit.id },
        },
      });

      return { deposit };
    });
  }

  /**
   * Get deposit by ID
   */
  static async getById(id: string, actingUserId?: string): Promise<DepositResult> {
    const deposit = await prisma.deposit.findUnique({
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

    if (!deposit) throw new NotFoundError('Deposit', id);

    // Authorization check
    if (actingUserId && actingUserId !== deposit.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this deposit');
      }
    }

    return { deposit };
  }

  /**
   * List deposits for a user
   */
  static async listByUser(
    userId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: DepositStatus,
    method?: DepositMethod,
    startDate?: Date,
    endDate?: Date
  ): Promise<DepositListResult> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    // Authorization check
    if (actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these deposits');
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

    const deposits = await prisma.deposit.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        account: true,
      },
    });

    const total = await prisma.deposit.count({ where });

    return {
      deposits,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * List all deposits (admin only)
   */
  static async listAll(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: DepositStatus,
    method?: DepositMethod,
    startDate?: Date,
    endDate?: Date,
    userId?: string
  ): Promise<DepositListResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view all deposits');
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

    const deposits = await prisma.deposit.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        account: true,
      },
    });

    const total = await prisma.deposit.count({ where });

    return {
      deposits,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get deposit statistics
   */
  static async getStats(actingUserId: string): Promise<DepositStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view deposit statistics');
    }

    const totalDeposits = await prisma.deposit.count();

    // Group by status
    const byStatus: Record<DepositStatus, number> = {
      PENDING: 0,
      COMPLETED: 0,
      APPROVED: 0,
      REJECTED: 0,
      FAILED: 0,
    };

    const statusCounts = await prisma.deposit.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    for (const group of statusCounts) {
      byStatus[group.status as DepositStatus] = group._count._all;
    }

    // Group by method
    const byMethod: Record<DepositMethod, number> = {
      BANK_TRANSFER: 0,
      CASH: 0,
      CHECK: 0,
      MOBILE_MONEY: 0,
      USSD: 0,
      CARD: 0,
    };

    const methodCounts = await prisma.deposit.groupBy({
      by: ['method'],
      _count: { _all: true },
    });

    for (const group of methodCounts) {
      byMethod[group.method as DepositMethod] = group._count._all;
    }

    // Group by currency
    const byCurrency: Record<Currency, number> = {
      USD: 0,
      NGN: 0,
      EUR: 0,
      GBP: 0,
    };

    const currencyCounts = await prisma.deposit.groupBy({
      by: ['currency'],
      _count: { _all: true },
    });

    for (const group of currencyCounts) {
      byCurrency[group.currency as Currency] = group._count._all;
    }

    // Calculate total amount using Decimal arithmetic
    const allDeposits = await prisma.deposit.findMany({
      where: { status: { in: ['COMPLETED', 'APPROVED'] as DepositStatus[] } },
      select: { amount: true, currency: true },
    });

    const totalAmount = allDeposits
      .reduce((sum, d) => sum.plus(toDecimal(d.amount)), new Decimal(0))
      .toNumber();

    // Calculate average amount using Decimal arithmetic
    const averageAmount = allDeposits.length > 0
      ? allDeposits.reduce((sum, d) => sum.plus(toDecimal(d.amount)), new Decimal(0)).div(allDeposits.length).toNumber()
      : 0;

    // Count pending approval
    const pendingApproval = await prisma.deposit.count({
      where: { status: 'PENDING' },
    });

    return {
      totalDeposits,
      totalAmount,
      byStatus,
      byMethod,
      byCurrency,
      averageAmount,
      pendingApproval,
    };
  }
}
