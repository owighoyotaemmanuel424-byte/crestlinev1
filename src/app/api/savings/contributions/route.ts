import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SavingsService } from '@/lib/services/savings-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/savings/contributions
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const savingsGoalId = searchParams.get('savingsGoalId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    
    if (!savingsGoalId) {
      return success({ contributions: [] });
    }
    
    const result = await SavingsService.listContributions(savingsGoalId, user.id, { page, limit });
    return paginated(result.contributions, result.page, result.limit, result.total);
  });
}

// POST /api/savings/contributions
const createContributionSchema = z.object({
  savingsGoalId: z.string().uuid(),
  accountId: z.string().uuid(),
  amount: z.number().positive(),
  description: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = createContributionSchema.parse(body);
    
    const result = await SavingsService.contributeToSavingsGoal({
      savingsGoalId: validated.savingsGoalId,
      accountId: validated.accountId,
      amount: validated.amount,
      description: validated.description,
      idempotencyKey: validated.idempotencyKey,
    }, user.id);
    
    return success(result);
  });
}
