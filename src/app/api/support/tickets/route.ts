import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SupportService } from '@/lib/services/support-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/support/tickets
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') as any;
    const category = searchParams.get('category') as any;
    const priority = searchParams.get('priority') as any;
    
    const result = await SupportService.listTickets(user.id, user.id, page, limit, status, category, priority);
    return paginated(result.tickets, result.page, result.limit, result.total);
  });
}

// POST /api/support/tickets
const createTicketSchema = z.object({
  subject: z.string().min(1),
  category: z.enum(['GENERAL', 'TECHNICAL', 'ACCOUNT', 'TRANSACTION', 'FRAUD', 'COMPLAINT']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().default('MEDIUM'),
  description: z.string().min(1),
  attachments: z.array(z.object({
    fileName: z.string(),
    fileUrl: z.string().url(),
    fileSize: z.number(),
    mimeType: z.string(),
  })).optional(),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = createTicketSchema.parse(body);
    
    const result = await SupportService.createTicket({
      userId: user.id,
      subject: validated.subject,
      category: validated.category,
      priority: validated.priority,
      description: validated.description,
      attachments: validated.attachments,
    }, user.id);
    
    return success(result);
  });
}
