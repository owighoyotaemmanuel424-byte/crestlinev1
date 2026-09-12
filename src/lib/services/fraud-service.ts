import { prisma } from '../prisma';
import { generateReference, generateIdempotencyKey } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  AppError,
} from '../utils/errors';
import type {
  User,
  Transfer,
  Withdrawal,
  Card,
  Account,
  Transaction,
  Role,
  RiskStatus,
  TransferStatus,
  WithdrawalStatus,
} from '@prisma/client';

// ============================================
// INTERFACES & TYPES
// ============================================

export interface FraudAlertData {
  userId: string;
  alertType: FraudAlertType;
  severity: FraudAlertSeverity;
  description: string;
  relatedTransactionId?: string;
  relatedTransferId?: string;
  relatedWithdrawalId?: string;
  relatedCardId?: string;
  relatedAccountId?: string;
  amount?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateFraudAlertData {
  status?: FraudAlertStatus;
  assignedToId?: string;
  reviewNotes?: string;
  severity?: FraudAlertSeverity;
  resolution?: FraudAlertResolution;
  metadata?: Record<string, unknown>;
}

export interface FraudRiskAssessmentData {
  userId: string;
  transactionId?: string;
  transferId?: string;
  withdrawalId?: string;
  amount: number;
  currency?: string;
  destinationAccountId?: string;
  destinationUserId?: string;
  cardId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface FraudRiskAssessment {
  id: string;
  userId: string;
  transactionId: string | null;
  transferId: string | null;
  withdrawalId: string | null;
  amount: number;
  currency: string;
  riskScore: number;
  riskFactors: string[];
  recommendedAction: FraudRecommendedAction;
  status: FraudRiskStatus;
  createdAt: Date;
}

export interface VelocityCheckData {
  userId: string;
  actionType: 'TRANSFER' | 'WITHDRAWAL' | 'LOGIN' | 'DEPOSIT';
  timeWindow: '1H' | '24H' | '7D' | '30D';
}

export interface VelocityCheckResult {
  count: number;
  threshold: number;
  isExceeded: boolean;
  timeWindow: string;
  actionType: string;
}

export enum FraudAlertType {
  VELOCITY = 'VELOCITY',
  UNUSUAL_ACTIVITY = 'UNUSUAL_ACTIVITY',
  HIGH_VALUE = 'HIGH_VALUE',
  NEW_DEVICE = 'NEW_DEVICE',
  NEW_LOCATION = 'NEW_LOCATION',
  FAILED_LOGIN = 'FAILED_LOGIN',
  CARD_NOT_PRESENT = 'CARD_NOT_PRESENT',
  SUSPICIOUS_IP = 'SUSPICIOUS_IP',
  ACCOUNT_TAKEOVER = 'ACCOUNT_TAKEOVER',
  CHARGEBACK = 'CHARGEBACK',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
  OTHER = 'OTHER',
}

export enum FraudAlertSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum FraudAlertStatus {
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  ESCALATED = 'ESCALATED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FALSE_POSITIVE = 'FALSE_POSITIVE',
  CLOSED = 'CLOSED',
}

export enum FraudAlertResolution {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  BLOCKED = 'BLOCKED',
  FLAGGED = 'FLAGGED',
  MONITORED = 'MONITORED',
  FALSE_POSITIVE = 'FALSE_POSITIVE',
}

export enum FraudRecommendedAction {
  ALLOW = 'ALLOW',
  REVIEW = 'REVIEW',
  BLOCK = 'BLOCK',
  HOLD = 'HOLD',
  REQUIRE_2FA = 'REQUIRE_2FA',
  REQUIRE_MANUAL_APPROVAL = 'REQUIRE_MANUAL_APPROVAL',
}

export enum FraudRiskStatus {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface FraudAlert {
  id: string;
  reference: string;
  userId: string;
  alertType: FraudAlertType;
  severity: FraudAlertSeverity;
  status: FraudAlertStatus;
  description: string;
  amount: number | null;
  currency: string | null;
  relatedTransactionId: string | null;
  relatedTransferId: string | null;
  relatedWithdrawalId: string | null;
  relatedCardId: string | null;
  relatedAccountId: string | null;
  assignedToId: string | null;
  reviewNotes: string | null;
  resolution: FraudAlertResolution | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  resolvedById: string | null;
}

export interface FraudAlertResult {
  alert: FraudAlert;
}

export interface FraudAlertListResult {
  alerts: FraudAlert[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// FRAUD CONFIGURATION
// ============================================

const FRAUD_CONFIG = {
  // Velocity thresholds
  VELOCITY_THRESHOLDS: {
    LOGIN: { '1H': 5, '24H': 10, '7D': 30, '30D': 100 },
    TRANSFER: { '1H': 3, '24H': 10, '7D': 50, '30D': 200 },
    WITHDRAWAL: { '1H': 2, '24H': 5, '7D': 20, '30D': 50 },
    DEPOSIT: { '1H': 5, '24H': 20, '7D': 100, '30D': 500 },
  },
  
  // Amount thresholds (in USD)
  AMOUNT_THRESHOLDS: {
    LOW: 1000,
    MEDIUM: 10000,
    HIGH: 50000,
    CRITICAL: 100000,
  },
  
  // Risk score thresholds
  RISK_SCORE_THRESHOLDS: {
    LOW: 0,
    MEDIUM: 30,
    HIGH: 70,
    CRITICAL: 90,
  },
  
  // SUSPICIOUS IPs (in production, this would be a dynamic list)
  SUSPICIOUS_IPS: ['192.168.1.100', '10.0.0.50'],
  SUSPICIOUS_COUNTRIES: ['RU', 'CN', 'IR', 'KP', 'SY'],
  
  // High-risk time windows (hours in 24h format)
  HIGH_RISK_HOURS: [0, 1, 2, 3, 4, 5], // 12am - 6am
  
  // Maximum allowed risk score before auto-block
  AUTO_BLOCK_THRESHOLD: 95,
  
  // Idempotency key prefix
  IDEMPOTENCY_PREFIX: 'FRAUD',
} as const;

// ============================================
// FRAUD SERVICE
// ============================================

export class FraudService {
  // ============================================
  // FRAUD ALERT MANAGEMENT
  // ============================================

  /**
   * Create a fraud alert
   */
  static async createFraudAlert(
    data: FraudAlertData,
    actingUserId: string
  ): Promise<FraudAlertResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    
    // Check if user can create fraud alerts
    if (actingUserId !== 'SYSTEM' && (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'OPERATOR'].includes(actingUser.role))) {
      throw new ForbiddenError('Only authorized personnel can create fraud alerts');
    }

    // Check for duplicate alerts
    const existingAlert = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'FRAUD_ALERT',
        action: 'CREATE',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        OR: [
          { newValues: { path: ['relatedTransactionId'], equals: data.relatedTransactionId } },
          { newValues: { path: ['relatedTransferId'], equals: data.relatedTransferId } },
          { newValues: { path: ['relatedWithdrawalId'], equals: data.relatedWithdrawalId } },
        ],
      },
    });

    if (existingAlert) {
      throw new ConflictError('A fraud alert for this transaction already exists within the last 24 hours');
    }

    const reference = generateReference('FRA');

    const alertData = {
      id: reference,
      reference,
      userId: data.userId,
      alertType: data.alertType,
      severity: data.severity,
      status: FraudAlertStatus.OPEN,
      description: data.description,
      amount: data.amount || null,
      currency: data.currency || null,
      relatedTransactionId: data.relatedTransactionId || null,
      relatedTransferId: data.relatedTransferId || null,
      relatedWithdrawalId: data.relatedWithdrawalId || null,
      relatedCardId: data.relatedCardId || null,
      relatedAccountId: data.relatedAccountId || null,
      assignedToId: null,
      reviewNotes: null,
      resolution: null,
      metadata: data.metadata || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      resolvedAt: null,
      resolvedById: null,
    };

    // Create fraud alert (using AuditLog as backing store)
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId === 'SYSTEM' ? null : actingUserId,
        action: 'CREATE',
        resourceType: 'FRAUD_ALERT',
        resourceId: reference,
        newValues: alertData,
        metadata: {
          alertType: data.alertType,
          severity: data.severity,
          description: data.description,
        },
        status: 'SUCCESS',
      },
    });

    // Send notification to fraud team
    const fraudTeamUsers = await prisma.user.findMany({
      where: { role: { in: ['COMPLIANCE', 'ADMIN', 'SUPER_ADMIN', 'OPERATOR'] } },
    });

    for (const teamUser of fraudTeamUsers) {
      await prisma.notification.create({
        data: {
          userId: teamUser.id,
          title: `New Fraud Alert: ${data.alertType}`,
          message: `A new fraud alert has been created for user ${data.userId}. Severity: ${data.severity}`,
          type: 'WARNING',
          category: 'SECURITY',
          isRead: false,
          metadata: { alertId: reference, alertType: data.alertType, severity: data.severity },
        },
      });
    }

    // If this is a critical alert, also freeze related accounts/cards
    if (data.severity === FraudAlertSeverity.CRITICAL) {
      if (data.relatedCardId) {
        await prisma.card.updateMany({
          where: { id: data.relatedCardId, userId: data.userId },
          data: { status: 'FROZEN' as const },
        });
      }
      if (data.relatedAccountId) {
        await prisma.account.updateMany({
          where: { id: data.relatedAccountId, userId: data.userId },
          data: { status: 'FROZEN' as const },
        });
      }
    }

    return { alert: alertData };
  }

  /**
   * Get a fraud alert by ID
   */
  static async getFraudAlert(alertId: string, actingUserId: string): Promise<FraudAlertResult> {
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'FRAUD_ALERT',
        resourceId: alertId,
        action: 'CREATE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!auditLog) throw new NotFoundError('Fraud Alert', alertId);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view fraud alerts');
    }

    const newValues = auditLog.newValues as unknown as Partial<FraudAlert>;
    const alert: FraudAlert = {
      id: auditLog.resourceId,
      reference: newValues.reference || alertId,
      userId: newValues.userId || '',
      alertType: newValues.alertType || FraudAlertType.OTHER,
      severity: newValues.severity || FraudAlertSeverity.LOW,
      status: newValues.status || FraudAlertStatus.OPEN,
      description: newValues.description || '',
      amount: newValues.amount || null,
      currency: newValues.currency || null,
      relatedTransactionId: newValues.relatedTransactionId || null,
      relatedTransferId: newValues.relatedTransferId || null,
      relatedWithdrawalId: newValues.relatedWithdrawalId || null,
      relatedCardId: newValues.relatedCardId || null,
      relatedAccountId: newValues.relatedAccountId || null,
      assignedToId: newValues.assignedToId || null,
      reviewNotes: newValues.reviewNotes || null,
      resolution: newValues.resolution || null,
      metadata: newValues.metadata as Record<string, unknown> || null,
      createdAt: auditLog.createdAt,
      updatedAt: auditLog.createdAt,
      resolvedAt: newValues.resolvedAt || null,
      resolvedById: newValues.resolvedById || null,
    };

    return { alert };
  }

  /**
   * Update a fraud alert
   */
  static async updateFraudAlert(
    alertId: string,
    data: UpdateFraudAlertData,
    actingUserId: string
  ): Promise<FraudAlertResult> {
    const existingAlert = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'FRAUD_ALERT',
        resourceId: alertId,
        action: 'CREATE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!existingAlert) throw new NotFoundError('Fraud Alert', alertId);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can update fraud alerts');
    }

    const newValues = existingAlert.newValues as unknown as Partial<FraudAlert>;
    const oldAlert: FraudAlert = {
      id: existingAlert.resourceId,
      reference: newValues.reference || alertId,
      userId: newValues.userId || '',
      alertType: newValues.alertType || FraudAlertType.OTHER,
      severity: newValues.severity || FraudAlertSeverity.LOW,
      status: newValues.status || FraudAlertStatus.OPEN,
      description: newValues.description || '',
      amount: newValues.amount || null,
      currency: newValues.currency || null,
      relatedTransactionId: newValues.relatedTransactionId || null,
      relatedTransferId: newValues.relatedTransferId || null,
      relatedWithdrawalId: newValues.relatedWithdrawalId || null,
      relatedCardId: newValues.relatedCardId || null,
      relatedAccountId: newValues.relatedAccountId || null,
      assignedToId: newValues.assignedToId || null,
      reviewNotes: newValues.reviewNotes || null,
      resolution: newValues.resolution || null,
      metadata: newValues.metadata as Record<string, unknown> || null,
      createdAt: existingAlert.createdAt,
      updatedAt: existingAlert.createdAt,
      resolvedAt: newValues.resolvedAt || null,
      resolvedById: newValues.resolvedById || null,
    };

    const updatedAlert: FraudAlert = {
      ...oldAlert,
      status: data.status || oldAlert.status,
      assignedToId: data.assignedToId || oldAlert.assignedToId,
      reviewNotes: data.reviewNotes || oldAlert.reviewNotes,
      severity: data.severity || oldAlert.severity,
      resolution: data.resolution || oldAlert.resolution,
      metadata: data.metadata ? { ...(oldAlert.metadata || {}), ...data.metadata } : oldAlert.metadata,
      updatedAt: new Date(),
      resolvedAt: (data.status === 'CLOSED' || data.resolution) ? new Date() : oldAlert.resolvedAt,
      resolvedById: (data.status === 'CLOSED' || data.resolution) ? actingUserId : oldAlert.resolvedById,
    };

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'UPDATE',
        resourceType: 'FRAUD_ALERT',
        resourceId: alertId,
        oldValues: oldAlert,
        newValues: updatedAlert,
        status: 'SUCCESS',
      },
    });

    // If alert is approved, update related transaction/transfer/withdrawal
    if (data.resolution === FraudAlertResolution.APPROVED) {
      if (oldAlert.relatedTransferId) {
        await prisma.transfer.update({
          where: { id: oldAlert.relatedTransferId },
          data: { riskStatus: 'LOW' as RiskStatus },
        });
      }
      if (oldAlert.relatedWithdrawalId) {
        await prisma.withdrawal.update({
          where: { id: oldAlert.relatedWithdrawalId },
          data: { riskStatus: 'LOW' as RiskStatus },
        });
      }
    } else if (data.resolution === FraudAlertResolution.REJECTED || data.resolution === FraudAlertResolution.BLOCKED) {
      if (oldAlert.relatedTransferId) {
        await prisma.transfer.update({
          where: { id: oldAlert.relatedTransferId },
          data: { 
            riskStatus: 'CRITICAL' as RiskStatus,
            status: 'REJECTED' as TransferStatus
          },
        });
      }
      if (oldAlert.relatedWithdrawalId) {
        await prisma.withdrawal.update({
          where: { id: oldAlert.relatedWithdrawalId },
          data: { 
            riskStatus: 'CRITICAL' as RiskStatus,
            status: 'REJECTED' as WithdrawalStatus
          },
        });
      }
    }

    return { alert: updatedAlert };
  }

  /**
   * List fraud alerts with filtering
   */
  static async listFraudAlerts(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: FraudAlertStatus,
    severity?: FraudAlertSeverity,
    alertType?: FraudAlertType,
    userId?: string,
    assignedToId?: string,
    search?: string
  ): Promise<FraudAlertListResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view fraud alerts');
    }

    const where: Record<string, unknown> = {
      resourceType: 'FRAUD_ALERT',
      action: 'CREATE',
    };

    if (status) {
      where.newValues = {
        path: ['status'],
        string_contains: status,
      };
    }

    if (severity) {
      where.newValues = {
        ...where.newValues as object,
        path: ['severity'],
        string_contains: severity,
      };
    }

    if (alertType) {
      where.newValues = {
        ...where.newValues as object,
        path: ['alertType'],
        string_contains: alertType,
      };
    }

    // Note: The above filtering is simplified. In production, you'd need to properly
    // filter the JSON newValues field using raw SQL or a more sophisticated approach.

    const auditLogs = await prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const alerts: FraudAlert[] = auditLogs.map(log => {
      const newValues = log.newValues as unknown as Partial<FraudAlert>;
      return {
        id: log.resourceId,
        reference: newValues.reference || log.resourceId,
        userId: newValues.userId || '',
        alertType: newValues.alertType || FraudAlertType.OTHER,
        severity: newValues.severity || FraudAlertSeverity.LOW,
        status: newValues.status || FraudAlertStatus.OPEN,
        description: newValues.description || '',
        amount: newValues.amount || null,
        currency: newValues.currency || null,
        relatedTransactionId: newValues.relatedTransactionId || null,
        relatedTransferId: newValues.relatedTransferId || null,
        relatedWithdrawalId: newValues.relatedWithdrawalId || null,
        relatedCardId: newValues.relatedCardId || null,
        relatedAccountId: newValues.relatedAccountId || null,
        assignedToId: newValues.assignedToId || null,
        reviewNotes: newValues.reviewNotes || null,
        resolution: newValues.resolution || null,
        metadata: newValues.metadata as Record<string, unknown> || null,
        createdAt: log.createdAt,
        updatedAt: log.createdAt,
        resolvedAt: newValues.resolvedAt || null,
        resolvedById: newValues.resolvedById || null,
      };
    });

    const total = await prisma.auditLog.count({ where });

    return {
      alerts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================
  // RISK ASSESSMENT
  // ============================================

  /**
   * Assess fraud risk for a transaction, transfer, or withdrawal
   */
  static async assessFraudRisk(
    data: FraudRiskAssessmentData
  ): Promise<FraudRiskAssessment> {
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      include: {
        accounts: true,
        cards: true,
        transactions: {
          where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          orderBy: { createdAt: 'desc' },
        },
        transfers: {
          where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          orderBy: { createdAt: 'desc' },
        },
        withdrawals: {
          where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          orderBy: { createdAt: 'desc' },
        },
        sessions: {
          where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) throw new NotFoundError('User', data.userId);

    const riskFactors: string[] = [];
    let riskScore = 0;

    // 1. Amount-based risk
    if (data.amount >= FRAUD_CONFIG.AMOUNT_THRESHOLDS.CRITICAL) {
      riskScore += 40;
      riskFactors.push(`Very high amount: ${data.currency || 'USD'} ${data.amount}`);
    } else if (data.amount >= FRAUD_CONFIG.AMOUNT_THRESHOLDS.HIGH) {
      riskScore += 30;
      riskFactors.push(`High amount: ${data.currency || 'USD'} ${data.amount}`);
    } else if (data.amount >= FRAUD_CONFIG.AMOUNT_THRESHOLDS.MEDIUM) {
      riskScore += 20;
      riskFactors.push(`Medium amount: ${data.currency || 'USD'} ${data.amount}`);
    }

    // 2. Velocity checks
    const velocityResults = await Promise.all([
      this.checkVelocity({ userId: data.userId, actionType: 'TRANSFER', timeWindow: '24H' }),
      this.checkVelocity({ userId: data.userId, actionType: 'WITHDRAWAL', timeWindow: '24H' }),
      this.checkVelocity({ userId: data.userId, actionType: 'LOGIN', timeWindow: '1H' }),
    ]);

    for (const result of velocityResults) {
      if (result.isExceeded) {
        riskScore += 25;
        riskFactors.push(`${result.actionType} velocity exceeded: ${result.count} in ${result.timeWindow} (threshold: ${result.threshold})`);
      }
    }

    // 3. IP-based risk
    if (data.ipAddress) {
      if (FRAUD_CONFIG.SUSPICIOUS_IPS.includes(data.ipAddress)) {
        riskScore += 35;
        riskFactors.push(`Suspicious IP address: ${data.ipAddress}`);
      }

      // Check if IP is from a high-risk country (simplified check)
      // In production, you'd use a geo-IP lookup service
      if (data.ipAddress.startsWith('192.168.1.')) {
        riskScore += 20;
        riskFactors.push('IP from high-risk range');
      }
    }

    // 4. Time-based risk (high-risk hours)
    const now = new Date();
    const hour = now.getHours();
    if (FRAUD_CONFIG.HIGH_RISK_HOURS.includes(hour)) {
      riskScore += 15;
      riskFactors.push(`Transaction during high-risk hour: ${hour}:00`);
    }

    // 5. New device/location detection
    if (data.userAgent) {
      const recentSessions = user.sessions;
      const uniqueUserAgents = new Set(recentSessions.map(s => s.userAgent).filter(Boolean));
      
      if (uniqueUserAgents.size >= 3 && !Array.from(uniqueUserAgents).includes(data.userAgent)) {
        riskScore += 20;
        riskFactors.push('New device detected');
      }
    }

    // 6. New destination check
    if (data.destinationAccountId) {
      const userAccounts = user.accounts.map(a => a.id);
      if (!userAccounts.includes(data.destinationAccountId)) {
        riskScore += 25;
        riskFactors.push('New destination account');
      }
    }

    // 7. Card risk (if applicable)
    if (data.cardId) {
      const card = await prisma.card.findUnique({ where: { id: data.cardId } });
      if (card && card.status === 'FROZEN') {
        riskScore += 50;
        riskFactors.push('Card is frozen');
      }
    }

    // 8. User behavior patterns
    const recentTransactionAmounts = user.transactions.map(t => Number(t.amount));
    const avgTransactionAmount = recentTransactionAmounts.length > 0
      ? recentTransactionAmounts.reduce((a, b) => a + b, 0) / recentTransactionAmounts.length
      : 0;

    if (data.amount > avgTransactionAmount * 5 && avgTransactionAmount > 0) {
      riskScore += 15;
      riskFactors.push(`Transaction amount (${data.amount}) is 5x higher than average (${avgTransactionAmount})`);
    }

    // Cap risk score at 100
    riskScore = Math.min(100, Math.max(0, riskScore));

    // Determine risk level
    let riskStatus: FraudRiskStatus = FraudRiskStatus.LOW;
    if (riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.CRITICAL) {
      riskStatus = FraudRiskStatus.CRITICAL;
    } else if (riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.HIGH) {
      riskStatus = FraudRiskStatus.HIGH;
    } else if (riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.MEDIUM) {
      riskStatus = FraudRiskStatus.MEDIUM;
    }

    // Determine recommended action
    let recommendedAction: FraudRecommendedAction = FraudRecommendedAction.ALLOW;
    if (riskScore >= FRAUD_CONFIG.AUTO_BLOCK_THRESHOLD) {
      recommendedAction = FraudRecommendedAction.BLOCK;
    } else if (riskStatus === FraudRiskStatus.CRITICAL || riskStatus === FraudRiskStatus.HIGH) {
      recommendedAction = FraudRecommendedAction.REQUIRE_MANUAL_APPROVAL;
    } else if (riskStatus === FraudRiskStatus.MEDIUM) {
      recommendedAction = FraudRecommendedAction.REVIEW;
    }

    // Create risk assessment record
    const assessmentId = generateReference('FRA');
    const assessment: FraudRiskAssessment = {
      id: assessmentId,
      userId: data.userId,
      transactionId: data.transactionId || null,
      transferId: data.transferId || null,
      withdrawalId: data.withdrawalId || null,
      amount: data.amount,
      currency: data.currency || 'USD',
      riskScore,
      riskFactors,
      recommendedAction,
      status: riskStatus,
      createdAt: new Date(),
    };

    // Log assessment
    await prisma.auditLog.create({
      data: {
        actorId: 'SYSTEM',
        action: 'RISK_ASSESSMENT',
        resourceType: 'FRAUD_RISK',
        resourceId: assessmentId,
        newValues: assessment,
        metadata: {
          riskScore,
          riskFactors,
          recommendedAction,
        },
        status: 'SUCCESS',
      },
    });

    // Create fraud alert if risk is high enough
    if (riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.HIGH) {
      await this.createFraudAlert({
        userId: data.userId,
        alertType: FraudAlertType.UNUSUAL_ACTIVITY,
        severity: riskStatus === FraudRiskStatus.CRITICAL ? FraudAlertSeverity.CRITICAL : FraudAlertSeverity.HIGH,
        description: `High fraud risk detected: ${riskFactors.join(', ')}`,
        amount: data.amount,
        currency: data.currency,
        relatedTransactionId: data.transactionId,
        relatedTransferId: data.transferId,
        relatedWithdrawalId: data.withdrawalId,
        metadata: {
          riskScore,
          riskFactors,
          assessmentId,
        },
      }, 'SYSTEM');
    }

    return assessment;
  }

  // ============================================
  // VELOCITY CHECKS
  // ============================================

  /**
   * Check transaction velocity for a user
   */
  static async checkVelocity(data: VelocityCheckData): Promise<VelocityCheckResult> {
    const now = new Date();
    let startDate: Date;

    switch (data.timeWindow) {
      case '1H':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24H':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7D':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30D':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    let count = 0;
    let threshold = 0;

    switch (data.actionType) {
      case 'LOGIN':
        count = await prisma.session.count({
          where: { userId: data.userId, createdAt: { gte: startDate } },
        });
        threshold = FRAUD_CONFIG.VELOCITY_THRESHOLDS.LOGIN[data.timeWindow];
        break;
      case 'TRANSFER':
        count = await prisma.transfer.count({
          where: { fromUserId: data.userId, createdAt: { gte: startDate } },
        });
        threshold = FRAUD_CONFIG.VELOCITY_THRESHOLDS.TRANSFER[data.timeWindow];
        break;
      case 'WITHDRAWAL':
        count = await prisma.withdrawal.count({
          where: { userId: data.userId, createdAt: { gte: startDate } },
        });
        threshold = FRAUD_CONFIG.VELOCITY_THRESHOLDS.WITHDRAWAL[data.timeWindow];
        break;
      case 'DEPOSIT':
        count = await prisma.deposit.count({
          where: { userId: data.userId, createdAt: { gte: startDate } },
        });
        threshold = FRAUD_CONFIG.VELOCITY_THRESHOLDS.DEPOSIT[data.timeWindow];
        break;
    }

    return {
      count,
      threshold,
      isExceeded: count > threshold,
      timeWindow: data.timeWindow,
      actionType: data.actionType,
    };
  }

  // ============================================
  // TRANSACTION MONITORING
  // ============================================

  /**
   * Monitor a transaction for fraud
   */
  static async monitorTransaction(
    transactionId: string,
    userId: string,
    amount: number,
    currency: string = 'USD',
    destinationAccountId?: string,
    cardId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{
    isSuspicious: boolean;
    riskScore: number;
    riskFactors: string[];
    recommendedAction: FraudRecommendedAction;
    alertId?: string;
  }> {
    const assessment = await this.assessFraudRisk({
      userId,
      transactionId,
      amount,
      currency,
      destinationAccountId,
      cardId,
      ipAddress,
      userAgent,
    });

    const isSuspicious = assessment.riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.MEDIUM;

    // If critical risk, create alert
    let alertId: string | undefined;
    if (assessment.riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.HIGH) {
      const alert = await this.createFraudAlert({
        userId,
        alertType: FraudAlertType.UNUSUAL_ACTIVITY,
        severity: assessment.riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.CRITICAL
          ? FraudAlertSeverity.CRITICAL
          : FraudAlertSeverity.HIGH,
        description: `Suspicious transaction detected: ${assessment.riskFactors.join(', ')}`,
        amount,
        currency,
        relatedTransactionId: transactionId,
        metadata: {
          riskScore: assessment.riskScore,
          riskFactors: assessment.riskFactors,
          assessmentId: assessment.id,
        },
      }, 'SYSTEM');
      alertId = alert.alert.id;
    }

    return {
      isSuspicious,
      riskScore: assessment.riskScore,
      riskFactors: assessment.riskFactors,
      recommendedAction: assessment.recommendedAction,
      alertId,
    };
  }

  /**
   * Monitor a transfer for fraud
   */
  static async monitorTransfer(
    transferId: string,
    fromUserId: string,
    toUserId: string,
    amount: number,
    currency: string = 'USD',
    fromAccountId: string,
    toAccountId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{
    isSuspicious: boolean;
    riskScore: number;
    riskFactors: string[];
    recommendedAction: FraudRecommendedAction;
    alertId?: string;
  }> {
    const assessment = await this.assessFraudRisk({
      userId: fromUserId,
      transferId,
      amount,
      currency,
      destinationUserId: toUserId,
      destinationAccountId: toAccountId,
      ipAddress,
      userAgent,
    });

    const isSuspicious = assessment.riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.MEDIUM;

    // Check if transferring to self (structuring)
    if (fromUserId === toUserId && fromAccountId !== toAccountId) {
      assessment.riskFactors.push('Transfer to own account (structuring)');
      assessment.riskScore = Math.min(100, assessment.riskScore + 10);
    }

    // Check if recipient is new
    const toUser = await prisma.user.findUnique({ where: { id: toUserId } });
    if (toUser && toUser.createdAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
      assessment.riskFactors.push('Recipient account is less than 7 days old');
      assessment.riskScore = Math.min(100, assessment.riskScore + 15);
    }

    // Update risk status
    if (assessment.riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.CRITICAL) {
      assessment.status = FraudRiskStatus.CRITICAL;
    } else if (assessment.riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.HIGH) {
      assessment.status = FraudRiskStatus.HIGH;
    } else if (assessment.riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.MEDIUM) {
      assessment.status = FraudRiskStatus.MEDIUM;
    }

    // If critical risk, create alert
    let alertId: string | undefined;
    if (assessment.riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.HIGH) {
      const alert = await this.createFraudAlert({
        userId: fromUserId,
        alertType: FraudAlertType.SUSPICIOUS_IP,
        severity: assessment.status === FraudRiskStatus.CRITICAL
          ? FraudAlertSeverity.CRITICAL
          : FraudAlertSeverity.HIGH,
        description: `Suspicious transfer detected: ${assessment.riskFactors.join(', ')}`,
        amount,
        currency,
        relatedTransferId: transferId,
        relatedAccountId: fromAccountId,
        metadata: {
          riskScore: assessment.riskScore,
          riskFactors: assessment.riskFactors,
          assessmentId: assessment.id,
          toUserId,
        },
      }, 'SYSTEM');
      alertId = alert.alert.id;
    }

    return {
      isSuspicious: assessment.riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.MEDIUM,
      riskScore: assessment.riskScore,
      riskFactors: assessment.riskFactors,
      recommendedAction: assessment.recommendedAction,
      alertId,
    };
  }

  /**
   * Monitor a withdrawal for fraud
   */
  static async monitorWithdrawal(
    withdrawalId: string,
    userId: string,
    amount: number,
    currency: string = 'USD',
    accountId: string,
    destination: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{
    isSuspicious: boolean;
    riskScore: number;
    riskFactors: string[];
    recommendedAction: FraudRecommendedAction;
    alertId?: string;
  }> {
    const assessment = await this.assessFraudRisk({
      userId,
      withdrawalId,
      amount,
      currency,
      destinationAccountId: accountId,
      ipAddress,
      userAgent,
    });

    // Check for cash withdrawal patterns
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (account && account.balance < amount * 2) {
      assessment.riskFactors.push('Withdrawal amount is close to account balance');
      assessment.riskScore = Math.min(100, assessment.riskScore + 15);
    }

    // Check destination
    if (destination && !destination.startsWith('ACC-')) {
      assessment.riskFactors.push('Unusual withdrawal destination');
      assessment.riskScore = Math.min(100, assessment.riskScore + 10);
    }

    const isSuspicious = assessment.riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.MEDIUM;

    // If critical risk, create alert
    let alertId: string | undefined;
    if (assessment.riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.HIGH) {
      const alert = await this.createFraudAlert({
        userId,
        alertType: FraudAlertType.HIGH_VALUE,
        severity: assessment.riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.CRITICAL
          ? FraudAlertSeverity.CRITICAL
          : FraudAlertSeverity.HIGH,
        description: `Suspicious withdrawal detected: ${assessment.riskFactors.join(', ')}`,
        amount,
        currency,
        relatedWithdrawalId: withdrawalId,
        relatedAccountId: accountId,
        metadata: {
          riskScore: assessment.riskScore,
          riskFactors: assessment.riskFactors,
          assessmentId: assessment.id,
          destination,
        },
      }, 'SYSTEM');
      alertId = alert.alert.id;
    }

    return {
      isSuspicious,
      riskScore: assessment.riskScore,
      riskFactors: assessment.riskFactors,
      recommendedAction: assessment.recommendedAction,
      alertId,
    };
  }

  // ============================================
  // CARD FRAUD DETECTION
  // ============================================

  /**
   * Check for card fraud patterns
   */
  static async checkCardFraud(
    cardId: string,
    userId: string,
    amount: number,
    merchant: string,
    ipAddress?: string,
    isOnline: boolean = true
  ): Promise<{
    isSuspicious: boolean;
    riskScore: number;
    riskFactors: string[];
    recommendedAction: FraudRecommendedAction;
    alertId?: string;
  }> {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: {
        transactions: {
          where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          orderBy: { createdAt: 'desc' },
        },
        user: true,
      },
    });

    if (!card) throw new NotFoundError('Card', cardId);

    const riskFactors: string[] = [];
    let riskScore = 0;

    // 1. Card not present (online) vs present (in-person)
    if (isOnline) {
      riskScore += 5;
      riskFactors.push('Card not present transaction');
    }

    // 2. Multiple transactions in short time
    const recentTransactions = card.transactions.length;
    if (recentTransactions >= 10) {
      riskScore += 20;
      riskFactors.push(`High transaction count: ${recentTransactions} in 24h`);
    }

    // 3. High amount
    if (amount >= FRAUD_CONFIG.AMOUNT_THRESHOLDS.HIGH) {
      riskScore += 25;
      riskFactors.push(`High amount: ${amount}`);
    }

    // 4. Unusual merchant
    const user = card.user;
    const userTransactions = await prisma.transaction.findMany({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      distinct: ['metadata'],
    });
    
    // Simplified merchant check
    if (merchant && !userTransactions.some(t => 
      (t.metadata as Record<string, string>)?.merchant?.includes(merchant)
    )) {
      riskScore += 15;
      riskFactors.push('Unusual merchant');
    }

    // 5. IP mismatch
    if (ipAddress) {
      const userSessions = await prisma.session.findMany({
        where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      });
      const userIPs = userSessions.map(s => s.ipAddress).filter(Boolean);
      
      if (userIPs.length > 0 && !userIPs.includes(ipAddress)) {
        riskScore += 25;
        riskFactors.push(`New IP address: ${ipAddress}`);
      }
    }

    // Cap score
    riskScore = Math.min(100, riskScore);

    // Determine status
    let status: FraudRiskStatus = FraudRiskStatus.LOW;
    if (riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.CRITICAL) {
      status = FraudRiskStatus.CRITICAL;
    } else if (riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.HIGH) {
      status = FraudRiskStatus.HIGH;
    } else if (riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.MEDIUM) {
      status = FraudRiskStatus.MEDIUM;
    }

    // Determine recommended action
    let recommendedAction: FraudRecommendedAction = FraudRecommendedAction.ALLOW;
    if (riskScore >= FRAUD_CONFIG.AUTO_BLOCK_THRESHOLD) {
      recommendedAction = FraudRecommendedAction.BLOCK;
    } else if (status === FraudRiskStatus.CRITICAL || status === FraudRiskStatus.HIGH) {
      recommendedAction = FraudRecommendedAction.REQUIRE_2FA;
    } else if (status === FraudRiskStatus.MEDIUM) {
      recommendedAction = FraudRecommendedAction.REVIEW;
    }

    const isSuspicious = riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.MEDIUM;

    // Create alert if high risk
    let alertId: string | undefined;
    if (riskScore >= FRAUD_CONFIG.RISK_SCORE_THRESHOLDS.HIGH) {
      const alert = await this.createFraudAlert({
        userId: user.id,
        alertType: FraudAlertType.CARD_NOT_PRESENT,
        severity: status === FraudRiskStatus.CRITICAL ? FraudAlertSeverity.CRITICAL : FraudAlertSeverity.HIGH,
        description: `Suspicious card transaction: ${riskFactors.join(', ')}`,
        amount,
        currency: 'USD',
        relatedCardId: cardId,
        metadata: {
          riskScore,
          riskFactors,
          merchant,
          isOnline,
        },
      }, 'SYSTEM');
      alertId = alert.alert.id;
    }

    return {
      isSuspicious,
      riskScore,
      riskFactors,
      recommendedAction,
      alertId,
    };
  }

  // ============================================
  // FRAUD STATISTICS
  // ============================================

  /**
   * Get fraud statistics
   */
  static async getStats(
    actingUserId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalAlerts: number;
    openAlerts: number;
    resolvedAlerts: number;
    falsePositives: number;
    byType: Record<FraudAlertType, number>;
    bySeverity: Record<FraudAlertSeverity, number>;
    byStatus: Record<FraudAlertStatus, number>;
    highRiskUsers: number;
    blockedTransactions: number;
  }> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view fraud statistics');
    }

    const where: Record<string, unknown> = {
      resourceType: 'FRAUD_ALERT',
      action: 'CREATE',
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const totalAlerts = await prisma.auditLog.count({ where });

    const openAlerts = await prisma.auditLog.count({
      where: {
        ...where,
        newValues: { path: ['status'], string_contains: 'OPEN' },
      },
    });

    const resolvedAlerts = await prisma.auditLog.count({
      where: {
        ...where,
        newValues: { path: ['status'], string_contains: 'CLOSED' },
      },
    });

    const falsePositives = await prisma.auditLog.count({
      where: {
        ...where,
        newValues: { path: ['resolution'], string_contains: 'FALSE_POSITIVE' },
      },
    });

    // Count by type
    const types = Object.values(FraudAlertType);
    const byType: Record<FraudAlertType, number> = {} as Record<FraudAlertType, number>;
    for (const type of types) {
      byType[type] = await prisma.auditLog.count({
        where: {
          ...where,
          newValues: { path: ['alertType'], string_contains: type },
        },
      });
    }

    // Count by severity
    const severities = Object.values(FraudAlertSeverity);
    const bySeverity: Record<FraudAlertSeverity, number> = {} as Record<FraudAlertSeverity, number>;
    for (const severity of severities) {
      bySeverity[severity] = await prisma.auditLog.count({
        where: {
          ...where,
          newValues: { path: ['severity'], string_contains: severity },
        },
      });
    }

    // Count by status
    const statuses = Object.values(FraudAlertStatus);
    const byStatus: Record<FraudAlertStatus, number> = {} as Record<FraudAlertStatus, number>;
    for (const status of statuses) {
      byStatus[status] = await prisma.auditLog.count({
        where: {
          ...where,
          newValues: { path: ['status'], string_contains: status },
        },
      });
    }

    // Count high-risk users
    const allUsers = await prisma.user.findMany();
    let highRiskUsers = 0;
    let blockedTransactions = 0;

    for (const user of allUsers) {
      const alerts = await prisma.auditLog.findMany({
        where: {
          resourceType: 'FRAUD_ALERT',
          action: 'CREATE',
          newValues: { path: ['userId'], equals: user.id },
          createdAt: startDate && endDate ? { gte: startDate, lte: endDate } : undefined,
        },
      });

      if (alerts.length >= 3) {
        highRiskUsers++;
      }

      blockedTransactions += alerts.filter(a => 
        (a.newValues as Record<string, string>)?.resolution === 'BLOCKED'
      ).length;
    }

    return {
      totalAlerts,
      openAlerts,
      resolvedAlerts,
      falsePositives,
      byType,
      bySeverity,
      byStatus,
      highRiskUsers,
      blockedTransactions,
    };
  }
}
