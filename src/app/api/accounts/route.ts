import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { AccountService } from '@/lib/services/account-service';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/utils/errors';

export async function GET(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { search, status, accountType, page, limit } = Object.fromEntries(
      new URL(request.url).searchParams.entries()
    );

    if (['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(session.user.role)) {
      const result = await AccountService.getAllAccounts(
        session.user.id,
        parseInt(page) || 1,
        parseInt(limit) || 20,
        search,
        status as any,
        accountType as any
      );
      return NextResponse.json(result);
    }

    const result = await AccountService.getUserAccounts(
      session.user.id,
      parseInt(page) || 1,
      parseInt(limit) || 20,
      search,
      status as any,
      accountType as any
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!['CUSTOMER', 'ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only customers can create accounts' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, accountType, currency, initialDeposit } = body;

    if (!name || !accountType) {
      return NextResponse.json(
        { error: 'Name and account type are required' },
        { status: 400 }
      );
    }

    const result = await AccountService.createAccount({
      userId: session.user.id,
      name,
      accountType: accountType as any,
      currency: currency || 'USD',
      initialDeposit: initialDeposit || 0,
    }, session.user.id);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create account' },
      { status: 500 }
    );
  }
}
