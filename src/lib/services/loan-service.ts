import { prisma } from '../prisma';
import { generateReference } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  InsufficientBalanceError,
  LoanError,
} from '../utils/errors';
import { AccountService } from './account-service';
import { LedgerService } from './ledger-service';
import { Decimal } from '@prisma/client/runtime/library';
import type {
  User,
  Account,
  Loan,
  LoanStatus,
  LoanType,
  RepaymentFrequency,
  Role,
  Currency,
  Journal,
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

const LOAN_CONFIG = {
  MIN_LOAN_AMOUNT: new Decimal(100),
  MAX_LOAN_AMOUNT: new Decimal(1000000),
  MIN_DURATION_DAYS: 30,
  MAX_DURATION_DAYS: 3650,
  DEFAULT_CURRENCY: 'USD' as Currency,
  SUPPORTED_TYPES: ['PERSONAL', 'BUSINESS', 'MORTGAGE', 'AUTO', 'EDUCATION', 'PAYDAY'] as LoanType[],
  INTEREST_RATES: {
    PERSONAL: new Decimal(0.12), // 12%
    BUSINESS: new Decimal(0.10), // 10%
    MORTGAGE: new Decimal(0.08), // 8%
    AUTO: new Decimal(0.09), // 9%
    EDUCATION: new Decimal(0.07), // 7%
    PAYDAY: new Decimal(0.15), // 15%
  },
  REPAYMENT_FREQUENCIES: ['MONTHLY', 'BIWEEKLY', 'WEEKLY', 'QUARTERLY', 'ANNUALLY'] as RepaymentFrequency[],
  MAX_DESCRIPTION_LENGTH: 1000,
  PROCESSING_FEE_PERCENTAGE: new Decimal(0.01), // 1%
  PROCESSING_FEE_MINIMUM: new Decimal(10),
  PROCESSING_FEE_MAXIMUM: new Decimal(1000),
  LATE_FEE_PERCENTAGE: new Decimal(0.02), // 2% per day
  LATE_FEE_MAXIMUM: new Decimal(100),
} as const;

export interface CreateLoanData {
  userId: string;
  accountId: string;
  loanType: LoanType;
  amount: number | string | Decimal;
  durationDays: number;
  repaymentFrequency?: RepaymentFrequency;
  currency?: Currency;
  description?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
}

export interface LoanResult {
  loan: Loan & {
    user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
    account: Pick<Account, 'id' | 'accountNumber' | 'balance' | 'availableBalance'>;
    journal?: Journal | null;
  };
}

export interface LoanRepaymentData {
  loanId: string;
  amount: number | string | Decimal;
  reference?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface LoanListResult {
  loans: Loan[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LoanStats {
  totalLoans: number;
  totalAmount: number;
  totalDisbursed: number;
  totalRepaid: number;
  totalOutstanding: number;
  byStatus: Record<LoanStatus, number>;
  byType: Record<LoanType, number>;
  averageAmount: number;
  overdueLoans: number;
  activeLoans: number;
}

export class LoanService {
  /**
   * Create a new loan
   */
  static async createLoan(
    data: CreateLoanData,
    actingUserId?: string
  ): Promise<LoanResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    // Authorization check
    if (actingUserId && actingUserId !== data.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You can only create loans for yourself');
      }
    }

    const account = await prisma.account.findUnique({ where: { id: data.accountId } });
    if (!account) throw new NotFoundError('Account', data.accountId);
    if (account.userId !== data.userId) {
      throw new ForbiddenError('Account does not belong to user');
    }

    // Check account status
    if (account.status !== 'ACTIVE') {
      throw new ValidationError(`Account is ${account.status.toLowerCase()}`);
    }

    // Validate loan type
    if (!LOAN_CONFIG.SUPPORTED_TYPES.includes(data.loanType)) {
      throw new ValidationError(
        `Unsupported loan type. Supported: ${LOAN_CONFIG.SUPPORTED_TYPES.join(', ')}`
      );
    }

    // Validate amount using Decimal
    const amount = toDecimal(data.amount);
    if (amount.lessThanOrEqual(new Decimal(0))) {
      throw new ValidationError('Amount must be positive');
    }
    if (amount.lessThan(LOAN_CONFIG.MIN_LOAN_AMOUNT)) {
      throw new ValidationError(
        `Minimum loan amount is ${LOAN_CONFIG.MIN_LOAN_AMOUNT.toString()}`
      );
    }
    if (amount.greaterThan(LOAN_CONFIG.MAX_LOAN_AMOUNT)) {
      throw new ValidationError(
        `Maximum loan amount is ${LOAN_CONFIG.MAX_LOAN_AMOUNT.toString()}`
      );
    }

    // Validate duration
    if (data.durationDays < LOAN_CONFIG.MIN_DURATION_DAYS) {
      throw new ValidationError(
        `Minimum loan duration is ${LOAN_CONFIG.MIN_DURATION_DAYS} days`
      );
    }
    if (data.durationDays > LOAN_CONFIG.MAX_DURATION_DAYS) {
      throw new ValidationError(
        `Maximum loan duration is ${LOAN_CONFIG.MAX_DURATION_DAYS} days`
      );
    }

    // Validate currency
    const currency = data.currency || account.currency;

    // Get interest rate
    const interestRate = LOAN_CONFIG.INTEREST_RATES[data.loanType];

    // Calculate repayment frequency
    const repaymentFrequency = data.repaymentFrequency || 'MONTHLY';

    // Calculate total interest using Decimal arithmetic
    const totalInterest = amount.times(interestRate).times(new Decimal(data.durationDays / 365));
    const totalRepayment = amount.plus(totalInterest);

    // Calculate processing fee using Decimal arithmetic
    const processingFeeAmount = amount.times(LOAN_CONFIG.PROCESSING_FEE_PERCENTAGE);
    const processingFee = processingFeeAmount.lessThan(LOAN_CONFIG.PROCESSING_FEE_MINIMUM)
      ? LOAN_CONFIG.PROCESSING_FEE_MINIMUM
      : processingFeeAmount.greaterThan(LOAN_CONFIG.PROCESSING_FEE_MAXIMUM)
        ? LOAN_CONFIG.PROCESSING_FEE_MAXIMUM
        : processingFeeAmount;

    const netDisbursement = amount.minus(processingFee);

    // Check sufficient balance for processing fee using Decimal comparison
    const availableBalance = toDecimal(account.availableBalance);
    if (availableBalance.lessThan(processingFee)) {
      throw new InsufficientBalanceError(
        account.id,
        processingFee.toNumber(),
        availableBalance.toNumber()
      );
    }

    // Calculate maturity date
    const maturityDate = new Date();
    maturityDate.setDate(maturityDate.getDate() + data.durationDays);

    // Generate reference
    const reference = data.reference || generateReference('LOAN');

    // Create loan
    return await prisma.$transaction(async (tx) => {
      const loan = await tx.loan.create({
        data: {
          reference,
          userId: data.userId,
          accountId: data.accountId,
          loanType: data.loanType,
          amount: amount,
          currency,
          durationDays: data.durationDays,
          interestRate,
          totalInterest,
          totalRepayment,
          repaymentFrequency,
          maturityDate,
          processingFee,
          netDisbursement,
          status: 'APPROVED' as LoanStatus,
          description: data.description || null,
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
              balance: true,
              availableBalance: true,
            },
          },
          journal: true,
        },
      });

      // Create ledger entry for processing fee using Decimal
      await LedgerService.createJournal({
        reference: generateReference('LOAN-FEE'),
        description: `Loan processing fee ${reference} - ${processingFee.toString()} ${currency}`,
        entries: [
          {
            accountId: data.accountId,
            entryType: 'DEBIT',
            amount: processingFee,
            description: `Loan processing fee for ${reference}`,
            transactionId: loan.id,
          },
        ],
        loanId: loan.id,
        metadata: {
          loanId: loan.id,
          accountId: data.accountId,
          processingFee: processingFee.toString(),
          currency,
        },
      }, actingUserId);

      // Update account balance for processing fee using Decimal arithmetic
      await AccountService.updateBalance({
        accountId: data.accountId,
        amount: processingFee,
        operation: 'FEE',
        reference: loan.reference,
        description: 'Loan processing fee',
        metadata: { loanId: loan.id },
      }, actingUserId);

      // Create ledger entry for disbursement using Decimal
      await LedgerService.createJournal({
        reference: generateReference('LOAN-DIS'),
        description: `Loan disbursement ${reference} - ${netDisbursement.toString()} ${currency}`,
        entries: [
          {
            accountId: data.accountId,
            entryType: 'CREDIT',
            amount: netDisbursement,
            description: `Loan disbursement ${reference} - Net: ${netDisbursement.toString()}`,
            transactionId: loan.id,
          },
        ],
        loanId: loan.id,
        metadata: {
          loanId: loan.id,
          accountId: data.accountId,
          netDisbursement: netDisbursement.toString(),
          currency,
        },
      }, actingUserId);

      // Update account balance for disbursement using Decimal arithmetic
      await AccountService.updateBalance({
        accountId: data.accountId,
        amount: netDisbursement,
        operation: 'DEPOSIT',
        reference: loan.reference,
        description: 'Loan disbursement',
        metadata: { loanId: loan.id },
      }, actingUserId);

      // Log audit event
      await tx.auditLog.create({
        data: {
          actorId: actingUserId || data.userId,
          action: 'CREATE',
          resourceType: 'LOAN',
          resourceId: loan.id,
          newValues: {
            reference,
            userId: data.userId,
            accountId: data.accountId,
            loanType: data.loanType,
            amount: amount.toString(),
            currency,
            durationDays: data.durationDays,
            interestRate: interestRate.toString(),
            totalInterest: totalInterest.toString(),
            totalRepayment: totalRepayment.toString(),
            processingFee: processingFee.toString(),
            netDisbursement: netDisbursement.toString(),
            maturityDate: maturityDate.toISOString(),
          },
          metadata: data.metadata,
          status: 'SUCCESS',
        },
      });

      // Send notification
      await tx.notification.create({
        data: {
          userId: data.userId,
          title: 'Loan Approved and Disbursed',
          message: `Your ${data.loanType} loan of ${amount.toString()} ${currency} has been approved and disbursed. Net amount: ${netDisbursement.toString()} ${currency}. Total repayment: ${totalRepayment.toString()} ${currency}. Maturity: ${maturityDate.toDateString()}`,
          type: 'SUCCESS',
          category: 'LOAN',
          isRead: false,
          metadata: { loanId: loan.id },
        },
      });

      return { loan };
    });
  }

  /**
   * Make loan repayment
   */
  static async makeRepayment(
    data: LoanRepaymentData,
    actingUserId: string
  ): Promise<LoanResult> {
    const loan = await prisma.loan.findUnique({
      where: { id: data.loanId },
      include: {
        user: true,
        account: true,
      },
    });

    if (!loan) throw new NotFoundError('Loan', data.loanId);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || actingUser.id !== loan.userId) {
      throw new ForbiddenError('You can only make repayments for your own loans');
    }

    if (loan.status !== 'APPROVED' && loan.status !== 'ACTIVE') {
      throw new ValidationError('Only approved or active loans can receive repayments');
    }

    // Validate amount using Decimal
    const amount = toDecimal(data.amount);
    if (amount.lessThanOrEqual(new Decimal(0))) {
      throw new ValidationError('Amount must be positive');
    }

    // Check if repayment exceeds remaining balance using Decimal comparison
    const remainingAmount = toDecimal(loan.totalRepayment).minus(toDecimal(loan.totalRepaid || 0));
    if (amount.greaterThan(remainingAmount)) {
      throw new ValidationError(
        `Repayment amount cannot exceed remaining balance of ${remainingAmount.toString()} ${loan.currency}`
      );
    }

    // Check sufficient balance using Decimal comparison
    const account = loan.account;
    const availableBalance = toDecimal(account.availableBalance);
    if (availableBalance.lessThan(amount)) {
      throw new InsufficientBalanceError(
        account.id,
        amount.toNumber(),
        availableBalance.toNumber()
      );
    }

    const reference = data.reference || generateReference('LOAN-REP');

    return await prisma.$transaction(async (tx) => {
      // Update loan repayment
      const updatedLoan = await tx.loan.update({
        where: { id: data.loanId },
        data: {
          totalRepaid: {
            increment: amount,
          },
          lastRepaymentAt: new Date(),
          lastRepaymentAmount: amount,
          status: remainingAmount.minus(amount).lessThanOrEqual(new Decimal(0)) ? 'COMPLETED' : 'ACTIVE' as LoanStatus,
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
              balance: true,
              availableBalance: true,
            },
          },
          journal: true,
        },
      });

      // Create ledger entry for repayment using Decimal
      await LedgerService.createJournal({
        reference: generateReference('LOAN-REP-JNL'),
        description: `Loan repayment ${reference} - ${amount.toString()} ${loan.currency}`,
        entries: [
          {
            accountId: loan.accountId,
            entryType: 'DEBIT',
            amount: amount,
            description: `Loan repayment for ${loan.reference}`,
            transactionId: updatedLoan.id,
          },
        ],
        loanId: updatedLoan.id,
        metadata: {
          loanId: updatedLoan.id,
          accountId: loan.accountId,
          amount: amount.toString(),
          currency: loan.currency,
        },
      }, actingUserId);

      // Update account balance using Decimal arithmetic
      await AccountService.updateBalance({
        accountId: loan.accountId,
        amount: amount,
        operation: 'ADJUSTMENT',
        reference: updatedLoan.reference,
        description: `Loan repayment for ${loan.reference}`,
        metadata: { loanId: updatedLoan.id },
      }, actingUserId);

      // Log audit event
      await tx.auditLog.create({
        data: {
          actorId: actingUserId,
          action: 'REPAY',
          resourceType: 'LOAN',
          resourceId: loan.id,
          oldValues: {
            totalRepaid: toDecimal(loan.totalRepaid || 0).toString(),
            status: loan.status,
          },
          newValues: {
            totalRepaid: toDecimal(updatedLoan.totalRepaid).toString(),
            status: updatedLoan.status,
            amount: amount.toString(),
          },
          status: 'SUCCESS',
        },
      });

      // Send notification
      await tx.notification.create({
        data: {
          userId: loan.userId,
          title: 'Loan Repayment Made',
          message: `Your repayment of ${amount.toString()} ${loan.currency} for loan ${loan.reference} has been processed. Remaining: ${remainingAmount.minus(amount).toString()} ${loan.currency}`,
          type: 'SUCCESS',
          category: 'LOAN',
          isRead: false,
          metadata: { loanId: updatedLoan.id },
        },
      });

      // Send completion notification if loan is fully repaid
      if (updatedLoan.status === 'COMPLETED') {
        await tx.notification.create({
          data: {
            userId: loan.userId,
            title: 'Loan Fully Repaid',
            message: `Congratulations! Your loan ${loan.reference} has been fully repaid.`,
            type: 'SUCCESS',
            category: 'LOAN',
            isRead: false,
            metadata: { loanId: updatedLoan.id },
          },
        });
      }

      return { loan: updatedLoan };
    });
  }

  /**
   * Get loan by ID
   */
  static async getById(id: string, actingUserId?: string): Promise<LoanResult> {
    const loan = await prisma.loan.findUnique({
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
            balance: true,
            availableBalance: true,
          },
        },
        journal: true,
      },
    });

    if (!loan) throw new NotFoundError('Loan', id);

    // Authorization check
    if (actingUserId && actingUserId !== loan.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this loan');
      }
    }

    return { loan };
  }

  /**
   * List loans for a user
   */
  static async listByUser(
    userId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: LoanStatus,
    loanType?: LoanType
  ): Promise<LoanListResult> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    // Authorization check
    if (actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these loans');
      }
    }

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    if (loanType) where.loanType = loanType;

    const loans = await prisma.loan.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        account: true,
      },
    });

    const total = await prisma.loan.count({ where });

    return {
      loans,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * List all loans (admin only)
   */
  static async listAll(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: LoanStatus,
    loanType?: LoanType,
    userId?: string
  ): Promise<LoanListResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view all loans');
    }

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (loanType) where.loanType = loanType;
    if (userId) where.userId = userId;

    const loans = await prisma.loan.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        account: true,
      },
    });

    const total = await prisma.loan.count({ where });

    return {
      loans,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get loan statistics
   */
  static async getStats(actingUserId: string): Promise<LoanStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view loan statistics');
    }

    const totalLoans = await prisma.loan.count();

    // Group by status
    const byStatus: Record<LoanStatus, number> = {
      PENDING: 0,
      APPROVED: 0,
      ACTIVE: 0,
      COMPLETED: 0,
      OVERDUE: 0,
      DEFAULTED: 0,
    };

    const statusCounts = await prisma.loan.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    for (const group of statusCounts) {
      byStatus[group.status as LoanStatus] = group._count._all;
    }

    // Group by type
    const byType: Record<LoanType, number> = {
      PERSONAL: 0,
      BUSINESS: 0,
      MORTGAGE: 0,
      AUTO: 0,
      EDUCATION: 0,
      PAYDAY: 0,
    };

    const typeCounts = await prisma.loan.groupBy({
      by: ['loanType'],
      _count: { _all: true },
    });

    for (const group of typeCounts) {
      byType[group.loanType as LoanType] = group._count._all;
    }

    // Calculate total amount using Decimal arithmetic
    const allLoans = await prisma.loan.findMany({
      where: { status: { in: ['APPROVED', 'ACTIVE', 'OVERDUE'] as LoanStatus[] } },
      select: { amount: true, totalRepayment: true, totalRepaid: true, currency: true },
    });

    const totalAmount = allLoans
      .reduce((sum, l) => sum.plus(toDecimal(l.amount)), new Decimal(0))
      .toNumber();

    const totalDisbursed = allLoans
      .reduce((sum, l) => sum.plus(toDecimal(l.amount).minus(toDecimal(l.processingFee || 0))), new Decimal(0))
      .toNumber();

    const totalRepaid = allLoans
      .reduce((sum, l) => sum.plus(toDecimal(l.totalRepaid || 0)), new Decimal(0))
      .toNumber();

    const totalOutstanding = allLoans
      .reduce((sum, l) => sum.plus(toDecimal(l.totalRepayment).minus(toDecimal(l.totalRepaid || 0))), new Decimal(0))
      .toNumber();

    // Calculate average amount using Decimal arithmetic
    const averageAmount = allLoans.length > 0
      ? allLoans.reduce((sum, l) => sum.plus(toDecimal(l.amount)), new Decimal(0)).div(allLoans.length).toNumber()
      : 0;

    // Count overdue loans
    const today = new Date();
    const overdueLoans = await prisma.loan.count({
      where: {
        status: { in: ['ACTIVE', 'APPROVED'] as LoanStatus[] },
        maturityDate: { lt: today },
      },
    });

    return {
      totalLoans,
      totalAmount,
      totalDisbursed,
      totalRepaid,
      totalOutstanding,
      byStatus,
      byType,
      averageAmount,
      overdueLoans,
      activeLoans: byStatus.ACTIVE + byStatus.APPROVED,
    };
  }

  /**
   * Calculate late fee using Decimal arithmetic
   */
  static calculateLateFee(loan: Loan, daysOverdue: number): Decimal {
    const outstandingAmount = toDecimal(loan.totalRepayment).minus(toDecimal(loan.totalRepaid || 0));
    const dailyLateFee = outstandingAmount.times(LOAN_CONFIG.LATE_FEE_PERCENTAGE);
    const totalLateFee = dailyLateFee.times(new Decimal(daysOverdue));
    return totalLateFee.greaterThan(LOAN_CONFIG.LATE_FEE_MAXIMUM)
      ? LOAN_CONFIG.LATE_FEE_MAXIMUM
      : totalLateFee;
  }

  /**
   * Get loan repayment schedule
   */
  static async getRepaymentSchedule(
    loanId: string,
    actingUserId: string
  ): Promise<{ schedule: any[]; totalRepayment: number; remainingBalance: number }> {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: { user: true },
    });

    if (!loan) throw new NotFoundError('Loan', loanId);

    // Authorization check
    if (actingUserId !== loan.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this loan repayment schedule');
      }
    }

    const amount = toDecimal(loan.amount);
    const totalInterest = toDecimal(loan.totalInterest);
    const totalRepayment = toDecimal(loan.totalRepayment);
    const repaid = toDecimal(loan.totalRepaid || 0);
    const remainingBalance = totalRepayment.minus(repaid);

    // Calculate repayment schedule based on frequency
    const schedule = [];
    let remaining = totalRepayment;
    let paymentNumber = 1;
    const startDate = new Date(loan.createdAt);

    // Simplified: equal monthly installments
    const months = Math.ceil(loan.durationDays / 30);
    const monthlyPayment = totalRepayment.div(new Decimal(months));

    for (let i = 0; i < months; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i + 1);

      const paymentAmount = i === months - 1 ? remaining : monthlyPayment;
      const isPaid = repaid.greaterThanOrEqual(new Decimal(i * monthlyPayment.toNumber()));

      schedule.push({
        paymentNumber,
        dueDate: dueDate.toISOString(),
        amount: paymentAmount.toString(),
        principal: amount.div(new Decimal(months)).toString(),
        interest: totalInterest.div(new Decimal(months)).toString(),
        isPaid,
        paymentDate: isPaid ? new Date().toISOString() : null,
      });

      remaining = remaining.minus(paymentAmount);
      paymentNumber++;
    }

    return {
      schedule,
      totalRepayment: totalRepayment.toNumber(),
      remainingBalance: remainingBalance.toNumber(),
    };
  }
}
