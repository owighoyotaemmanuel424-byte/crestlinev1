import { prisma } from '../prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import type { Beneficiary } from '@prisma/client';

export class BeneficiaryService {
  static async createBeneficiary(data: any, actingUserId?: string) {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);
    const beneficiary = await prisma.beneficiary.create({ data: { userId: data.userId, name: data.name, accountNumber: data.accountNumber, bankName: data.bankName } });
    return { beneficiary };
  }
}