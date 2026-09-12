import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!['ADMIN', 'SUPER_ADMIN', 'SUPPORT', 'OPERATOR'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const { limit, page } = Object.fromEntries(new URL(request.url).searchParams.entries());
    const limitNum = parseInt(limit) || 10;
    const pageNum = parseInt(page) || 1;
    const skip = (pageNum - 1) * limitNum;

    // Fetch transactions for this account
    const transactions = await prisma.transaction.findMany({
      where: {
        accountId: id,
      },
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        journal: true,
      },
    });

    const total = await prisma.transaction.count({
      where: {
        accountId: id,
      },
    });

    return NextResponse.json({
      transactions,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch account transactions' },
      { status: 500 }
    );
  }
}