import { generateReference, generateIdempotencyKey } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  AppError,
  InsufficientBalanceError,
} from '../utils/errors';
import { LedgerService } from './ledger-service';
import { Decimal } from '@prisma/client/runtime/library';
import type {
  User,
  Account,
  InvestmentPortfolio,
  Investment,
  InvestmentTransaction,
  InvestmentType,
  InvestmentStatus,
  InvestmentTransactionType,
  PortfolioStatus,
  TransactionStatus,
  Role,
  Journal,
  LedgerEntry,
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

export interface CreatePortfolioData {
  userId: string;
  name: string;
  description?: string;
}

export interface UpdatePortfolioData {
  name?: string;
  description?: string;
  status?: PortfolioStatus;
}

export interface CreateInvestmentData {
  portfolioId: string;
  symbol: string;
  name: string;
  investmentType: InvestmentType;
  quantity: number | string | Decimal; // Decimal string or number
  purchasePrice: number | string | Decimal;
  metadata?: Record<string, unknown>;
}

export interface UpdateInvestmentData {
  name?: string;
  currentPrice?: number | string | Decimal;
  status?: InvestmentStatus;
  metadata?: Record<string, unknown>;
}

export interface BuyInvestmentData {
  portfolioId: string;
  accountId: string;
  symbol: string;
  name: string;
  investmentType: InvestmentType;
  quantity: number | string | Decimal;
  price: number | string | Decimal;
  fee?: number | string | Decimal;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface SellInvestmentData {
  investmentId: string;
  portfolioId: string;
  accountId: string;
  quantity: number | string | Decimal;
  price: number | string | Decimal;
  fee?: number | string | Decimal;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface InvestmentTransactionData {
  portfolioId: string;
  investmentId: string;
  accountId: string;
  transactionType: InvestmentTransactionType;
  quantity: number | string | Decimal;
  price: number | string | Decimal;
  amount: number | string | Decimal;
  fee?: number | string | Decimal;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface PortfolioResult {
  portfolio: InvestmentPortfolio & {
    user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
    investments: Investment[];
    transactions: InvestmentTransaction[];
    totalValue: number;
    totalInvested: number;
    totalGainLoss: number;
  };
}

export interface InvestmentResult {
  investment: Investment & {
    portfolio: Pick<InvestmentPortfolio, 'id' | 'name' | 'userId'>;
    transactions: InvestmentTransaction[];
    currentValue: number;
    costBasis: number;
    gainLoss: number;
    gainLossPercent: number;
  };
}

export interface TransactionResult {
  transaction: InvestmentTransaction & {
    portfolio: Pick<InvestmentPortfolio, 'id' | 'name' | 'userId'>;
    investment: Pick<Investment, 'id' | 'symbol' | 'name' | 'investmentType'>;
    account: Pick<Account, 'id' | 'accountNumber' | 'userId'>;
    journal?: Journal | null;
  };
}

export interface PortfolioListResult {
  portfolios: PortfolioResult['portfolio'][];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface InvestmentListResult {
  investments: InvestmentResult['investment'][];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TransactionListResult {
  transactions: TransactionResult['transaction'][];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PortfolioPerformance {
  portfolioId: string;
  portfolioName: string;
  period: '1D' | '7D' | '30D' | '90D' | 'YTD' | '1Y' | 'ALL';
  startValue: number;
  endValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  transactions: number;
  fees: number;
  dividendIncome: number;
}

export interface InvestmentPerformance {
  investmentId: string;
  symbol: string;
  period: '1D' | '7D' | '30D' | '90D' | 'YTD' | '1Y' | 'ALL';
  startValue: number;
  endValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  quantity: number;
  averagePurchasePrice: number;
  currentPrice: number;
}

export interface InvestmentStats {
  totalPortfolios: number;
  totalInvestments: number;
  totalValue: number;
  totalInvested: number;
  totalGainLoss: number;
  byType: Record<InvestmentType, { count: number; value: number; }>;
  byStatus: Record<InvestmentStatus, number>;
  topHoldings: Array<{
    symbol: string;
    name: string;
    quantity: number;
    value: number;
    percentOfPortfolio: number;
  }>;
}

// ============================================
// CONSTANTS
// ============================================

const INVESTMENT_CONFIG = {
  MIN_QUANTITY: 0.0001,
  MIN_PRICE: 0.01,
  MAX_FEE_PERCENT: new Decimal(0.05), // 5%
  DEFAULT_FEE: new Decimal(0),
  ALLOW_FRACTIONAL_SHARES: true,
  PRICE_PRECISION: 8, // Decimal places for price
  QUANTITY_PRECISION: 8, // Decimal places for quantity
  IDEMPOTENCY_TTL: 24 * 60 * 60 * 1000, // 24 hours
} as const;

// ============================================
// INVESTMENT SERVICE
// ============================================

export class InvestmentService {
  // ============================================
  // PORTFOLIO MANAGEMENT
  // ============================================

  /**
   * Create a new investment portfolio
   */
  static async createPortfolio(
    data: CreatePortfolioData,
    actingUserId: string
  ): Promise<PortfolioResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    // Authorization check
    if (actingUserId !== data.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('Only administrators can create portfolios for other users');
      }
    }

    // Check for duplicate portfolio name
    const existingPortfolio = await prisma.investmentPortfolio.findFirst({
      where: { userId: data.userId, name: data.name },
    });

    if (existingPortfolio) {
      throw new ConflictError('Portfolio with this name already exists');
    }

    const portfolio = await prisma.investmentPortfolio.create({
      data: {
        userId: data.userId,
        name: data.name,
        description: data.description || null,
        status: 'ACTIVE' as PortfolioStatus,
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
        investments: true,
        transactions: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'CREATE',
        resourceType: 'INVESTMENT_PORTFOLIO',
        resourceId: portfolio.id,
        newValues: { userId: data.userId, name: data.name, status: portfolio.status },
        status: 'SUCCESS',
      },
    });

    return this.formatPortfolio(portfolio);
  }

  /**
   * Get a portfolio by ID
   */
  static async getPortfolioById(
    id: string,
    actingUserId: string
  ): Promise<PortfolioResult> {
    const portfolio = await prisma.investmentPortfolio.findUnique({
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
        investments: {
          include: {
            transactions: {
              orderBy: { executedAt: 'desc' },
            },
          },
        },
        transactions: {
          orderBy: { executedAt: 'desc' },
          include: {
            investment: true,
          },
        },
      },
    });

    if (!portfolio) throw new NotFoundError('Investment Portfolio', id);

    // Authorization check
    if (actingUserId !== portfolio.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this portfolio');
      }
    }

    return this.formatPortfolio(portfolio);
  }

  /**
   * List portfolios for a user
   */
  static async listPortfolios(
    userId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: PortfolioStatus,
    search?: string
  ): Promise<PortfolioListResult> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    // Authorization check
    if (actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these portfolios');
      }
    }

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const portfolios = await prisma.investmentPortfolio.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        investments: {
          include: {
            transactions: true,
          },
        },
        transactions: {
          include: {
            investment: true,
          },
        },
      },
    });

    const total = await prisma.investmentPortfolio.count({ where });

    return {
      portfolios: await Promise.all(portfolios.map(p => this.formatPortfolio(p))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * List all portfolios (admin only)
   */
  static async listAllPortfolios(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: PortfolioStatus,
    search?: string
  ): Promise<PortfolioListResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view all portfolios');
    }

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const portfolios = await prisma.investmentPortfolio.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        investments: {
          include: {
            transactions: true,
          },
        },
        transactions: {
          include: {
            investment: true,
          },
        },
      },
    });

    const total = await prisma.investmentPortfolio.count({ where });

    return {
      portfolios: await Promise.all(portfolios.map(p => this.formatPortfolio(p))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update a portfolio
   */
  static async updatePortfolio(
    id: string,
    data: UpdatePortfolioData,
    actingUserId: string
  ): Promise<PortfolioResult> {
    const portfolio = await prisma.investmentPortfolio.findUnique({
      where: { id },
      include: {
        user: true,
        investments: {
          include: {
            transactions: true,
          },
        },
        transactions: {
          include: {
            investment: true,
          },
        },
      },
    });

    if (!portfolio) throw new NotFoundError('Investment Portfolio', id);

    // Authorization check
    if (actingUserId !== portfolio.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('Only administrators can update portfolios of other users');
      }
    }

    const oldStatus = portfolio.status;

    const updatedPortfolio = await prisma.investmentPortfolio.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        status: data.status,
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
        investments: {
          include: {
            transactions: true,
          },
        },
        transactions: {
          include: {
            investment: true,
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'UPDATE',
        resourceType: 'INVESTMENT_PORTFOLIO',
        resourceId: portfolio.id,
        oldValues: { name: portfolio.name, status: oldStatus },
        newValues: { name: data.name || portfolio.name, status: data.status || oldStatus },
        status: 'SUCCESS',
      },
    });

    return this.formatPortfolio(updatedPortfolio);
  }

  /**
   * Close a portfolio (no longer allows new investments)
   */
  static async closePortfolio(id: string, actingUserId: string): Promise<PortfolioResult> {
    const portfolio = await prisma.investmentPortfolio.findUnique({
      where: { id },
      include: {
        user: true,
        investments: {
          include: {
            transactions: true,
          },
        },
        transactions: {
          include: {
            investment: true,
          },
        },
      },
    });

    if (!portfolio) throw new NotFoundError('Investment Portfolio', id);

    // Authorization check
    if (actingUserId !== portfolio.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('Only administrators can close portfolios of other users');
      }
    }

    if (portfolio.status === 'CLOSED') {
      throw new ValidationError('Portfolio is already closed');
    }

    // Check if there are open positions
    const openInvestments = await prisma.investment.count({
      where: {
        portfolioId: id,
        status: { in: ['ACTIVE', 'PENDING'] },
      },
    });

    if (openInvestments > 0) {
      throw new ValidationError('Cannot close portfolio with open investments');
    }

    const closedPortfolio = await prisma.investmentPortfolio.update({
      where: { id },
      data: { status: 'CLOSED' as PortfolioStatus },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        investments: {
          include: {
            transactions: true,
          },
        },
        transactions: {
          include: {
            investment: true,
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'CLOSE',
        resourceType: 'INVESTMENT_PORTFOLIO',
        resourceId: portfolio.id,
        oldValues: { status: portfolio.status },
        newValues: { status: 'CLOSED' },
        status: 'SUCCESS',
      },
    });

    return this.formatPortfolio(closedPortfolio);
  }

  // ============================================
  // INVESTMENT MANAGEMENT
  // ============================================

  /**
   * Create a new investment (without buying)
   */
  static async createInvestment(
    data: CreateInvestmentData,
    actingUserId: string
  ): Promise<InvestmentResult> {
    const portfolio = await prisma.investmentPortfolio.findUnique({
      where: { id: data.portfolioId },
    });

    if (!portfolio) throw new NotFoundError('Investment Portfolio', data.portfolioId);

    // Authorization check
    if (actingUserId !== portfolio.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this portfolio');
      }
    }

    // Check for duplicate symbol in portfolio
    const existingInvestment = await prisma.investment.findFirst({
      where: {
        portfolioId: data.portfolioId,
        symbol: data.symbol,
      },
    });

    if (existingInvestment) {
      throw new ConflictError('Investment with this symbol already exists in the portfolio');
    }

    // Validate quantity and price using Decimal
    const quantity = toDecimal(data.quantity);
    const purchasePrice = toDecimal(data.purchasePrice);

    if (quantity.lessThanOrEqual(new Decimal(0))) {
      throw new ValidationError('Quantity must be greater than 0');
    }

    if (purchasePrice.lessThanOrEqual(new Decimal(0))) {
      throw new ValidationError('Purchase price must be greater than 0');
    }

    const investment = await prisma.investment.create({
      data: {
        portfolioId: data.portfolioId,
        symbol: data.symbol,
        name: data.name,
        investmentType: data.investmentType,
        quantity: quantity,
        purchasePrice: purchasePrice,
        currentPrice: purchasePrice,
        purchasedAt: new Date(),
        status: 'ACTIVE' as InvestmentStatus,
        metadata: data.metadata || null,
      },
      include: {
        portfolio: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        transactions: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'CREATE',
        resourceType: 'INVESTMENT',
        resourceId: investment.id,
        newValues: {
          portfolioId: data.portfolioId,
          symbol: data.symbol,
          name: data.name,
          quantity: quantity.toString(),
          purchasePrice: purchasePrice.toString(),
        },
        status: 'SUCCESS',
      },
    });

    return this.formatInvestment(investment);
  }

  /**
   * Get an investment by ID
   */
  static async getInvestmentById(
    id: string,
    actingUserId: string
  ): Promise<InvestmentResult> {
    const investment = await prisma.investment.findUnique({
      where: { id },
      include: {
        portfolio: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        transactions: {
          orderBy: { executedAt: 'desc' },
        },
      },
    });

    if (!investment) throw new NotFoundError('Investment', id);

    // Authorization check
    if (actingUserId !== investment.portfolio.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this investment');
      }
    }

    return this.formatInvestment(investment);
  }

  /**
   * List investments for a portfolio
   */
  static async listInvestments(
    portfolioId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: InvestmentStatus,
    search?: string
  ): Promise<InvestmentListResult> {
    const portfolio = await prisma.investmentPortfolio.findUnique({
      where: { id: portfolioId },
    });

    if (!portfolio) throw new NotFoundError('Investment Portfolio', portfolioId);

    // Authorization check
    if (actingUserId !== portfolio.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this portfolio');
      }
    }

    const where: Record<string, unknown> = { portfolioId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { symbol: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const investments = await prisma.investment.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { purchasedAt: 'desc' },
      include: {
        portfolio: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        transactions: {
          orderBy: { executedAt: 'desc' },
        },
      },
    });

    const total = await prisma.investment.count({ where });

    return {
      investments: await Promise.all(investments.map(i => this.formatInvestment(i))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update an investment
   */
  static async updateInvestment(
    id: string,
    data: UpdateInvestmentData,
    actingUserId: string
  ): Promise<InvestmentResult> {
    const investment = await prisma.investment.findUnique({
      where: { id },
      include: {
        portfolio: true,
        transactions: true,
      },
    });

    if (!investment) throw new NotFoundError('Investment', id);

    // Authorization check
    if (actingUserId !== investment.portfolio.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this investment');
      }
    }

    const oldStatus = investment.status;
    const oldPrice = investment.currentPrice;

    const updatedInvestment = await prisma.investment.update({
      where: { id },
      data: {
        name: data.name,
        currentPrice: data.currentPrice ? toDecimal(data.currentPrice) : undefined,
        status: data.status,
        metadata: data.metadata,
      },
      include: {
        portfolio: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        transactions: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'UPDATE',
        resourceType: 'INVESTMENT',
        resourceId: investment.id,
        oldValues: { currentPrice: oldPrice?.toString(), status: oldStatus },
        newValues: {
          currentPrice: data.currentPrice ? toDecimal(data.currentPrice).toString() : oldPrice?.toString(),
          status: data.status || oldStatus,
        },
        status: 'SUCCESS',
      },
    });

    return this.formatInvestment(updatedInvestment);
  }

  // ============================================
  // INVESTMENT TRANSACTIONS
  // ============================================

  /**
   * Buy an investment
   */
  static async buyInvestment(
    data: BuyInvestmentData,
    actingUserId: string
  ): Promise<TransactionResult> {
    const portfolio = await prisma.investmentPortfolio.findUnique({
      where: { id: data.portfolioId },
    });

    if (!portfolio) throw new NotFoundError('Investment Portfolio', data.portfolioId);

    // Authorization check
    if (actingUserId !== portfolio.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this portfolio');
      }
    }

    const account = await prisma.account.findUnique({ where: { id: data.accountId } });
    if (!account) throw new NotFoundError('Account', data.accountId);

    // Check account ownership
    if (account.userId !== portfolio.userId) {
      throw new ForbiddenError('Account does not belong to portfolio owner');
    }

    // Check for idempotency
    if (data.idempotencyKey) {
      const existingTransaction = await prisma.investmentTransaction.findFirst({
        where: { idempotencyKey: data.idempotencyKey },
      });

      if (existingTransaction) {
        throw new ConflictError('Duplicate transaction (idempotency key already used)');
      }
    }

    // Validate inputs using Decimal
    const quantity = toDecimal(data.quantity);
    const price = toDecimal(data.price);
    const fee = data.fee ? toDecimal(data.fee) : INVESTMENT_CONFIG.DEFAULT_FEE;

    if (quantity.lessThanOrEqual(new Decimal(0))) {
      throw new ValidationError('Quantity must be greater than 0');
    }

    if (price.lessThanOrEqual(new Decimal(0))) {
      throw new ValidationError('Price must be greater than 0');
    }

    // Validate fee is within bounds using Decimal arithmetic
    const maxFee = quantity.times(price).times(INVESTMENT_CONFIG.MAX_FEE_PERCENT);
    if (fee.lessThan(new Decimal(0)) || fee.greaterThan(maxFee)) {
      throw new ValidationError(\`Fee must be between 0 and \${INVESTMENT_CONFIG.MAX_FEE_PERCENT.times(100).toString()}% of transaction value\`);
    }

    // Calculate total amount using Decimal arithmetic
    const amount = quantity.times(price).plus(fee);

    // Check sufficient balance using Decimal comparison
    const availableBalance = toDecimal(account.availableBalance);
    if (availableBalance.lessThan(amount)) {
      throw new InsufficientBalanceError(
        account.id,
        amount.toNumber(),
        availableBalance.toNumber()
      );
    }

    // Check if investment already exists
    let investment = await prisma.investment.findFirst({
      where: {
        portfolioId: data.portfolioId,
        symbol: data.symbol,
      },
    });

    // Create or update investment
    if (!investment) {
      investment = await prisma.investment.create({
        data: {
          portfolioId: data.portfolioId,
          symbol: data.symbol,
          name: data.name,
          investmentType: data.investmentType,
          quantity: new Decimal(0),
          purchasePrice: new Decimal(0),
          currentPrice: price,
          status: 'PENDING' as InvestmentStatus,
        },
      });
    }

    // Create transaction
    const transaction = await prisma.investmentTransaction.create({
      data: {
        portfolioId: data.portfolioId,
        investmentId: investment.id,
        accountId: data.accountId,
        transactionType: 'BUY' as InvestmentTransactionType,
        quantity: quantity,
        price: price,
        amount: amount.minus(fee), // Net amount (excluding fee)
        fee: fee,
        executedAt: new Date(),
        status: 'COMPLETED' as TransactionStatus,
        idempotencyKey: data.idempotencyKey || generateIdempotencyKey(),
        metadata: data.metadata || null,
      },
      include: {
        portfolio: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        investment: {
          select: {
            id: true,
            symbol: true,
            name: true,
            investmentType: true,
          },
        },
        account: {
          select: {
            id: true,
            accountNumber: true,
            userId: true,
          },
        },
      },
    });

    // Update investment quantity and average purchase price using Decimal arithmetic
    const oldQuantity = toDecimal(investment.quantity);
    const oldPurchasePrice = toDecimal(investment.purchasePrice);
    const newQuantity = oldQuantity.plus(quantity);
    // newAveragePrice = (oldQuantity * oldPurchasePrice + quantity * price) / newQuantity
    const newAveragePrice = oldQuantity.times(oldPurchasePrice).plus(quantity.times(price)).div(newQuantity);

    await prisma.investment.update({
      where: { id: investment.id },
      data: {
        quantity: newQuantity,
        purchasePrice: newAveragePrice,
        currentPrice: price,
        status: 'ACTIVE' as InvestmentStatus,
      },
    });

    // Create ledger entries for the transaction
    await LedgerService.createJournal({
      reference: generateReference('INV-BUY'),
      description: \`Investment purchase: \${quantity.toString()} \${data.symbol} at \${price.toString()}\`,
      entries: [
        {
          accountId: data.accountId,
          entryType: 'DEBIT',
          amount: amount,
          description: \`Investment purchase: \${quantity.toString()} \${data.symbol}\`,
          transactionId: transaction.id,
        },
      ],
      investmentTransactionId: transaction.id,
      metadata: {
        transactionId: transaction.id,
        investmentId: investment.id,
        quantity: quantity.toString(),
        price: price.toString(),
        fee: fee.toString(),
      },
    }, actingUserId);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'BUY',
        resourceType: 'INVESTMENT_TRANSACTION',
        resourceId: transaction.id,
        newValues: {
          portfolioId: data.portfolioId,
          investmentId: investment.id,
          accountId: data.accountId,
          quantity: quantity.toString(),
          price: price.toString(),
          amount: amount.toString(),
          fee: fee.toString(),
        },
        metadata: data.metadata,
        status: 'SUCCESS',
      },
    });

    return this.formatTransaction(transaction);
  }

  /**
   * Sell an investment
   */
  static async sellInvestment(
    data: SellInvestmentData,
    actingUserId: string
  ): Promise<TransactionResult> {
    const portfolio = await prisma.investmentPortfolio.findUnique({
      where: { id: data.portfolioId },
    });

    if (!portfolio) throw new NotFoundError('Investment Portfolio', data.portfolioId);

    // Authorization check
    if (actingUserId !== portfolio.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this portfolio');
      }
    }

    const investment = await prisma.investment.findUnique({
      where: { id: data.investmentId },
    });

    if (!investment) throw new NotFoundError('Investment', data.investmentId);

    if (investment.portfolioId !== data.portfolioId) {
      throw new ValidationError('Investment does not belong to specified portfolio');
    }

    const account = await prisma.account.findUnique({ where: { id: data.accountId } });
    if (!account) throw new NotFoundError('Account', data.accountId);

    // Check account ownership
    if (account.userId !== portfolio.userId) {
      throw new ForbiddenError('Account does not belong to portfolio owner');
    }

    // Check for idempotency
    if (data.idempotencyKey) {
      const existingTransaction = await prisma.investmentTransaction.findFirst({
        where: { idempotencyKey: data.idempotencyKey },
      });

      if (existingTransaction) {
        throw new ConflictError('Duplicate transaction (idempotency key already used)');
      }
    }

    // Validate inputs using Decimal
    const quantity = toDecimal(data.quantity);
    const price = toDecimal(data.price);
    const fee = data.fee ? toDecimal(data.fee) : INVESTMENT_CONFIG.DEFAULT_FEE;

    if (quantity.lessThanOrEqual(new Decimal(0))) {
      throw new ValidationError('Quantity must be greater than 0');
    }

    if (price.lessThanOrEqual(new Decimal(0))) {
      throw new ValidationError('Price must be greater than 0');
    }

    // Check if selling more than owned using Decimal comparison
    const ownedQuantity = toDecimal(investment.quantity);
    if (quantity.greaterThan(ownedQuantity)) {
      throw new ValidationError('Cannot sell more than owned quantity');
    }

    // Calculate amount using Decimal arithmetic
    const amount = quantity.times(price).minus(fee);

    // Create transaction
    const transaction = await prisma.investmentTransaction.create({
      data: {
        portfolioId: data.portfolioId,
        investmentId: investment.id,
        accountId: data.accountId,
        transactionType: 'SELL' as InvestmentTransactionType,
        quantity: quantity,
        price: price,
        amount: amount,
        fee: fee,
        executedAt: new Date(),
        status: 'COMPLETED' as TransactionStatus,
        idempotencyKey: data.idempotencyKey || generateIdempotencyKey(),
        metadata: data.metadata || null,
      },
      include: {
        portfolio: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        investment: {
          select: {
            id: true,
            symbol: true,
            name: true,
            investmentType: true,
          },
        },
        account: {
          select: {
            id: true,
            accountNumber: true,
            userId: true,
          },
        },
      },
    });

    // Update investment quantity using Decimal arithmetic
    const newQuantity = ownedQuantity.minus(quantity);
    
    const updatedInvestment = await prisma.investment.update({
      where: { id: investment.id },
      data: {
        quantity: newQuantity,
        currentPrice: price,
        ...(newQuantity.equals(new Decimal(0)) && { status: 'CLOSED' as InvestmentStatus }),
      },
      include: {
        portfolio: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        transactions: true,
      },
    });

    // Create ledger entries for the transaction
    await LedgerService.createJournal({
      reference: generateReference('INV-SELL'),
      description: \`Investment sale: \${quantity.toString()} \${updatedInvestment.symbol} at \${price.toString()}\`,
      entries: [
        {
          accountId: data.accountId,
          entryType: 'CREDIT',
          amount: amount,
          description: \`Investment sale: \${quantity.toString()} \${updatedInvestment.symbol}\`,
          transactionId: transaction.id,
        },
      ],
      investmentTransactionId: transaction.id,
      metadata: {
        transactionId: transaction.id,
        investmentId: investment.id,
        quantity: quantity.toString(),
        price: price.toString(),
        fee: fee.toString(),
      },
    }, actingUserId);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'SELL',
        resourceType: 'INVESTMENT_TRANSACTION',
        resourceId: transaction.id,
        newValues: {
          portfolioId: data.portfolioId,
          investmentId: investment.id,
          accountId: data.accountId,
          quantity: quantity.toString(),
          price: price.toString(),
          amount: amount.toString(),
          fee: fee.toString(),
        },
        metadata: data.metadata,
        status: 'SUCCESS',
      },
    });

    return this.formatTransaction(transaction);
  }

  // ============================================
  // TRANSACTION MANAGEMENT
  // ============================================

  /**
   * Create an investment transaction (generic)
   */
  static async createInvestmentTransaction(
    data: InvestmentTransactionData,
    actingUserId: string
  ): Promise<TransactionResult> {
    const portfolio = await prisma.investmentPortfolio.findUnique({
      where: { id: data.portfolioId },
    });

    if (!portfolio) throw new NotFoundError('Investment Portfolio', data.portfolioId);

    // Authorization check
    if (actingUserId !== portfolio.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this portfolio');
      }
    }

    const investment = await prisma.investment.findUnique({
      where: { id: data.investmentId },
    });

    if (!investment) throw new NotFoundError('Investment', data.investmentId);

    if (investment.portfolioId !== data.portfolioId) {
      throw new ValidationError('Investment does not belong to specified portfolio');
    }

    const account = await prisma.account.findUnique({ where: { id: data.accountId } });
    if (!account) throw new NotFoundError('Account', data.accountId);

    // Check account ownership
    if (account.userId !== portfolio.userId) {
      throw new ForbiddenError('Account does not belong to portfolio owner');
    }

    // Check for idempotency
    if (data.idempotencyKey) {
      const existingTransaction = await prisma.investmentTransaction.findFirst({
        where: { idempotencyKey: data.idempotencyKey },
      });

      if (existingTransaction) {
        throw new ConflictError('Duplicate transaction (idempotency key already used)');
      }
    }

    // Validate inputs using Decimal
    const quantity = toDecimal(data.quantity);
    const price = toDecimal(data.price);
    const amount = toDecimal(data.amount);
    const fee = data.fee ? toDecimal(data.fee) : INVESTMENT_CONFIG.DEFAULT_FEE;

    if (quantity.lessThanOrEqual(new Decimal(0))) {
      throw new ValidationError('Quantity must be greater than 0');
    }

    if (price.lessThanOrEqual(new Decimal(0))) {
      throw new ValidationError('Price must be greater than 0');
    }

    if (amount.lessThanOrEqual(new Decimal(0))) {
      throw new ValidationError('Amount must be greater than 0');
    }

    // Create transaction
    const transaction = await prisma.investmentTransaction.create({
      data: {
        portfolioId: data.portfolioId,
        investmentId: investment.id,
        accountId: data.accountId,
        transactionType: data.transactionType,
        quantity: quantity,
        price: price,
        amount: amount,
        fee: fee,
        executedAt: new Date(),
        status: 'COMPLETED' as TransactionStatus,
        idempotencyKey: data.idempotencyKey || generateIdempotencyKey(),
        metadata: data.metadata || null,
      },
      include: {
        portfolio: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        investment: {
          select: {
            id: true,
            symbol: true,
            name: true,
            investmentType: true,
          },
        },
        account: {
          select: {
            id: true,
            accountNumber: true,
            userId: true,
          },
        },
      },
    });

    // Create ledger entries
    const entryType = data.transactionType === 'BUY' ? 'DEBIT' : 'CREDIT';
    await LedgerService.createJournal({
      reference: generateReference('INV-TRX'),
      description: \`Investment \${data.transactionType}: \${quantity.toString()} \${investment.symbol}\`,
      entries: [
        {
          accountId: data.accountId,
          entryType: entryType as 'DEBIT' | 'CREDIT',
          amount: amount,
          description: \`Investment \${data.transactionType}: \${quantity.toString()} \${investment.symbol}\`,
          transactionId: transaction.id,
        },
      ],
      investmentTransactionId: transaction.id,
      metadata: {
        transactionId: transaction.id,
        investmentId: investment.id,
        quantity: quantity.toString(),
        price: price.toString(),
        amount: amount.toString(),
        fee: fee.toString(),
      },
    }, actingUserId);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: data.transactionType,
        resourceType: 'INVESTMENT_TRANSACTION',
        resourceId: transaction.id,
        newValues: {
          portfolioId: data.portfolioId,
          investmentId: investment.id,
          accountId: data.accountId,
          transactionType: data.transactionType,
          quantity: quantity.toString(),
          price: price.toString(),
          amount: amount.toString(),
          fee: fee.toString(),
        },
        metadata: data.metadata,
        status: 'SUCCESS',
      },
    });

    return this.formatTransaction(transaction);
  }

  /**
   * Get a transaction by ID
   */
  static async getTransactionById(
    id: string,
    actingUserId: string
  ): Promise<TransactionResult> {
    const transaction = await prisma.investmentTransaction.findUnique({
      where: { id },
      include: {
        portfolio: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        investment: {
          select: {
            id: true,
            symbol: true,
            name: true,
            investmentType: true,
          },
        },
        account: {
          select: {
            id: true,
            accountNumber: true,
            userId: true,
          },
        },
        journal: true,
      },
    });

    if (!transaction) throw new NotFoundError('Investment Transaction', id);

    // Authorization check
    if (actingUserId !== transaction.portfolio.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this transaction');
      }
    }

    return this.formatTransaction(transaction);
  }

  /**
   * List transactions for a portfolio
   */
  static async listTransactions(
    portfolioId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    transactionType?: InvestmentTransactionType,
    investmentId?: string
  ): Promise<TransactionListResult> {
    const portfolio = await prisma.investmentPortfolio.findUnique({
      where: { id: portfolioId },
    });

    if (!portfolio) throw new NotFoundError('Investment Portfolio', portfolioId);

    // Authorization check
    if (actingUserId !== portfolio.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this portfolio');
      }
    }

    const where: Record<string, unknown> = { portfolioId };
    if (transactionType) where.transactionType = transactionType;
    if (investmentId) where.investmentId = investmentId;

    const transactions = await prisma.investmentTransaction.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { executedAt: 'desc' },
      include: {
        portfolio: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
        investment: {
          select: {
            id: true,
            symbol: true,
            name: true,
            investmentType: true,
          },
        },
        account: {
          select: {
            id: true,
            accountNumber: true,
            userId: true,
          },
        },
      },
    });

    const total = await prisma.investmentTransaction.count({ where });

    return {
      transactions: transactions.map(t => this.formatTransaction(t)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================
  // PERFORMANCE & STATISTICS
  // ============================================

  /**
   * Get portfolio performance
   */
  static async getPortfolioPerformance(
    portfolioId: string,
    actingUserId: string,
    period: '1D' | '7D' | '30D' | '90D' | 'YTD' | '1Y' | 'ALL' = 'ALL'
  ): Promise<PortfolioPerformance> {
    const portfolio = await prisma.investmentPortfolio.findUnique({
      where: { id: portfolioId },
    });

    if (!portfolio) throw new NotFoundError('Investment Portfolio', portfolioId);

    // Authorization check
    if (actingUserId !== portfolio.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this portfolio');
      }
    }

    // Calculate start date based on period
    const now = new Date();
    const startDate = new Date(now);
    
    switch (period) {
      case '1D':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7D':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30D':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90D':
        startDate.setDate(now.getDate() - 90);
        break;
      case 'YTD':
        startDate.setMonth(0, 1);
        break;
      case '1Y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    // Get transactions for the period
    const transactions = await prisma.investmentTransaction.findMany({
      where: {
        portfolioId,
        executedAt: { gte: startDate },
        status: 'COMPLETED',
      },
      include: { fee: true },
    });

    // Get all investments in portfolio
    const investments = await prisma.investment.findMany({
      where: { portfolioId, status: { in: ['ACTIVE', 'PENDING'] } },
    });

    // Calculate statistics
    const totalTransactions = transactions.length;
    const totalFees = transactions.reduce((sum, t) => sum.plus(toDecimal(t.fee)), new Decimal(0));
    const dividendIncome = new Decimal(0); // Would be calculated from dividend transactions

    // Calculate start and end values
    const startValue = await this.calculatePortfolioValue(portfolioId, startDate);
    const endValue = await this.calculatePortfolioValue(portfolioId, now);
    const totalReturn = endValue.minus(startValue);
    const totalReturnPercent = startValue.equals(new Decimal(0)) ? new Decimal(0) : totalReturn.div(startValue).times(100);

    return {
      portfolioId,
      portfolioName: portfolio.name,
      period,
      startValue: startValue.toNumber(),
      endValue: endValue.toNumber(),
      totalReturn: totalReturn.toNumber(),
      totalReturnPercent: totalReturnPercent.toNumber(),
      transactions: totalTransactions,
      fees: totalFees.toNumber(),
      dividendIncome: dividendIncome.toNumber(),
    };
  }

  /**
   * Calculate portfolio value at a specific date
   */
  private static async calculatePortfolioValue(portfolioId: string, asOfDate: Date): Promise<Decimal> {
    const investments = await prisma.investment.findMany({
      where: {
        portfolioId,
        status: { in: ['ACTIVE', 'PENDING'] },
      },
    });

    let totalValue = new Decimal(0);
    for (const investment of investments) {
      const quantity = toDecimal(investment.quantity);
      const currentPrice = toDecimal(investment.currentPrice);
      totalValue = totalValue.plus(quantity.times(currentPrice));
    }

    return totalValue;
  }

  /**
   * Get investment statistics
   */
  static async getInvestmentStats(actingUserId: string): Promise<InvestmentStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view investment statistics');
    }

    const totalPortfolios = await prisma.investmentPortfolio.count();
    const totalInvestments = await prisma.investment.count();

    const investments = await prisma.investment.findMany({
      where: { status: { in: ['ACTIVE', 'PENDING'] } },
      include: { portfolio: true },
    });

    let totalValue = new Decimal(0);
    let totalInvested = new Decimal(0);
    const byType: Record<InvestmentType, { count: number; value: number; }> = {
      STOCK: { count: 0, value: 0 },
      BOND: { count: 0, value: 0 },
      MUTUAL_FUND: { count: 0, value: 0 },
      ETF: { count: 0, value: 0 },
      CRYPTO: { count: 0, value: 0 },
      OTHER: { count: 0, value: 0 },
    };
    const byStatus: Record<InvestmentStatus, number> = {
      ACTIVE: 0,
      PENDING: 0,
      CLOSED: 0,
      SUSPENDED: 0,
    };

    for (const investment of investments) {
      const quantity = toDecimal(investment.quantity);
      const currentPrice = toDecimal(investment.currentPrice);
      const purchasePrice = toDecimal(investment.purchasePrice);
      const value = quantity.times(currentPrice);
      const costBasis = quantity.times(purchasePrice);

      totalValue = totalValue.plus(value);
      totalInvested = totalInvested.plus(costBasis);

      byType[investment.investmentType].count++;
      byType[investment.investmentType].value += value.toNumber();
      byStatus[investment.status]++;
    }

    const totalGainLoss = totalValue.minus(totalInvested);

    // Calculate top holdings
    const sortedInvestments = [...investments].sort((a, b) => {
      const aValue = toDecimal(a.quantity).times(toDecimal(a.currentPrice));
      const bValue = toDecimal(b.quantity).times(toDecimal(b.currentPrice));
      return bValue.minus(aValue).toNumber();
    });

    const topHoldings = sortedInvestments.slice(0, 10).map(inv => {
      const quantity = toDecimal(inv.quantity);
      const currentPrice = toDecimal(inv.currentPrice);
      const value = quantity.times(currentPrice);
      const percent = totalValue.equals(new Decimal(0)) ? 0 : value.div(totalValue).times(100).toNumber();
      return {
        symbol: inv.symbol,
        name: inv.name,
        quantity: quantity.toNumber(),
        value: value.toNumber(),
        percentOfPortfolio: percent,
      };
    });

    return {
      totalPortfolios,
      totalInvestments,
      totalValue: totalValue.toNumber(),
      totalInvested: totalInvested.toNumber(),
      totalGainLoss: totalGainLoss.toNumber(),
      byType,
      byStatus,
      topHoldings,
    };
  }

  // ============================================
  // FORMATTERS
  // ============================================

  /**
   * Format portfolio with calculated values
   */
  private static async formatPortfolio(
    portfolio: InvestmentPortfolio & {
      user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
      investments: Investment[];
      transactions: InvestmentTransaction[];
    }
  ): Promise<PortfolioResult> {
    let totalValue = new Decimal(0);
    let totalInvested = new Decimal(0);
    let totalGainLoss = new Decimal(0);

    for (const investment of portfolio.investments) {
      const quantity = toDecimal(investment.quantity);
      const currentPrice = toDecimal(investment.currentPrice);
      const purchasePrice = toDecimal(investment.purchasePrice);
      const value = quantity.times(currentPrice);
      const costBasis = quantity.times(purchasePrice);

      totalValue = totalValue.plus(value);
      totalInvested = totalInvested.plus(costBasis);
    }

    totalGainLoss = totalValue.minus(totalInvested);

    return {
      portfolio: {
        ...portfolio,
        totalValue: totalValue.toNumber(),
        totalInvested: totalInvested.toNumber(),
        totalGainLoss: totalGainLoss.toNumber(),
      },
    };
  }

  /**
   * Format investment with calculated values
   */
  private static async formatInvestment(
    investment: Investment & {
      portfolio: Pick<InvestmentPortfolio, 'id' | 'name' | 'userId'>;
      transactions: InvestmentTransaction[];
    }
  ): Promise<InvestmentResult> {
    const quantity = toDecimal(investment.quantity);
    const currentPrice = toDecimal(investment.currentPrice);
    const purchasePrice = toDecimal(investment.purchasePrice);

    const currentValue = quantity.times(currentPrice);
    const costBasis = quantity.times(purchasePrice);
    const gainLoss = currentValue.minus(costBasis);
    const gainLossPercent = costBasis.equals(new Decimal(0)) ? new Decimal(0) : gainLoss.div(costBasis).times(100);

    return {
      investment: {
        ...investment,
        currentValue: currentValue.toNumber(),
        costBasis: costBasis.toNumber(),
        gainLoss: gainLoss.toNumber(),
        gainLossPercent: gainLossPercent.toNumber(),
      },
    };
  }

  /**
   * Format transaction for output
   */
  private static formatTransaction(
    transaction: InvestmentTransaction & {
      portfolio: Pick<InvestmentPortfolio, 'id' | 'name' | 'userId'>;
      investment: Pick<Investment, 'id' | 'symbol' | 'name' | 'investmentType'>;
      account: Pick<Account, 'id' | 'accountNumber' | 'userId'>;
      journal?: Journal | null;
    }
  ): TransactionResult {
    return { transaction };
  }
}
