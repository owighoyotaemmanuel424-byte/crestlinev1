import { prisma } from '../prisma';
import { generateReference, generateIdempotencyKey } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  AppError,
  InsufficientBalanceError,
} from '../utils/errors';
import { Decimal } from '@prisma/client/runtime/library';
import type {
  User,
  Account,
  Journal,
  LedgerEntry,
  Transaction,
  Transfer,
  Deposit,
  Withdrawal,
  LoanDisbursement,
  LoanRepayment,
  SavingsContribution,
  SavingsWithdrawal,
  InvestmentTransaction,
  JournalStatus,
  EntryType,
  AccountType,
  AccountStatus,
  Role,
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
// INTERFACES & TYPES
// ============================================

export interface JournalData {
  reference?: string;
  description: string;
  entries: LedgerEntryData[];
  transactionId?: string;
  transferId?: string;
  depositId?: string;
  withdrawalId?: string;
  loanDisbursementId?: string;
  loanRepaymentId?: string;
  savingsContributionId?: string;
  savingsWithdrawalId?: string;
  investmentTransactionId?: string;
  metadata?: Record<string, unknown>;
}

export interface LedgerEntryData {
  accountId: string;
  entryType: EntryType;
  amount: number | string | Decimal;
  description: string;
  transactionId?: string;
}

export interface JournalResult {
  journal: Journal & {
    entries: LedgerEntry[];
    transaction?: Transaction | null;
    transfer?: Transfer | null;
    deposit?: Deposit | null;
    withdrawal?: Withdrawal | null;
    loanDisbursement?: LoanDisbursement | null;
    loanRepayment?: LoanRepayment | null;
    savingsContribution?: SavingsContribution | null;
    savingsWithdrawal?: SavingsWithdrawal | null;
    investmentTransaction?: InvestmentTransaction | null;
  };
}

export interface BalanceResult {
  accountId: string;
  balance: number;
  availableBalance: number;
  currency: string;
  calculatedAt: Date;
  entries: LedgerEntry[];
}

export interface TrialBalanceResult {
  accounts: Array<{
    accountId: string;
    accountNumber: string;
    userId: string;
    currency: string;
    debitTotal: number;
    creditTotal: number;
    netBalance: number;
  }>;
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  generatedAt: Date;
}

export interface LedgerStats {
  totalJournals: number;
  totalEntries: number;
  totalDebits: number;
  totalCredits: number;
  byAccount: Record<string, { debit: number; credit: number; balance: number }>;
  byCurrency: Record<string, { debit: number; credit: number; balance: number }>;
}

export interface ReversalData {
  journalId: string;
  reason: string;
  actingUserId: string;
}

export interface JournalListResult {
  journals: Journal[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LedgerEntryListResult {
  entries: LedgerEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// CONSTANTS
// ============================================

const LEDGER_CONFIG = {
  MAX_JOURNAL_ENTRIES: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  DEFAULT_CURRENCY: 'USD',
  ALLOW_NEGATIVE_BALANCES: false,
  REQUIRE_BALANCED_JOURNALS: true,
} as const;

// ============================================
// LEDGER SERVICE
// ============================================

export class LedgerService {
  // ============================================
  // JOURNAL MANAGEMENT
  // ============================================

  /**
   * Create a new journal with entries
   * This is the primary method for creating financial transactions
   */
  static async createJournal(
    data: JournalData,
    actingUserId?: string
  ): Promise<JournalResult> {
    // Validate entries
    if (!data.entries || data.entries.length === 0) {
      throw new ValidationError('Journal must have at least one entry');
    }

    if (data.entries.length > LEDGER_CONFIG.MAX_JOURNAL_ENTRIES) {
      throw new ValidationError(
        `Journal cannot have more than ${LEDGER_CONFIG.MAX_JOURNAL_ENTRIES} entries`
      );
    }

    // Validate that debits equal credits using Decimal arithmetic
    if (LEDGER_CONFIG.REQUIRE_BALANCED_JOURNALS) {
      const totalDebits = data.entries
        .filter(e => e.entryType === 'DEBIT')
        .reduce((sum, e) => sum.plus(toDecimal(e.amount)), new Decimal(0));
      const totalCredits = data.entries
        .filter(e => e.entryType === 'CREDIT')
        .reduce((sum, e) => sum.plus(toDecimal(e.amount)), new Decimal(0));

      if (!totalDebits.equals(totalCredits)) {
        throw new ValidationError(
          `Journal is unbalanced: Debits (${totalDebits.toString()}) != Credits (${totalCredits.toString()})`
        );
      }
    }

    // Generate reference if not provided
    const reference = data.reference || generateReference('JNL');

    // Verify all accounts exist
    const accountIds = [...new Set(data.entries.map(e => e.accountId))];
    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds } },
    });

    if (accounts.length !== accountIds.length) {
      throw new ValidationError('One or more accounts not found');
    }

    // Check for frozen/closed accounts
    for (const account of accounts) {
      if (account.status === 'FROZEN') {
        throw new ValidationError(`Account ${account.id} is frozen`);
      }
      if (account.status === 'CLOSED') {
        throw new ValidationError(`Account ${account.id} is closed`);
      }
    }

    // Check for sufficient balance on debit accounts using Decimal comparison
    for (const entry of data.entries.filter(e => e.entryType === 'DEBIT')) {
      const account = accounts.find(a => a.id === entry.accountId);
      if (account) {
        const entryAmount = toDecimal(entry.amount);
        const availableBalance = toDecimal(account.availableBalance);
        if (availableBalance.lessThan(entryAmount)) {
          if (!LEDGER_CONFIG.ALLOW_NEGATIVE_BALANCES) {
            throw new InsufficientBalanceError(
              account.id,
              entryAmount.toNumber(),
              availableBalance.toNumber()
            );
          }
        }
      }
    }

    // Create journal in transaction
    const journal = await prisma.journal.create({
      data: {
        reference,
        description: data.description || '',
        status: 'POSTED' as JournalStatus,
        transaction: data.transactionId
          ? { connect: { id: data.transactionId } }
          : undefined,
        transfer: data.transferId ? { connect: { id: data.transferId } } : undefined,
        deposit: data.depositId ? { connect: { id: data.depositId } } : undefined,
        withdrawal: data.withdrawalId
          ? { connect: { id: data.withdrawalId } }
          : undefined,
        loanDisbursement: data.loanDisbursementId
          ? { connect: { id: data.loanDisbursementId } }
          : undefined,
        loanRepayment: data.loanRepaymentId
          ? { connect: { id: data.loanRepaymentId } }
          : undefined,
        savingsContribution: data.savingsContributionId
          ? { connect: { id: data.savingsContributionId } }
          : undefined,
        savingsWithdrawal: data.savingsWithdrawalId
          ? { connect: { id: data.savingsWithdrawalId } }
          : undefined,
        investmentTransaction: data.investmentTransactionId
          ? { connect: { id: data.investmentTransactionId } }
          : undefined,
        metadata: data.metadata || null,
      },
      include: {
        entries: true,
        transaction: true,
        transfer: true,
        deposit: true,
        withdrawal: true,
        loanDisbursement: true,
        loanRepayment: true,
        savingsContribution: true,
        savingsWithdrawal: true,
        investmentTransaction: true,
      },
    });

    // Create entries using Decimal for amounts
    const entries = await Promise.all(
      data.entries.map(entry =>
        prisma.ledgerEntry.create({
          data: {
            journalId: journal.id,
            accountId: entry.accountId,
            entryType: entry.entryType,
            amount: toDecimal(entry.amount),
            description: entry.description || '',
            transactionId: entry.transactionId || null,
          },
        })
      )
    );

    // Update account balances
    await this.updateAccountBalances(journal.id);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId || 'SYSTEM',
        action: 'CREATE',
        resourceType: 'JOURNAL',
        resourceId: journal.id,
        newValues: {
          reference: journal.reference,
          description: journal.description,
          entryCount: entries.length,
          totalDebits: entries
            .filter(e => e.entryType === 'DEBIT')
            .reduce((sum, e) => sum.plus(toDecimal(e.amount)), new Decimal(0))
            .toNumber(),
          totalCredits: entries
            .filter(e => e.entryType === 'CREDIT')
            .reduce((sum, e) => sum.plus(toDecimal(e.amount)), new Decimal(0))
            .toNumber(),
        },
        metadata: data.metadata,
        status: 'SUCCESS',
      },
    });

    return {
      journal: {
        ...journal,
        entries,
      },
    };
  }

  /**
   * Get a journal by ID
   */
  static async getJournalById(
    id: string,
    actingUserId?: string
  ): Promise<JournalResult> {
    const journal = await prisma.journal.findUnique({
      where: { id },
      include: {
        entries: {
          orderBy: { createdAt: 'asc' },
        },
        transaction: true,
        transfer: true,
        deposit: true,
        withdrawal: true,
        loanDisbursement: true,
        loanRepayment: true,
        savingsContribution: true,
        savingsWithdrawal: true,
        investmentTransaction: true,
      },
    });

    if (!journal) throw new NotFoundError('Journal', id);

    // Authorization check
    if (actingUserId) {
      await this.verifyJournalAccess(journal, actingUserId);
    }

    return { journal };
  }

  /**
   * Get a journal by reference
   */
  static async getJournalByReference(
    reference: string,
    actingUserId?: string
  ): Promise<JournalResult> {
    const journal = await prisma.journal.findUnique({
      where: { reference },
      include: {
        entries: {
          orderBy: { createdAt: 'asc' },
        },
        transaction: true,
        transfer: true,
        deposit: true,
        withdrawal: true,
        loanDisbursement: true,
        loanRepayment: true,
        savingsContribution: true,
        savingsWithdrawal: true,
        investmentTransaction: true,
      },
    });

    if (!journal) throw new NotFoundError('Journal', reference);

    // Authorization check
    if (actingUserId) {
      await this.verifyJournalAccess(journal, actingUserId);
    }

    return { journal };
  }

  /**
   * List journals with filtering and pagination
   */
  static async listJournals(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    reference?: string,
    status?: JournalStatus,
    startDate?: Date,
    endDate?: Date,
    accountId?: string,
    userId?: string
  ): Promise<JournalListResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser) throw new NotFoundError('User', actingUserId);

    const where: Record<string, unknown> = {};

    if (reference) where.reference = { contains: reference, mode: 'insensitive' };
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    // For non-admin users, restrict to their own journals
    if (!['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
      where.OR = [
        { transaction: { userId: actingUserId } },
        { transfer: { fromUserId: actingUserId } },
        { deposit: { userId: actingUserId } },
        { withdrawal: { userId: actingUserId } },
      ];
    }

    if (accountId) {
      where.entries = { some: { accountId } };
    }

    if (userId) {
      where.OR = [
        ...(where.OR as Array<Record<string, unknown>> || []),
        { transaction: { userId } },
        { transfer: { fromUserId: userId } },
        { deposit: { userId } },
        { withdrawal: { userId } },
      ];
    }

    const journals = await prisma.journal.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        entries: true,
      },
    });

    const total = await prisma.journal.count({ where });

    return {
      journals,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================
  // JOURNAL REVERSAL
  // ============================================

  /**
   * Reverse a journal (create a reversing journal)
   */
  static async reverseJournal(
    data: ReversalData,
    actingUserId: string
  ): Promise<JournalResult> {
    const journal = await prisma.journal.findUnique({
      where: { id: data.journalId },
      include: {
        entries: true,
        transaction: true,
        transfer: true,
        deposit: true,
        withdrawal: true,
      },
    });

    if (!journal) throw new NotFoundError('Journal', data.journalId);

    // Authorization check
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can reverse journals');
    }

    if (journal.status !== 'POSTED') {
      throw new ValidationError('Only POSTED journals can be reversed');
    }

    // Create reversal entries (swap debit/credit)
    const reversalEntries: LedgerEntryData[] = journal.entries.map(entry => ({
      accountId: entry.accountId,
      entryType: entry.entryType === 'DEBIT' ? 'CREDIT' : 'DEBIT',
      amount: entry.amount,
      description: `Reversal of: ${entry.description} (Original: ${journal.reference})`,
      transactionId: entry.transactionId || undefined,
    }));

    // Create reversal journal
    const reversalJournal = await this.createJournal(
      {
        reference: `${journal.reference}-REV`,
        description: `Reversal of journal ${journal.reference}: ${data.reason}`,
        entries: reversalEntries,
        metadata: {
          originalJournalId: journal.id,
          reversedBy: actingUserId,
          reason: data.reason,
        },
      },
      actingUserId
    );

    // Update original journal status
    await prisma.journal.update({
      where: { id: journal.id },
      data: { status: 'REVERSED' as JournalStatus },
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'REVERSE',
        resourceType: 'JOURNAL',
        resourceId: journal.id,
        oldValues: { status: journal.status },
        newValues: { status: 'REVERSED' },
        metadata: {
          reversalJournalId: reversalJournal.journal.id,
          reason: data.reason,
        },
        status: 'SUCCESS',
      },
    });

    return reversalJournal;
  }

  // ============================================
  // LEDGER ENTRY MANAGEMENT
  // ============================================

  /**
   * Get ledger entries for an account
   */
  static async getEntriesByAccount(
    accountId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 50,
    startDate?: Date,
    endDate?: Date
  ): Promise<LedgerEntryListResult> {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundError('Account', accountId);

    // Authorization check
    if (actingUserId !== account.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this account');
      }
    }

    const where: Record<string, unknown> = { accountId };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const entries = await prisma.ledgerEntry.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        journal: {
          select: {
            id: true,
            reference: true,
            description: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    const total = await prisma.ledgerEntry.count({ where });

    return {
      entries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get ledger entries for a journal
   */
  static async getEntriesByJournal(
    journalId: string,
    actingUserId: string
  ): Promise<LedgerEntry[]> {
    const journal = await prisma.journal.findUnique({ where: { id: journalId } });
    if (!journal) throw new NotFoundError('Journal', journalId);

    // Authorization check
    await this.verifyJournalAccess(journal, actingUserId);

    return prisma.ledgerEntry.findMany({
      where: { journalId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ============================================
  // BALANCE CALCULATIONS
  // ============================================

  /**
   * Calculate the current balance for an account from ledger entries
   */
  static async calculateAccountBalance(
    accountId: string,
    actingUserId?: string
  ): Promise<BalanceResult> {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundError('Account', accountId);

    // Authorization check
    if (actingUserId && actingUserId !== account.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this account');
      }
    }

    const entries = await prisma.ledgerEntry.findMany({
      where: { accountId },
      orderBy: { createdAt: 'asc' },
    });

    // Calculate balance from entries using Decimal arithmetic
    let balance = new Decimal(0);
    for (const entry of entries) {
      const amount = toDecimal(entry.amount);
      if (entry.entryType === 'DEBIT') {
        balance = balance.minus(amount);
      } else {
        balance = balance.plus(amount);
      }
    }

    return {
      accountId: account.id,
      balance: balance.toNumber(),
      availableBalance: balance.toNumber(),
      currency: account.currency,
      calculatedAt: new Date(),
      entries,
    };
  }

  /**
   * Get account balance with validation
   */
  static async getAccountBalance(
    accountId: string,
    actingUserId?: string
  ): Promise<{
    account: Account;
    balance: number;
    availableBalance: number;
    currency: string;
  }> {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundError('Account', accountId);

    // Authorization check
    if (actingUserId && actingUserId !== account.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this account');
      }
    }

    return {
      account,
      balance: toDecimal(account.balance).toNumber(),
      availableBalance: toDecimal(account.availableBalance).toNumber(),
      currency: account.currency,
    };
  }

  /**
   * Recalculate and update all account balances
   * This is a maintenance operation
   */
  static async recalculateAllBalances(actingUserId: string): Promise<{
    updatedAccounts: number;
    discrepancies: Array<{
      accountId: string;
      storedBalance: number;
      calculatedBalance: number;
      difference: number;
    }>;
  }> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || actingUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only super administrators can recalculate all balances');
    }

    const accounts = await prisma.account.findMany({
      include: {
        ledgerEntries: true,
      },
    });

    let updatedAccounts: number = 0;
    const discrepancies: Array<{
      accountId: string;
      storedBalance: number;
      calculatedBalance: number;
      difference: number;
    }> = [];

    for (const account of accounts) {
      // Calculate balance using Decimal arithmetic
      const calculatedBalance = account.ledgerEntries.reduce((sum, entry) => {
        const amount = toDecimal(entry.amount);
        return entry.entryType === 'DEBIT' ? sum.minus(amount) : sum.plus(amount);
      }, new Decimal(0));

      const storedBalance = toDecimal(account.balance);
      const difference = calculatedBalance.minus(storedBalance);

      // Use a small epsilon for comparison due to potential rounding
      const epsilon = new Decimal(0.01);
      if (difference.abs().greaterThan(epsilon)) {
        discrepancies.push({
          accountId: account.id,
          storedBalance: storedBalance.toNumber(),
          calculatedBalance: calculatedBalance.toNumber(),
          difference: difference.toNumber(),
        });

        // Update account balance
        await prisma.account.update({
          where: { id: account.id },
          data: {
            balance: calculatedBalance,
            availableBalance: calculatedBalance,
          },
        });

        updatedAccounts++;
      }
    }

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'RECALCULATE_BALANCES',
        resourceType: 'ACCOUNT',
        resourceId: 'ALL',
        metadata: {
          updatedAccounts,
          discrepanciesCount: discrepancies.length,
          totalDiscrepancy: discrepancies.reduce((sum, d) => sum + Math.abs(d.difference), 0),
        },
        status: 'SUCCESS',
      },
    });

    return { updatedAccounts, discrepancies };
  }

  // ============================================
  // TRIAL BALANCE
  // ============================================

  /**
   * Generate a trial balance report
   */
  static async generateTrialBalance(
    actingUserId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<TrialBalanceResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can generate trial balance');
    }

    const where: Record<string, unknown> = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const accounts = await prisma.account.findMany({
      where: { status: { in: ['ACTIVE', 'FROZEN'] } },
      include: {
        ledgerEntries: {
          where,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const accountBalances = accounts.map(account => {
      const debitTotal = account.ledgerEntries
        .filter(e => e.entryType === 'DEBIT')
        .reduce((sum, e) => sum.plus(toDecimal(e.amount)), new Decimal(0));
      const creditTotal = account.ledgerEntries
        .filter(e => e.entryType === 'CREDIT')
        .reduce((sum, e) => sum.plus(toDecimal(e.amount)), new Decimal(0));
      const netBalance = creditTotal.minus(debitTotal);

      return {
        accountId: account.id,
        accountNumber: account.accountNumber,
        userId: account.userId,
        currency: account.currency,
        debitTotal: debitTotal.toNumber(),
        creditTotal: creditTotal.toNumber(),
        netBalance: netBalance.toNumber(),
      };
    });

    const totalDebits = accountBalances.reduce((sum, a) => sum.plus(new Decimal(a.debitTotal)), new Decimal(0)).toNumber();
    const totalCredits = accountBalances.reduce((sum, a) => sum.plus(new Decimal(a.creditTotal)), new Decimal(0)).toNumber();
    const isBalanced = totalDebits === totalCredits;

    return {
      accounts: accountBalances,
      totalDebits,
      totalCredits,
      isBalanced,
      generatedAt: new Date(),
    };
  }

  // ============================================
  // LEDGER STATISTICS
  // ============================================

  /**
   * Get ledger statistics
   */
  static async getStats(
    actingUserId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<LedgerStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view ledger statistics');
    }

    const where: Record<string, unknown> = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const totalJournals = await prisma.journal.count({ where });
    const totalEntries = await prisma.ledgerEntry.count({ where });

    // Get total debits and credits using Decimal arithmetic
    const entries = await prisma.ledgerEntry.findMany({
      where,
      select: {
        amount: true,
        entryType: true,
        accountId: true,
        account: {
          select: {
            currency: true,
          },
        },
      },
    });

    const totalDebits = entries
      .filter(e => e.entryType === 'DEBIT')
      .reduce((sum, e) => sum.plus(toDecimal(e.amount)), new Decimal(0))
      .toNumber();
    const totalCredits = entries
      .filter(e => e.entryType === 'CREDIT')
      .reduce((sum, e) => sum.plus(toDecimal(e.amount)), new Decimal(0))
      .toNumber();

    // Group by account
    const byAccount: Record<string, { debit: number; credit: number; balance: number }> = {};
    for (const entry of entries) {
      if (!byAccount[entry.accountId]) {
        byAccount[entry.accountId] = { debit: 0, credit: 0, balance: 0 };
      }
      const amount = toDecimal(entry.amount);
      if (entry.entryType === 'DEBIT') {
        byAccount[entry.accountId].debit = new Decimal(byAccount[entry.accountId].debit).plus(amount).toNumber();
        byAccount[entry.accountId].balance = new Decimal(byAccount[entry.accountId].balance).minus(amount).toNumber();
      } else {
        byAccount[entry.accountId].credit = new Decimal(byAccount[entry.accountId].credit).plus(amount).toNumber();
        byAccount[entry.accountId].balance = new Decimal(byAccount[entry.accountId].balance).plus(amount).toNumber();
      }
    }

    // Group by currency
    const byCurrency: Record<string, { debit: number; credit: number; balance: number }> = {};
    for (const entry of entries) {
      const currency = entry.account.currency || LEDGER_CONFIG.DEFAULT_CURRENCY;
      if (!byCurrency[currency]) {
        byCurrency[currency] = { debit: 0, credit: 0, balance: 0 };
      }
      const amount = toDecimal(entry.amount);
      if (entry.entryType === 'DEBIT') {
        byCurrency[currency].debit = new Decimal(byCurrency[currency].debit).plus(amount).toNumber();
        byCurrency[currency].balance = new Decimal(byCurrency[currency].balance).minus(amount).toNumber();
      } else {
        byCurrency[currency].credit = new Decimal(byCurrency[currency].credit).plus(amount).toNumber();
        byCurrency[currency].balance = new Decimal(byCurrency[currency].balance).plus(amount).toNumber();
      }
    }

    return {
      totalJournals,
      totalEntries,
      totalDebits,
      totalCredits,
      byAccount,
      byCurrency,
    };
  }

  // ============================================
  // TRANSACTION-SPECIFIC JOURNALS
  // ============================================

  /**
   * Create a journal for a deposit
   */
  static async createDepositJournal(
    depositId: string,
    accountId: string,
    amount: number | string | Decimal,
    currency: string = 'USD',
    description: string = 'Deposit'
  ): Promise<JournalResult> {
    const reference = generateReference('DEP');

    return this.createJournal({
      reference,
      description,
      entries: [
        {
          accountId,
          entryType: 'CREDIT',
          amount,
          description,
        },
      ],
      depositId,
      metadata: {
        depositId,
        amount: toDecimal(amount).toString(),
        currency,
      },
    });
  }

  /**
   * Create a journal for a withdrawal
   */
  static async createWithdrawalJournal(
    withdrawalId: string,
    accountId: string,
    amount: number | string | Decimal,
    currency: string = 'USD',
    description: string = 'Withdrawal'
  ): Promise<JournalResult> {
    const reference = generateReference('WTH');

    return this.createJournal({
      reference,
      description,
      entries: [
        {
          accountId,
          entryType: 'DEBIT',
          amount,
          description,
        },
      ],
      withdrawalId,
      metadata: {
        withdrawalId,
        amount: toDecimal(amount).toString(),
        currency,
      },
    });
  }

  /**
   * Create a journal for a transfer (debit from, credit to)
   */
  static async createTransferJournal(
    transferId: string,
    fromAccountId: string,
    toAccountId: string,
    amount: number | string | Decimal,
    currency: string = 'USD',
    description: string = 'Transfer'
  ): Promise<JournalResult> {
    const reference = generateReference('XFR');

    return this.createJournal({
      reference,
      description,
      entries: [
        {
          accountId: fromAccountId,
          entryType: 'DEBIT',
          amount,
          description: `${description} - From`,
        },
        {
          accountId: toAccountId,
          entryType: 'CREDIT',
          amount,
          description: `${description} - To`,
        },
      ],
      transferId,
      metadata: {
        transferId,
        fromAccountId,
        toAccountId,
        amount: toDecimal(amount).toString(),
        currency,
      },
    });
  }

  /**
   * Create a journal for a loan disbursement
   */
  static async createLoanDisbursementJournal(
    disbursementId: string,
    accountId: string,
    amount: number | string | Decimal,
    currency: string = 'USD',
    description: string = 'Loan Disbursement'
  ): Promise<JournalResult> {
    const reference = generateReference('LND');

    return this.createJournal({
      reference,
      description,
      entries: [
        {
          accountId,
          entryType: 'CREDIT',
          amount,
          description,
        },
      ],
      loanDisbursementId: disbursementId,
      metadata: {
        disbursementId,
        amount: toDecimal(amount).toString(),
        currency,
      },
    });
  }

  /**
   * Create a journal for a loan repayment
   */
  static async createLoanRepaymentJournal(
    repaymentId: string,
    accountId: string,
    amount: number | string | Decimal,
    principalAmount: number | string | Decimal,
    interestAmount: number | string | Decimal,
    currency: string = 'USD',
    description: string = 'Loan Repayment'
  ): Promise<JournalResult> {
    const reference = generateReference('LNR');

    // In a real implementation, this would also credit the loan liability account
    // For simplicity, we're just debiting the user's account
    return this.createJournal({
      reference,
      description,
      entries: [
        {
          accountId,
          entryType: 'DEBIT',
          amount,
          description: `${description} - Principal: ${toDecimal(principalAmount).toString()}, Interest: ${toDecimal(interestAmount).toString()}`,
        },
      ],
      loanRepaymentId: repaymentId,
      metadata: {
        repaymentId,
        amount: toDecimal(amount).toString(),
        principalAmount: toDecimal(principalAmount).toString(),
        interestAmount: toDecimal(interestAmount).toString(),
        currency,
      },
    });
  }

  /**
   * Create a journal for a fee
   */
  static async createFeeJournal(
    transactionId: string,
    accountId: string,
    amount: number | string | Decimal,
    currency: string = 'USD',
    description: string = 'Fee'
  ): Promise<JournalResult> {
    const reference = generateReference('FEE');

    return this.createJournal({
      reference,
      description,
      entries: [
        {
          accountId,
          entryType: 'DEBIT',
          amount,
          description,
          transactionId,
        },
      ],
      transactionId,
      metadata: {
        transactionId,
        amount: toDecimal(amount).toString(),
        currency,
        type: 'FEE',
      },
    });
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Update account balances based on journal entries
   */
  private static async updateAccountBalances(journalId: string): Promise<void> {
    const entries = await prisma.ledgerEntry.findMany({
      where: { journalId },
      include: { account: true },
    });

    // Group entries by account
    const accountUpdates: Record<string, { delta: Decimal; account: Account }> = {};

    for (const entry of entries) {
      const amount = toDecimal(entry.amount);
      const delta = entry.entryType === 'DEBIT' ? new Decimal(-1).times(amount) : amount;

      if (!accountUpdates[entry.accountId]) {
        accountUpdates[entry.accountId] = {
          delta: new Decimal(0),
          account: entry.account,
        };
      }

      accountUpdates[entry.accountId].delta = accountUpdates[entry.accountId].delta.plus(delta);
    }

    // Apply updates to accounts
    for (const [accountId, update] of Object.entries(accountUpdates)) {
      await prisma.account.update({
        where: { id: accountId },
        data: {
          balance: {
            increment: update.delta,
          },
          availableBalance: {
            increment: update.delta,
          },
        },
      });
    }
  }

  /**
   * Verify journal access for authorization
   */
  private static async verifyJournalAccess(journal: Journal, actingUserId: string): Promise<void> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser) throw new NotFoundError('User', actingUserId);

    // Check if user has access to any related entity
    const hasAccess = 
      journal.transaction?.userId === actingUserId ||
      journal.transfer?.fromUserId === actingUserId ||
      journal.deposit?.userId === actingUserId ||
      journal.withdrawal?.userId === actingUserId ||
      ['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role);

    if (!hasAccess) {
      throw new ForbiddenError('You do not have access to this journal');
    }
  }
}