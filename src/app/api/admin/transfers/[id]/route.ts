import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { TransferService } from '@/lib/services/transfer-service';

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

    // Check admin/support/operator/compliance role
    if (!['ADMIN', 'SUPER_ADMIN', 'SUPPORT', 'OPERATOR', 'COMPLIANCE'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const transfer = await TransferService.getTransferById(id, undefined);

    if (!transfer) {
      return NextResponse.json(
        { error: 'Transfer not found' },
        { status: 404 }
      );
    }

    // Fetch audit logs for this transfer
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        resourceType: 'TRANSFER',
        resourceId: id,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({ ...transfer, auditLogs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch transfer' },
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

    // Only ADMIN, SUPER_ADMIN, and OPERATOR can update transfer status
    if (!['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status, riskStatus, description, reviewNotes } = body;

    // Validate status
    const validStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED', 'ON_HOLD'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status value' },
        { status: 400 }
      );
    }

    const result = await TransferService.updateTransferStatus(
      id,
      status as any,
      session.user.id,
      description
    );

    // Update risk status if provided
    if (riskStatus) {
      await TransferService.updateTransferRiskStatus(
        id,
        riskStatus as any,
        session.user.id,
        reviewNotes
      );
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'UPDATE',
        resourceType: 'TRANSFER',
        resourceId: id,
        oldValues: { status: result.transfer.status },
        newValues: { status, riskStatus, description, reviewNotes },
        status: 'SUCCESS',
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update transfer' },
      { status: 500 }
    );
  }
}