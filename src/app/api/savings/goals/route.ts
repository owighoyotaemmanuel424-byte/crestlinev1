import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SavingsService } from '@/lib/services/savings-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/savings/goals
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') as any;
    
    const result = await SavingsService.listSavingsGoals(user.id, { page, limit, status });
    return paginated(result.goals, result.page, result.limit, result.total);
  });
}

// POST /api/savings/goals
const createSavingsGoalSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  targetAmount: z.number().positive(),
  targetDate: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = createSavingsGoalSchema.parse(body);
    
    const result = await SavingsService.createSavingsGoal({
      userId: user.id,
      name: validated.name,
      description: validated.description,
      targetAmount: validated.targetAmount,
      targetDate: validated.targetDate ? new Date(validated.targetDate) : undefined,
    }, user.id);
    
    return success(result);
  });
}
