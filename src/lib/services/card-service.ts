import { prisma } from '../prisma';
import { ForbiddenError, NotFoundError, ValidationError, CardError, CardFrozenError } from '../utils/errors';
import { generateReference } from '../utils/security';
import { Decimal } from '@prisma/client/runtime/library';
import type { Card, CardType, CardBrand, CardStatus, User, Account } from '@prisma/client';

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

export interface CreateCardData {
  userId: string;
  accountId?: string;
  cardType: CardType;
  cardBrand: CardBrand;
  expiryMonth: number;
  expiryYear: number;
  dailyLimit?: number | string | Decimal;
  monthlyLimit?: number | string | Decimal;
}

export interface CardResult {
  card: Card;
}

export class CardService {
  static async listCards(
    userId: string,
    options: { page?: number; limit?: number; status?: CardStatus } = {}
  ) {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const where: { userId: string; status?: CardStatus } = { userId };
    if (options.status) where.status = options.status;
    const cards = await prisma.card.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    const total = await prisma.card.count({ where });
    return { cards, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private static async assertCardAccess(id: string, actingUserId: string) {
    const card = await prisma.card.findUnique({ where: { id } });
    if (!card) throw new NotFoundError('Card', id);
    if (actingUserId !== card.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this card');
      }
    }
    return card;
  }

  static async updateCard(
    id: string,
    data: { isDefault?: boolean; status?: string },
    actingUserId: string
  ) {
    await this.assertCardAccess(id, actingUserId);
    const VALID: CardStatus[] = [
      'ACTIVE',
      'INACTIVE',
      'FROZEN',
      'LOST',
      'STOLEN',
      'EXPIRED',
      'CANCELLED',
    ];
    let status: CardStatus | undefined;
    if (data.status) {
      status = (data.status === 'REVOKED' ? 'CANCELLED' : data.status) as CardStatus;
      if (!VALID.includes(status)) {
        throw new ValidationError(`Invalid card status: ${data.status}`);
      }
    }
    const card = await prisma.card.update({
      where: { id },
      data: {
        status,
        isDefault: data.isDefault,
      },
    });
    return { card };
  }

  static async deleteCard(id: string, actingUserId: string) {
    await this.assertCardAccess(id, actingUserId);
    const card = await prisma.card.update({
      where: { id },
      data: { status: 'CANCELLED' as CardStatus },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'DELETE',
        resourceType: 'CARD',
        resourceId: id,
        oldValues: { status: 'ACTIVE' },
        newValues: { status: 'CANCELLED' },
        status: 'SUCCESS',
      },
    });
    return { card };
  }

  static async cancelCard(id: string, actingUserId: string, reason?: string) {
    await this.assertCardAccess(id, actingUserId);
    const existing = await prisma.card.findUnique({ where: { id }, select: { status: true } });
    const card = await prisma.card.update({
      where: { id },
      data: {
        status: 'CANCELLED' as CardStatus,
        metadata: { cancelledReason: reason ?? null, cancelledAt: new Date().toISOString() } as any,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'CANCEL',
        resourceType: 'CARD',
        resourceId: id,
        oldValues: { status: existing?.status ?? 'ACTIVE' },
        newValues: { status: 'CANCELLED', reason: reason ?? null },
        status: 'SUCCESS',
      },
    });
    return { card };
  }

  static async reportCard(id: string, actingUserId: string, reason?: string) {
    await this.assertCardAccess(id, actingUserId);
    const lost = /lost/i.test(reason ?? '');
    const newStatus: CardStatus = lost ? 'LOST' : 'STOLEN';
    const existing = await prisma.card.findUnique({ where: { id }, select: { status: true } });
    const card = await prisma.card.update({
      where: { id },
      data: {
        status: newStatus,
        metadata: { reportReason: reason ?? null, reportedAt: new Date().toISOString() } as any,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'REPORT',
        resourceType: 'CARD',
        resourceId: id,
        oldValues: { status: existing?.status ?? 'ACTIVE' },
        newValues: { status: newStatus, reason: reason ?? null },
        status: 'SUCCESS',
      },
    });
    return { card };
  }
  static async createCard(data: CreateCardData, actingUserId?: string): Promise<CardResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);
    let accountId = data.accountId;
    if (!accountId) {
      const defaultAccount = await prisma.account.findFirst({
        where: { userId: data.userId, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
      });
      accountId = defaultAccount?.id;
    }
    if (!accountId) throw new NotFoundError('Account', data.userId);
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundError('Account', accountId);
    if (account.userId !== data.userId) throw new ForbiddenError('Account does not belong to user');
    
    const cardNumber = generateReference('CARD');
    
    // Convert limits to Decimal
    const dailyLimit = data.dailyLimit ? toDecimal(data.dailyLimit) : new Decimal(5000);
    const monthlyLimit = data.monthlyLimit ? toDecimal(data.monthlyLimit) : new Decimal(50000);
    
    const card = await prisma.card.create({
      data: {
        userId: data.userId,
        accountId,
        cardNumber,
        maskedCardNumber: '***' + cardNumber.slice(-4),
        cardType: data.cardType,
        cardBrand: data.cardBrand,
        expiryMonth: data.expiryMonth,
        expiryYear: data.expiryYear,
        dailyLimit: dailyLimit,
        monthlyLimit: monthlyLimit,
        status: 'ACTIVE' as CardStatus,
        isDefault: false,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId || data.userId,
        action: 'CREATE',
        resourceType: 'CARD',
        resourceId: card.id,
        newValues: { cardNumber: card.maskedCardNumber, cardType: data.cardType },
        status: 'SUCCESS',
      },
    });
    return { card };
  }

  static async getCardById(id: string, actingUserId?: string): Promise<CardResult> {
    const card = await prisma.card.findUnique({ where: { id } });
    if (!card) throw new NotFoundError('Card', id);
    if (actingUserId && actingUserId !== card.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) 
        throw new ForbiddenError('You do not have access to this card');
    }
    return { card };
  }

  static async getUserCards(userId: string, actingUserId?: string): Promise<{ cards: Card[]; total: number }> {
    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) 
        throw new ForbiddenError('You do not have access to these cards');
    }
    const cards = await prisma.card.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return { cards, total: cards.length };
  }

  static async freezeCard(id: string, actingUserId: string, reason?: string): Promise<CardResult> {
    const card = await prisma.card.findUnique({ where: { id } });
    if (!card) throw new NotFoundError('Card', id);
    if (card.status === 'FROZEN') throw new CardFrozenError(card.id);
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) 
      throw new ForbiddenError('Only administrators or operators can freeze cards');
    const frozenCard = await prisma.card.update({ where: { id }, data: { status: 'FROZEN' as CardStatus } });
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'FREEZE',
        resourceType: 'CARD',
        resourceId: card.id,
        oldValues: { status: card.status },
        newValues: { status: 'FROZEN' },
        status: 'SUCCESS',
      },
    });
    return { card: frozenCard };
  }

  static async unfreezeCard(id: string, actingUserId: string, reason?: string): Promise<CardResult> {
    const card = await prisma.card.findUnique({ where: { id } });
    if (!card) throw new NotFoundError('Card', id);
    if (card.status !== 'FROZEN') throw new ValidationError('Card is not frozen');
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) 
      throw new ForbiddenError('Only administrators or operators can unfreeze cards');
    const unfrozenCard = await prisma.card.update({ where: { id }, data: { status: 'ACTIVE' as CardStatus } });
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'UNFREEZE',
        resourceType: 'CARD',
        resourceId: card.id,
        oldValues: { status: card.status },
        newValues: { status: 'ACTIVE' },
        status: 'SUCCESS',
      },
    });
    return { card: unfrozenCard };
  }
}
