import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { FraudService } from '@/lib/services/fraud-service';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'OPERATOR'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const fraudAlert = await prisma.fraudAlert.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, kYCProfile: true } },
        transaction: { include: { user: true, account: true, journal: true } },
        transfer: { include: { fromUser: true, toUser: true, fromAccount: true, toAccount: true } },
        withdrawal: { include: { user: true, account: true } },
        deposit: { include: { user: true, account: true } },
        reviewedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!fraudAlert) {
      return NextResponse.json({ error: 'Fraud alert not found' }, { status: 404 });
    }

    return NextResponse.json(fraudAlert);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch fraud alert' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'OPERATOR'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { status, reviewNotes, escalateTo } = body;

    const result = await FraudService.updateFraudAlertStatus(
      id,
      { status, reviewNotes, reviewedById: session.user.id, escalateTo },
      session.user.role
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update fraud alert' },
      { status: 500 }
    );
  }
}