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

    const { search, accountType, status, customerId, page, limit } = Object.fromEntries(
      new URL(request.url).searchParams.entries()
    );
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (search) {
      where.OR = [
        { accountNumber: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (accountType && accountType !== 'ALL') where.accountType = accountType;
    if (status && status !== 'ALL') where.status = status;
    if (customerId) where.userId = customerId;

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, status: true } },
          _count: {
            select: {
              transactions: true,
              transfersFrom: true,
              transfersTo: true,
              deposits: true,
              withdrawals: true,
            },
          },
        },
      }),
      prisma.account.count({ where }),
    ]);

    return NextResponse.json({
      accounts,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}