import { prisma } from '../prisma';
import { generateReference } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ComplianceError,
} from '../utils/errors';
import { Decimal } from '@prisma/client/runtime/library';
import type {
  User,
  Account,
  Transaction,
  AMLCheck,
  AMLStatus,
  RiskLevel,
  Role,
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

const AML_CONFIG = {
  HIGH_RISK_THRESHOLD: new Decimal(10000),
  MEDIUM_RISK_THRESHOLD: new Decimal(5000),
  DAILY_LIMIT: new Decimal(50000),
  MONTHLY_LIMIT: new Decimal(200000),
  MAX_DESCRIPTION_LENGTH: 1000,
  RISK_FREE_THRESHOLD: new Decimal(1000),
} as const;

export interface AMLCheckData {
  userId: string;
  accountId?: string;
  transactionId?: string;
  amount: number | string | Decimal;
  currency?: string;
  counterpartyId?: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface AMLCheckResult {
  check: AMLCheck & {
    user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
    account?: Pick<Account, 'id' | 'accountNumber'> | null;
    transaction?: Pick<Transaction, 'id' | 'reference'> | null;
  };
  riskLevel: RiskLevel;
  riskScore: number;
  requiresReview: boolean;
  requiresApproval: boolean;
}

export interface AMLStats {
  totalChecks: number;
  byRiskLevel: Record<RiskLevel, number>;
  byStatus: Record<AMLStatus, number>;
  highRiskCount: number;
  flaggedAmount: number;
  averageRiskScore: number;
}

export class AMLService {
  /**
   * Perform AML check on a transaction or amount
   */
  static async check(
    data: AMLCheckData,
    actingUserId?: string
  ): Promise<AMLCheckResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    // Validate amount using Decimal
    const amount = toDecimal(data.amount);
    if (amount.lessThanOrEqual(new Decimal(0))) {
      throw new ValidationError('Amount must be positive');
    }

    // Check account if provided
    let account: Account | null = null;
    if (data.accountId) {
      account = await prisma.account.findUnique({ where: { id: data.accountId } });
      if (!account) throw new NotFoundError('Account', data.accountId);
      if (account.userId !== data.userId) {
        throw new ForbiddenError('Account does not belong to user');
      }
    }

    // Check transaction if provided
    let transaction: Transaction | null = null;
    if (data.transactionId) {
      transaction = await prisma.transaction.findUnique({ where: { id: data.transactionId } });
      if (!transaction) throw new NotFoundError('Transaction', data.transactionId);
    }

    // Determine risk level using Decimal comparisons
    let riskLevel: RiskLevel = 'LOW';
    let riskScore = 0;
    let requiresReview = false;
    let requiresApproval = false;

    // Check amount thresholds
    if (amount.greaterThanOrEqual(AML_CONFIG.HIGH_RISK_THRESHOLD)) {
      riskLevel = 'HIGH';
      riskScore += 100;
      requiresReview = true;
      requiresApproval = true;
    } else if (amount.greaterThanOrEqual(AML_CONFIG.MEDIUM_RISK_THRESHOLD)) {
      riskLevel = 'MEDIUM';
      riskScore += 50;
      requiresReview = true;
    } else if (amount.greaterThanOrEqual(AML_CONFIG.RISK_FREE_THRESHOLD)) {
      riskLevel = 'LOW';
      riskScore += 10;
    }

    // Check for high-risk counterparties
    if (data.counterpartyId) {
      const counterpartyRisk = await this.getCounterpartyRisk(data.counterpartyId);
      if (counterpartyRisk > 0) {
        riskScore += counterpartyRisk * 20;
        if (riskScore >= 100) {
          riskLevel = 'HIGH';
          requiresApproval = true;
        } else if (riskScore >= 50) {
          riskLevel = 'MEDIUM';
        }
      }
    }

    // Check daily/monthly limits using Decimal arithmetic
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const dailyTotal = await prisma.amlCheck.aggregate({
      where: {
        userId: data.userId,
        createdAt: { gte: today },
        status: { in: ['PENDING', 'APPROVED', 'COMPLETED'] as AMLStatus[] },
      },
      _sum: { amount: true },
    });

    const monthlyTotal = await prisma.amlCheck.aggregate({
      where: {
        userId: data.userId,
        createdAt: { gte: thisMonth },
        status: { in: ['PENDING', 'APPROVED', 'COMPLETED'] as AMLStatus[] },
      },
      _sum: { amount: true },
    });

    const dailyAmount = toDecimal(dailyTotal._sum.amount || 0);
    const monthlyAmount = toDecimal(monthlyTotal._sum.amount || 0);

    // Check if adding this amount would exceed limits
    const newDailyTotal = dailyAmount.plus(amount);
    const newMonthlyTotal = monthlyAmount.plus(amount);

    if (newDailyTotal.greaterThan(AML_CONFIG.DAILY_LIMIT)) {
      riskScore += 30;
      requiresReview = true;
      requiresApproval = true;
    }

    if (newMonthlyTotal.greaterThan(AML_CONFIG.MONTHLY_LIMIT)) {
      riskScore += 50;
      requiresReview = true;
      requiresApproval = true;
    }

    // Cap risk score at 100
    riskScore = Math.min(riskScore, 100);

    // Determine final risk level
    if (riskScore >= 80) riskLevel = 'HIGH';
    else if (riskScore >= 40) riskLevel = 'MEDIUM';
    else riskLevel = 'LOW';

    // Create AML check record
    const check = await prisma.amlCheck.create({
      data: {
        userId: data.userId,
        accountId: data.accountId || null,
        transactionId: data.transactionId || null,
        amount: amount,
        currency: data.currency || 'USD',
        counterpartyId: data.counterpartyId || null,
        counterpartyName: data.counterpartyName || null,
        counterpartyAccount: data.counterpartyAccount || null,
        riskLevel,
        riskScore,
        status: requiresApproval ? 'PENDING' : 'COMPLETED' as AMLStatus,
        requiresReview,
        requiresApproval,
        notes: data.description || null,
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
          },
        },
        transaction: {
          select: {
            id: true,
            reference: true,
          },
        },
      },
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId || data.userId,
        action: 'CREATE',
        resourceType: 'AML_CHECK',
        resourceId: check.id,
        newValues: {
          amount: amount.toString(),
          riskLevel,
          riskScore,
          requiresReview,
          requiresApproval,
        },
        metadata: data.metadata,
        status: 'SUCCESS',
      },
    });

    // Send notification if approval is required
    if (requiresApproval) {
      const admins = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'] as Role[] } },
      });

      for (const admin of admins) {
        await prisma.notification.create({
          data: {
            userId: admin.id,
            title: 'AML Approval Required',
            message: 'AML check requires approval for user ' + user.email + ' - Amount: ' + amount.toString() + ' ' + (data.currency || 'USD'),
            type: 'WARNING',
            category: 'COMPLIANCE',
            isRead: false,
            metadata: {
              checkId: check.id,
              userId: data.userId,
              amount: amount.toString(),
              riskLevel,
            },
          },
        });
      }
    }

    return {
      check,
      riskLevel,
      riskScore,
      requiresReview,
      requiresApproval,
    };
  }

  /**
   * Approve an AML check
   */
  static async approve(checkId: string, actingUserId: string, notes?: string): Promise<AMLCheckResult> {
    const check = await prisma.amlCheck.findUnique({
      where: { id: checkId },
      include: {
        user: true,
        account: true,
        transaction: true,
      },
    });

    if (!check) throw new NotFoundError('AML Check', checkId);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can approve AML checks');
    }

    if (check.status !== 'PENDING') {
      throw new ValidationError('Only pending checks can be approved');
    }

    const updatedCheck = await prisma.amlCheck.update({
      where: { id: checkId },
      data: {
        status: 'APPROVED' as AMLStatus,
        approvedById: actingUserId,
        approvedAt: new Date(),
        approvalNotes: notes || null,
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
          },
        },
        transaction: {
          select: {
            id: true,
            reference: true,
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'APPROVE',
        resourceType: 'AML_CHECK',
        resourceId: check.id,
        oldValues: { status: check.status },
        newValues: { status: 'APPROVED', notes },
        status: 'SUCCESS',
      },
    });

    // Send notification to user
    await prisma.notification.create({
      data: {
        userId: check.userId,
        title: 'AML Check Approved',
        message: 'Your AML check has been approved. Reference: ' + check.id,
        type: 'SUCCESS',
        category: 'COMPLIANCE',
        isRead: false,
        metadata: { checkId: check.id },
      },
    });

    return {
      check: updatedCheck,
      riskLevel: updatedCheck.riskLevel as RiskLevel,
      riskScore: updatedCheck.riskScore,
      requiresReview: updatedCheck.requiresReview,
      requiresApproval: updatedCheck.requiresApproval,
    };
  }

  /**
   * Reject an AML check
   */
  static async reject(checkId: string, actingUserId: string, reason: string): Promise<AMLCheckResult> {
    const check = await prisma.amlCheck.findUnique({
      where: { id: checkId },
      include: {
        user: true,
        account: true,
        transaction: true,
      },
    });

    if (!check) throw new NotFoundError('AML Check', checkId);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can reject AML checks');
    }

    if (check.status !== 'PENDING') {
      throw new ValidationError('Only pending checks can be rejected');
    }

    const updatedCheck = await prisma.amlCheck.update({
      where: { id: checkId },
      data: {
        status: 'REJECTED' as AMLStatus,
        rejectedById: actingUserId,
        rejectedAt: new Date(),
        rejectionReason: reason,
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
          },
        },
        transaction: {
          select: {
            id: true,
            reference: true,
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'REJECT',
        resourceType: 'AML_CHECK',
        resourceId: check.id,
        oldValues: { status: check.status },
        newValues: { status: 'REJECTED', reason },
        status: 'SUCCESS',
      },
    });

    // Send notification to user
    await prisma.notification.create({
      data: {
        userId: check.userId,
        title: 'AML Check Rejected',
        message: 'Your AML check has been rejected. Reason: ' + reason,
        type: 'ERROR',
        category: 'COMPLIANCE',
        isRead: false,
        metadata: { checkId: check.id, reason },
      },
    });

    // Flag the user for review
    await prisma.user.update({
      where: { id: check.userId },
      data: {
        amlFlagged: true,
        amlFlaggedAt: new Date(),
        amlFlaggedReason: reason,
      },
    });

    return {
      check: updatedCheck,
      riskLevel: updatedCheck.riskLevel as RiskLevel,
      riskScore: updatedCheck.riskScore,
      requiresReview: updatedCheck.requiresReview,
      requiresApproval: updatedCheck.requiresApproval,
    };
  }

  /**
   * Get AML check by ID
   */
  static async getById(id: string, actingUserId: string): Promise<AMLCheckResult> {
    const check = await prisma.amlCheck.findUnique({
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
          },
        },
        transaction: {
          select: {
            id: true,
            reference: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        rejectedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!check) throw new NotFoundError('AML Check', id);

    // Authorization check
    if (actingUserId !== check.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this AML check');
      }
    }

    return {
      check,
      riskLevel: check.riskLevel as RiskLevel,
      riskScore: check.riskScore,
      requiresReview: check.requiresReview,
      requiresApproval: check.requiresApproval,
    };
  }

  /**
   * List AML checks for a user
   */
  static async listByUser(
    userId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: AMLStatus,
    riskLevel?: RiskLevel,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ checks: AMLCheck[]; total: number; page: number; limit: number; totalPages: number }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    // Authorization check
    if (actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these AML checks');
      }
    }

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    if (riskLevel) where.riskLevel = riskLevel;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const checks = await prisma.amlCheck.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        account: true,
        transaction: true,
      },
    });

    const total = await prisma.amlCheck.count({ where });

    return {
      checks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * List all AML checks (admin only)
   */
  static async listAll(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: AMLStatus,
    riskLevel?: RiskLevel,
    startDate?: Date,
    endDate?: Date,
    userId?: string
  ): Promise<{ checks: AMLCheck[]; total: number; page: number; limit: number; totalPages: number }> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view all AML checks');
    }

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (riskLevel) where.riskLevel = riskLevel;
    if (userId) where.userId = userId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const checks = await prisma.amlCheck.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        account: true,
        transaction: true,
      },
    });

    const total = await prisma.amlCheck.count({ where });

    return {
      checks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get AML statistics
   */
  static async getStats(actingUserId: string): Promise<AMLStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view AML statistics');
    }

    const totalChecks = await prisma.amlCheck.count();

    // Group by risk level using Decimal arithmetic for calculations
    const byRiskLevel: Record<RiskLevel, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
    };

    const riskLevelCounts = await prisma.amlCheck.groupBy({
      by: ['riskLevel'],
      _count: { _all: true },
    });

    for (const group of riskLevelCounts) {
      byRiskLevel[group.riskLevel as RiskLevel] = group._count._all;
    }

    // Group by status
    const byStatus: Record<AMLStatus, number> = {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      COMPLETED: 0,
    };

    const statusCounts = await prisma.amlCheck.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    for (const group of statusCounts) {
      byStatus[group.status as AMLStatus] = group._count._all;
    }

    // Calculate flagged amount using Decimal arithmetic
    const highRiskChecks = await prisma.amlCheck.findMany({
      where: { riskLevel: 'HIGH' },
      select: { amount: true },
    });

    const flaggedAmount = highRiskChecks
      .reduce((sum, c) => sum.plus(toDecimal(c.amount)), new Decimal(0))
      .toNumber();

    // Calculate average risk score using Decimal arithmetic
    const allChecks = await prisma.amlCheck.findMany({
      select: { riskScore: true },
    });

    const averageRiskScore = allChecks.length > 0
      ? allChecks.reduce((sum, c) => sum + c.riskScore, 0) / allChecks.length
      : 0;

    return {
      totalChecks,
      byRiskLevel,
      byStatus,
      highRiskCount: byRiskLevel.HIGH,
      flaggedAmount,
      averageRiskScore,
    };
  }

  /**
   * Get counterparty risk score
   */
  private static async getCounterpartyRisk(counterpartyId: string): Promise<number> {
    // In a real implementation, this would check against a risk database
    // For now, return a simple risk score based on known patterns
    const highRiskPatterns = ['offshore', 'anonymous', 'crypto', 'gambling'];
    
    const counterparty = await prisma.user.findUnique({
      where: { id: counterpartyId },
    });

    if (!counterparty) return 0;

    const email = counterparty.email.toLowerCase();
    const name = (counterparty.firstName + ' ' + counterparty.lastName).toLowerCase();

    for (const pattern of highRiskPatterns) {
      if (email.includes(pattern) || name.includes(pattern)) {
        return 5; // High risk
      }
    }

    return 0; // No additional risk
  }
}
