import { prisma } from '../prisma';
import { generateReference, generateIdempotencyKey } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  InsufficientBalanceError,
  TransferError,
  DailyLimitExceededError,
  MonthlyLimitExceededError,
} from '../utils/errors';
import { LedgerService } from './ledger-service';
import { Decimal } from '@prisma/client/runtime/library';
import type {
  User,
  Account,
  Transfer,
  TransferStatus,
  TransferType,
  Role,
  Journal,
} from '@prisma/client';

// ============================================
// DECIMAL UTILITIES
// ============================================

function toDecimal(amount: number | string | Decimal): Decimal {
  if (amount instanceof Decimal) return amount;
  if (typeof amount === 'string') return new Decimal(amount);
  return new Decimal(amount.toString());
}

// ============================================
// CONSTANTS
// ============================================

const TRANSFER_CONFIG = {
  MIN_TRANSFER_AMOUNT: new Decimal(1),
  MAX_TRANSFER_AMOUNT: new Decimal(1000000),
  DAILY_LIMIT: new Decimal(50000),
  MONTHLY_LIMIT: new Decimal(500000),
  MAX_DESCRIPTION_LENGTH: 500,
  DEFAULT_CURRENCY: 'USD',
  ALLOW_INTERNAL_TRANSFERS: true,
  ALLOW_EXTERNAL_TRANSFERS: true,
  REQUIRE_APPROVAL_AMOUNT: new Decimal(50000),
  FEE_PERCENTAGE: new Decimal(0.01),
  FEE_MINIMUM: new Decimal(1),
  FEE_MAXIMUM: new Decimal(100),
} as const;

export interface CreateTransferData {
  fromUserId: string;
  fromAccountId: string;
  toUserId: string;
  toAccountId: string;
  amount: number | string | Decimal;
  currency?: string;
  description?: string;
  reference?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface TransferResult {
  transfer: Transfer & {
    fromUser: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
    toUser: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
    fromAccount: Pick<Account, 'id' | 'accountNumber' | 'balance' | 'availableBalance'>;
    toAccount: Pick<Account, 'id' | 'accountNumber' | 'balance' | 'availableBalance'>;
    journal?: Journal | null;
  };
}

export interface TransferListResult {
  transfers: Transfer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TransferStats {
  totalTransfers: number;
  totalAmount: number;
  byStatus: Record<TransferStatus, number>;
  byType: Record<TransferType, number>;
  averageAmount: number;
  pendingApproval: number;
}

export class TransferService {
  static async createTransfer(data: CreateTransferData, actingUserId?: string): Promise<TransferResult> {
    const fromUser = await prisma.user.findUnique({ where: { id: data.fromUserId } });
    if (!fromUser) throw new NotFoundError('User (From)', data.fromUserId);
    const toUser = await prisma.user.findUnique({ where: { id: data.toUserId } });
    if (!toUser) throw new NotFoundError('User (To)', data.toUserId);
    if (actingUserId && actingUserId !== data.fromUserId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You can only transfer from your own account');
      }
    }
    const fromAccount = await prisma.account.findUnique({ where: { id: data.fromAccountId } });
    if (!fromAccount) throw new NotFoundError('Account (From)', data.fromAccountId);
    if (fromAccount.userId !== data.fromUserId) throw new ForbiddenError('From account does not belong to from user');
    const toAccount = await prisma.account.findUnique({ where: { id: data.toAccountId } });
    if (!toAccount) throw new NotFoundError('Account (To)', data.toAccountId);
    if (toAccount.userId !== data.toUserId) throw new ForbiddenError('To account does not belong to to user');
    if (fromAccount.status !== 'ACTIVE') throw new ValidationError(`From account is ${fromAccount.status.toLowerCase()}`);
    if (toAccount.status !== 'ACTIVE') throw new ValidationError(`To account is ${toAccount.status.toLowerCase()}`);
    const amount = toDecimal(data.amount);
    if (amount.lessThanOrEqual(new Decimal(0))) throw new ValidationError('Amount must be positive');
    if (amount.greaterThan(TRANSFER_CONFIG.MAX_TRANSFER_AMOUNT)) throw new ValidationError(`Amount exceeds maximum transfer limit of ${TRANSFER_CONFIG.MAX_TRANSFER_AMOUNT.toString()}`);
    if (data.idempotencyKey) {
      const existingTransfer = await prisma.transfer.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
      if (existingTransfer) return { transfer: existingTransfer as any };
    }
    const availableBalance = toDecimal(fromAccount.availableBalance);
    if (availableBalance.lessThan(amount)) {
      throw new InsufficientBalanceError(fromAccount.id, amount.toNumber(), availableBalance.toNumber());
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailyTransfers = await prisma.transfer.aggregate({ where: { fromUserId: data.fromUserId, createdAt: { gte: today }, status: { in: ['PENDING', 'COMPLETED', 'APPROVED'] as TransferStatus[] } }, _sum: { amount: true } });
    const dailyTotal = toDecimal(dailyTransfers._sum.amount || 0);
    const newDailyTotal = dailyTotal.plus(amount);
    if (newDailyTotal.greaterThan(TRANSFER_CONFIG.DAILY_LIMIT)) {
      throw new DailyLimitExceededError(data.fromUserId, TRANSFER_CONFIG.DAILY_LIMIT.toNumber(), newDailyTotal.toNumber());
    }
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyTransfers = await prisma.transfer.aggregate({ where: { fromUserId: data.fromUserId, createdAt: { gte: thisMonth }, status: { in: ['PENDING', 'COMPLETED', 'APPROVED'] as TransferStatus[] } }, _sum: { amount: true } });
    const monthlyTotal = toDecimal(monthlyTransfers._sum.amount || 0);
    const newMonthlyTotal = monthlyTotal.plus(amount);
    if (newMonthlyTotal.greaterThan(TRANSFER_CONFIG.MONTHLY_LIMIT)) {
      throw new MonthlyLimitExceededError(data.fromUserId, TRANSFER_CONFIG.MONTHLY_LIMIT.toNumber(), newMonthlyTotal.toNumber());
    }
    const requiresApproval = amount.greaterThanOrEqual(TRANSFER_CONFIG.REQUIRE_APPROVAL_AMOUNT);
    const reference = data.reference || generateReference('TRF');
    const idempotencyKey = data.idempotencyKey || generateIdempotencyKey();
    const feeAmount = amount.times(TRANSFER_CONFIG.FEE_PERCENTAGE);
    const fee = feeAmount.lessThan(TRANSFER_CONFIG.FEE_MINIMUM) ? TRANSFER_CONFIG.FEE_MINIMUM : feeAmount.greaterThan(TRANSFER_CONFIG.FEE_MAXIMUM) ? TRANSFER_CONFIG.FEE_MAXIMUM : feeAmount;
    const totalDeduction = amount.plus(fee);
    if (availableBalance.lessThan(totalDeduction)) {
      throw new InsufficientBalanceError(fromAccount.id, totalDeduction.toNumber(), availableBalance.toNumber());
    }
    return await prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.create({
        data: {
          reference,
          fromUserId: data.fromUserId,
          toUserId: data.toUserId,
          fromAccountId: data.fromAccountId,
          toAccountId: data.toAccountId,
          amount: amount,
          fee: fee,
          totalAmount: totalDeduction,
          currency: data.currency || TRANSFER_CONFIG.DEFAULT_CURRENCY,
          description: data.description || null,
          status: requiresApproval ? 'PENDING' : 'COMPLETED' as TransferStatus,
          type: data.fromUserId === data.toUserId ? 'INTERNAL' : 'EXTERNAL' as TransferType,
          idempotencyKey,
          metadata: data.metadata || null,
        },
        include: {
          fromUser: { select: { id: true, email: true, firstName: true, lastName: true } },
          toUser: { select: { id: true, email: true, firstName: true, lastName: true } },
          fromAccount: { select: { id: true, accountNumber: true, balance: true, availableBalance: true } },
          toAccount: { select: { id: true, accountNumber: true, balance: true, availableBalance: true } },
          journal: true,
        },
      });
      await LedgerService.createJournal({
        reference: generateReference('TRF-JNL'),
        description: `Transfer ${reference} - ${amount.toString()} ${data.currency || 'USD'}`,
        entries: [
          { accountId: data.fromAccountId, entryType: 'DEBIT', amount: totalDeduction, description: `Transfer to ${toAccount.accountNumber} - Amount: ${amount.toString()}, Fee: ${fee.toString()}`, transactionId: transfer.id },
          { accountId: data.toAccountId, entryType: 'CREDIT', amount: amount, description: `Transfer from ${fromAccount.accountNumber}`, transactionId: transfer.id },
        ],
        transferId: transfer.id,
        metadata: { transferId: transfer.id, fromAccountId: data.fromAccountId, toAccountId: data.toAccountId, amount: amount.toString(), fee: fee.toString(), currency: data.currency || 'USD' },
      }, actingUserId);
      if (!requiresApproval) {
        await tx.account.update({ where: { id: data.fromAccountId }, data: { balance: { decrement: totalDeduction }, availableBalance: { decrement: totalDeduction } } });
        await tx.account.update({ where: { id: data.toAccountId }, data: { balance: { increment: amount }, availableBalance: { increment: amount } } });
      }
      await tx.auditLog.create({
        data: {
          actorId: actingUserId || data.fromUserId,
          action: 'CREATE',
          resourceType: 'TRANSFER',
          resourceId: transfer.id,
          newValues: { reference, fromUserId: data.fromUserId, toUserId: data.toUserId, amount: amount.toString(), fee: fee.toString(), totalAmount: totalDeduction.toString(), status: transfer.status, requiresApproval },
          metadata: data.metadata,
          status: 'SUCCESS',
        },
      });
      if (requiresApproval) {
        const admins = await tx.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] as Role[] } } });
        for (const admin of admins) {
          await tx.notification.create({
            data: {
              userId: admin.id,
              title: 'Transfer Approval Required',
              message: `Transfer of ${amount.toString()} ${data.currency || 'USD'} from ${fromUser.email} to ${toUser.email} requires approval`,
              type: 'WARNING',
              category: 'TRANSFER',
              isRead: false,
              metadata: { transferId: transfer.id, fromUserId: data.fromUserId, toUserId: data.toUserId, amount: amount.toString() },
            },
          });
        }
        await tx.notification.create({
          data: {
            userId: data.fromUserId,
            title: 'Transfer Pending Approval',
            message: `Your transfer of ${amount.toString()} ${data.currency || 'USD'} to ${toUser.email} is pending approval`,
            type: 'INFO',
            category: 'TRANSFER',
            isRead: false,
            metadata: { transferId: transfer.id },
          },
        });
      } else {
        await tx.notification.create({
          data: {
            userId: data.fromUserId,
            title: 'Transfer Completed',
            message: `Your transfer of ${amount.toString()} ${data.currency || 'USD'} to ${toUser.email} has been completed`,
            type: 'SUCCESS',
            category: 'TRANSFER',
            isRead: false,
            metadata: { transferId: transfer.id },
          },
        });
        await tx.notification.create({
          data: {
            userId: data.toUserId,
            title: 'Transfer Received',
            message: `You have received ${amount.toString()} ${data.currency || 'USD'} from ${fromUser.email}`,
            type: 'SUCCESS',
            category: 'TRANSFER',
            isRead: false,
            metadata: { transferId: transfer.id },
          },
        });
      }
      return { transfer };
    });
  }
  static async getById(id: string, actingUserId?: string): Promise<TransferResult> {
    const transfer = await prisma.transfer.findUnique({
      where: { id },
      include: {
        fromUser: { select: { id: true, email: true, firstName: true, lastName: true } },
        toUser: { select: { id: true, email: true, firstName: true, lastName: true } },
        fromAccount: { select: { id: true, accountNumber: true, balance: true, availableBalance: true } },
        toAccount: { select: { id: true, accountNumber: true, balance: true, availableBalance: true } },
        journal: true,
      },
    });
    if (!transfer) throw new NotFoundError('Transfer', id);
    if (actingUserId && actingUserId !== transfer.fromUserId && actingUserId !== transfer.toUserId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this transfer');
      }
    }
    return { transfer };
  }
  static async listByUser(userId: string, actingUserId: string, page: number = 1, limit: number = 20, type?: TransferType, status?: TransferStatus, startDate?: Date, endDate?: Date): Promise<TransferListResult> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);
    if (actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these transfers');
      }
    }
    const where: Record<string, unknown> = { OR: [{ fromUserId: userId }, { toUserId: userId }] };
    if (type) where.type = type;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }
    const transfers = await prisma.transfer.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: { fromUser: true, toUser: true, fromAccount: true, toAccount: true } });
    const total = await prisma.transfer.count({ where });
    return { transfers, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  static async listAll(actingUserId: string, page: number = 1, limit: number = 20, type?: TransferType, status?: TransferStatus, startDate?: Date, endDate?: Date, userId?: string): Promise<TransferListResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view all transfers');
    }
    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (userId) where.OR = [{ fromUserId: userId }, { toUserId: userId }];
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }
    const transfers = await prisma.transfer.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: { fromUser: true, toUser: true, fromAccount: true, toAccount: true } });
    const total = await prisma.transfer.count({ where });
    return { transfers, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  static async approve(id: string, actingUserId: string, notes?: string): Promise<TransferResult> {
    const transfer = await prisma.transfer.findUnique({ where: { id }, include: { fromUser: true, toUser: true, fromAccount: true, toAccount: true, journal: true } });
    if (!transfer) throw new NotFoundError('Transfer', id);
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) throw new ForbiddenError('Only administrators can approve transfers');
    if (transfer.status !== 'PENDING') throw new ValidationError('Only pending transfers can be approved');
    if (transfer.fromAccount.status !== 'ACTIVE') throw new ValidationError('From account is no longer active');
    if (transfer.toAccount.status !== 'ACTIVE') throw new ValidationError('To account is no longer active');
    const totalAmount = toDecimal(transfer.totalAmount);
    const availableBalance = toDecimal(transfer.fromAccount.availableBalance);
    if (availableBalance.lessThan(totalAmount)) throw new InsufficientBalanceError(transfer.fromAccount.id, totalAmount.toNumber(), availableBalance.toNumber());
    return await prisma.$transaction(async (tx) => {
      const approvedTransfer = await tx.transfer.update({
        where: { id },
        data: { status: 'APPROVED' as TransferStatus, approvedById: actingUserId, approvedAt: new Date(), approvalNotes: notes || null },
        include: { fromUser: { select: { id: true, email: true, firstName: true, lastName: true } }, toUser: { select: { id: true, email: true, firstName: true, lastName: true } }, fromAccount: { select: { id: true, accountNumber: true, balance: true, availableBalance: true } }, toAccount: { select: { id: true, accountNumber: true, balance: true, availableBalance: true } }, journal: true },
      });
      await tx.account.update({ where: { id: transfer.fromAccountId }, data: { balance: { decrement: totalAmount }, availableBalance: { decrement: totalAmount } } });
      await tx.account.update({ where: { id: transfer.toAccountId }, data: { balance: { increment: toDecimal(transfer.amount) }, availableBalance: { increment: toDecimal(transfer.amount) } } });
      await tx.auditLog.create({ data: { actorId: actingUserId, action: 'APPROVE', resourceType: 'TRANSFER', resourceId: transfer.id, oldValues: { status: transfer.status }, newValues: { status: 'APPROVED', notes }, status: 'SUCCESS' } });
      await tx.notification.create({ data: { userId: transfer.fromUserId, title: 'Transfer Approved', message: `Your transfer of ${toDecimal(transfer.amount).toString()} ${transfer.currency} to ${transfer.toUser.email} has been approved`, type: 'SUCCESS', category: 'TRANSFER', isRead: false, metadata: { transferId: transfer.id } } });
      await tx.notification.create({ data: { userId: transfer.toUserId, title: 'Transfer Received', message: `You have received ${toDecimal(transfer.amount).toString()} ${transfer.currency} from ${transfer.fromUser.email}`, type: 'SUCCESS', category: 'TRANSFER', isRead: false, metadata: { transferId: transfer.id } } });
      return { transfer: approvedTransfer };
    });
  }
  static async reject(id: string, actingUserId: string, reason: string): Promise<TransferResult> {
    const transfer = await prisma.transfer.findUnique({ where: { id }, include: { fromUser: true, toUser: true, fromAccount: true, toAccount: true, journal: true } });
    if (!transfer) throw new NotFoundError('Transfer', id);
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) throw new ForbiddenError('Only administrators can reject transfers');
    if (transfer.status !== 'PENDING') throw new ValidationError('Only pending transfers can be rejected');
    const rejectedTransfer = await prisma.transfer.update({
      where: { id },
      data: { status: 'REJECTED' as TransferStatus, rejectedById: actingUserId, rejectedAt: new Date(), rejectionReason: reason },
      include: { fromUser: { select: { id: true, email: true, firstName: true, lastName: true } }, toUser: { select: { id: true, email: true, firstName: true, lastName: true } }, fromAccount: { select: { id: true, accountNumber: true, balance: true, availableBalance: true } }, toAccount: { select: { id: true, accountNumber: true, balance: true, availableBalance: true } }, journal: true },
    });
    await prisma.auditLog.create({ data: { actorId: actingUserId, action: 'REJECT', resourceType: 'TRANSFER', resourceId: transfer.id, oldValues: { status: transfer.status }, newValues: { status: 'REJECTED', reason }, status: 'SUCCESS' } });
    await prisma.notification.create({ data: { userId: transfer.fromUserId, title: 'Transfer Rejected', message: `Your transfer of ${toDecimal(transfer.amount).toString()} ${transfer.currency} to ${transfer.toUser.email} has been rejected. Reason: ${reason}`, type: 'ERROR', category: 'TRANSFER', isRead: false, metadata: { transferId: transfer.id, reason } } });
    return { transfer: rejectedTransfer };
  }
  static async getStats(actingUserId: string): Promise<TransferStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view transfer statistics');
    }
    const totalTransfers = await prisma.transfer.count();
    const byStatus: Record<TransferStatus, number> = { PENDING: 0, COMPLETED: 0, APPROVED: 0, REJECTED: 0, FAILED: 0 };
    const statusCounts = await prisma.transfer.groupBy({ by: ['status'], _count: { _all: true } });
    for (const group of statusCounts) byStatus[group.status as TransferStatus] = group._count._all;
    const byType: Record<TransferType, number> = { INTERNAL: 0, EXTERNAL: 0 };
    const typeCounts = await prisma.transfer.groupBy({ by: ['type'], _count: { _all: true } });
    for (const group of typeCounts) byType[group.type as TransferType] = group._count._all;
    const allTransfers = await prisma.transfer.findMany({ where: { status: { in: ['COMPLETED', 'APPROVED'] as TransferStatus[] } }, select: { amount: true } });
    const totalAmount = allTransfers.reduce((sum, t) => sum.plus(toDecimal(t.amount)), new Decimal(0)).toNumber();
    const averageAmount = allTransfers.length > 0 ? allTransfers.reduce((sum, t) => sum.plus(toDecimal(t.amount)), new Decimal(0)).div(allTransfers.length).toNumber() : 0;
    const pendingApproval = await prisma.transfer.count({ where: { status: 'PENDING' } });
    return { totalTransfers, totalAmount, byStatus, byType, averageAmount, pendingApproval };
  }
}
