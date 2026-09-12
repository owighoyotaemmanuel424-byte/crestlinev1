import { NextResponse } from 'next/server';
import { z } from 'zod';
import { InvestmentService } from '@/lib/services/investment-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/investments/portfolios
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') as any;
    const search = searchParams.get('search');
    
    const result = await InvestmentService.listPortfolios(user.id, user.id, page, limit, status, search);
    return paginated(result.portfolios, result.page, result.limit, result.total);
  });
}

// POST /api/investments/portfolios
const createPortfolioSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = createPortfolioSchema.parse(body);
    
    const result = await InvestmentService.createPortfolio({
      userId: user.id,
      name: validated.name,
      description: validated.description,
    }, user.id);
    
    return success(result);
  });
}
