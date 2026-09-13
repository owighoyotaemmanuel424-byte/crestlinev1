import { prisma } from '../prisma';
import { ForbiddenError, NotFoundError, ValidationError, InsufficientBalanceError, AccountFrozenError } from '../utils/errors';
import { generateReference, generateIdempotencyKey } from '../utils/security';
import { Decimal } from '@prisma/client/runtime/library';
import type { Withdrawal, WithdrawalMethod, WithdrawalStatus, RiskStatus, User, Account, Journal } from '@prisma/client';

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

export interface CreateWithdrawalData {
  userId: string;
  accountId: string;
  amount: number | string | Decimal;
  currency?: string;
  method: WithdrawalMethod;
  destination?: string;
  provider?: string;
  providerReference?: string;
  idempotencyKey?: string;
}

export interface WithdrawalResult {
  withdrawal: Withdrawal & { account?: Partial<Account>; journal?: Journal };
}

export class WithdrawalService {
  static async createWithdrawal(data: CreateWithdrawalData, actingUserId?: string): Promise<WithdrawalResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);
    const account = await prisma.account.findUnique({ where: { id: data.accountId } });
    if (!account) throw new NotFoundError('Account', data.accountId);
    if (account.userId !== data.userId) throw new ForbiddenError('Account does not belong to user');
    if (account.status !== 'ACTIVE') throw new AccountFrozenError(data.accountId);
    if (account.status === 'FROZEN') throw new AccountFrozenError(data.accountId);
    
    const amountDecimal = toDecimal(data.amount);
    
    if (amountDecimal.lessThanOrEqual(new Decimal(0))) throw new ValidationError('Amount must be positive');
    
    const availableBalanceDecimal = toDecimal(account.availableBalance);
    if (availableBalanceDecimal.lessThan(amountDecimal)) {
      throw new InsufficientBalanceError(
        account.id,
        amountDecimal.toNumber(),
        availableBalanceDecimal.toNumber()
      );
    }
    
    if (data.idempotencyKey) {
      const existing = await prisma.withdrawal.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
      if (existing) return { withdrawal: existing };
    }
    const idempotencyKey = data.idempotencyKey || generateIdempotencyKey();
    const reference = generateReference('WDR');
    return await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.create({
        data: {
          reference,
          userId: data.userId,
          accountId: data.accountId,
          amount: amountDecimal,
          currency: data.currency || 'USD',
          method: data.method,
          destination: data.destination,
          provider: data.provider,
          providerReference: data.providerReference,
          status: 'PROCESSING' as WithdrawalStatus,
          riskStatus: 'LOW' as RiskStatus,
          idempotencyKey,
        },
        include: { account: { select: { id: true, accountNumber: true } } },
      });
      const journal = await tx.journal.create({
        data: {
          reference: generateReference('JNL'),
          description: `Withdrawal ${reference}`,
          status: 'POSTED' as const,
          withdrawalId: withdrawal.id,
        },
      });
      
      const accountBalance = toDecimal(account.balance);
      const newBalance = accountBalance.minus(amountDecimal);
      
      await tx.ledgerEntry.create({
        data: {
          journalId: journal.id,
          accountId: data.accountId,
          entryType: 'DEBIT' as const,
          amount: amountDecimal,
          balance: newBalance,
          description: `Withdrawal ${reference}`,
          transactionId: null,
        },
      });
      await tx.account.update({
        where: { id: data.accountId },
        data: { balance: { decrement: amountDecimal }, availableBalance: { decrement: amountDecimal } },
      });
      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawal.id },
        data: { status: 'COMPLETED' as WithdrawalStatus, journalId: journal.id },
        include: { account: { select: { id: true, accountNumber: true } }, journal: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actingUserId || data.userId,
          action: 'CREATE',
          resourceType: 'WITHDRAWAL',
          resourceId: withdrawal.id,
          newValues: { reference, accountId: data.accountId, amount: amountDecimal.toString(), method: data.method },
          status: 'SUCCESS',
        },
      });
      return { withdrawal: updatedWithdrawal };
    });
  }
  static async getWithdrawalById(id: string, actingUserId?: string): Promise<WithdrawalResult> {
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id },
      include: { account: { select: { id: true, accountNumber: true } }, journal: true },
    });
    if (!withdrawal) throw new NotFoundError('Withdrawal', id);
    if (actingUserId && actingUserId !== withdrawal.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) throw new ForbiddenError('You do not have access to this withdrawal');
    }
    return { withdrawal };
  }
  static async getUserWithdrawals(userId: string, page: number = 1, limit: number = 20, actingUserId?: string): Promise<{ withdrawals: any[]; total: number; page: number; limit: number; totalPages: number }> {
    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) throw new ForbiddenError('You do not have access to these withdrawals');
    }
    const withdrawals = await prisma.withdrawal.findMany({
      where: { userId },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { account: { select: { id: true, accountNumber: true } } },
    });
    const total = await prisma.withdrawal.count({ where: { userId } });
    return { withdrawals, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  static async approveWithdrawal(id: string, actingUserId: string): Promise<WithdrawalResult> {
    const withdrawal = await prisma.withdrawal.findUnique({ where: { id } });
    if (!withdrawal) throw new NotFoundError('Withdrawal', id);
    if (withdrawal.status !== 'PENDING') throw new ValidationError('Only pending withdrawals can be approved');
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) throw new ForbiddenError('Only administrators or operators can approve withdrawals');
    const approvedWithdrawal = await prisma.withdrawal.update({
      where: { id },
      data: { status: 'APPROVED' as WithdrawalStatus, reviewedById: actingUserId, reviewedAt: new Date() },
      include: { account: { select: { id: true, accountNumber: true } }, journal: true },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'APPROVE',
        resourceType: 'WITHDRAWAL',
        resourceId: withdrawal.id,
        oldValues: { status: withdrawal.status },
        newValues: { status: 'APPROVED' },
        status: 'SUCCESS',
      },
    });
    return { withdrawal: approvedWithdrawal };
  }
  static async rejectWithdrawal(id: string, actingUserId: string, reason: string): Promise<WithdrawalResult> {
    const withdrawal = await prisma.withdrawal.findUnique({ where: { id } });
    if (!withdrawal) throw new NotFoundError('Withdrawal', id);
    if (withdrawal.status !== 'PENDING') throw new ValidationError('Only pending withdrawals can be rejected');
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) throw new ForbiddenError('Only administrators or operators can reject withdrawals');
    const rejectedWithdrawal = await prisma.withdrawal.update({
      where: { id },
      data: { status: 'REJECTED' as WithdrawalStatus, reviewedById: actingUserId, reviewedAt: new Date(), reviewNotes: reason },
      include: { account: { select: { id: true, accountNumber: true } }, journal: true },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'REJECT',
        resourceType: 'WITHDRAWAL',
        resourceId: withdrawal.id,
        oldValues: { status: withdrawal.status },
        newValues: { status: 'REJECTED', reason },
        status: 'SUCCESS',
      },
    });
    return { withdrawal: rejectedWithdrawal };
  }
}