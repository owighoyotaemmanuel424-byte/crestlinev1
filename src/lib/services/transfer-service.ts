import { prisma } from '../prisma';
import { ForbiddenError, NotFoundError, ValidationError, InsufficientBalanceError, TransferError, IdempotencyError } from '../utils/errors';
import { generateReference, generateIdempotencyKey } from '../utils/security';
import { Decimal } from '@prisma/client/runtime/library';
import type { Transfer, TransferStatus, RiskStatus, Account, User, Journal, LedgerEntry, Beneficiary } from '@prisma/client';

export interface CreateTransferData {
  fromUserId: string;
  fromAccountId: string;
  toUserId?: string;
  toAccountId?: string;
  beneficiaryId?: string;
  amount: number | string | Decimal;
  currency?: string;
  description?: string;
  idempotencyKey?: string;
  riskStatus?: RiskStatus;
}

export interface TransferResult {
  transfer: Transfer & { fromAccount?: Partial<Account>; toAccount?: Partial<Account>; journal?: Journal; ledgerEntries?: LedgerEntry[] };
}

export interface TransferListResult {
  transfers: (Transfer & { fromAccount?: Partial<Account>; toAccount?: Partial<Account> })[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

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

export class TransferService {
  static async createTransfer(data: CreateTransferData, actingUserId?: string): Promise<TransferResult> {
    const fromUser = await prisma.user.findUnique({ where: { id: data.fromUserId } });
    if (!fromUser) throw new NotFoundError('User', data.fromUserId);
    const fromAccount = await prisma.account.findUnique({ where: { id: data.fromAccountId } });
    if (!fromAccount) throw new NotFoundError('Account', data.fromAccountId);
    if (fromAccount.userId !== data.fromUserId) throw new ForbiddenError('Account does not belong to user');
    if (fromAccount.status !== 'ACTIVE') throw new ValidationError(`Source account is ${fromAccount.status.toLowerCase()}`);
    
    // Convert amount to Decimal for safe arithmetic
    const amountDecimal = toDecimal(data.amount);
    
    // Validate amount is positive
    if (amountDecimal.lessThanOrEqual(new Decimal(0))) throw new ValidationError('Amount must be positive');
    
    // Check sufficient balance using Decimal comparison
    const availableBalanceDecimal = toDecimal(fromAccount.availableBalance);
    if (availableBalanceDecimal.lessThan(amountDecimal)) {
      throw new InsufficientBalanceError(
        fromAccount.id,
        amountDecimal.toNumber(),
        availableBalanceDecimal.toNumber()
      );
    }
    
    if (data.idempotencyKey) {
      const existing = await prisma.transfer.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
      if (existing) throw new IdempotencyError('Transfer with this idempotency key already exists');
    }
    
    const idempotencyKey = data.idempotencyKey || generateIdempotencyKey();
    const reference = generateReference('XFR');
    let toAccount: Account | null = null;
    let toUser: User | null = null;
    
    if (data.toAccountId) {
      toAccount = await prisma.account.findUnique({ where: { id: data.toAccountId } });
      if (!toAccount) throw new NotFoundError('Account', data.toAccountId);
      if (toAccount.status !== 'ACTIVE') throw new ValidationError(`Destination account is ${toAccount.status.toLowerCase()}`);
      toUser = await prisma.user.findUnique({ where: { id: toAccount.userId } });
    } else if (data.beneficiaryId) {
      const beneficiary = await prisma.beneficiary.findUnique({ where: { id: data.beneficiaryId } });
      if (!beneficiary) throw new NotFoundError('Beneficiary', data.beneficiaryId);
      if (beneficiary.userId !== data.fromUserId) throw new ForbiddenError('Beneficiary does not belong to user');
      if (beneficiary.status !== 'ACTIVE') throw new ValidationError(`Beneficiary is ${beneficiary.status.toLowerCase()}`);
    } else if (data.toUserId) {
      toUser = await prisma.user.findUnique({ where: { id: data.toUserId } });
      if (!toUser) throw new NotFoundError('User', data.toUserId);
      toAccount = await prisma.account.findFirst({ where: { userId: data.toUserId } });
      if (!toAccount) throw new NotFoundError('Account for recipient user');
    }
    
    if (!toAccount && !data.beneficiaryId) throw new ValidationError('Must specify toAccountId, toUserId, or beneficiaryId');
    
    return await prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.create({
        data: {
          reference,
          fromUserId: data.fromUserId,
          toUserId: toUser?.id || data.toUserId,
          fromAccountId: data.fromAccountId,
          toAccountId: toAccount?.id || data.toAccountId,
          amount: amountDecimal,
          currency: data.currency || 'USD',
          description: data.description,
          status: 'PROCESSING' as TransferStatus,
          riskStatus: data.riskStatus || 'LOW' as RiskStatus,
          idempotencyKey,
          beneficiaryId: data.beneficiaryId
        },
        include: {
          fromAccount: { select: { id: true, accountNumber: true, userId: true } },
          toAccount: { select: { id: true, accountNumber: true, userId: true } }
        },
      });
      
      const journal = await tx.journal.create({
        data: {
          reference: generateReference('JNL'),
          description: `Transfer ${reference}`,
          status: 'POSTED' as const,
          transferId: transfer.id
        }
      });
      
      // Use Decimal arithmetic for ledger entry balances
      const fromAccountBalance = toDecimal(fromAccount.balance);
      const toAccountBalance = toAccount ? toDecimal(toAccount.balance) : new Decimal(0);
      const newFromBalance = fromAccountBalance.minus(amountDecimal);
      const newToBalance = toAccountBalance.plus(amountDecimal);
      
      await tx.ledgerEntry.createMany({
        data: [
          {
            journalId: journal.id,
            accountId: data.fromAccountId,
            entryType: 'DEBIT' as const,
            amount: amountDecimal,
            balance: newFromBalance,
            description: `Transfer ${reference} - Debit`,
            transactionId: null
          },
          {
            journalId: journal.id,
            accountId: toAccount?.id || data.toAccountId!,
            entryType: 'CREDIT' as const,
            amount: amountDecimal,
            balance: newToBalance,
            description: `Transfer ${reference} - Credit`,
            transactionId: null
          }
        ]
      });
      
      // Prisma handles Decimal arithmetic for increment/decrement operations
      await tx.account.update({
        where: { id: data.fromAccountId },
        data: {
          balance: { decrement: amountDecimal },
          availableBalance: { decrement: amountDecimal }
        }
      });
      
      if (toAccount) {
        await tx.account.update({
          where: { id: toAccount.id },
          data: {
            balance: { increment: amountDecimal },
            availableBalance: { increment: amountDecimal }
          }
        });
      }
      
      const updatedTransfer = await tx.transfer.update({
        where: { id: transfer.id },
        data: { status: 'COMPLETED' as TransferStatus },
        include: {
          fromAccount: { select: { id: true, accountNumber: true, userId: true } },
          toAccount: { select: { id: true, accountNumber: true, userId: true } },
          journal: true,
          ledgerEntries: true
        }
      });
      
      await tx.auditLog.create({
        data: {
          actorId: actingUserId || data.fromUserId,
          action: 'CREATE',
          resourceType: 'TRANSFER',
          resourceId: transfer.id,
          newValues: {
            reference,
            fromAccountId: data.fromAccountId,
            toAccountId: toAccount?.id || data.toAccountId,
            amount: amountDecimal.toString()
          },
          status: 'SUCCESS'
        }
      });
      
      return { transfer: updatedTransfer };
    });
  }

  static async getTransferById(id: string, actingUserId?: string): Promise<TransferResult> {
    const transfer = await prisma.transfer.findUnique({
      where: { id },
      include: {
        fromAccount: { select: { id: true, accountNumber: true, userId: true } },
        toAccount: { select: { id: true, accountNumber: true, userId: true } },
        journal: true,
        ledgerEntries: true,
        beneficiary: true
      }
    });
    if (!transfer) throw new NotFoundError('Transfer', id);
    if (actingUserId && actingUserId !== transfer.fromUserId && actingUserId !== transfer.toUserId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this transfer');
      }
    }
    return { transfer };
  }

  static async getUserTransfers(userId: string, page: number = 1, limit: number = 20, status?: TransferStatus, riskStatus?: RiskStatus, actingUserId?: string): Promise<TransferListResult> {
    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these transfers');
      }
    }
    const where: any = { OR: [{ fromUserId: userId }, { toUserId: userId }] };
    if (status) where.status = status;
    if (riskStatus) where.riskStatus = riskStatus;
    const transfers = await prisma.transfer.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        fromAccount: { select: { id: true, accountNumber: true } },
        toAccount: { select: { id: true, accountNumber: true } }
      }
    });
    const total = await prisma.transfer.count({ where });
    return {
      transfers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  static async getAccountTransfers(accountId: string, page: number = 1, limit: number = 20, actingUserId?: string): Promise<TransferListResult> {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundError('Account', accountId);
    if (actingUserId && actingUserId !== account.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this account transfers');
      }
    }
    const transfers = await prisma.transfer.findMany({
      where: { OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        fromAccount: { select: { id: true, accountNumber: true } },
        toAccount: { select: { id: true, accountNumber: true } }
      }
    });
    const total = await prisma.transfer.count({ where: { OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] } });
    return {
      transfers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  static async cancelTransfer(id: string, actingUserId: string): Promise<TransferResult> {
    const transfer = await prisma.transfer.findUnique({ where: { id } });
    if (!transfer) throw new NotFoundError('Transfer', id);
    if (transfer.status !== 'PENDING' && transfer.status !== 'PROCESSING') {
      throw new ValidationError('Only pending or processing transfers can be cancelled');
    }
    if (actingUserId !== transfer.fromUserId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('Only the sender or administrator can cancel this transfer');
      }
    }
    return await prisma.$transaction(async (tx) => {
      const cancelledTransfer = await tx.transfer.update({
        where: { id },
        data: { status: 'CANCELLED' as TransferStatus },
        include: {
          fromAccount: { select: { id: true, accountNumber: true } },
          toAccount: { select: { id: true, accountNumber: true } },
          journal: true,
          ledgerEntries: true
        }
      });
      await tx.journal.updateMany({
        where: { transferId: id },
        data: { status: 'VOIDED' as const }
      });
      await tx.auditLog.create({
        data: {
          actorId: actingUserId,
          action: 'CANCEL',
          resourceType: 'TRANSFER',
          resourceId: transfer.id,
          oldValues: { status: transfer.status },
          newValues: { status: 'CANCELLED' },
          status: 'SUCCESS'
        }
      });
      return { transfer: cancelledTransfer };
    });
  }

  static async getTransferStats(userId: string, actingUserId?: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byRiskStatus: Record<string, number>;
    totalAmount: number;
  }> {
    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these statistics');
      }
    }
    const [total, byStatus, byRiskStatus, totalAmount] = await Promise.all([
      prisma.transfer.count({ where: { OR: [{ fromUserId: userId }, { toUserId: userId }] } }),
      prisma.transfer.groupBy({
        by: ['status'],
        where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
        _count: { _all: true }
      }),
      prisma.transfer.groupBy({
        by: ['riskStatus'],
        where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
        _count: { _all: true }
      }),
      prisma.transfer.aggregate({
        where: {
          OR: [{ fromUserId: userId }, { toUserId: userId }],
          status: 'COMPLETED' as TransferStatus
        },
        _sum: { amount: true }
      }),
    ]);
    const statusStats: Record<string, number> = {};
    for (const group of byStatus) statusStats[group.status] = group._count._all;
    const riskStats: Record<string, number> = {};
    for (const group of byRiskStatus) riskStats[group.riskStatus] = group._count._all;
    return {
      total,
      byStatus: statusStats,
      byRiskStatus: riskStats,
      totalAmount: totalAmount._sum.amount?.toNumber() || 0
    };
  }
}