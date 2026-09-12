import { prisma } from '../prisma';
import { ForbiddenError, NotFoundError, ValidationError, InsufficientBalanceError } from '../utils/errors';
import { generateReference, generateIdempotencyKey } from '../utils/security';
import type { Deposit, DepositMethod, DepositStatus, User, Account, Journal } from '@prisma/client';

export interface CreateDepositData {
  userId: string;
  accountId: string;
  amount: number;
  currency?: string;
  method: DepositMethod;
  provider?: string;
  providerReference?: string;
  idempotencyKey?: string;
}

export interface DepositResult {
  deposit: Deposit & { account?: Partial<Account>; journal?: Journal };
}

export class DepositService {
  static async createDeposit(data: CreateDepositData, actingUserId?: string): Promise<DepositResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);
    const account = await prisma.account.findUnique({ where: { id: data.accountId } });
    if (!account) throw new NotFoundError('Account', data.accountId);
    if (account.userId !== data.userId) throw new ForbiddenError('Account does not belong to user');
    if (account.status !== 'ACTIVE') throw new ValidationError(`Account is ${account.status.toLowerCase()}`);
    if (data.amount <= 0) throw new ValidationError('Amount must be positive');
    if (data.idempotencyKey) {
      const existing = await prisma.deposit.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
      if (existing) return { deposit: existing };
    }
    const idempotencyKey = data.idempotencyKey || generateIdempotencyKey();
    const reference = generateReference('DEP');
    return await prisma.$transaction(async (tx) => {
      const deposit = await tx.deposit.create({
        data: {
          reference,
          userId: data.userId,
          accountId: data.accountId,
          amount: data.amount,
          currency: data.currency || 'USD',
          method: data.method,
          provider: data.provider,
          providerReference: data.providerReference,
          status: 'PROCESSING' as DepositStatus,
          idempotencyKey,
        },
        include: { account: { select: { id: true, accountNumber: true } } },
      });
      const journal = await tx.journal.create({
        data: {
          reference: generateReference('JNL'),
          description: `Deposit ${reference}`,
          status: 'POSTED' as const,
          depositId: deposit.id,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          journalId: journal.id,
          accountId: data.accountId,
          entryType: 'CREDIT' as const,
          amount: data.amount,
          balance: account.balance.toNumber() + data.amount,
          description: `Deposit ${reference}`,
          transactionId: null,
        },
      });
      await tx.account.update({
        where: { id: data.accountId },
        data: { balance: { increment: data.amount }, availableBalance: { increment: data.amount } },
      });
      const updatedDeposit = await tx.deposit.update({
        where: { id: deposit.id },
        data: { status: 'COMPLETED' as DepositStatus, journalId: journal.id },
        include: { account: { select: { id: true, accountNumber: true } }, journal: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actingUserId || data.userId,
          action: 'CREATE',
          resourceType: 'DEPOSIT',
          resourceId: deposit.id,
          newValues: { reference, accountId: data.accountId, amount: data.amount, method: data.method },
          status: 'SUCCESS',
        },
      });
      return { deposit: updatedDeposit };
    });
  }
  static async getDepositById(id: string, actingUserId?: string): Promise<DepositResult> {
    const deposit = await prisma.deposit.findUnique({
      where: { id },
      include: { account: { select: { id: true, accountNumber: true } }, journal: true },
    });
    if (!deposit) throw new NotFoundError('Deposit', id);
    if (actingUserId && actingUserId !== deposit.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) throw new ForbiddenError('You do not have access to this deposit');
    }
    return { deposit };
  }
  static async getUserDeposits(userId: string, page: number = 1, limit: number = 20, actingUserId?: string): Promise<{ deposits: any[]; total: number; page: number; limit: number; totalPages: number }> {
    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) throw new ForbiddenError('You do not have access to these deposits');
    }
    const deposits = await prisma.deposit.findMany({
      where: { userId },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { account: { select: { id: true, accountNumber: true } } },
    });
    const total = await prisma.deposit.count({ where: { userId } });
    return { deposits, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}