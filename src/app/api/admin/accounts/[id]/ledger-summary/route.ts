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

    if (!['ADMIN', 'SUPER_ADMIN', 'SUPPORT', 'OPERATOR'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Fetch ledger summary for this account
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: {
        accountId: id,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        journal: {
          include: {
            entries: true,
          },
        },
        transaction: true,
      },
    });

    const totalDebits = ledgerEntries
      .filter(e => e.entryType === 'DEBIT')
      .reduce((sum, e) => sum + e.amount.toNumber(), 0);

    const totalCredits = ledgerEntries
      .filter(e => e.entryType === 'CREDIT')
      .reduce((sum, e) => sum + e.amount.toNumber(), 0);

    return NextResponse.json({
      ledgerEntries,
      summary: {
        totalDebits,
        totalCredits,
        net: totalCredits - totalDebits,
        entryCount: ledgerEntries.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch ledger summary' },
      { status: 500 }
    );
  }
}
