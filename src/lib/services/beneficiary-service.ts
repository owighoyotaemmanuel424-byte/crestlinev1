import { prisma } from '../prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import type { Beneficiary } from '@prisma/client';

export interface UpdateBeneficiaryData {
  name?: string;
  accountNumber?: string;
  bankName?: string;
  bankCode?: string;
  isDefault?: boolean;
}

export class BeneficiaryService {
  static async createBeneficiary(data: any, actingUserId?: string) {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);
    const beneficiary = await prisma.beneficiary.create({ data: { userId: data.userId, name: data.name, accountNumber: data.accountNumber, bankName: data.bankName } });
    return { beneficiary };
  }

  static async listBeneficiaries(
    userId: string,
    options: { page?: number; limit?: number } = {}
  ) {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const where = { userId };
    const beneficiaries = await prisma.beneficiary.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    const total = await prisma.beneficiary.count({ where });
    return { beneficiaries, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async getBeneficiaryById(id: string, actingUserId?: string) {
    const beneficiary = await prisma.beneficiary.findUnique({ where: { id } });
    if (!beneficiary) throw new NotFoundError('Beneficiary', id);
    if (actingUserId && actingUserId !== beneficiary.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this beneficiary');
      }
    }
    return { beneficiary };
  }

  static async updateBeneficiary(id: string, data: UpdateBeneficiaryData, actingUserId?: string) {
    const beneficiary = await prisma.beneficiary.findUnique({ where: { id } });
    if (!beneficiary) throw new NotFoundError('Beneficiary', id);
    if (actingUserId && actingUserId !== beneficiary.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this beneficiary');
      }
    }
    if (data.accountNumber && data.accountNumber !== beneficiary.accountNumber) {
      const conflict = await prisma.beneficiary.findUnique({
        where: { userId_accountNumber: { userId: beneficiary.userId, accountNumber: data.accountNumber } },
      });
      if (conflict) throw new ValidationError('A beneficiary with this account number already exists');
    }
    const updated = await prisma.beneficiary.update({
      where: { id },
      data: {
        name: data.name ?? undefined,
        accountNumber: data.accountNumber ?? undefined,
        bankName: data.bankName ?? undefined,
        bankCode: data.bankCode ?? undefined,
      },
    });
    return { beneficiary: updated };
  }

  static async deleteBeneficiary(id: string, actingUserId?: string) {
    const beneficiary = await prisma.beneficiary.findUnique({ where: { id } });
    if (!beneficiary) throw new NotFoundError('Beneficiary', id);
    if (actingUserId && actingUserId !== beneficiary.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this beneficiary');
      }
    }
    const updated = await prisma.beneficiary.update({
      where: { id },
      data: { status: 'DELETED' },
    });
    return { beneficiary: updated };
  }
}
