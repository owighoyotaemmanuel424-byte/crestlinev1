import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuditService } from '@/lib/services/audit-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/admin/audit - Query audit logs (admin only)
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const actorId = searchParams.get('actorId');
    const action = searchParams.get('action') as any;
    const resourceType = searchParams.get('resourceType') as any;
    const resourceId = searchParams.get('resourceId');
    const status = searchParams.get('status') as any;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search');
    
    const result = await AuditService.listEvents(
      {
        actorId,
        action,
        resourceType,
        resourceId,
        status,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        search,
      },
      user.id,
      page,
      limit
    );
    
    return paginated(result.events, result.page, result.limit, result.total);
  });
}
