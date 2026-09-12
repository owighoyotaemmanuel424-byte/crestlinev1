import { prisma } from '../prisma';
import { ForbiddenError, NotFoundError, ValidationError, CardError, CardFrozenError } from '../utils/errors';
import { generateReference } from '../utils/security';
import type { Card, CardType, CardBrand, CardStatus, User, Account } from '@prisma/client';

export interface CreateCardData {
  userId: string;
  accountId: string;
  cardType: CardType;
  cardBrand: CardBrand;
  expiryMonth: number;
  expiryYear: number;
  dailyLimit?: number;
  monthlyLimit?: number;
}

export interface CardResult {
  card: Card;
}

export class CardService {
  static async createCard(data: CreateCardData, actingUserId?: string): Promise<CardResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);
    const account = await prisma.account.findUnique({ where: { id: data.accountId } });
    if (!account) throw new NotFoundError('Account', data.accountId);
    if (account.userId !== data.userId) throw new ForbiddenError('Account does not belong to user');
    const cardNumber = generateReference('CARD');
    const card = await prisma.card.create({
      data: {
        userId: data.userId,
        accountId: data.accountId,
        cardNumber,
        maskedCardNumber: '***' + cardNumber.slice(-4),
        cardType: data.cardType,
        cardBrand: data.cardBrand,
        expiryMonth: data.expiryMonth,
        expiryYear: data.expiryYear,
        dailyLimit: data.dailyLimit || 5000,
        monthlyLimit: data.monthlyLimit || 50000,
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
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) throw new ForbiddenError('You do not have access to this card');
    }
    return { card };
  }
  static async getUserCards(userId: string, actingUserId?: string): Promise<{ cards: Card[]; total: number }> {
    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) throw new ForbiddenError('You do not have access to these cards');
    }
    const cards = await prisma.card.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return { cards, total: cards.length };
  }
  static async freezeCard(id: string, actingUserId: string): Promise<CardResult> {
    const card = await prisma.card.findUnique({ where: { id } });
    if (!card) throw new NotFoundError('Card', id);
    if (card.status === 'FROZEN') throw new CardFrozenError(card.id);
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) throw new ForbiddenError('Only administrators or operators can freeze cards');
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
  static async unfreezeCard(id: string, actingUserId: string): Promise<CardResult> {
    const card = await prisma.card.findUnique({ where: { id } });
    if (!card) throw new NotFoundError('Card', id);
    if (card.status !== 'FROZEN') throw new ValidationError('Card is not frozen');
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) throw new ForbiddenError('Only administrators or operators can unfreeze cards');
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