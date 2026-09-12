import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { DepositService } from '@/lib/services/deposit-service';

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
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const deposit = await DepositService.getDepositById(id, undefined);

    if (!deposit) {
      return NextResponse.json(
        { error: 'Deposit not found' },
        { status: 404 }
      );
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        resourceType: 'DEPOSIT',
        resourceId: id,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({ ...deposit, auditLogs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch deposit' },
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
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status, providerReference, description, reviewNotes } = body;

    const validStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status value' },
        { status: 400 }
      );
    }

    const result = await DepositService.updateDepositStatus(
      id,
      { status, providerReference, description } as any,
      session.user.id
    );

    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'UPDATE',
        resourceType: 'DEPOSIT',
        resourceId: id,
        oldValues: { status: result.deposit.status },
        newValues: { status, providerReference, description, reviewNotes },
        status: 'SUCCESS',
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update deposit' },
      { status: 500 }
    );
  }
}