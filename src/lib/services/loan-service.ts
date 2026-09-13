import { prisma } from '../prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { generateReference } from '../utils/security';
import { Decimal } from '@prisma/client/runtime/library';
import type { LoanApplication, LoanApplicationStatus, User, Account } from '@prisma/client';

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

export interface CreateLoanApplicationData {
  userId: string;
  accountId: string;
  requestedAmount: number | string | Decimal;
  termMonths?: number;
  purpose?: string;
}

export interface LoanApplicationResult {
  loanApplication: LoanApplication & { user?: Partial<User>; account?: Partial<Account> };
}

export class LoanService {
  static async createLoanApplication(data: CreateLoanApplicationData, actingUserId?: string): Promise<LoanApplicationResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);
    const account = await prisma.account.findUnique({ where: { id: data.accountId } });
    if (!account) throw new NotFoundError('Account', data.accountId);
    if (account.userId !== data.userId) throw new ForbiddenError('Account does not belong to user');
    
    const requestedAmountDecimal = toDecimal(data.requestedAmount);
    
    if (requestedAmountDecimal.lessThanOrEqual(new Decimal(0))) throw new ValidationError('Requested amount must be positive');
    
    const reference = generateReference('LOAN');
    const loanApplication = await prisma.loanApplication.create({
      data: {
        reference,
        userId: data.userId,
        accountId: data.accountId,
        requestedAmount: requestedAmountDecimal,
        termMonths: data.termMonths || 12,
        purpose: data.purpose,
        status: 'DRAFT' as LoanApplicationStatus,
      },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } }, account: { select: { id: true, accountNumber: true } } },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId || data.userId,
        action: 'CREATE',
        resourceType: 'LOAN_APPLICATION',
        resourceId: loanApplication.id,
        newValues: { reference, requestedAmount: requestedAmountDecimal.toString(), termMonths: data.termMonths },
        status: 'SUCCESS',
      },
    });
    return { loanApplication };
  }
  static async getLoanApplicationById(id: string, actingUserId?: string): Promise<LoanApplicationResult> {
    const loanApplication = await prisma.loanApplication.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } }, account: { select: { id: true, accountNumber: true } } },
    });
    if (!loanApplication) throw new NotFoundError('Loan Application', id);
    if (actingUserId && actingUserId !== loanApplication.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) throw new ForbiddenError('You do not have access to this loan application');
    }
    return { loanApplication };
  }
  static async getUserLoanApplications(userId: string, page: number = 1, limit: number = 20, actingUserId?: string): Promise<{ loanApplications: any[]; total: number; page: number; limit: number; totalPages: number }> {
    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) throw new ForbiddenError('You do not have access to these loan applications');
    }
    const loanApplications = await prisma.loanApplication.findMany({
      where: { userId },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { account: { select: { id: true, accountNumber: true } } },
    });
    const total = await prisma.loanApplication.count({ where: { userId } });
    return { loanApplications, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  static async submitLoanApplication(id: string, actingUserId: string): Promise<LoanApplicationResult> {
    const loanApplication = await prisma.loanApplication.findUnique({ where: { id } });
    if (!loanApplication) throw new NotFoundError('Loan Application', id);
    if (loanApplication.userId !== actingUserId) throw new ForbiddenError('You can only submit your own loan applications');
    if (loanApplication.status !== 'DRAFT') throw new ValidationError('Only draft applications can be submitted');
    const submittedApplication = await prisma.loanApplication.update({
      where: { id },
      data: { status: 'SUBMITTED' as LoanApplicationStatus },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } }, account: { select: { id: true, accountNumber: true } } },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'SUBMIT',
        resourceType: 'LOAN_APPLICATION',
        resourceId: loanApplication.id,
        oldValues: { status: loanApplication.status },
        newValues: { status: 'SUBMITTED' },
        status: 'SUCCESS',
      },
    });
    return { loanApplication: submittedApplication };
  }
  static async approveLoanApplication(id: string, actingUserId: string, approvedAmount?: number | string | Decimal): Promise<LoanApplicationResult> {
    const loanApplication = await prisma.loanApplication.findUnique({ where: { id } });
    if (!loanApplication) throw new NotFoundError('Loan Application', id);
    if (loanApplication.status !== 'SUBMITTED' && loanApplication.status !== 'UNDER_REVIEW') throw new ValidationError('Only submitted or under review applications can be approved');
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) throw new ForbiddenError('Only administrators or operators can approve loan applications');
    
    const approvedAmountDecimal = approvedAmount ? toDecimal(approvedAmount) : toDecimal(loanApplication.requestedAmount);
    
    const approvedApplication = await prisma.loanApplication.update({
      where: { id },
      data: { status: 'APPROVED' as LoanApplicationStatus, approvedAmount: approvedAmountDecimal, reviewedById: actingUserId, reviewedAt: new Date() },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } }, account: { select: { id: true, accountNumber: true } } },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'APPROVE',
        resourceType: 'LOAN_APPLICATION',
        resourceId: loanApplication.id,
        oldValues: { status: loanApplication.status },
        newValues: { status: 'APPROVED', approvedAmount: approvedAmountDecimal.toString() },
        status: 'SUCCESS',
      },
    });
    return { loanApplication: approvedApplication };
  }
  static async rejectLoanApplication(id: string, actingUserId: string, reason: string): Promise<LoanApplicationResult> {
    const loanApplication = await prisma.loanApplication.findUnique({ where: { id } });
    if (!loanApplication) throw new NotFoundError('Loan Application', id);
    if (loanApplication.status !== 'SUBMITTED' && loanApplication.status !== 'UNDER_REVIEW') throw new ValidationError('Only submitted or under review applications can be rejected');
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) throw new ForbiddenError('Only administrators or operators can reject loan applications');
    const rejectedApplication = await prisma.loanApplication.update({
      where: { id },
      data: { status: 'REJECTED' as LoanApplicationStatus, reviewedById: actingUserId, reviewedAt: new Date(), rejectionReason: reason },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } }, account: { select: { id: true, accountNumber: true } } },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'REJECT',
        resourceType: 'LOAN_APPLICATION',
        resourceId: loanApplication.id,
        oldValues: { status: loanApplication.status },
        newValues: { status: 'REJECTED', reason },
        status: 'SUCCESS',
      },
    });
    return { loanApplication: rejectedApplication };
  }
}