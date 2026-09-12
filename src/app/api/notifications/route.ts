import { NextResponse } from 'next/server';
import { NotificationService } from '@/lib/services/notification-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/notifications - List notifications
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const isRead = searchParams.get('isRead') === 'true';
    const category = searchParams.get('category');
    
    const result = await NotificationService.listNotifications(user.id, {
      page,
      limit,
      isRead,
      category: category as any,
    });
    
    return paginated(result.notifications, result.page, result.limit, result.total);
  });
}

// POST /api/notifications/mark-all-read - Mark all as read
export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const result = await NotificationService.markAllAsRead(user.id);
    return success(result);
  });
}
