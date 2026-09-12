import { NextResponse } from 'next/server';
import { z } from 'zod';
import { KYCService } from '@/lib/services/kyc-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser, complianceMiddleware } from '@/lib/middleware/auth';

// POST /api/admin/kyc/:id/approve - Approve KYC (compliance only)
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return handleRouteError(request, { params }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const notes = body.notes as string | undefined;
    
    const result = await KYCService.updateKYCProfile(
      params.id,
      { status: 'APPROVED', notes },
      user.id
    );
    
    return success(result);
  });
}
