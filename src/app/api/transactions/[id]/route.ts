import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { TransactionService } from '@/lib/services/transaction-service';
import { ForbiddenError, NotFoundError } from '@/lib/utils/errors';

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

    // Check if user has permission to view all transactions (admin)
    if (['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(session.user.role)) {
      const result = await TransactionService.getTransactionById(id, undefined);
      return NextResponse.json(result);
    }

    // Regular users can only view their own transactions
    const result = await TransactionService.getTransactionById(id, session.user.id);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch transaction' },
      { status: 500 }
    );
  }
}