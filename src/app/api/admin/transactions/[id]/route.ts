import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { TransactionService } from '@/lib/services/transaction-service';

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

    const transaction = await TransactionService.getTransactionById(id, undefined);

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Fetch audit logs for this transaction
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        resourceType: 'TRANSACTION',
        resourceId: id,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({ ...transaction, auditLogs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch transaction' },
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

    // Only ADMIN and SUPER_ADMIN can update transaction metadata
    if (!['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { description, category, metadata, notes } = body;

    // Cannot directly modify amount, balance, or financial data
    if (body.amount !== undefined || body.balance !== undefined || body.type !== undefined) {
      return NextResponse.json(
        { error: 'Cannot modify financial transaction data directly' },
        { status: 400 }
      );
    }

    const result = await TransactionService.updateTransaction(
      id,
      { description, category, metadata, notes } as any,
      session.user.id
    );

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'UPDATE',
        resourceType: 'TRANSACTION',
        resourceId: id,
        oldValues: { description: result.transaction.description },
        newValues: { description, category, metadata, notes },
        status: 'SUCCESS',
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update transaction' },
      { status: 500 }
    );
  }
}