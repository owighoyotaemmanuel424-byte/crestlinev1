import { prisma } from '../prisma';
import { generateReference } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { Decimal } from '@prisma/client/runtime/library';
import {
  type User,
  type Account,
  type Transaction,
  type FraudAlert,
  FraudAlertStatus,
  type FraudAlertType,
  type RiskLevel,
  type Role,
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
  return new Decimal(amount.toString());
}

// ============================================
// CONSTANTS
// ============================================

const FRAUD_CONFIG = {
  SUSPICIOUS_THRESHOLD: new Decimal(1000),
  HIGH_RISK_THRESHOLD: new Decimal(5000),
  RAPID_TRANSACTION_THRESHOLD: 5,
  VELOCITY_THRESHOLD: new Decimal(10000),
} as const;

const RISK_SCORE_BY_SEVERITY: Record<RiskLevel, number> = {
  LOW: 25,
  MEDIUM: 50,
  HIGH: 80,
  CRITICAL: 95,
};

/**
 * Map legacy alert-type names (used by the admin API validation schema)
 * onto the FraudAlertType enum values that exist in the schema.
 */
function mapAlertType(alertType: string): FraudAlertType {
  switch (alertType) {
    case 'VELOCITY':
      return 'VELOCITY_VIOLATION';
    case 'HIGH_VALUE':
      return 'HIGH_RISK_TRANSACTION';
    case 'NEW_DEVICE':
      return 'DEVICE_MISMATCH';
    case 'NEW_LOCATION':
    case 'SUSPICIOUS_IP':
      return 'LOCATION_MISMATCH';
    case 'FAILED_LOGIN':
    case 'CARD_NOT_PRESENT':
      return 'BEHAVIORAL_ANOMALY';
    case 'MANUAL_REVIEW':
      return 'OTHER';
    default:
      return alertType as FraudAlertType;
  }
}

// ============================================
// INTERFACES & TYPES
// ============================================

export interface FraudCheckData {
  userId: string;
  accountId?: string;
  transactionId?: string;
  amount: number | string | Decimal;
  currency?: string;
  description?: string;
  ipAddress?: string;
  deviceId?: string;
  location?: string;
  metadata?: Record<string, unknown>;
}

const ALERT_INCLUDE = {
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
  account: { select: { id: true, accountNumber: true } },
  transaction: { select: { id: true, reference: true } },
} as const;

type AlertWithRelations = FraudAlert & {
  user?: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'> | null;
  account?: Pick<Account, 'id' | 'accountNumber'> | null;
  transaction?: Pick<Transaction, 'id' | 'reference'> | null;
};

export interface FraudCheckResult {
  alert: AlertWithRelations;
  riskLevel: RiskLevel;
  riskScore: number;
  isSuspicious: boolean;
  isBlocked: boolean;
  recommendations: string[];
}

export interface FraudStats {
  totalAlerts: number;
  byRiskLevel: Record<RiskLevel, number>;
  byStatus: Record<FraudAlertStatus, number>;
  byType: Record<string, number>;
  totalFlaggedAmount: number;
  totalBlockedAmount: number;
  averageResponseTime: number;
}

function isSuspiciousStatus(status: FraudAlertStatus): boolean {
  return status === 'OPEN' || status === 'UNDER_REVIEW' || status === 'ESCALATED';
}

function recommendationsOf(alert: FraudAlert): string[] {
  const meta = alert.metadata as Record<string, unknown> | null;
  const recs = meta && Array.isArray(meta.recommendations) ? meta.recommendations : [];
  return recs.filter((r): r is string => typeof r === 'string');
}

// ============================================
// SERVICE
// ============================================

export class FraudService {
  /**
   * Run fraud heuristics against a transaction attempt and persist an alert
   * when the activity looks suspicious or should be blocked.
   */
  static async check(data: FraudCheckData, actingUserId?: string): Promise<FraudCheckResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    const amount = toDecimal(data.amount);
    if (amount.lessThanOrEqualTo(new Decimal(0))) {
      throw new ValidationError('Amount must be positive');
    }

    let account: Account | null = null;
    if (data.accountId) {
      account = await prisma.account.findUnique({ where: { id: data.accountId } });
      if (!account) throw new NotFoundError('Account', data.accountId);
      if (account.userId !== data.userId) throw new ForbiddenError('Account does not belong to user');
    }

    let transaction: Transaction | null = null;
    if (data.transactionId) {
      transaction = await prisma.transaction.findUnique({ where: { id: data.transactionId } });
      if (!transaction) throw new NotFoundError('Transaction', data.transactionId);
    }

    let riskLevel: RiskLevel = 'LOW';
    let riskScore = 0;
    const recommendations: string[] = [];

    if (amount.greaterThanOrEqualTo(FRAUD_CONFIG.HIGH_RISK_THRESHOLD)) {
      riskScore += 40;
      recommendations.push('High amount - manual review recommended');
    } else if (amount.greaterThanOrEqualTo(FRAUD_CONFIG.SUSPICIOUS_THRESHOLD)) {
      riskScore += 20;
    }

    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    const recentTransactions = await prisma.transaction.count({
      where: { userId: data.userId, createdAt: { gte: oneHourAgo } },
    });
    if (recentTransactions >= FRAUD_CONFIG.RAPID_TRANSACTION_THRESHOLD) {
      riskScore += 30;
      recommendations.push('Rapid transaction pattern detected');
    }

    if (data.location && user.lastLoginLocation) {
      const distance = this.calculateDistance(user.lastLoginLocation, data.location);
      if (distance > 500) {
        riskScore += 25;
        recommendations.push('Unusual location - distance from last login');
      }
    }

    if (data.deviceId && user.lastDeviceId && data.deviceId !== user.lastDeviceId) {
      riskScore += 15;
      recommendations.push('New device detected');
    }

    if (data.ipAddress && user.lastIpAddress && data.ipAddress !== user.lastIpAddress) {
      riskScore += 10;
    }

    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    const velocityCheck = await prisma.transaction.aggregate({
      where: { userId: data.userId, createdAt: { gte: twentyFourHoursAgo } },
      _sum: { amount: true },
    });
    const total24h = toDecimal(velocityCheck._sum.amount || 0);
    if (total24h.plus(amount).greaterThan(FRAUD_CONFIG.VELOCITY_THRESHOLD)) {
      riskScore += 25;
      recommendations.push('High velocity - exceeds 24h threshold');
    }

    const avgTransactionAmount = await this.getAverageTransactionAmount(data.userId);
    if (avgTransactionAmount.greaterThan(0) && amount.greaterThan(avgTransactionAmount.times(3))) {
      riskScore += 20;
      recommendations.push('Amount significantly higher than average');
    }

    // Previous unresolved alerts raise the score (replaces legacy user.fraudFlagged flag)
    const openAlerts = await prisma.fraudAlert.count({
      where: { userId: data.userId, status: { in: ['OPEN', 'UNDER_REVIEW', 'ESCALATED'] as FraudAlertStatus[] } },
    });
    if (openAlerts > 0) {
      riskScore += 30;
      recommendations.push('User has previous unresolved fraud alerts');
    }

    if (riskScore >= 80) {
      riskLevel = 'HIGH';
    } else if (riskScore >= 50) {
      riskLevel = 'MEDIUM';
    } else if (riskScore >= 20) {
      riskLevel = 'LOW';
    } else {
      return {
        alert: null as unknown as AlertWithRelations,
        riskLevel,
        riskScore,
        isSuspicious: false,
        isBlocked: false,
        recommendations,
      };
    }
    riskScore = Math.min(riskScore, 100);
    const isSuspicious = true;
    const isBlocked = riskScore >= 80;

    const alert = await prisma.fraudAlert.create({
      data: {
        reference: generateReference('FRA'),
        userId: data.userId,
        accountId: data.accountId || null,
        transactionId: data.transactionId || null,
        alertType: 'UNUSUAL_ACTIVITY',
        riskLevel,
        riskScore,
        amount: amount,
        currency: data.currency || 'USD',
        description: data.description || `Automated fraud check flagged this activity (score ${riskScore})`,
        status: isBlocked ? 'ESCALATED' : 'OPEN',
        metadata: {
          ...(data.metadata || {}),
          recommendations,
          ipAddress: data.ipAddress || null,
          deviceId: data.deviceId || null,
          location: data.location || null,
        } as any,
      },
      include: ALERT_INCLUDE,
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId || data.userId,
        action: 'REPORT',
        resourceType: 'FRAUD_ALERT',
        resourceId: alert.id,
        newValues: { amount: amount.toString(), riskLevel, riskScore, isSuspicious, isBlocked },
        metadata: data.metadata as any,
        status: 'SUCCESS',
      },
    });

    if (isBlocked && account) {
      await prisma.account.update({ where: { id: account.id }, data: { status: 'FROZEN' as const } });
    }

    const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'] as Role[] } } });
    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          title: isBlocked ? 'FRAUD ALERT - Transaction Blocked' : 'Fraud Alert - Suspicious Activity',
          message: `Fraud risk detected for user ${user.email}. Amount: ${amount.toString()} ${data.currency || 'USD'} (score ${riskScore})`,
          type: isBlocked ? 'ERROR' : 'WARNING',
          category: 'FRAUD',
          isRead: false,
          metadata: { alertId: alert.id, userId: data.userId, amount: amount.toString(), riskLevel },
        },
      });
    }

    return { alert, riskLevel, riskScore, isSuspicious, isBlocked, recommendations };
  }

  /**
   * Create a fraud alert from the admin API.
   */
  static async createFraudAlert(
    data: {
      userId: string;
      alertType: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      description: string;
      relatedTransactionId?: string;
      relatedTransferId?: string;
      relatedWithdrawalId?: string;
      relatedCardId?: string;
      relatedAccountId?: string;
      amount?: number;
      currency?: string;
      metadata?: Record<string, unknown>;
    },
    actingUserId: string
  ): Promise<AlertWithRelations> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    const riskLevel = data.severity as RiskLevel;
    const riskScore = RISK_SCORE_BY_SEVERITY[riskLevel];

    const alert = await prisma.fraudAlert.create({
      data: {
        reference: generateReference('FRA'),
        userId: data.userId,
        accountId: data.relatedAccountId || null,
        transactionId: data.relatedTransactionId || null,
        transferId: data.relatedTransferId || null,
        withdrawalId: data.relatedWithdrawalId || null,
        cardId: data.relatedCardId || null,
        alertType: mapAlertType(data.alertType),
        riskLevel,
        riskScore,
        amount: data.amount != null ? toDecimal(data.amount) : null,
        currency: data.currency || 'USD',
        description: data.description,
        status: 'OPEN',
        metadata: {
          ...(data.metadata || {}),
          severity: data.severity,
          createdBy: actingUserId,
        } as any,
      },
      include: ALERT_INCLUDE,
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'REPORT',
        resourceType: 'FRAUD_ALERT',
        resourceId: alert.id,
        newValues: { alertType: alert.alertType, riskLevel, riskScore },
        metadata: data.metadata as any,
        status: 'SUCCESS',
      },
    });

    return alert;
  }

  /**
   * List fraud alerts for the admin API (supports status/severity/alertType/user filters).
   */
  static async listFraudAlerts(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: FraudAlertStatus,
    severity?: RiskLevel,
    alertType?: string,
    userId?: string
  ): Promise<{ alerts: AlertWithRelations[]; total: number; page: number; limit: number; totalPages: number }> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view fraud alerts');
    }

    const where: any = {};
    if (status) where.status = status;
    if (severity) where.riskLevel = severity;
    if (alertType) where.alertType = mapAlertType(alertType);
    if (userId) where.userId = userId;

    const [alerts, total] = await Promise.all([
      prisma.fraudAlert.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: ALERT_INCLUDE,
      }),
      prisma.fraudAlert.count({ where }),
    ]);

    return { alerts, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async getById(id: string, actingUserId: string): Promise<FraudCheckResult> {
    const alert = await prisma.fraudAlert.findUnique({ where: { id }, include: ALERT_INCLUDE });
    if (!alert) throw new NotFoundError('Fraud Alert', id);

    if (actingUserId !== alert.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this fraud alert');
      }
    }

    return this.toResult(alert);
  }

  static async listByUser(
    userId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: FraudAlertStatus,
    riskLevel?: RiskLevel,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ alerts: AlertWithRelations[]; total: number; page: number; limit: number; totalPages: number }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    if (actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these fraud alerts');
      }
    }

    const where: any = { userId };
    if (status) where.status = status;
    if (riskLevel) where.riskLevel = riskLevel;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [alerts, total] = await Promise.all([
      prisma.fraudAlert.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: ALERT_INCLUDE,
      }),
      prisma.fraudAlert.count({ where }),
    ]);

    return { alerts, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async listAll(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: FraudAlertStatus,
    riskLevel?: RiskLevel,
    startDate?: Date,
    endDate?: Date,
    userId?: string
  ): Promise<{ alerts: AlertWithRelations[]; total: number; page: number; limit: number; totalPages: number }> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view all fraud alerts');
    }

    const where: any = {};
    if (status) where.status = status;
    if (riskLevel) where.riskLevel = riskLevel;
    if (userId) where.userId = userId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [alerts, total] = await Promise.all([
      prisma.fraudAlert.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: ALERT_INCLUDE,
      }),
      prisma.fraudAlert.count({ where }),
    ]);

    return { alerts, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Resolve (or mark as false positive) a fraud alert.
   */
  static async resolve(id: string, actingUserId: string, resolution: string, isFalsePositive: boolean): Promise<FraudCheckResult> {
    const alert = await prisma.fraudAlert.findUnique({ where: { id }, include: ALERT_INCLUDE });
    if (!alert) throw new NotFoundError('Fraud Alert', id);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can resolve fraud alerts');
    }
    if (alert.status === 'RESOLVED' || alert.status === 'FALSE_POSITIVE') {
      throw new ValidationError('Alert is already resolved');
    }

    const updatedAlert = await prisma.fraudAlert.update({
      where: { id },
      data: {
        status: isFalsePositive ? 'FALSE_POSITIVE' : 'RESOLVED',
        resolvedById: actingUserId,
        resolvedAt: new Date(),
        notes: resolution,
        metadata: {
          ...((alert.metadata as Record<string, unknown>) || {}),
          isFalsePositive,
        } as any,
      },
      include: ALERT_INCLUDE,
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'RESOLVE',
        resourceType: 'FRAUD_ALERT',
        resourceId: alert.id,
        oldValues: { status: alert.status },
        newValues: { status: updatedAlert.status, resolution, isFalsePositive },
        status: 'SUCCESS',
      },
    });

    if (isFalsePositive && alert.accountId) {
      await prisma.account.update({ where: { id: alert.accountId }, data: { status: 'ACTIVE' as const } });
    }

    return this.toResult(updatedAlert);
  }

  /**
   * Update the status of a fraud alert (used by the admin workflow routes:
   * review, escalate, dismiss, reopen, resolve).
   */
  static async updateFraudAlertStatus(
    id: string,
    data: {
      status: string;
      reviewNotes?: string;
      reviewedById?: string;
      escalatedById?: string;
      escalateTo?: string;
    },
    actingRole?: string
  ): Promise<AlertWithRelations> {
    if (actingRole && !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'OPERATOR'].includes(actingRole)) {
      throw new ForbiddenError('Only authorized personnel can update fraud alerts');
    }

    const validStatuses: FraudAlertStatus[] = ['OPEN', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'DISMISSED', 'FALSE_POSITIVE'];
    if (!validStatuses.includes(data.status as FraudAlertStatus)) {
      throw new ValidationError(`Invalid fraud alert status: ${data.status}`);
    }

    const alert = await prisma.fraudAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundError('Fraud Alert', id);

    const reviewerId = data.reviewedById || data.escalatedById;
    const nextMetadata = {
      ...((alert.metadata as Record<string, unknown>) || {}),
      ...(data.reviewedById ? { reviewedById: data.reviewedById } : {}),
      ...(data.escalatedById ? { escalatedById: data.escalatedById } : {}),
      ...(data.escalateTo ? { escalateTo: data.escalateTo } : {}),
    };

    const updatedAlert = await prisma.fraudAlert.update({
      where: { id },
      data: {
        status: data.status as FraudAlertStatus,
        notes: data.reviewNotes,
        assignedToId: data.escalateTo || alert.assignedToId,
        resolvedById: data.status === 'RESOLVED' || data.status === 'FALSE_POSITIVE' ? reviewerId || null : alert.resolvedById,
        resolvedAt: data.status === 'RESOLVED' || data.status === 'FALSE_POSITIVE' ? new Date() : alert.resolvedAt,
        metadata: nextMetadata as any,
      },
      include: ALERT_INCLUDE,
    });

    const auditAction =
      data.status === 'ESCALATED' ? 'ESCALATE'
      : data.status === 'DISMISSED' ? 'DISMISS'
      : data.status === 'RESOLVED' || data.status === 'FALSE_POSITIVE' ? 'RESOLVE'
      : 'REVIEW';

    await prisma.auditLog.create({
      data: {
        actorId: reviewerId || alert.userId || alert.id,
        action: auditAction,
        resourceType: 'FRAUD_ALERT',
        resourceId: alert.id,
        oldValues: { status: alert.status },
        newValues: { status: updatedAlert.status, reviewNotes: data.reviewNotes },
        status: 'SUCCESS',
      },
    });

    return updatedAlert;
  }

  static async getStats(actingUserId: string): Promise<FraudStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view fraud statistics');
    }

    const totalAlerts = await prisma.fraudAlert.count();

    const byRiskLevel: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    const riskLevelCounts = await prisma.fraudAlert.groupBy({ by: ['riskLevel'], _count: { _all: true } });
    for (const group of riskLevelCounts) {
      if (group.riskLevel && group.riskLevel in byRiskLevel) {
        byRiskLevel[group.riskLevel as RiskLevel] = group._count._all;
      }
    }

    const byStatus: Record<FraudAlertStatus, number> = {
      OPEN: 0,
      UNDER_REVIEW: 0,
      ESCALATED: 0,
      RESOLVED: 0,
      DISMISSED: 0,
      FALSE_POSITIVE: 0,
    };
    const statusCounts = await prisma.fraudAlert.groupBy({ by: ['status'], _count: { _all: true } });
    for (const group of statusCounts) {
      if (group.status in byStatus) {
        byStatus[group.status] = group._count._all;
      }
    }

    const byType: Record<string, number> = {};
    const typeCounts = await prisma.fraudAlert.groupBy({ by: ['alertType'], _count: { _all: true } });
    for (const group of typeCounts) byType[group.alertType] = group._count._all;

    const flaggedAlerts = await prisma.fraudAlert.findMany({
      where: { status: { in: ['OPEN', 'UNDER_REVIEW', 'ESCALATED'] as FraudAlertStatus[] } },
      select: { amount: true },
    });
    const totalFlaggedAmount = flaggedAlerts.reduce((sum, a) => sum.plus(toDecimal(a.amount || 0)), new Decimal(0)).toNumber();

    const blockedAlerts = await prisma.fraudAlert.findMany({ where: { status: 'ESCALATED' }, select: { amount: true } });
    const totalBlockedAmount = blockedAlerts.reduce((sum, a) => sum.plus(toDecimal(a.amount || 0)), new Decimal(0)).toNumber();

    const resolvedAlerts = await prisma.fraudAlert.findMany({
      where: { status: { in: ['RESOLVED', 'FALSE_POSITIVE'] as FraudAlertStatus[] }, resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true },
    });
    const averageResponseTime = resolvedAlerts.length > 0
      ? resolvedAlerts.reduce((sum, a) => (a.resolvedAt ? sum + (a.resolvedAt.getTime() - a.createdAt.getTime()) / 1000 : sum), 0) / resolvedAlerts.length
      : 0;

    return { totalAlerts, byRiskLevel, byStatus, byType, totalFlaggedAmount, totalBlockedAmount, averageResponseTime };
  }

  private static toResult(alert: AlertWithRelations): FraudCheckResult {
    return {
      alert,
      riskLevel: (alert.riskLevel || 'LOW') as RiskLevel,
      riskScore: alert.riskScore,
      isSuspicious: isSuspiciousStatus(alert.status),
      isBlocked: alert.status === 'ESCALATED',
      recommendations: recommendationsOf(alert),
    };
  }

  private static async getAverageTransactionAmount(userId: string): Promise<Decimal> {
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      select: { amount: true },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
    if (transactions.length === 0) return new Decimal(0);
    const sum = transactions.reduce((s, t) => s.plus(toDecimal(t.amount)), new Decimal(0));
    return sum.div(transactions.length);
  }

  private static calculateDistance(loc1: string, loc2: string): number {
    if (loc1 === loc2) return 0;
    if (loc1.includes('Nigeria') && loc2.includes('Nigeria')) return 100;
    if (loc1.includes('US') && loc2.includes('US')) return 500;
    return 1000;
  }
}
