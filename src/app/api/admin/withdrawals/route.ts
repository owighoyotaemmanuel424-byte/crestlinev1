import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!['ADMIN', 'SUPER_ADMIN', 'SUPPORT', 'OPERATOR', 'COMPLIANCE'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { search, status, method, customerId, accountId, riskStatus, page, limit } = Object.fromEntries(
      new URL(request.url).searchParams.entries()
    );
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { providerReference: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (status && status !== 'ALL') where.status = status;
    if (method && method !== 'ALL') where.method = method;
    if (riskStatus && riskStatus !== 'ALL') where.riskStatus = riskStatus;
    if (customerId) where.userId = customerId;
    if (accountId) where.accountId = accountId;

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, kYCProfile: true } },
          account: { select: { id: true, accountNumber: true, name: true, balance: true, availableBalance: true } },
          reviewedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          journal: { include: { entries: true } },
          transaction: true,
          fraudAlerts: true,
          auditLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      }),
      prisma.withdrawal.count({ where }),
    ]);

    return NextResponse.json({
      withdrawals,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch withdrawals' },
      { status: 500 }
    );
  }
}