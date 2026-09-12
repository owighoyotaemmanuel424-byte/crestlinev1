import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CardService } from '@/lib/services/card-service';

export async function POST(
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
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { reason } = body;

    const result = await CardService.freezeCard(
      id,
      session.user.id,
      reason
    );

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'FREEZE',
        resourceType: 'CARD',
        resourceId: id,
        metadata: { reason },
        status: 'SUCCESS',
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to freeze card' },
      { status: 500 }
    );
  }
}