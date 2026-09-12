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
// INTERFACES & TYPES
// ============================================

export interface CreateSavingsGoalData {
  userId: string;
  name: string;
  description?: string;
  targetAmount: number | string;
  targetDate?: Date;
}

export interface UpdateSavingsGoalData {
  name?: string;
  description?: string;
  targetAmount?: number | string;
  targetDate?: Date;
  status?: SavingsGoalStatus;
}

export interface ContributeData {
  savingsGoalId: string;
  accountId: string;
  amount: number | string;
  description?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface WithdrawData {
  savingsGoalId: string;
  accountId: string;
  amount: number | string;
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
  dailyRate: number;
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
// CONSTANTS
// ============================================

const SAVINGS_CONFIG = {
  MIN_TARGET_AMOUNT: 1,
  MIN_CONTRIBUTION_AMOUNT: 1,
  MIN_WITHDRAWAL_AMOUNT: 1,
  MAX_DESCRIPTION_LENGTH: 500,
  DEFAULT_INTEREST_RATE: 0.05, // 5% annual
  COMPOUND_FREQUENCY: 'MONTHLY' as const,
  ALLOW_OVER_CONTRIBUTION: true,
  ALLOW_EARLY_WITHDRAWAL: true,
  IDEMPOTENCY_TTL: 24 * 60 * 60 * 1000, // 24 hours
} as const;

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

    // Validate inputs
    const targetAmount = this.toDecimalNumber(data.targetAmount);
    if (targetAmount < SAVINGS_CONFIG.MIN_TARGET_AMOUNT) {
      throw new ValidationError(`Target amount must be at least ${SAVINGS_CONFIG.MIN_TARGET_AMOUNT}`);
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
        currentAmount: 0,
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
        newValues: { userId: data.userId, name: data.name, targetAmount },
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
    const oldTargetAmount = goal.targetAmount;

    const updatedGoal = await prisma.savingsGoal.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        targetAmount: data.targetAmount ? this.toDecimal(data.targetAmount) : undefined,
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
        oldValues: { name: goal.name, targetAmount: oldTargetAmount, status: oldStatus },
        newValues: {
          name: data.name || goal.name,
          targetAmount: data.targetAmount || oldTargetAmount,
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

    if (goal.currentAmount < Number(goal.targetAmount)) {
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

    // Validate amount
    const amount = this.toDecimalNumber(data.amount);
    if (amount < SAVINGS_CONFIG.MIN_CONTRIBUTION_AMOUNT) {
      throw new ValidationError(
        `Contribution amount must be at least ${SAVINGS_CONFIG.MIN_CONTRIBUTION_AMOUNT}`
      );
    }

    // Check sufficient balance
    if (account.availableBalance < amount) {
      throw new InsufficientBalanceError(
        account.id,
        amount,
        Number(account.availableBalance)
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

    // Update savings goal current amount
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
      description: `Savings contribution: ${amount} to ${goal.name}`,
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
        amount,
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
          amount,
        },
        metadata: data.metadata,
        status: 'SUCCESS',
      },
    });

    // Check if goal is now completed
    const updatedGoal = await prisma.savingsGoal.findUnique({
      where: { id: data.savingsGoalId },
    });

    if (updatedGoal && Number(updatedGoal.currentAmount) >= Number(updatedGoal.targetAmount)) {
      await this.completeSavingsGoal(data.savingsGoalId, actingUserId);
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
      contributions: contributions.map(this.formatContribution),
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

    // Validate amount
    const amount = this.toDecimalNumber(data.amount);
    if (amount < SAVINGS_CONFIG.MIN_WITHDRAWAL_AMOUNT) {
      throw new ValidationError(
        `Withdrawal amount must be at least ${SAVINGS_CONFIG.MIN_WITHDRAWAL_AMOUNT}`
      );
    }

    // Check sufficient savings balance
    if (Number(goal.currentAmount) < amount) {
      throw new InsufficientBalanceError(
        `Savings Goal ${goal.id}`,
        amount,
        Number(goal.currentAmount)
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

    // Update savings goal current amount
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
      description: `Savings withdrawal: ${amount} from ${goal.name}`,
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
        amount,
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
          amount,
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
      withdrawals: withdrawals.map(this.formatWithdrawal),
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

    // Calculate total saved
    const contributions = await prisma.savingsContribution.findMany({
      select: { amount: true },
    });

    const totalSaved = contributions.reduce((sum, c) => sum + Number(c.amount), 0);

    // Calculate total target
    const goals = await prisma.savingsGoal.findMany({
      select: { targetAmount: true },
    });

    const totalTarget = goals.reduce((sum, g) => sum + Number(g.targetAmount), 0);

    // Calculate average progress
    const goalsWithProgress = await prisma.savingsGoal.findMany({
      select: { currentAmount: true, targetAmount: true },
    });

    const progressPercentages = goalsWithProgress
      .filter(g => Number(g.targetAmount) > 0)
      .map(g => (Number(g.currentAmount) / Number(g.targetAmount)) * 100);

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

    // Get top goals
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

    const topGoals = sortedGoals.map(g => ({
      goalId: g.id,
      name: g.name,
      currentAmount: Number(g.currentAmount),
      targetAmount: Number(g.targetAmount),
      progressPercent: g.targetAmount > 0 ? (Number(g.currentAmount) / Number(g.targetAmount)) * 100 : 0,
    }));

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
  // INTEREST CALCULATION
  // ============================================

  /**
   * Calculate interest for a savings goal (compound interest)
   */
  static async calculateInterest(
    data: InterestCalculation,
    actingUserId: string
  ): Promise<InterestResult> {
    const goal = await prisma.savingsGoal.findUnique({ where: { id: data.savingsGoalId } });
    if (!goal) throw new NotFoundError('Savings Goal', data.savingsGoalId);

    // Authorization check
    if (actingUserId !== goal.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this savings goal');
      }
    }

    const principal = Number(goal.currentAmount);
    const dailyRate = data.dailyRate;
    const startDate = data.startDate;
    const endDate = data.endDate;

    // Calculate number of days
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // Calculate compound interest
    let interestEarned = 0;
    let compoundFrequency = data.compoundFrequency;

    switch (compoundFrequency) {
      case 'DAILY':
        interestEarned = principal * Math.pow(1 + dailyRate, days) - principal;
        break;
      case 'MONTHLY':
        const months = days / 30;
        const monthlyRate = Math.pow(1 + dailyRate, 30) - 1;
        interestEarned = principal * Math.pow(1 + monthlyRate, months) - principal;
        break;
      case 'YEARLY':
        const years = days / 365;
        const yearlyRate = Math.pow(1 + dailyRate, 365) - 1;
        interestEarned = principal * Math.pow(1 + yearlyRate, years) - principal;
        break;
    }

    const totalAmount = principal + interestEarned;

    return {
      savingsGoalId: data.savingsGoalId,
      startDate,
      endDate,
      principal,
      interestEarned,
      totalAmount,
      compoundFrequency,
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Convert amount to Decimal (Prisma Decimal type)
   */
  private static toDecimal(amount: number | string): number {
    if (typeof amount === 'string') {
      return parseFloat(amount);
    }
    return amount;
  }

  /**
   * Convert amount to number for calculations
   */
  private static toDecimalNumber(amount: number | string): number {
    return typeof amount === 'string' ? parseFloat(amount) : amount;
  }

  /**
   * Format savings goal with calculated values
   */
  private static formatGoal(goal: SavingsGoal & {
    user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
    contributions: SavingsContribution[];
    withdrawals: SavingsWithdrawal[];
  }): SavingsGoalResult['goal'] {
    const targetAmount = Number(goal.targetAmount);
    const currentAmount = Number(goal.currentAmount);

    const progressPercent = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
    const remainingAmount = targetAmount - currentAmount;

    // Calculate days remaining
    let daysRemaining: number | null = null;
    if (goal.targetDate) {
      const now = new Date();
      const diff = goal.targetDate.getTime() - now.getTime();
      daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
      if (daysRemaining < 0) daysRemaining = 0;
    }

    return {
      ...goal,
      user: goal.user,
      contributions: goal.contributions,
      withdrawals: goal.withdrawals,
      progressPercent,
      currentAmount,
      remainingAmount,
      daysRemaining,
    };
  }

  /**
   * Format contribution with related data
   */
  private static formatContribution(contribution: SavingsContribution & {
    savingsGoal: Pick<SavingsGoal, 'id' | 'name' | 'userId'>;
    account: Pick<Account, 'id' | 'accountNumber' | 'userId'>;
    journal?: Journal | null;
    transaction?: Transaction | null;
  }): ContributionResult['contribution'] {
    return {
      ...contribution,
      savingsGoal: contribution.savingsGoal,
      account: contribution.account,
      journal: contribution.journal || null,
      transaction: contribution.transaction || null,
    };
  }

  /**
   * Format withdrawal with related data
   */
  private static formatWithdrawal(withdrawal: SavingsWithdrawal & {
    savingsGoal: Pick<SavingsGoal, 'id' | 'name' | 'userId'>;
    account: Pick<Account, 'id' | 'accountNumber' | 'userId'>;
    journal?: Journal | null;
    transaction?: Transaction | null;
  }): WithdrawalResult['withdrawal'] {
    return {
      ...withdrawal,
      savingsGoal: withdrawal.savingsGoal,
      account: withdrawal.account,
      journal: withdrawal.journal || null,
      transaction: withdrawal.transaction || null,
    };
  }
}
