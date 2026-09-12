import { NextResponse } from 'next/server';
import { z } from 'zod';
import { KYCService } from '@/lib/services/kyc-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser, complianceMiddleware } from '@/lib/middleware/auth';

// POST /api/admin/kyc/:id/reject - Reject KYC (compliance only)
const rejectSchema = z.object({
  rejectionReason: z.string().min(1),
  notes: z.string().optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return handleRouteError(request, { params }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = rejectSchema.parse(body);
    
    const result = await KYCService.updateKYCProfile(
      params.id,
      { 
        status: 'REJECTED',
        rejectionReason: validated.rejectionReason,
        notes: validated.notes
      },
      user.id
    );
    
    return success(result);
  });
}
