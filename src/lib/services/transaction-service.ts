import { prisma } from '../prisma';
import { ForbiddenError, NotFoundError, ValidationError, InsufficientBalanceError } from '../utils/errors';
import { generateReference, generateIdempotencyKey } from '../utils/security';
import type { Transaction, TransactionType, TransactionStatus, Account, User, Journal, LedgerEntry } from '@prisma/client';

export interface CreateTransactionData {
  userId: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  currency?: string;
  description?: string;
  category?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface TransactionResult {
  transaction: Transaction & { account?: Partial<Account>; journal?: Journal; ledgerEntries?: LedgerEntry[] };
}

export interface TransactionListResult {
  transactions: (Transaction & { account?: Partial<Account> })[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class TransactionService {
  static async createTransaction(data: CreateTransactionData, actingUserId?: string): Promise<TransactionResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);
    const account = await prisma.account.findUnique({ where: { id: data.accountId } });
    if (!account) throw new NotFoundError('Account', data.accountId);
    if (account.userId !== data.userId) throw new ForbiddenError('Account does not belong to user');
    if (account.status !== 'ACTIVE') throw new ValidationError(`Account is ${account.status.toLowerCase()}`);
    if (data.amount <= 0) throw new ValidationError('Amount must be positive');
    if (data.idempotencyKey) {
      const existing = await prisma.transaction.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
      if (existing) return { transaction: existing };
    }
    const idempotencyKey = data.idempotencyKey || generateIdempotencyKey();
    const reference = generateReference('TXN');
    return await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: { reference, userId: data.userId, accountId: data.accountId, type: data.type, amount: data.amount, currency: data.currency || 'USD', description: data.description, category: data.category, metadata: data.metadata as any, status: 'COMPLETED' as TransactionStatus, idempotencyKey },
        include: { account: { select: { id: true, accountNumber: true, userId: true } } },
      });
      const journal = await tx.journal.create({ data: { reference: generateReference('JNL'), description: `Transaction ${reference}`, status: 'POSTED' as const, transactionId: transaction.id } });
      await tx.ledgerEntry.create({ data: { journalId: journal.id, accountId: data.accountId, entryType: data.type === 'DEPOSIT' || data.type.includes('CREDIT') ? 'CREDIT' : 'DEBIT' as any, amount: data.amount, balance: 0, description: data.description || `Transaction ${reference}`, transactionId: transaction.id } });
      await tx.auditLog.create({ data: { actorId: actingUserId || data.userId, action: 'CREATE', resourceType: 'TRANSACTION', resourceId: transaction.id, newValues: { reference, type: data.type, amount: data.amount }, status: 'SUCCESS' } });
      return { transaction };
    });
  }
  static async getTransactionById(id: string, actingUserId?: string): Promise<TransactionResult> {
    const transaction = await prisma.transaction.findUnique({ where: { id }, include: { account: { select: { id: true, accountNumber: true, userId: true } }, journal: true, ledgerEntries: true, fees: true } });
    if (!transaction) throw new NotFoundError('Transaction', id);
    if (actingUserId && actingUserId !== transaction.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) throw new ForbiddenError('You do not have access to this transaction');
    }
    return { transaction };
  }
  static async getUserTransactions(userId: string, page: number = 1, limit: number = 20, search?: string, type?: TransactionType, status?: TransactionStatus, startDate?: Date, endDate?: Date, actingUserId?: string): Promise<TransactionListResult> {
    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) throw new ForbiddenError('You do not have access to these transactions');
    }
    const where: any = { userId };
    if (search) where.description = { contains: search, mode: 'insensitive' };
    if (type) where.type = type;
    if (status) where.status = status;
    if (startDate || endDate) { where.createdAt = {}; if (startDate) where.createdAt.gte = startDate; if (endDate) where.createdAt.lte = endDate; }
    const transactions = await prisma.transaction.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: { account: { select: { id: true, accountNumber: true } } } });
    const total = await prisma.transaction.count({ where });
    return { transactions, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  static async getAccountTransactions(accountId: string, page: number = 1, limit: number = 20, actingUserId?: string): Promise<TransactionListResult> {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundError('Account', accountId);
    if (actingUserId && actingUserId !== account.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) throw new ForbiddenError('You do not have access to this account transactions');
    }
    const transactions = await prisma.transaction.findMany({ where: { accountId }, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: { account: { select: { id: true, accountNumber: true } } } });
    const total = await prisma.transaction.count({ where: { accountId } });
    return { transactions, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  static async reverseTransaction(id: string, actingUserId: string, reason?: string): Promise<TransactionResult> {
    const transaction = await prisma.transaction.findUnique({ where: { id } });
    if (!transaction) throw new NotFoundError('Transaction', id);
    if (transaction.status !== 'COMPLETED') throw new ValidationError('Only completed transactions can be reversed');
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) throw new ForbiddenError('Only administrators can reverse transactions');
    return await prisma.$transaction(async (tx) => {
      const reversedTransaction = await tx.transaction.update({ where: { id }, data: { status: 'REVERSED' as TransactionStatus }, include: { account: { select: { id: true, accountNumber: true } }, journal: true, ledgerEntries: true } });
      await tx.journal.updateMany({ where: { transactionId: id }, data: { status: 'REVERSED' as const } });
      await tx.auditLog.create({ data: { actorId: actingUserId, action: 'REVERSE', resourceType: 'TRANSACTION', resourceId: transaction.id, oldValues: { status: transaction.status }, newValues: { status: 'REVERSED', reason }, status: 'SUCCESS' } });
      return { transaction: reversedTransaction };
    });
  }
  static async getTransactionStats(userId: string, actingUserId?: string): Promise<{ total: number; byType: Record<string, number>; byStatus: Record<string, number>; totalAmount: number; }> {
    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) throw new ForbiddenError('You do not have access to these statistics');
    }
    const [total, byType, byStatus, totalAmount] = await Promise.all([
      prisma.transaction.count({ where: { userId } }),
      prisma.transaction.groupBy({ by: ['type'], where: { userId }, _count: { _all: true } }),
      prisma.transaction.groupBy({ by: ['status'], where: { userId }, _count: { _all: true } }),
      prisma.transaction.aggregate({ where: { userId, type: { in: ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER'] as TransactionType[] } }, _sum: { amount: true } }),
    ]);
    const typeStats: Record<string, number> = {};
    for (const group of byType) typeStats[group.type] = group._count._all;
    const statusStats: Record<string, number> = {};
    for (const group of byStatus) statusStats[group.status] = group._count._all;
    return { total, byType: typeStats, byStatus: statusStats, totalAmount: totalAmount._sum.amount?.toNumber() || 0 };
  }
}