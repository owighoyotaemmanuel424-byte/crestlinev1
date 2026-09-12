import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!['ADMIN', 'SUPER_ADMIN', 'SUPPORT', 'OPERATOR'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { search, status, method, customerId, accountId, page, limit } = Object.fromEntries(
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
      ];
    }
    if (status && status !== 'ALL') where.status = status;
    if (method && method !== 'ALL') where.method = method;
    if (customerId) where.userId = customerId;
    if (accountId) where.accountId = accountId;

    const [deposits, total] = await Promise.all([
      prisma.deposit.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          account: { select: { id: true, accountNumber: true, name: true } },
          journal: { include: { entries: true } },
          transaction: true,
        },
      }),
      prisma.deposit.count({ where }),
    ]);

    return NextResponse.json({
      deposits,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch deposits' },
      { status: 500 }
    );
  }
}