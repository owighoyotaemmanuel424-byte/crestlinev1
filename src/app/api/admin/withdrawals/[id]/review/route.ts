import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { WithdrawalService } from '@/lib/services/withdrawal-service';

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

    if (!['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { notes, riskStatus } = body;

    const result = await WithdrawalService.updateWithdrawalStatus(
      id,
      { status: 'UNDER_REVIEW', reviewNotes: notes, riskStatus, reviewedById: session.user.id },
      session.user.role
    );

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'REVIEW',
        resourceType: 'WITHDRAWAL',
        resourceId: id,
        metadata: { notes, riskStatus },
        status: 'SUCCESS',
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to review withdrawal' },
      { status: 500 }
    );
  }
}