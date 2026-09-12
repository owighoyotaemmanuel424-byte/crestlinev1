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

    if (!['ADMIN', 'SUPER_ADMIN', 'SUPPORT', 'OPERATOR', 'COMPLIANCE'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Fetch withdrawal with journal
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id },
      include: {
        journal: {
          include: {
            entries: true,
          },
        },
      },
    });

    if (!withdrawal) {
      return NextResponse.json(
        { error: 'Withdrawal not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ journal: withdrawal.journal });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch withdrawal journal' },
      { status: 500 }
    );
  }
}