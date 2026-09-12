import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check admin/support/operator/compliance role
    if (!['ADMIN', 'SUPER_ADMIN', 'SUPPORT', 'OPERATOR', 'COMPLIANCE'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const {
      search,
      type,
      status,
      customerId,
      accountId,
      startDate,
      endDate,
      page,
      limit
    } = Object.fromEntries(new URL(request.url).searchParams.entries());

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {};
    
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (type && type !== 'ALL') {
      where.type = type;
    }

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (customerId) {
      where.userId = customerId;
    }

    if (accountId) {
      where.accountId = accountId;
    }

    if (startDate) {
      where.createdAt = {
        ...where.createdAt,
        gte: new Date(startDate),
      };
    }

    if (endDate) {
      where.createdAt = {
        ...where.createdAt,
        lte: new Date(endDate),
      };
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip,
        take: limitNum,
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
          account: {
            select: {
              id: true,
              accountNumber: true,
              name: true,
              balance: true,
            },
          },
          journal: {
            include: {
              entries: true,
            },
          },
          transfer: {
            select: {
              id: true,
              reference: true,
              fromUserId: true,
              toUserId: true,
              amount: true,
            },
          },
          deposit: {
            select: {
              id: true,
              reference: true,
              method: true,
              amount: true,
            },
          },
          withdrawal: {
            select: {
              id: true,
              reference: true,
              method: true,
              amount: true,
            },
          },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    return NextResponse.json({
      transactions,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}