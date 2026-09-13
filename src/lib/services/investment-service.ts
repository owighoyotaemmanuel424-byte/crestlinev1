import { prisma } from '../prisma';
import { generateReference } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  InsufficientBalanceError,
  InvestmentError,
} from '../utils/errors';
import { AccountService } from './account-service';
import { LedgerService } from './ledger-service';
import { Decimal } from '@prisma/client/runtime/library';
import type {
  User,
  Account,
  Investment,
  InvestmentStatus,
  InvestmentType,
  InvestmentRiskLevel,
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

const INVESTMENT_CONFIG = {
  MIN_INVESTMENT_AMOUNT: new Decimal(100),
  MAX_INVESTMENT_AMOUNT: new Decimal(10000000),
  MIN_DURATION_DAYS: 30,
  MAX_DURATION_DAYS: 3650,
  DEFAULT_CURRENCY: 'USD' as Currency,
  SUPPORTED_TYPES: ['FIXED_DEPOSIT', 'TREASURY_BILL', 'BOND', 'MUTUAL_FUND', 'STOCK', 'REIT'] as InvestmentType[],
  RISK_LEVELS: {
    FIXED_DEPOSIT: 'LOW' as InvestmentRiskLevel,
    TREASURY_BILL: 'LOW' as InvestmentRiskLevel,
    BOND: 'MEDIUM' as InvestmentRiskLevel,
    MUTUAL_FUND: 'MEDIUM' as InvestmentRiskLevel,
    STOCK: 'HIGH' as InvestmentRiskLevel,
    REIT: 'MEDIUM' as InvestmentRiskLevel,
  },
  // Interest rates as percentages
  INTEREST_RATES: {
    FIXED_DEPOSIT: new Decimal(0.08), // 8%
    TREASURY_BILL: new Decimal(0.07), // 7%
    BOND: new Decimal(0.065), // 6.5%
    MUTUAL_FUND: new Decimal(0.10), // 10%
    STOCK: new Decimal(0.15), // 15% (variable)
    REIT: new Decimal(0.12), // 12%
  },
  MAX_DESCRIPTION_LENGTH: 1000,
} as const;

export interface CreateInvestmentData {
  userId: string;
  accountId: string;
  investmentType: InvestmentType;
  amount: number | string | Decimal;
  durationDays: number;
  currency?: Currency;
  description?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
}

export interface InvestmentResult {
  investment: Investment & {
    user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
    account: Pick<Account, 'id' | 'accountNumber' | 'balance' | 'availableBalance'>;
    journal?: Journal | null;
  };
}

export interface InvestmentListResult {
  investments: Investment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface InvestmentStats {
  totalInvestments: number;
  totalAmount: number;
  totalReturns: number;
  byStatus: Record<InvestmentStatus, number>;
  byType: Record<InvestmentType, number>;
  byRiskLevel: Record<InvestmentRiskLevel, number>;
  averageAmount: number;
  averageReturnRate: number;
  maturingSoon: number;
  activeInvestments: number;
}

export class InvestmentService {
  /**
   * Create a new investment
   */
  static async createInvestment(
    data: CreateInvestmentData,
    actingUserId?: string
  ): Promise<InvestmentResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    // Authorization check
    if (actingUserId && actingUserId !== data.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You can only create investments for yourself');
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

    // Validate investment type
    if (!INVESTMENT_CONFIG.SUPPORTED_TYPES.includes(data.investmentType)) {
      throw new ValidationError(
        `Unsupported investment type. Supported: ${INVESTMENT_CONFIG.SUPPORTED_TYPES.join(', ')}`
      );
    }

    // Validate amount using Decimal
    const amount = toDecimal(data.amount);
    if (amount.lessThanOrEqual(new Decimal(0))) {
      throw new ValidationError('Amount must be positive');
    }
    if (amount.lessThan(INVESTMENT_CONFIG.MIN_INVESTMENT_AMOUNT)) {
      throw new ValidationError(
        `Minimum investment amount is ${INVESTMENT_CONFIG.MIN_INVESTMENT_AMOUNT.toString()}`
      );
    }
    if (amount.greaterThan(INVESTMENT_CONFIG.MAX_INVESTMENT_AMOUNT)) {
      throw new ValidationError(
        `Maximum investment amount is ${INVESTMENT_CONFIG.MAX_INVESTMENT_AMOUNT.toString()}`
      );
    }

    // Validate duration
    if (data.durationDays < INVESTMENT_CONFIG.MIN_DURATION_DAYS) {
      throw new ValidationError(
        `Minimum investment duration is ${INVESTMENT_CONFIG.MIN_DURATION_DAYS} days`
      );
    }
    if (data.durationDays > INVESTMENT_CONFIG.MAX_DURATION_DAYS) {
      throw new ValidationError(
        `Maximum investment duration is ${INVESTMENT_CONFIG.MAX_DURATION_DAYS} days`
      );
    }

    // Check sufficient balance using Decimal comparison
    const availableBalance = toDecimal(account.availableBalance);
    if (availableBalance.lessThan(amount)) {
      throw new InsufficientBalanceError(
        account.id,
        amount.toNumber(),
        availableBalance.toNumber()
      );
    }

    // Validate currency
    const currency = data.currency || account.currency;

    // Get risk level and interest rate
    const riskLevel = INVESTMENT_CONFIG.RISK_LEVELS[data.investmentType];
    const interestRate = INVESTMENT_CONFIG.INTEREST_RATES[data.investmentType];

    // Calculate maturity date
    const maturityDate = new Date();
    maturityDate.setDate(maturityDate.getDate() + data.durationDays);

    // Calculate projected returns using Decimal arithmetic
    const projectedReturns = amount.times(interestRate).times(new Decimal(data.durationDays / 365));

    // Generate reference
    const reference = data.reference || generateReference('INV');

    // Create investment
    return await prisma.$transaction(async (tx) => {
      const investment = await tx.investment.create({
        data: {
          reference,
          userId: data.userId,
          accountId: data.accountId,
          investmentType: data.investmentType,
          amount: amount,
          currency,
          durationDays: data.durationDays,
          maturityDate,
          interestRate,
          projectedReturns,
          riskLevel,
          status: 'ACTIVE' as InvestmentStatus,
          description: data.description || null,
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
        reference: generateReference('INV-JNL'),
        description: `Investment ${reference} - ${amount.toString()} ${currency} in ${data.investmentType}`,
        entries: [
          {
            accountId: data.accountId,
            entryType: 'DEBIT',
            amount: amount,
            description: `Investment in ${data.investmentType} - Amount: ${amount.toString()}, Duration: ${data.durationDays} days`,
            transactionId: investment.id,
          },
        ],
        investmentId: investment.id,
        metadata: {
          investmentId: investment.id,
          accountId: data.accountId,
          amount: amount.toString(),
          currency,
          investmentType: data.investmentType,
          durationDays: data.durationDays,
          projectedReturns: projectedReturns.toString(),
        },
      }, actingUserId);

      // Update account balance using Decimal arithmetic
      await AccountService.updateBalance({
        accountId: data.accountId,
        amount: amount,
        operation: 'ADJUSTMENT',
        reference: investment.reference,
        description: `Investment in ${data.investmentType}`,
        metadata: { investmentId: investment.id },
      }, actingUserId);

      // Log audit event
      await tx.auditLog.create({
        data: {
          actorId: actingUserId || data.userId,
          action: 'CREATE',
          resourceType: 'INVESTMENT',
          resourceId: investment.id,
          newValues: {
            reference,
            userId: data.userId,
            accountId: data.accountId,
            investmentType: data.investmentType,
            amount: amount.toString(),
            currency,
            durationDays: data.durationDays,
            maturityDate: maturityDate.toISOString(),
            interestRate: interestRate.toString(),
            projectedReturns: projectedReturns.toString(),
            riskLevel,
          },
          metadata: data.metadata,
          status: 'SUCCESS',
        },
      });

      // Send notification
      await tx.notification.create({
        data: {
          userId: data.userId,
          title: 'Investment Created',
          message: `Your investment of ${amount.toString()} ${currency} in ${data.investmentType} has been created. Projected returns: ${projectedReturns.toString()} ${currency}. Maturity: ${maturityDate.toDateString()}`,
          type: 'SUCCESS',
          category: 'INVESTMENT',
          isRead: false,
          metadata: { investmentId: investment.id },
        },
      });

      return { investment };
    });
  }

  /**
   * Get investment by ID
   */
  static async getById(id: string, actingUserId?: string): Promise<InvestmentResult> {
    const investment = await prisma.investment.findUnique({
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

    if (!investment) throw new NotFoundError('Investment', id);

    // Authorization check
    if (actingUserId && actingUserId !== investment.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this investment');
      }
    }

    return { investment };
  }

  /**
   * List investments for a user
   */
  static async listByUser(
    userId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: InvestmentStatus,
    investmentType?: InvestmentType,
    riskLevel?: InvestmentRiskLevel,
    maturingSoon?: boolean
  ): Promise<InvestmentListResult> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    // Authorization check
    if (actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these investments');
      }
    }

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    if (investmentType) where.investmentType = investmentType;
    if (riskLevel) where.riskLevel = riskLevel;
    if (maturingSoon) {
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 7);
      where.maturityDate = { lte: soonDate };
    }

    const investments = await prisma.investment.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        account: true,
      },
    });

    const total = await prisma.investment.count({ where });

    return {
      investments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * List all investments (admin only)
   */
  static async listAll(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: InvestmentStatus,
    investmentType?: InvestmentType,
    riskLevel?: InvestmentRiskLevel,
    userId?: string
  ): Promise<InvestmentListResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view all investments');
    }

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (investmentType) where.investmentType = investmentType;
    if (riskLevel) where.riskLevel = riskLevel;
    if (userId) where.userId = userId;

    const investments = await prisma.investment.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        account: true,
      },
    });

    const total = await prisma.investment.count({ where });

    return {
      investments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Liquidate investment (early withdrawal)
   */
  static async liquidate(
    id: string,
    actingUserId: string,
    reason?: string
  ): Promise<InvestmentResult> {
    const investment = await prisma.investment.findUnique({
      where: { id },
      include: {
        user: true,
        account: true,
      },
    });

    if (!investment) throw new NotFoundError('Investment', id);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
      throw new ForbiddenError('Only administrators can liquidate investments');
    }

    if (investment.status !== 'ACTIVE') {
      throw new ValidationError('Only active investments can be liquidated');
    }

    // Calculate liquidation amount using Decimal arithmetic
    // Apply penalty for early withdrawal (5% for first 90 days, 3% for 90-180 days, 1% for 180+ days)
    const today = new Date();
    const daysHeld = Math.floor((today.getTime() - investment.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    
    let penaltyRate: Decimal;
    if (daysHeld < 90) {
      penaltyRate = new Decimal(0.05); // 5%
    } else if (daysHeld < 180) {
      penaltyRate = new Decimal(0.03); // 3%
    } else {
      penaltyRate = new Decimal(0.01); // 1%
    }

    const amount = toDecimal(investment.amount);
    const penalty = amount.times(penaltyRate);
    const liquidationAmount = amount.minus(penalty);

    return await prisma.$transaction(async (tx) => {
      const liquidatedInvestment = await tx.investment.update({
        where: { id },
        data: {
          status: 'LIQUIDATED' as InvestmentStatus,
          liquidatedAt: new Date(),
          liquidatedById: actingUserId,
          liquidationAmount,
          liquidationPenalty: penalty,
          liquidationReason: reason || null,
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

      // Create ledger entry for liquidation using Decimal
      await LedgerService.createJournal({
        reference: generateReference('INV-LIQ'),
        description: `Investment liquidation ${investment.reference} - ${liquidationAmount.toString()} ${investment.currency}`,
        entries: [
          {
            accountId: investment.accountId,
            entryType: 'CREDIT',
            amount: liquidationAmount,
            description: `Liquidation of investment ${investment.reference} - Amount: ${liquidationAmount.toString()}, Penalty: ${penalty.toString()}`,
            transactionId: liquidatedInvestment.id,
          },
        ],
        investmentId: liquidatedInvestment.id,
        metadata: {
          investmentId: liquidatedInvestment.id,
          accountId: investment.accountId,
          liquidationAmount: liquidationAmount.toString(),
          penalty: penalty.toString(),
          currency: investment.currency,
        },
      }, actingUserId);

      // Update account balance using Decimal arithmetic
      await AccountService.updateBalance({
        accountId: investment.accountId,
        amount: liquidationAmount,
        operation: 'ADJUSTMENT',
        reference: liquidatedInvestment.reference,
        description: `Liquidation of investment ${investment.reference}`,
        metadata: { investmentId: liquidatedInvestment.id },
      }, actingUserId);

      // Log audit event
      await tx.auditLog.create({
        data: {
          actorId: actingUserId,
          action: 'LIQUIDATE',
          resourceType: 'INVESTMENT',
          resourceId: investment.id,
          oldValues: { status: investment.status },
          newValues: {
            status: 'LIQUIDATED',
            liquidationAmount: liquidationAmount.toString(),
            penalty: penalty.toString(),
            reason,
          },
          status: 'SUCCESS',
        },
      });

      // Send notification
      await tx.notification.create({
        data: {
          userId: investment.userId,
          title: 'Investment Liquidated',
          message: `Your investment ${investment.reference} has been liquidated. Amount received: ${liquidationAmount.toString()} ${investment.currency}. Penalty: ${penalty.toString()} ${investment.currency}`,
          type: 'INFO',
          category: 'INVESTMENT',
          isRead: false,
          metadata: { investmentId: liquidatedInvestment.id },
        },
      });

      return { investment: liquidatedInvestment };
    });
  }

  /**
   * Mark investment as matured
   */
  static async markAsMatured(
    id: string,
    actingUserId: string
  ): Promise<InvestmentResult> {
    const investment = await prisma.investment.findUnique({
      where: { id },
      include: {
        user: true,
        account: true,
      },
    });

    if (!investment) throw new NotFoundError('Investment', id);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
      throw new ForbiddenError('Only administrators can mark investments as matured');
    }

    if (investment.status !== 'ACTIVE') {
      throw new ValidationError('Only active investments can be marked as matured');
    }

    if (new Date() < investment.maturityDate) {
      throw new ValidationError('Investment has not reached maturity date yet');
    }

    // Calculate maturity amount with full returns using Decimal arithmetic
    const amount = toDecimal(investment.amount);
    const returns = toDecimal(investment.projectedReturns);
    const maturityAmount = amount.plus(returns);

    return await prisma.$transaction(async (tx) => {
      const maturedInvestment = await tx.investment.update({
        where: { id },
        data: {
          status: 'MATURED' as InvestmentStatus,
          maturedAt: new Date(),
          maturedById: actingUserId,
          maturityAmount,
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

      // Create ledger entry for maturity using Decimal
      await LedgerService.createJournal({
        reference: generateReference('INV-MAT'),
        description: `Investment maturity ${investment.reference} - ${maturityAmount.toString()} ${investment.currency}`,
        entries: [
          {
            accountId: investment.accountId,
            entryType: 'CREDIT',
            amount: maturityAmount,
            description: `Maturity of investment ${investment.reference} - Principal: ${amount.toString()}, Returns: ${returns.toString()}`,
            transactionId: maturedInvestment.id,
          },
        ],
        investmentId: maturedInvestment.id,
        metadata: {
          investmentId: maturedInvestment.id,
          accountId: investment.accountId,
          maturityAmount: maturityAmount.toString(),
          principal: amount.toString(),
          returns: returns.toString(),
          currency: investment.currency,
        },
      }, actingUserId);

      // Update account balance using Decimal arithmetic
      await AccountService.updateBalance({
        accountId: investment.accountId,
        amount: maturityAmount,
        operation: 'ADJUSTMENT',
        reference: maturedInvestment.reference,
        description: `Maturity of investment ${investment.reference}`,
        metadata: { investmentId: maturedInvestment.id },
      }, actingUserId);

      // Log audit event
      await tx.auditLog.create({
        data: {
          actorId: actingUserId,
          action: 'MATURE',
          resourceType: 'INVESTMENT',
          resourceId: investment.id,
          oldValues: { status: investment.status },
          newValues: {
            status: 'MATURED',
            maturityAmount: maturityAmount.toString(),
          },
          status: 'SUCCESS',
        },
      });

      // Send notification
      await tx.notification.create({
        data: {
          userId: investment.userId,
          title: 'Investment Matured',
          message: `Your investment ${investment.reference} has matured. Total amount: ${maturityAmount.toString()} ${investment.currency} (Principal: ${amount.toString()}, Returns: ${returns.toString()})`,
          type: 'SUCCESS',
          category: 'INVESTMENT',
          isRead: false,
          metadata: { investmentId: maturedInvestment.id },
        },
      });

      return { investment: maturedInvestment };
    });
  }

  /**
   * Get investment statistics
   */
  static async getStats(actingUserId: string): Promise<InvestmentStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view investment statistics');
    }

    const totalInvestments = await prisma.investment.count();

    // Group by status
    const byStatus: Record<InvestmentStatus, number> = {
      ACTIVE: 0,
      MATURED: 0,
      LIQUIDATED: 0,
      CLOSED: 0,
    };

    const statusCounts = await prisma.investment.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    for (const group of statusCounts) {
      byStatus[group.status as InvestmentStatus] = group._count._all;
    }

    // Group by type
    const byType: Record<InvestmentType, number> = {
      FIXED_DEPOSIT: 0,
      TREASURY_BILL: 0,
      BOND: 0,
      MUTUAL_FUND: 0,
      STOCK: 0,
      REIT: 0,
    };

    const typeCounts = await prisma.investment.groupBy({
      by: ['investmentType'],
      _count: { _all: true },
    });

    for (const group of typeCounts) {
      byType[group.investmentType as InvestmentType] = group._count._all;
    }

    // Group by risk level
    const byRiskLevel: Record<InvestmentRiskLevel, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
    };

    const riskLevelCounts = await prisma.investment.groupBy({
      by: ['riskLevel'],
      _count: { _all: true },
    });

    for (const group of riskLevelCounts) {
      byRiskLevel[group.riskLevel as InvestmentRiskLevel] = group._count._all;
    }

    // Calculate total amount using Decimal arithmetic
    const allInvestments = await prisma.investment.findMany({
      where: { status: { in: ['ACTIVE', 'MATURED'] as InvestmentStatus[] } },
      select: { amount: true, currency: true },
    });

    const totalAmount = allInvestments
      .reduce((sum, i) => sum.plus(toDecimal(i.amount)), new Decimal(0))
      .toNumber();

    // Calculate total returns using Decimal arithmetic
    const activeInvestmentsList = await prisma.investment.findMany({
      where: { status: 'ACTIVE' as InvestmentStatus },
      select: { projectedReturns: true },
    });

    const totalReturns = activeInvestmentsList
      .reduce((sum, i) => sum.plus(toDecimal(i.projectedReturns)), new Decimal(0))
      .toNumber();

    // Calculate average amount using Decimal arithmetic
    const averageAmount = allInvestments.length > 0
      ? allInvestments.reduce((sum, i) => sum.plus(toDecimal(i.amount)), new Decimal(0)).div(allInvestments.length).toNumber()
      : 0;

    // Calculate average return rate
    const averageReturnRate = activeInvestmentsList.length > 0
      ? activeInvestmentsList.reduce((sum, i) => sum.plus(toDecimal(i.projectedReturns)), new Decimal(0)).div(activeInvestmentsList.length).div(allInvestments.reduce((s, i) => s.plus(toDecimal(i.amount)), new Decimal(0))).toNumber()
      : 0;

    // Count maturing soon (within 7 days)
    const soonDate = new Date();
    soonDate.setDate(soonDate.getDate() + 7);

    const maturingSoon = await prisma.investment.count({
      where: {
        status: 'ACTIVE' as InvestmentStatus,
        maturityDate: { lte: soonDate },
      },
    });

    return {
      totalInvestments,
      totalAmount,
      totalReturns,
      byStatus,
      byType,
      byRiskLevel,
      averageAmount,
      averageReturnRate,
      maturingSoon,
      activeInvestments: byStatus.ACTIVE,
    };
  }
}
