import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BeneficiaryService } from '@/lib/services/beneficiary-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/beneficiaries/:id
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return handleRouteError(request, { params }, async () => {
    const user = getAuthUser(request);
    const result = await BeneficiaryService.getBeneficiaryById(params.id, user.id);
    return success(result);
  });
}

// PATCH /api/beneficiaries/:id
const updateBeneficiarySchema = z.object({
  name: z.string().min(1).optional(),
  accountNumber: z.string().min(1).optional(),
  bankName: z.string().min(1).optional(),
  bankCode: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  return handleRouteError(request, { params }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = updateBeneficiarySchema.parse(body);
    const result = await BeneficiaryService.updateBeneficiary(params.id, validated, user.id);
    return success(result);
  });
}

// DELETE /api/beneficiaries/:id
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  return handleRouteError(request, { params }, async () => {
    const user = getAuthUser(request);
    const result = await BeneficiaryService.deleteBeneficiary(params.id, user.id);
    return success(result);
  });
}
