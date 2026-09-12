import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BeneficiaryService } from '@/lib/services/beneficiary-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/beneficiaries - List beneficiaries
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    
    const result = await BeneficiaryService.listBeneficiaries(user.id, { page, limit });
    return paginated(result.beneficiaries, result.page, result.limit, result.total);
  });
}

// POST /api/beneficiaries - Create beneficiary
const createBeneficiarySchema = z.object({
  name: z.string().min(1),
  accountNumber: z.string().min(1),
  bankName: z.string().min(1),
  bankCode: z.string().optional(),
  currency: z.string().length(3),
  isDefault: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = createBeneficiarySchema.parse(body);
    
    const result = await BeneficiaryService.createBeneficiary({
      userId: user.id,
      name: validated.name,
      accountNumber: validated.accountNumber,
      bankName: validated.bankName,
      bankCode: validated.bankCode,
      currency: validated.currency,
      isDefault: validated.isDefault,
    }, user.id);
    
    return success(result);
  });
}
