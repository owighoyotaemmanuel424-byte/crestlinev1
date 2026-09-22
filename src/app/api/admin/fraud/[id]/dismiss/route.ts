import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { FraudService } from '@/lib/services/fraud-service';

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

    if (!['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'OPERATOR'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { notes, reason } = body;

    const result = await FraudService.updateFraudAlertStatus(
      id,
      {
        status: 'DISMISSED',
        reviewNotes: [notes, reason].filter(Boolean).join(' — ') || undefined,
        reviewedById: session.user.id,
      },
      session.user.role
    );

    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'DISMISS',
        resourceType: 'FRAUD_ALERT',
        resourceId: id,
        metadata: { notes, reason },
        status: 'SUCCESS',
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to dismiss fraud alert' },
      { status: 500 }
    );
  }
}