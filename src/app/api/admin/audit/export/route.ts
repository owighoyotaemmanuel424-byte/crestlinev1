import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuditService } from '@/lib/services/audit-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/admin/audit/export - Export audit data (admin only)
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') as 'json' | 'csv' || 'json';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const actorId = searchParams.get('actorId');
    const action = searchParams.get('action') as any;
    const resourceType = searchParams.get('resourceType') as any;
    
    const result = await AuditService.exportEvents(
      {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        actorId: actorId ?? undefined,
        action,
        resourceType,
      },
      user.id,
      format
    );
    
    const blob = new Blob([result], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const filename = `audit-export-${new Date().toISOString()}.${format}`;
    
    return new NextResponse(blob, {
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': format === 'csv' ? 'text/csv' : 'application/json',
      },
    });
  });
}
