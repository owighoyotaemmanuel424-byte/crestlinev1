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

    const { search, status, riskStatus, customerId, page, limit } = Object.fromEntries(
      new URL(request.url).searchParams.entries()
    );
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { fromUser: { firstName: { contains: search, mode: 'insensitive' } } },
        { fromUser: { lastName: { contains: search, mode: 'insensitive' } } },
        { fromUser: { email: { contains: search, mode: 'insensitive' } } },
        { toUser: { firstName: { contains: search, mode: 'insensitive' } } },
        { toUser: { lastName: { contains: search, mode: 'insensitive' } } },
        { toUser: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (status && status !== 'ALL') where.status = status;
    if (riskStatus && riskStatus !== 'ALL') where.riskStatus = riskStatus;
    if (customerId) {
      where.OR = [
        { fromUserId: customerId },
        { toUserId: customerId },
      ];
    }

    const [transfers, total] = await Promise.all([
      prisma.transfer.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          fromUser: { select: { id: true, email: true, firstName: true, lastName: true, status: true } },
          toUser: { select: { id: true, email: true, firstName: true, lastName: true, status: true } },
          fromAccount: { select: { id: true, accountNumber: true, name: true } },
          toAccount: { select: { id: true, accountNumber: true, name: true } },
          journal: { include: { entries: true } },
          transaction: true,
          reviewedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          auditLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      }),
      prisma.transfer.count({ where }),
    ]);

    return NextResponse.json({
      transfers,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch transfers' },
      { status: 500 }
    );
  }
}