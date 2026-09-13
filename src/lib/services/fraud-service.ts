import { prisma } from '../prisma';
import { generateReference } from '../utils/security';
import { ForbiddenError, NotFoundError, ValidationError, FraudError, SuspiciousActivityError } from '../utils/errors';
import { Decimal } from '@prisma/client/runtime/library';
import { LedgerService } from './ledger-service';
import type { User, Account, Transaction, FraudAlert, FraudStatus, RiskLevel, Role } from '@prisma/client';

function toDecimal(amount: number | string | Decimal): Decimal {
  if (amount instanceof Decimal) return amount;
  if (typeof amount === 'string') return new Decimal(amount);
  return new Decimal(amount.toString());
}

const FRAUD_CONFIG = {
  SUSPICIOUS_THRESHOLD: new Decimal(1000),
  HIGH_RISK_THRESHOLD: new Decimal(5000),
  RAPID_TRANSACTION_THRESHOLD: 5,
  RAPID_TRANSACTION_AMOUNT: new Decimal(1000),
  UNUSUAL_TIME_WINDOW: 2,
  MAX_DESCRIPTION_LENGTH: 1000,
  VELOCITY_CHECK_WINDOW: 24,
  VELOCITY_THRESHOLD: new Decimal(10000),
} as const;

export interface FraudCheckData {
  userId: string; accountId?: string; transactionId?: string; amount: number | string | Decimal;
  currency?: string; description?: string; ipAddress?: string; deviceId?: string; location?: string;
  metadata?: Record<string, unknown>;
}

export interface FraudCheckResult {
  alert: FraudAlert & { user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
    account?: Pick<Account, 'id' | 'accountNumber'> | null; transaction?: Pick<Transaction, 'id' | 'reference'> | null; };
  riskLevel: RiskLevel; riskScore: number; isSuspicious: boolean; isBlocked: boolean; recommendations: string[];
}

export interface FraudStats {
  totalAlerts: number; byRiskLevel: Record<RiskLevel, number>; byStatus: Record<FraudStatus, number>;
  byType: Record<string, number>; totalFlaggedAmount: number; totalBlockedAmount: number; averageResponseTime: number;
}

export class FraudService {
  static async check(data: FraudCheckData, actingUserId?: string): Promise<FraudCheckResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);
    const amount = toDecimal(data.amount);
    if (amount.lessThanOrEqual(new Decimal(0))) throw new ValidationError('Amount must be positive');
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
    let riskLevel: RiskLevel = 'LOW'; let riskScore = 0; let isSuspicious = false; let isBlocked = false;
    const recommendations: string[] = [];
    if (amount.greaterThanOrEqual(FRAUD_CONFIG.HIGH_RISK_THRESHOLD)) { riskScore += 40; recommendations.push('High amount - manual review recommended'); }
    else if (amount.greaterThanOrEqual(FRAUD_CONFIG.SUSPICIOUS_THRESHOLD)) { riskScore += 20; }
    const oneHourAgo = new Date(); oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    const recentTransactions = await prisma.transaction.count({ where: { userId: data.userId, createdAt: { gte: oneHourAgo } } });
    if (recentTransactions >= FRAUD_CONFIG.RAPID_TRANSACTION_THRESHOLD) { riskScore += 30; recommendations.push('Rapid transaction pattern detected'); }
    if (data.location && user.lastLoginLocation) {
      const distance = this.calculateDistance(user.lastLoginLocation, data.location);
      if (distance > 500) { riskScore += 25; recommendations.push('Unusual location - distance from last login'); }
    }
    if (data.deviceId && user.lastDeviceId && data.deviceId !== user.lastDeviceId) { riskScore += 15; recommendations.push('New device detected'); }
    if (data.ipAddress && user.lastIpAddress && data.ipAddress !== user.lastIpAddress) { riskScore += 10; }
    const twentyFourHoursAgo = new Date(); twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    const velocityCheck = await prisma.transaction.aggregate({ where: { userId: data.userId, createdAt: { gte: twentyFourHoursAgo } }, _sum: { amount: true } });
    const total24h = toDecimal(velocityCheck._sum.amount || 0); const newTotal = total24h.plus(amount);
    if (newTotal.greaterThan(FRAUD_CONFIG.VELOCITY_THRESHOLD)) { riskScore += 25; recommendations.push('High velocity - exceeds 24h threshold'); isSuspicious = true; }
    const avgTransactionAmount = await this.getAverageTransactionAmount(data.userId);
    if (avgTransactionAmount.greaterThan(0) && amount.greaterThan(avgTransactionAmount.times(3))) { riskScore += 20; recommendations.push('Amount significantly higher than average'); }
    if (user.fraudFlagged) { riskScore += 30; recommendations.push('User has previous fraud flags'); }
    if (riskScore >= 80) { riskLevel = 'HIGH'; isSuspicious = true; isBlocked = true; }
    else if (riskScore >= 50) { riskLevel = 'MEDIUM'; isSuspicious = true; }
    else if (riskScore >= 20) { riskLevel = 'LOW'; isSuspicious = true; }
    riskScore = Math.min(riskScore, 100);
    const alert = await prisma.fraudAlert.create({
      data: { userId: data.userId, accountId: data.accountId || null, transactionId: data.transactionId || null,
        amount: amount, currency: data.currency || 'USD', riskLevel, riskScore, isSuspicious, isBlocked,
        status: isBlocked ? 'BLOCKED' : isSuspicious ? 'PENDING' : 'COMPLETED' as FraudStatus,
        ipAddress: data.ipAddress || null, deviceId: data.deviceId || null, location: data.location || null,
        recommendations, metadata: data.metadata || null },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } },
        account: { select: { id: true, accountNumber: true } }, transaction: { select: { id: true, reference: true } } },
    });
    await prisma.auditLog.create({ data: { actorId: actingUserId || data.userId, action: 'CREATE', resourceType: 'FRAUD_ALERT', resourceId: alert.id,
      newValues: { amount: amount.toString(), riskLevel, riskScore, isSuspicious, isBlocked }, metadata: data.metadata, status: 'SUCCESS' } });
    if (isBlocked) {
      if (data.accountId) await prisma.account.update({ where: { id: data.accountId }, data: { status: 'FROZEN' as const } });
      const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'] as Role[] } } });
      for (const admin of admins) await prisma.notification.create({ data: { userId: admin.id, title: 'FRAUD ALERT - Transaction Blocked',
        message: 'Fraud detected and blocked for user ' + user.email + '. Amount: ' + amount.toString() + ' ' + (data.currency || 'USD'),
        type: 'ERROR', category: 'FRAUD', isRead: false, metadata: { alertId: alert.id, userId: data.userId, amount: amount.toString(), riskLevel } } });
      await prisma.notification.create({ data: { userId: data.userId, title: 'Transaction Blocked - Fraud Detection',
        message: 'Your transaction has been blocked due to fraud detection. Please contact support.', type: 'ERROR',
        category: 'FRAUD', isRead: false, metadata: { alertId: alert.id } } });
    } else if (isSuspicious) {
      const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'] as Role[] } } });
      for (const admin of admins) await prisma.notification.create({ data: { userId: admin.id, title: 'Fraud Alert - Suspicious Activity',
        message: 'Suspicious activity detected for user ' + user.email + '. Amount: ' + amount.toString() + ' ' + (data.currency || 'USD'),
        type: 'WARNING', category: 'FRAUD', isRead: false, metadata: { alertId: alert.id, userId: data.userId, amount: amount.toString(), riskLevel } } });
    }
    return { alert, riskLevel, riskScore, isSuspicious, isBlocked, recommendations };
  }

  static async getById(id: string, actingUserId: string): Promise<FraudCheckResult> {
    const alert = await prisma.fraudAlert.findUnique({ where: { id }, include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
      account: { select: { id: true, accountNumber: true } }, transaction: { select: { id: true, reference: true } } } });
    if (!alert) throw new NotFoundError('Fraud Alert', id);
    if (actingUserId !== alert.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this fraud alert');
      }
    }
    return { alert, riskLevel: alert.riskLevel as RiskLevel, riskScore: alert.riskScore, isSuspicious: alert.isSuspicious, isBlocked: alert.isBlocked, recommendations: alert.recommendations as string[] };
  }

  static async listByUser(userId: string, actingUserId: string, page: number = 1, limit: number = 20, status?: FraudStatus, riskLevel?: RiskLevel, startDate?: Date, endDate?: Date): Promise<{ alerts: FraudAlert[]; total: number; page: number; limit: number; totalPages: number }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);
    if (actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these fraud alerts');
      }
    }
    const where: Record<string, unknown> = { userId };
    if (status) where.status = status; if (riskLevel) where.riskLevel = riskLevel;
    if (startDate || endDate) { where.createdAt = {}; if (startDate) where.createdAt.gte = startDate; if (endDate) where.createdAt.lte = endDate; }
    const alerts = await prisma.fraudAlert.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: { user: true, account: true, transaction: true } });
    const total = await prisma.fraudAlert.count({ where });
    return { alerts, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async listAll(actingUserId: string, page: number = 1, limit: number = 20, status?: FraudStatus, riskLevel?: RiskLevel, startDate?: Date, endDate?: Date, userId?: string): Promise<{ alerts: FraudAlert[]; total: number; page: number; limit: number; totalPages: number }> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view all fraud alerts');
    }
    const where: Record<string, unknown> = {}; if (status) where.status = status; if (riskLevel) where.riskLevel = riskLevel;
    if (userId) where.userId = userId; if (startDate || endDate) { where.createdAt = {}; if (startDate) where.createdAt.gte = startDate; if (endDate) where.createdAt.lte = endDate; }
    const alerts = await prisma.fraudAlert.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: { user: true, account: true, transaction: true } });
    const total = await prisma.fraudAlert.count({ where });
    return { alerts, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async resolve(id: string, actingUserId: string, resolution: string, isFalsePositive: boolean): Promise<FraudCheckResult> {
    const alert = await prisma.fraudAlert.findUnique({ where: { id }, include: { user: true, account: true, transaction: true } });
    if (!alert) throw new NotFoundError('Fraud Alert', id);
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can resolve fraud alerts');
    }
    if (alert.status === 'RESOLVED') throw new ValidationError('Alert is already resolved');
    const updatedAlert = await prisma.fraudAlert.update({
      where: { id }, data: { status: 'RESOLVED' as FraudStatus, resolvedById: actingUserId, resolvedAt: new Date(), resolution, isFalsePositive },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } },
        account: { select: { id: true, accountNumber: true } }, transaction: { select: { id: true, reference: true } } },
    });
    await prisma.auditLog.create({ data: { actorId: actingUserId, action: 'RESOLVE', resourceType: 'FRAUD_ALERT', resourceId: alert.id,
      oldValues: { status: alert.status }, newValues: { status: 'RESOLVED', resolution, isFalsePositive }, status: 'SUCCESS' } });
    if (isFalsePositive) {
      await prisma.user.update({ where: { id: alert.userId }, data: { fraudFlagged: false, fraudFlaggedAt: null, fraudFlaggedReason: null } });
      if (alert.accountId) await prisma.account.update({ where: { id: alert.accountId }, data: { status: 'ACTIVE' as const } });
    }
    return { alert: updatedAlert, riskLevel: updatedAlert.riskLevel as RiskLevel, riskScore: updatedAlert.riskScore, isSuspicious: updatedAlert.isSuspicious, isBlocked: updatedAlert.isBlocked, recommendations: updatedAlert.recommendations as string[] };
  }

  static async getStats(actingUserId: string): Promise<FraudStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view fraud statistics');
    }
    const totalAlerts = await prisma.fraudAlert.count();
    const byRiskLevel: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    const riskLevelCounts = await prisma.fraudAlert.groupBy({ by: ['riskLevel'], _count: { _all: true } });
    for (const group of riskLevelCounts) byRiskLevel[group.riskLevel as RiskLevel] = group._count._all;
    const byStatus: Record<FraudStatus, number> = { PENDING: 0, COMPLETED: 0, BLOCKED: 0, RESOLVED: 0 };
    const statusCounts = await prisma.fraudAlert.groupBy({ by: ['status'], _count: { _all: true } });
    for (const group of statusCounts) byStatus[group.status as FraudStatus] = group._count._all;
    const byType: Record<string, number> = {}; const typeCounts = await prisma.fraudAlert.groupBy({ by: ['riskLevel'], _count: { _all: true } });
    for (const group of typeCounts) byType[group.riskLevel] = group._count._all;
    const flaggedAlerts = await prisma.fraudAlert.findMany({ where: { isSuspicious: true }, select: { amount: true } });
    const totalFlaggedAmount = flaggedAlerts.reduce((sum, a) => sum.plus(toDecimal(a.amount)), new Decimal(0)).toNumber();
    const blockedAlerts = await prisma.fraudAlert.findMany({ where: { isBlocked: true }, select: { amount: true } });
    const totalBlockedAmount = blockedAlerts.reduce((sum, a) => sum.plus(toDecimal(a.amount)), new Decimal(0)).toNumber();
    const resolvedAlerts = await prisma.fraudAlert.findMany({ where: { status: 'RESOLVED' }, select: { createdAt: true, resolvedAt: true } });
    const averageResponseTime = resolvedAlerts.length > 0 ? resolvedAlerts.reduce((sum, a) => { if (a.resolvedAt) { const diff = a.resolvedAt.getTime() - a.createdAt.getTime(); return sum + diff / 1000; } return sum; }, 0) / resolvedAlerts.length : 0;
    return { totalAlerts, byRiskLevel, byStatus, byType, totalFlaggedAmount, totalBlockedAmount, averageResponseTime };
  }

  private static async getAverageTransactionAmount(userId: string): Promise<Decimal> {
    const transactions = await prisma.transaction.findMany({ where: { userId }, select: { amount: true }, take: 100, orderBy: { createdAt: 'desc' } });
    if (transactions.length === 0) return new Decimal(0);
    const sum = transactions.reduce((s, t) => s.plus(toDecimal(t.amount)), new Decimal(0));
    return sum.div(transactions.length);
  }

  private static calculateDistance(loc1: string, loc2: string): number {
    if (loc1 === loc2) return 0; if (loc1.includes('Nigeria') && loc2.includes('Nigeria')) return 100;
    if (loc1.includes('US') && loc2.includes('US')) return 500; return 1000;
  }
}