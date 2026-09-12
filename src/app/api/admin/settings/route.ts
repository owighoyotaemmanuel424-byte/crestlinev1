import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const settings = await prisma.systemSetting.findMany({
      orderBy: { category: 'asc' },
    });

    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { key, value, category, description } = body;

    if (!key) {
      return NextResponse.json(
        { error: 'Setting key is required' },
        { status: 400 }
      );
    }

    const setting = await prisma.systemSetting.upsert({
      where: { key },
      create: {
        key,
        value: value || '',
        category: category || 'GENERAL',
        description: description || '',
      },
      update: {
        value: value || undefined,
        category: category || undefined,
        description: description || undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'UPDATE',
        resourceType: 'SETTING',
        resourceId: key,
        oldValues: { value: setting.value },
        newValues: { value, category, description },
        status: 'SUCCESS',
      },
    });

    return NextResponse.json(setting);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update setting' },
      { status: 500 }
    );
  }
}