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

    // Check admin/support/compliance role
    if (!['ADMIN', 'SUPER_ADMIN', 'SUPPORT', 'COMPLIANCE'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const customer = await prisma.user.findUnique({
      where: { id },
      include: {
        accounts: {
          include: {
            transactions: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            transfersFrom: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            transfersTo: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            deposits: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            withdrawals: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            cards: true,
          },
        },
        kYCProfile: {
          include: {
            documents: true,
          },
        },
        kycDocuments: true,
        beneficiaries: true,
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
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
        loanApplications: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        savingsGoals: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        investmentPortfolios: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        supportTickets: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        securitySettings: true,
        profile: true,
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Calculate totals
    const totalBalance = customer.accounts?.reduce(
      (sum, acc) => sum + (acc.balance || 0),
      0
    ) || 0;

    const customerData = {
      ...customer,
      totalBalance,
      totalAccounts: customer.accounts?.length || 0,
      totalTransactions: customer._count?.transactions || 0,
    };

    return NextResponse.json(customerData);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch customer' },
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

    // Only ADMIN and SUPER_ADMIN can update customer status
    if (!['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status, notes } = body;

    // Validate status
    const validStatuses = ['ACTIVE', 'SUSPENDED', 'PENDING', 'CLOSED'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status value' },
        { status: 400 }
      );
    }

    // Check if trying to update self
    if (id === session.user.id) {
      return NextResponse.json(
        { error: 'Cannot update your own account' },
        { status: 400 }
      );
    }

    const customer = await prisma.user.update({
      where: { id },
      data: {
        status: status || undefined,
        notes: notes || undefined,
      },
      include: {
        accounts: true,
        kYCProfile: true,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'UPDATE',
        resourceType: 'USER',
        resourceId: id,
        oldValues: { status: customer.status },
        newValues: { status, notes },
        status: 'SUCCESS',
      },
    });

    return NextResponse.json(customer);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update customer' },
      { status: 500 }
    );
  }
}