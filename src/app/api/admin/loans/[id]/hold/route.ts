import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { LoanService } from '@/lib/services/loan-service';

export async function POST(
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

    if (!['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { notes } = body;

    const result = await LoanService.updateLoanStatus(
      id,
      'ON_HOLD',
      { notes, reviewedById: session.user.id },
      session.user.role
    );

    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'HOLD',
        resourceType: 'LOAN',
        resourceId: id,
        metadata: { notes },
        status: 'SUCCESS',
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to place loan on hold' },
      { status: 500 }
    );
  }
}