import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check admin role
    if (!['ADMIN', 'SUPER_ADMIN', 'SUPPORT', 'OPERATOR', 'COMPLIANCE'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // Fetch dashboard statistics
    const [
      totalCustomers,
      activeCustomers,
      suspendedCustomers,
      totalAccounts,
      totalBalance,
      pendingTransfers,
      pendingDeposits,
      pendingWithdrawals,
      pendingKYC,
      fraudAlerts,
      recentTransactions,
      recentAuditEvents
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
      prisma.account.count(),
      prisma.account.aggregate({ _sum: { balance: true } }),
      prisma.transfer.count({ where: { status: 'PENDING' } }),
      prisma.deposit.count({ where: { status: 'PENDING' } }),
      prisma.withdrawal.count({ where: { status: 'PENDING' } }),
      prisma.kYCProfile.count({ where: { status: 'PENDING' } }),
      prisma.fraudAlert.count({ where: { status: 'OPEN' } }),
      prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          account: { select: { id: true, accountNumber: true } },
        },
      }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          actor: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    return NextResponse.json({
      stats: {
        totalCustomers,
        activeCustomers,
        suspendedCustomers,
        totalAccounts,
        totalLedgerBalance: totalBalance?._sum?.balance || 0,
        pendingTransfers,
        pendingDeposits,
        pendingWithdrawals,
        pendingKYC,
        fraudAlerts: fraudAlerts || 0,
      },
      recentTransactions,
      recentAuditEvents,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch admin dashboard' },
      { status: 500 }
    );
  }
}