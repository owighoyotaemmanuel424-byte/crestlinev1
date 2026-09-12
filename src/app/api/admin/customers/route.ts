import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthService } from '@/lib/services/auth-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/admin/customers - List all customers (admin only)
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const role = searchParams.get('role') as any;
    const status = searchParams.get('status') as any;
    const search = searchParams.get('search');
    
    const result = await AuthService.listUsers(user.id, {
      page,
      limit,
      role,
      status,
      search,
    });
    
    return paginated(result.users, result.page, result.limit, result.total);
  });
}

// POST /api/admin/customers - Create customer (admin only)
const createCustomerSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  password: z.string().min(8),
  role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'OPERATOR']).optional().default('USER'),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = createCustomerSchema.parse(body);
    
    const result = await AuthService.register({
      email: validated.email,
      password: validated.password,
      firstName: validated.firstName,
      lastName: validated.lastName,
      phone: validated.phone,
      role: validated.role,
      metadata: validated.metadata,
    }, user.id);
    
    return success(result);
  });
}
