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
import { LedgerService } from './ledger-service';
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
  quantity: number | string; // Decimal string or number
  purchasePrice: number | string;
  metadata?: Record<string, unknown>;
}

export interface UpdateInvestmentData {
  name?: string;
  currentPrice?: number | string;
  status?: InvestmentStatus;
  metadata?: Record<string, unknown>;
}

export interface BuyInvestmentData {
  portfolioId: string;
  accountId: string;
  symbol: string;
  name: string;
  investmentType: InvestmentType;
  quantity: number | string;
  price: number | string;
  fee?: number | string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface SellInvestmentData {
  investmentId: string;
  portfolioId: string;
  accountId: string;
  quantity: number | string;
  price: number | string;
  fee?: number | string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface InvestmentTransactionData {
  portfolioId: string;
  investmentId: string;
  accountId: string;
  transactionType: InvestmentTransactionType;
  quantity: number | string;
  price: number | string;
  amount: number | string;
  fee?: number | string;
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
  MAX_FEE_PERCENT: 0.05, // 5%
  DEFAULT_FEE: 0,
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

    // Validate quantity and price
    const quantity = this.toDecimalNumber(data.quantity);
    const purchasePrice = this.toDecimalNumber(data.purchasePrice);

    if (quantity <= 0) {
      throw new ValidationError('Quantity must be greater than 0');
    }

    if (purchasePrice <= 0) {
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
          quantity,
          purchasePrice,
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
        currentPrice: data.currentPrice ? this.toDecimal(data.currentPrice) : undefined,
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
        oldValues: { currentPrice: oldPrice, status: oldStatus },
        newValues: {
          currentPrice: data.currentPrice || oldPrice,
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

    // Validate inputs
    const quantity = this.toDecimalNumber(data.quantity);
    const price = this.toDecimalNumber(data.price);
    const fee = data.fee ? this.toDecimalNumber(data.fee) : INVESTMENT_CONFIG.DEFAULT_FEE;

    if (quantity <= 0) {
      throw new ValidationError('Quantity must be greater than 0');
    }

    if (price <= 0) {
      throw new ValidationError('Price must be greater than 0');
    }

    if (fee < 0 || fee > quantity * price * INVESTMENT_CONFIG.MAX_FEE_PERCENT) {
      throw new ValidationError(`Fee must be between 0 and ${INVESTMENT_CONFIG.MAX_FEE_PERCENT * 100}% of transaction value`);
    }

    const amount = quantity * price + fee;

    // Check sufficient balance
    if (account.availableBalance < amount) {
      throw new InsufficientBalanceError(
        account.id,
        amount,
        Number(account.availableBalance)
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
          quantity: 0,
          purchasePrice: 0,
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
        amount: amount - fee, // Net amount (excluding fee)
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

    // Update investment quantity and average purchase price
    const oldQuantity = Number(investment.quantity);
    const oldPurchasePrice = Number(investment.purchasePrice);
    const newQuantity = oldQuantity + quantity;
    const newAveragePrice = (oldQuantity * oldPurchasePrice + quantity * price) / newQuantity;

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
      description: `Investment purchase: ${quantity} ${data.symbol} at ${price}`,
      entries: [
        {
          accountId: data.accountId,
          entryType: 'DEBIT',
          amount: amount,
          description: `Investment purchase: ${quantity} ${data.symbol}`,
          transactionId: transaction.id,
        },
      ],
      investmentTransactionId: transaction.id,
      metadata: {
        transactionId: transaction.id,
        investmentId: investment.id,
        quantity,
        price,
        fee,
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
          quantity,
          price,
          amount,
          fee,
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

    // Validate inputs
    const quantity = this.toDecimalNumber(data.quantity);
    const price = this.toDecimalNumber(data.price);
    const fee = data.fee ? this.toDecimalNumber(data.fee) : INVESTMENT_CONFIG.DEFAULT_FEE;

    if (quantity <= 0) {
      throw new ValidationError('Quantity must be greater than 0');
    }

    if (price <= 0) {
      throw new ValidationError('Price must be greater than 0');
    }

    if (quantity > Number(investment.quantity)) {
      throw new ValidationError('Cannot sell more than owned quantity');
    }

    const amount = quantity * price - fee;

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

    // Update investment quantity
    const newQuantity = Number(investment.quantity) - quantity;

    await prisma.investment.update({
      where: { id: investment.id },
      data: {
        quantity: newQuantity,
        status: newQuantity <= 0 ? 'SOLD' : 'ACTIVE',
      },
    });

    // Create ledger entries for the transaction
    await LedgerService.createJournal({
      reference: generateReference('INV-SELL'),
      description: `Investment sale: ${quantity} ${investment.symbol} at ${price}`,
      entries: [
        {
          accountId: data.accountId,
          entryType: 'CREDIT',
          amount: amount + fee, // Credit the net amount + fee (fee is deducted separately)
          description: `Investment sale proceeds: ${quantity} ${investment.symbol}`,
          transactionId: transaction.id,
        },
        {
          accountId: data.accountId,
          entryType: 'DEBIT',
          amount: fee,
          description: `Investment sale fee: ${quantity} ${investment.symbol}`,
          transactionId: transaction.id,
        },
      ],
      investmentTransactionId: transaction.id,
      metadata: {
        transactionId: transaction.id,
        investmentId: investment.id,
        quantity,
        price,
        fee,
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
          quantity,
          price,
          amount,
          fee,
        },
        metadata: data.metadata,
        status: 'SUCCESS',
      },
    });

    return this.formatTransaction(transaction);
  }

  /**
   * Get an investment transaction by ID
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
    status?: TransactionStatus,
    startDate?: Date,
    endDate?: Date
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
    if (status) where.status = status;
    if (startDate || endDate) {
      where.executedAt = {};
      if (startDate) where.executedAt.gte = startDate;
      if (endDate) where.executedAt.lte = endDate;
    }

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
        journal: true,
      },
    });

    const total = await prisma.investmentTransaction.count({ where });

    return {
      transactions: transactions.map(this.formatTransaction),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================
  // PERFORMANCE & ANALYTICS
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
      include: {
        investments: {
          include: {
            transactions: true,
          },
        },
        transactions: true,
      },
    });

    if (!portfolio) throw new NotFoundError('Investment Portfolio', portfolioId);

    // Authorization check
    if (actingUserId !== portfolio.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this portfolio');
      }
    }

    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '1D':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7D':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30D':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90D':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'YTD':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case '1Y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0); // All time
    }

    // Calculate start value (value of portfolio at start date)
    const startInvestments = await prisma.investment.findMany({
      where: {
        portfolioId,
        purchasedAt: { lte: startDate },
      },
    });

    const startValue = startInvestments.reduce(
      (sum, i) => sum + Number(i.quantity) * Number(i.purchasePrice),
      0
    );

    // Calculate end value (current value of portfolio)
    const endInvestments = await prisma.investment.findMany({
      where: { portfolioId },
    });

    const endValue = endInvestments.reduce(
      (sum, i) => sum + Number(i.quantity) * (Number(i.currentPrice) || Number(i.purchasePrice)),
      0
    );

    // Calculate total return
    const totalReturn = endValue - startValue;
    const totalReturnPercent = startValue > 0 ? (totalReturn / startValue) * 100 : 0;

    // Count transactions
    const transactions = await prisma.investmentTransaction.count({
      where: {
        portfolioId,
        executedAt: { gte: startDate },
      },
    });

    // Calculate fees
    const fees = await prisma.investmentTransaction.aggregate({
      where: {
        portfolioId,
        executedAt: { gte: startDate },
      },
      _sum: { fee: true },
    });

    // Calculate dividend income (transactions of type DIVIDEND)
    const dividends = await prisma.investmentTransaction.aggregate({
      where: {
        portfolioId,
        transactionType: 'DIVIDEND',
        executedAt: { gte: startDate },
      },
      _sum: { amount: true },
    });

    return {
      portfolioId: portfolio.id,
      portfolioName: portfolio.name,
      period,
      startValue,
      endValue,
      totalReturn,
      totalReturnPercent,
      transactions,
      fees: Number(fees._sum.fee || 0),
      dividendIncome: Number(dividends._sum.amount || 0),
    };
  }

  /**
   * Get investment performance
   */
  static async getInvestmentPerformance(
    investmentId: string,
    actingUserId: string,
    period: '1D' | '7D' | '30D' | '90D' | 'YTD' | '1Y' | 'ALL' = 'ALL'
  ): Promise<InvestmentPerformance> {
    const investment = await prisma.investment.findUnique({
      where: { id: investmentId },
      include: {
        portfolio: true,
        transactions: true,
      },
    });

    if (!investment) throw new NotFoundError('Investment', investmentId);

    // Authorization check
    if (actingUserId !== investment.portfolio.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this investment');
      }
    }

    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '1D':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7D':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30D':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90D':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'YTD':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case '1Y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0); // All time
    }

    // Get investment value at start date
    const startQuantity = Number(investment.quantity);
    const startPrice = Number(investment.purchasePrice);
    const startValue = startQuantity * startPrice;

    // Get current value
    const currentPrice = Number(investment.currentPrice) || startPrice;
    const currentQuantity = Number(investment.quantity);
    const endValue = currentQuantity * currentPrice;

    // Calculate return
    const totalReturn = endValue - startValue;
    const totalReturnPercent = startValue > 0 ? (totalReturn / startValue) * 100 : 0;

    return {
      investmentId: investment.id,
      symbol: investment.symbol,
      period,
      startValue,
      endValue,
      totalReturn,
      totalReturnPercent,
      quantity: currentQuantity,
      averagePurchasePrice: startPrice,
      currentPrice,
    };
  }

  /**
   * Get investment statistics
   */
  static async getStats(actingUserId: string): Promise<InvestmentStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view investment statistics');
    }

    const totalPortfolios = await prisma.investmentPortfolio.count();
    const totalInvestments = await prisma.investment.count();

    // Calculate total value
    const investments = await prisma.investment.findMany({
      include: { portfolio: true },
    });

    const totalValue = investments.reduce(
      (sum, i) => sum + Number(i.quantity) * (Number(i.currentPrice) || Number(i.purchasePrice)),
      0
    );

    const totalInvested = investments.reduce(
      (sum, i) => sum + Number(i.quantity) * Number(i.purchasePrice),
      0
    );

    const totalGainLoss = totalValue - totalInvested;

    // Group by type
    const byType: Record<InvestmentType, { count: number; value: number }> = {
      STOCK: { count: 0, value: 0 },
      BOND: { count: 0, value: 0 },
      ETF: { count: 0, value: 0 },
      MUTUAL_FUND: { count: 0, value: 0 },
      CRYPTO: { count: 0, value: 0 },
      COMMODITY: { count: 0, value: 0 },
      REAL_ESTATE: { count: 0, value: 0 },
      OTHER: { count: 0, value: 0 },
    };

    for (const investment of investments) {
      const type = investment.investmentType;
      if (byType[type]) {
        byType[type].count++;
        byType[type].value += Number(investment.quantity) * (Number(investment.currentPrice) || Number(investment.purchasePrice));
      }
    }

    // Group by status
    const byStatus: Record<InvestmentStatus, number> = {
      ACTIVE: 0,
      SOLD: 0,
      PENDING: 0,
    };

    for (const investment of investments) {
      byStatus[investment.status]++;
    }

    // Get top holdings
    const sortedInvestments = [...investments].sort(
      (a, b) => 
        (Number(b.quantity) * (Number(b.currentPrice) || Number(b.purchasePrice))) -
        (Number(a.quantity) * (Number(a.currentPrice) || Number(a.purchasePrice)))
    );

    const topHoldings = sortedInvestments.slice(0, 10).map(i => {
      const value = Number(i.quantity) * (Number(i.currentPrice) || Number(i.purchasePrice));
      return {
        symbol: i.symbol,
        name: i.name,
        quantity: Number(i.quantity),
        value,
        percentOfPortfolio: totalValue > 0 ? (value / totalValue) * 100 : 0,
      };
    });

    return {
      totalPortfolios,
      totalInvestments,
      totalValue,
      totalInvested,
      totalGainLoss,
      byType,
      byStatus,
      topHoldings,
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Convert amount to Decimal (Prisma Decimal type)
   */
  private static toDecimal(amount: number | string): number {
    if (typeof amount === 'string') {
      return parseFloat(amount);
    }
    return amount;
  }

  /**
   * Convert amount to number for calculations
   */
  private static toDecimalNumber(amount: number | string): number {
    return typeof amount === 'string' ? parseFloat(amount) : amount;
  }

  /**
   * Format portfolio with calculated values
   */
  private static async formatPortfolio(portfolio: InvestmentPortfolio & {
    user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
    investments: Investment[];
    transactions: InvestmentTransaction[];
  }): Promise<PortfolioResult['portfolio']> {
    const totalValue = portfolio.investments.reduce(
      (sum, i) => sum + Number(i.quantity) * (Number(i.currentPrice) || Number(i.purchasePrice)),
      0
    );

    const totalInvested = portfolio.investments.reduce(
      (sum, i) => sum + Number(i.quantity) * Number(i.purchasePrice),
      0
    );

    const totalGainLoss = totalValue - totalInvested;

    return {
      ...portfolio,
      user: portfolio.user,
      investments: portfolio.investments,
      transactions: portfolio.transactions,
      totalValue,
      totalInvested,
      totalGainLoss,
    };
  }

  /**
   * Format investment with calculated values
   */
  private static async formatInvestment(investment: Investment & {
    portfolio: Pick<InvestmentPortfolio, 'id' | 'name' | 'userId'>;
    transactions: InvestmentTransaction[];
  }): Promise<InvestmentResult['investment']> {
    const currentPrice = Number(investment.currentPrice) || Number(investment.purchasePrice);
    const quantity = Number(investment.quantity);
    const purchasePrice = Number(investment.purchasePrice);

    const currentValue = quantity * currentPrice;
    const costBasis = quantity * purchasePrice;
    const gainLoss = currentValue - costBasis;
    const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

    return {
      ...investment,
      portfolio: investment.portfolio,
      transactions: investment.transactions,
      currentValue,
      costBasis,
      gainLoss,
      gainLossPercent,
    };
  }

  /**
   * Format transaction with related data
   */
  private static formatTransaction(transaction: InvestmentTransaction & {
    portfolio: Pick<InvestmentPortfolio, 'id' | 'name' | 'userId'>;
    investment: Pick<Investment, 'id' | 'symbol' | 'name' | 'investmentType'>;
    account: Pick<Account, 'id' | 'accountNumber' | 'userId'>;
    journal?: Journal | null;
  }): TransactionResult['transaction'] {
    return {
      ...transaction,
      portfolio: transaction.portfolio,
      investment: transaction.investment,
      account: transaction.account,
      journal: transaction.journal || null,
    };
  }
}
