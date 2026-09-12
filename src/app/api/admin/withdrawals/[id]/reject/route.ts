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

    if (!['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { notes, reason } = body;

    const result = await WithdrawalService.updateWithdrawalStatus(
      id,
      { status: 'REJECTED', reviewNotes: notes, reviewedById: session.user.id, rejectionReason: reason },
      session.user.role
    );

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'REJECT',
        resourceType: 'WITHDRAWAL',
        resourceId: id,
        metadata: { notes, reason },
        status: 'SUCCESS',
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reject withdrawal' },
      { status: 500 }
    );
  }
}