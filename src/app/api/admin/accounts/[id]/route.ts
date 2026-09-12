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

    // Check admin/support/operator role
    if (!['ADMIN', 'SUPER_ADMIN', 'SUPPORT', 'OPERATOR'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const account = await prisma.account.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            role: true,
          },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            journal: true,
          },
        },
        transfersFrom: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        transfersTo: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        deposits: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        withdrawals: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        cards: true,
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        _count: {
          select: {
            transactions: true,
            transfersFrom: true,
            transfersTo: true,
            deposits: true,
            withdrawals: true,
          },
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(account);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch account' },
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

    // Only ADMIN, SUPER_ADMIN, and OPERATOR can update account status
    if (!['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status, notes } = body;

    // Validate status
    const validStatuses = ['ACTIVE', 'FROZEN', 'CLOSED', 'PENDING', 'SUSPENDED'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status value' },
        { status: 400 }
      );
    }

    // Cannot directly modify balance - must use ledger
    if (body.balance !== undefined || body.availableBalance !== undefined) {
      return NextResponse.json(
        { error: 'Balance cannot be modified directly. Use ledger operations.' },
        { status: 400 }
      );
    }

    const account = await prisma.account.update({
      where: { id },
      data: {
        status: status || undefined,
        notes: notes || undefined,
      },
      include: {
        user: true,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'UPDATE',
        resourceType: 'ACCOUNT',
        resourceId: id,
        oldValues: { status: account.status },
        newValues: { status, notes },
        status: 'SUCCESS',
      },
    });

    return NextResponse.json(account);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update account' },
      { status: 500 }
    );
  }
}