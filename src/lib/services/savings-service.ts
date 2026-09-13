import { prisma } from '../prisma';
import { generateReference, generateIdempotencyKey } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  AppError,
  InsufficientBalanceError,
} from '../utils/errors';
import { LedgerService } from './ledger-service';
import { Decimal } from '@prisma/client/runtime/library';
import type {
  User,
  Account,
  SavingsGoal,
  SavingsContribution,
  SavingsWithdrawal,
  SavingsGoalStatus,
  ContributionStatus,
  WithdrawalStatus,
  Role,
  Journal,
  Transaction,
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

const SAVINGS_CONFIG = {
  MIN_TARGET_AMOUNT: new Decimal(1),
  MIN_CONTRIBUTION_AMOUNT: new Decimal(1),
  MIN_WITHDRAWAL_AMOUNT: new Decimal(1),
  MAX_DESCRIPTION_LENGTH: 500,
  DEFAULT_INTEREST_RATE: new Decimal(0.05), // 5% annual
  COMPOUND_FREQUENCY: 'MONTHLY' as const,
  ALLOW_OVER_CONTRIBUTION: true,
  ALLOW_EARLY_WITHDRAWAL: true,
  IDEMPOTENCY_TTL: 24 * 60 * 60 * 1000, // 24 hours
} as const;

// ============================================
// INTERFACES & TYPES
// ============================================

export interface CreateSavingsGoalData {
  userId: string;
  name: string;
  description?: string;
  targetAmount: number | string | Decimal;
  targetDate?: Date;
}

export interface UpdateSavingsGoalData {
  name?: string;
  description?: string;
  targetAmount?: number | string | Decimal;
  targetDate?: Date;
  status?: SavingsGoalStatus;
}

export interface ContributeData {
  savingsGoalId: string;
  accountId: string;
  amount: number | string | Decimal;
  description?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface WithdrawData {
  savingsGoalId: string;
  accountId: string;
  amount: number | string | Decimal;
  description?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface SavingsGoalResult {
  goal: SavingsGoal & {
    user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
    contributions: SavingsContribution[];
    withdrawals: SavingsWithdrawal[];
    progressPercent: number;
    currentAmount: number;
    remainingAmount: number;
    daysRemaining: number | null;
  };
}

export interface ContributionResult {
  contribution: SavingsContribution & {
    savingsGoal: Pick<SavingsGoal, 'id' | 'name' | 'userId'>;
    account: Pick<Account, 'id' | 'accountNumber' | 'userId'>;
    journal?: Journal | null;
    transaction?: Transaction | null;
  };
}

export interface WithdrawalResult {
  withdrawal: SavingsWithdrawal & {
    savingsGoal: Pick<SavingsGoal, 'id' | 'name' | 'userId'>;
    account: Pick<Account, 'id' | 'accountNumber' | 'userId'>;
    journal?: Journal | null;
    transaction?: Transaction | null;
  };
}

export interface SavingsGoalListResult {
  goals: SavingsGoalResult['goal'][];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ContributionListResult {
  contributions: ContributionResult['contribution'][];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface WithdrawalListResult {
  withdrawals: WithdrawalResult['withdrawal'][];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SavingsStats {
  totalGoals: number;
  totalContributions: number;
  totalWithdrawals: number;
  totalSaved: number;
  totalTarget: number;
  averageProgress: number;
  byStatus: Record<SavingsGoalStatus, number>;
  topGoals: Array<{
    goalId: string;
    name: string;
    currentAmount: number;
    targetAmount: number;
    progressPercent: number;
  }>;
}

export interface InterestCalculation {
  savingsGoalId: string;
  startDate: Date;
  endDate: Date;
  dailyRate: number | string | Decimal;
  compoundFrequency: 'DAILY' | 'MONTHLY' | 'YEARLY';
}

export interface InterestResult {
  savingsGoalId: string;
  startDate: Date;
  endDate: Date;
  principal: number;
  interestEarned: number;
  totalAmount: number;
  compoundFrequency: string;
}

// ============================================
// SAVINGS SERVICE
// ============================================

export class SavingsService {
  // ============================================
  // SAVINGS GOAL MANAGEMENT
  // ============================================

  /**
   * Create a new savings goal
   */
  static async createSavingsGoal(
    data: CreateSavingsGoalData,
    actingUserId: string
  ): Promise<SavingsGoalResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    // Authorization check
    if (actingUserId !== data.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('Only administrators can create savings goals for other users');
      }
    }

    // Validate inputs using Decimal
    const targetAmount = toDecimal(data.targetAmount);
    if (targetAmount.lessThan(SAVINGS_CONFIG.MIN_TARGET_AMOUNT)) {
      throw new ValidationError(
        `Target amount must be at least ${SAVINGS_CONFIG.MIN_TARGET_AMOUNT.toString()}`
      );
    }

    // Check for duplicate goal name
    const existingGoal = await prisma.savingsGoal.findFirst({
      where: { userId: data.userId, name: data.name },
    });

    if (existingGoal) {
      throw new ConflictError('Savings goal with this name already exists');
    }

    const goal = await prisma.savingsGoal.create({
      data: {
        userId: data.userId,
        name: data.name,
        description: data.description || null,
        targetAmount: targetAmount,
        currentAmount: new Decimal(0),
        targetDate: data.targetDate || null,
        status: 'ACTIVE' as SavingsGoalStatus,
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
        contributions: true,
        withdrawals: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'CREATE',
        resourceType: 'SAVINGS_GOAL',
        resourceId: goal.id,
        newValues: { userId: data.userId, name: data.name, targetAmount: targetAmount.toString() },
        status: 'SUCCESS',
      },
    });

    return this.formatGoal(goal);
  }

  /**
   * Get a savings goal by ID
   */
  static async getSavingsGoalById(
    id: string,
    actingUserId: string
  ): Promise<SavingsGoalResult> {
    const goal = await prisma.savingsGoal.findUnique({
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
        contributions: {
          orderBy: { contributedAt: 'desc' },
          include: {
            account: true,
            journal: true,
          },
        },
        withdrawals: {
          orderBy: { withdrawnAt: 'desc' },
          include: {
            account: true,
            journal: true,
          },
        },
      },
    });

    if (!goal) throw new NotFoundError('Savings Goal', id);

    // Authorization check
    if (actingUserId !== goal.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this savings goal');
      }
    }

    return this.formatGoal(goal);
  }

  /**
   * List savings goals for a user
   */
  static async listSavingsGoals(
    userId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: SavingsGoalStatus,
    search?: string
  ): Promise<SavingsGoalListResult> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    // Authorization check
    if (actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these savings goals');
      }
    }

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const goals = await prisma.savingsGoal.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        contributions: {
          include: {
            account: true,
            journal: true,
          },
        },
        withdrawals: {
          include: {
            account: true,
            journal: true,
          },
        },
      },
    });

    const total = await prisma.savingsGoal.count({ where });

    return {
      goals: await Promise.all(goals.map(g => this.formatGoal(g))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * List all savings goals (admin only)
   */
  static async listAllSavingsGoals(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: SavingsGoalStatus,
    search?: string
  ): Promise<SavingsGoalListResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view all savings goals');
    }

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const goals = await prisma.savingsGoal.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        contributions: {
          include: {
            account: true,
            journal: true,
          },
        },
        withdrawals: {
          include: {
            account: true,
            journal: true,
          },
        },
      },
    });

    const total = await prisma.savingsGoal.count({ where });

    return {
      goals: await Promise.all(goals.map(g => this.formatGoal(g))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update a savings goal
   */
  static async updateSavingsGoal(
    id: string,
    data: UpdateSavingsGoalData,
    actingUserId: string
  ): Promise<SavingsGoalResult> {
    const goal = await prisma.savingsGoal.findUnique({
      where: { id },
      include: {
        user: true,
        contributions: true,
        withdrawals: true,
      },
    });

    if (!goal) throw new NotFoundError('Savings Goal', id);

    // Authorization check
    if (actingUserId !== goal.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('Only administrators can update savings goals of other users');
      }
    }

    const oldStatus = goal.status;
    const oldTargetAmount = toDecimal(goal.targetAmount);

    const updatedGoal = await prisma.savingsGoal.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        targetAmount: data.targetAmount ? toDecimal(data.targetAmount) : undefined,
        targetDate: data.targetDate,
        status: data.status,
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
        contributions: {
          include: {
            account: true,
            journal: true,
          },
        },
        withdrawals: {
          include: {
            account: true,
            journal: true,
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'UPDATE',
        resourceType: 'SAVINGS_GOAL',
        resourceId: goal.id,
        oldValues: { name: goal.name, targetAmount: oldTargetAmount.toString(), status: oldStatus },
        newValues: {
          name: data.name || goal.name,
          targetAmount: data.targetAmount ? toDecimal(data.targetAmount).toString() : oldTargetAmount.toString(),
          status: data.status || oldStatus,
        },
        status: 'SUCCESS',
      },
    });

    return this.formatGoal(updatedGoal);
  }

  /**
   * Complete a savings goal
   */
  static async completeSavingsGoal(id: string, actingUserId: string): Promise<SavingsGoalResult> {
    const goal = await prisma.savingsGoal.findUnique({
      where: { id },
      include: {
        user: true,
        contributions: true,
        withdrawals: true,
      },
    });

    if (!goal) throw new NotFoundError('Savings Goal', id);

    // Authorization check
    if (actingUserId !== goal.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('Only administrators can complete savings goals of other users');
      }
    }

    if (goal.status === 'COMPLETED') {
      throw new ValidationError('Goal is already completed');
    }

    // Check if goal has reached target using Decimal comparison
    const currentAmount = toDecimal(goal.currentAmount);
    const targetAmount = toDecimal(goal.targetAmount);
    if (currentAmount.lessThan(targetAmount)) {
      throw new ValidationError('Goal has not reached target amount');
    }

    const completedGoal = await prisma.savingsGoal.update({
      where: { id },
      data: { status: 'COMPLETED' as SavingsGoalStatus },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        contributions: {
          include: {
            account: true,
            journal: true,
          },
        },
        withdrawals: {
          include: {
            account: true,
            journal: true,
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'COMPLETE',
        resourceType: 'SAVINGS_GOAL',
        resourceId: goal.id,
        oldValues: { status: goal.status },
        newValues: { status: 'COMPLETED' },
        status: 'SUCCESS',
      },
    });

    // Send notification
    await prisma.notification.create({
      data: {
        userId: goal.userId,
        title: 'Savings Goal Completed!',
        message: `Congratulations! You have reached your savings goal "${goal.name}".`,
        type: 'SUCCESS',
        category: 'SAVINGS',
        isRead: false,
        metadata: { goalId: goal.id, goalName: goal.name },
      },
    });

    return this.formatGoal(completedGoal);
  }

  // ============================================
  // CONTRIBUTION MANAGEMENT
  // ============================================

  /**
   * Make a contribution to a savings goal
   */
  static async contribute(
    data: ContributeData,
    actingUserId: string
  ): Promise<ContributionResult> {
    const goal = await prisma.savingsGoal.findUnique({ where: { id: data.savingsGoalId } });
    if (!goal) throw new NotFoundError('Savings Goal', data.savingsGoalId);

    // Authorization check
    if (actingUserId !== goal.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this savings goal');
      }
    }

    const account = await prisma.account.findUnique({ where: { id: data.accountId } });
    if (!account) throw new NotFoundError('Account', data.accountId);

    // Check account ownership
    if (account.userId !== goal.userId) {
      throw new ForbiddenError('Account does not belong to goal owner');
    }

    // Check for idempotency
    if (data.idempotencyKey) {
      const existingContribution = await prisma.savingsContribution.findFirst({
        where: { idempotencyKey: data.idempotencyKey },
      });

      if (existingContribution) {
        throw new ConflictError('Duplicate contribution (idempotency key already used)');
      }
    }

    // Validate amount using Decimal
    const amount = toDecimal(data.amount);
    if (amount.lessThan(SAVINGS_CONFIG.MIN_CONTRIBUTION_AMOUNT)) {
      throw new ValidationError(
        `Contribution amount must be at least ${SAVINGS_CONFIG.MIN_CONTRIBUTION_AMOUNT.toString()}`
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

    // Create contribution
    const contribution = await prisma.savingsContribution.create({
      data: {
        savingsGoalId: data.savingsGoalId,
        accountId: data.accountId,
        amount: amount,
        description: data.description || null,
        contributedAt: new Date(),
        status: 'COMPLETED' as ContributionStatus,
        idempotencyKey: data.idempotencyKey || generateIdempotencyKey(),
        metadata: data.metadata || null,
      },
      include: {
        savingsGoal: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        account: {
          select: {
            id: true,
            accountNumber: true,
            userId: true,
          },
        },
        journal: true,
        transaction: true,
      },
    });

    // Update savings goal current amount using Decimal arithmetic
    await prisma.savingsGoal.update({
      where: { id: data.savingsGoalId },
      data: {
        currentAmount: {
          increment: amount,
        },
      },
    });

    // Create ledger entries
    await LedgerService.createJournal({
      reference: generateReference('SAV-CONT'),
      description: `Savings contribution: ${amount.toString()} to ${goal.name}`,
      entries: [
        {
          accountId: data.accountId,
          entryType: 'DEBIT',
          amount: amount,
          description: `Contribution to savings goal: ${goal.name}`,
          transactionId: contribution.id,
        },
      ],
      savingsContributionId: contribution.id,
      metadata: {
        contributionId: contribution.id,
        savingsGoalId: data.savingsGoalId,
        amount: amount.toString(),
      },
    }, actingUserId);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'CREATE',
        resourceType: 'SAVINGS_CONTRIBUTION',
        resourceId: contribution.id,
        newValues: {
          savingsGoalId: data.savingsGoalId,
          accountId: data.accountId,
          amount: amount.toString(),
        },
        metadata: data.metadata,
        status: 'SUCCESS',
      },
    });

    // Check if goal is now completed
    const updatedGoal = await prisma.savingsGoal.findUnique({
      where: { id: data.savingsGoalId },
    });

    if (updatedGoal) {
      const updatedCurrent = toDecimal(updatedGoal.currentAmount);
      const target = toDecimal(updatedGoal.targetAmount);
      if (updatedCurrent.greaterThanOrEqual(target)) {
        await this.completeSavingsGoal(data.savingsGoalId, actingUserId);
      }
    }

    return this.formatContribution(contribution);
  }

  /**
   * Get a contribution by ID
   */
  static async getContributionById(
    id: string,
    actingUserId: string
  ): Promise<ContributionResult> {
    const contribution = await prisma.savingsContribution.findUnique({
      where: { id },
      include: {
        savingsGoal: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        account: {
          select: {
            id: true,
            accountNumber: true,
            userId: true,
          },
        },
        journal: true,
        transaction: true,
      },
    });

    if (!contribution) throw new NotFoundError('Savings Contribution', id);

    // Authorization check
    if (actingUserId !== contribution.savingsGoal.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this contribution');
      }
    }

    return this.formatContribution(contribution);
  }

  /**
   * List contributions for a savings goal
   */
  static async listContributions(
    savingsGoalId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: ContributionStatus,
    startDate?: Date,
    endDate?: Date
  ): Promise<ContributionListResult> {
    const goal = await prisma.savingsGoal.findUnique({ where: { id: savingsGoalId } });
    if (!goal) throw new NotFoundError('Savings Goal', savingsGoalId);

    // Authorization check
    if (actingUserId !== goal.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this savings goal');
      }
    }

    const where: Record<string, unknown> = { savingsGoalId };
    if (status) where.status = status;
    if (startDate || endDate) {
      where.contributedAt = {};
      if (startDate) where.contributedAt.gte = startDate;
      if (endDate) where.contributedAt.lte = endDate;
    }

    const contributions = await prisma.savingsContribution.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { contributedAt: 'desc' },
      include: {
        savingsGoal: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        account: {
          select: {
            id: true,
            accountNumber: true,
            userId: true,
          },
        },
        journal: true,
        transaction: true,
      },
    });

    const total = await prisma.savingsContribution.count({ where });

    return {
      contributions: contributions.map(c => this.formatContribution(c)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================
  // WITHDRAWAL MANAGEMENT
  // ============================================

  /**
   * Make a withdrawal from a savings goal
   */
  static async withdraw(
    data: WithdrawData,
    actingUserId: string
  ): Promise<WithdrawalResult> {
    const goal = await prisma.savingsGoal.findUnique({ where: { id: data.savingsGoalId } });
    if (!goal) throw new NotFoundError('Savings Goal', data.savingsGoalId);

    // Authorization check
    if (actingUserId !== goal.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this savings goal');
      }
    }

    const account = await prisma.account.findUnique({ where: { id: data.accountId } });
    if (!account) throw new NotFoundError('Account', data.accountId);

    // Check account ownership
    if (account.userId !== goal.userId) {
      throw new ForbiddenError('Account does not belong to goal owner');
    }

    // Check for idempotency
    if (data.idempotencyKey) {
      const existingWithdrawal = await prisma.savingsWithdrawal.findFirst({
        where: { idempotencyKey: data.idempotencyKey },
      });

      if (existingWithdrawal) {
        throw new ConflictError('Duplicate withdrawal (idempotency key already used)');
      }
    }

    // Validate amount using Decimal
    const amount = toDecimal(data.amount);
    if (amount.lessThan(SAVINGS_CONFIG.MIN_WITHDRAWAL_AMOUNT)) {
      throw new ValidationError(
        `Withdrawal amount must be at least ${SAVINGS_CONFIG.MIN_WITHDRAWAL_AMOUNT.toString()}`
      );
    }

    // Check sufficient savings balance using Decimal comparison
    const currentAmount = toDecimal(goal.currentAmount);
    if (currentAmount.lessThan(amount)) {
      throw new InsufficientBalanceError(
        `Savings Goal ${goal.id}`,
        amount.toNumber(),
        currentAmount.toNumber()
      );
    }

    // Create withdrawal
    const withdrawal = await prisma.savingsWithdrawal.create({
      data: {
        savingsGoalId: data.savingsGoalId,
        accountId: data.accountId,
        amount: amount,
        description: data.description || null,
        withdrawnAt: new Date(),
        status: 'COMPLETED' as WithdrawalStatus,
        idempotencyKey: data.idempotencyKey || generateIdempotencyKey(),
        metadata: data.metadata || null,
      },
      include: {
        savingsGoal: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        account: {
          select: {
            id: true,
            accountNumber: true,
            userId: true,
          },
        },
        journal: true,
        transaction: true,
      },
    });

    // Update savings goal current amount using Decimal arithmetic
    await prisma.savingsGoal.update({
      where: { id: data.savingsGoalId },
      data: {
        currentAmount: {
          decrement: amount,
        },
      },
    });

    // Create ledger entries
    await LedgerService.createJournal({
      reference: generateReference('SAV-WTH'),
      description: `Savings withdrawal: ${amount.toString()} from ${goal.name}`,
      entries: [
        {
          accountId: data.accountId,
          entryType: 'CREDIT',
          amount: amount,
          description: `Withdrawal from savings goal: ${goal.name}`,
          transactionId: withdrawal.id,
        },
      ],
      savingsWithdrawalId: withdrawal.id,
      metadata: {
        withdrawalId: withdrawal.id,
        savingsGoalId: data.savingsGoalId,
        amount: amount.toString(),
      },
    }, actingUserId);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'CREATE',
        resourceType: 'SAVINGS_WITHDRAWAL',
        resourceId: withdrawal.id,
        newValues: {
          savingsGoalId: data.savingsGoalId,
          accountId: data.accountId,
          amount: amount.toString(),
        },
        metadata: data.metadata,
        status: 'SUCCESS',
      },
    });

    return this.formatWithdrawal(withdrawal);
  }

  /**
   * Get a withdrawal by ID
   */
  static async getWithdrawalById(
    id: string,
    actingUserId: string
  ): Promise<WithdrawalResult> {
    const withdrawal = await prisma.savingsWithdrawal.findUnique({
      where: { id },
      include: {
        savingsGoal: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        account: {
          select: {
            id: true,
            accountNumber: true,
            userId: true,
          },
        },
        journal: true,
        transaction: true,
      },
    });

    if (!withdrawal) throw new NotFoundError('Savings Withdrawal', id);

    // Authorization check
    if (actingUserId !== withdrawal.savingsGoal.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this withdrawal');
      }
    }

    return this.formatWithdrawal(withdrawal);
  }

  /**
   * List withdrawals for a savings goal
   */
  static async listWithdrawals(
    savingsGoalId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: WithdrawalStatus,
    startDate?: Date,
    endDate?: Date
  ): Promise<WithdrawalListResult> {
    const goal = await prisma.savingsGoal.findUnique({ where: { id: savingsGoalId } });
    if (!goal) throw new NotFoundError('Savings Goal', savingsGoalId);

    // Authorization check
    if (actingUserId !== goal.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this savings goal');
      }
    }

    const where: Record<string, unknown> = { savingsGoalId };
    if (status) where.status = status;
    if (startDate || endDate) {
      where.withdrawnAt = {};
      if (startDate) where.withdrawnAt.gte = startDate;
      if (endDate) where.withdrawnAt.lte = endDate;
    }

    const withdrawals = await prisma.savingsWithdrawal.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { withdrawnAt: 'desc' },
      include: {
        savingsGoal: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        account: {
          select: {
            id: true,
            accountNumber: true,
            userId: true,
          },
        },
        journal: true,
        transaction: true,
      },
    });

    const total = await prisma.savingsWithdrawal.count({ where });

    return {
      withdrawals: withdrawals.map(w => this.formatWithdrawal(w)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================
  // STATISTICS & ANALYTICS
  // ============================================

  /**
   * Get savings statistics
   */
  static async getStats(actingUserId: string): Promise<SavingsStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view savings statistics');
    }

    const totalGoals = await prisma.savingsGoal.count();
    const totalContributions = await prisma.savingsContribution.count();
    const totalWithdrawals = await prisma.savingsWithdrawal.count();

    // Calculate total saved using Decimal arithmetic
    const contributions = await prisma.savingsContribution.findMany({
      select: { amount: true },
    });

    const totalSaved = contributions.reduce((sum, c) => sum.plus(toDecimal(c.amount)), new Decimal(0)).toNumber();

    // Calculate total target using Decimal arithmetic
    const goals = await prisma.savingsGoal.findMany({
      select: { targetAmount: true },
    });

    const totalTarget = goals.reduce((sum, g) => sum.plus(toDecimal(g.targetAmount)), new Decimal(0)).toNumber();

    // Calculate average progress using Decimal arithmetic
    const goalsWithProgress = await prisma.savingsGoal.findMany({
      select: { currentAmount: true, targetAmount: true },
    });

    const progressPercentages = goalsWithProgress
      .filter(g => toDecimal(g.targetAmount).greaterThan(0))
      .map(g => toDecimal(g.currentAmount).div(toDecimal(g.targetAmount)).times(100).toNumber());

    const averageProgress = progressPercentages.length > 0
      ? progressPercentages.reduce((a, b) => a + b, 0) / progressPercentages.length
      : 0;

    // Group by status
    const byStatus: Record<SavingsGoalStatus, number> = {
      ACTIVE: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      PAUSED: 0,
    };

    const allGoals = await prisma.savingsGoal.findMany({
      select: { status: true },
    });

    for (const goal of allGoals) {
      byStatus[goal.status]++;
    }

    // Get top goals using Decimal arithmetic for sorting
    const sortedGoals = await prisma.savingsGoal.findMany({
      orderBy: { currentAmount: 'desc' },
      take: 10,
      select: {
        id: true,
        name: true,
        currentAmount: true,
        targetAmount: true,
      },
    });

    const topGoals = sortedGoals.map(g => {
      const current = toDecimal(g.currentAmount);
      const target = toDecimal(g.targetAmount);
      const progressPercent = target.greaterThan(0) ? current.div(target).times(100).toNumber() : 0;
      return {
        goalId: g.id,
        name: g.name,
        currentAmount: current.toNumber(),
        targetAmount: target.toNumber(),
        progressPercent,
      };
    });

    return {
      totalGoals,
      totalContributions,
      totalWithdrawals,
      totalSaved,
      totalTarget,
      averageProgress,
      byStatus,
      topGoals,
    };
  }

  // ============================================
  // FORMATTERS
  // ============================================

  /**
   * Format savings goal with calculated values
   */
  private static async formatGoal(
    goal: SavingsGoal & {
      user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
      contributions: SavingsContribution[];
      withdrawals: SavingsWithdrawal[];
    }
  ): Promise<SavingsGoalResult> {
    const currentAmount = toDecimal(goal.currentAmount);
    const targetAmount = toDecimal(goal.targetAmount);
    const progressPercent = targetAmount.greaterThan(0) 
      ? currentAmount.div(targetAmount).times(100).toNumber()
      : 0;
    const remainingAmount = targetAmount.minus(currentAmount).toNumber();

    // Calculate days remaining
    let daysRemaining: number | null = null;
    if (goal.targetDate) {
      const now = new Date();
      const targetDate = new Date(goal.targetDate);
      daysRemaining = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      daysRemaining = daysRemaining > 0 ? daysRemaining : null;
    }

    return {
      goal: {
        ...goal,
        progressPercent,
        currentAmount: currentAmount.toNumber(),
        remainingAmount,
        daysRemaining,
      },
    };
  }

  /**
   * Format contribution for output
   */
  private static formatContribution(
    contribution: SavingsContribution & {
      savingsGoal: Pick<SavingsGoal, 'id' | 'name' | 'userId'>;
      account: Pick<Account, 'id' | 'accountNumber' | 'userId'>;
      journal?: Journal | null;
      transaction?: Transaction | null;
    }
  ): ContributionResult {
    return { contribution };
  }

  /**
   * Format withdrawal for output
   */
  private static formatWithdrawal(
    withdrawal: SavingsWithdrawal & {
      savingsGoal: Pick<SavingsGoal, 'id' | 'name' | 'userId'>;
      account: Pick<Account, 'id' | 'accountNumber' | 'userId'>;
      journal?: Journal | null;
      transaction?: Transaction | null;
    }
  ): WithdrawalResult {
    return { withdrawal };
  }
}
