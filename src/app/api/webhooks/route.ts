import { NextResponse } from 'next/server';
import { WebhookService } from '@/lib/services/webhook-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// ============================================
// POST /api/webhooks
// Generic webhook handler - routes to specific providers
// ============================================

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const signature = request.headers.get('x-signature') || '';
    const timestamp = request.headers.get('x-timestamp');
    const provider = request.headers.get('x-provider') || 'unknown';
    const eventType = request.headers.get('x-event-type') || 'unknown';
    
    const rawBody = await request.text();
    let body: Record<string, unknown>;
    
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = {};
    }
    
    const result = await WebhookService.processWebhook({
      provider,
      eventType,
      payload: body,
      rawPayload: rawBody,
      signature,
      timestamp: timestamp ?? undefined,
    });
    
    return success(result);
  });
}

// GET /api/webhooks - List webhook events (admin only)
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const provider = searchParams.get('provider');
    const status = searchParams.get('status') as any;
    
    const result = await WebhookService.listWebhookEvents(
      user.id,
      page,
      limit,
      provider ?? undefined,
      undefined,
      status
    );
    return success(result);
  });
}
