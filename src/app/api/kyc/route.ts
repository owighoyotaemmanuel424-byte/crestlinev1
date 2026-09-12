import { NextResponse } from 'next/server';
import { z } from 'zod';
import { KYCService } from '@/lib/services/kyc-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/kyc - Get KYC status
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const result = await KYCService.getKYCProfile(user.id, user.id);
    return success(result);
  });
}

// POST /api/kyc - Submit KYC documents
const submitKYCDocumentSchema = z.object({
  documentType: z.enum(['PASSPORT', 'DRIVERS_LICENSE', 'NATIONAL_ID', 'UTILITY_BILL', 'BANK_STATEMENT', 'SELFIE']),
  fileName: z.string().min(1),
  fileUrl: z.string().url(),
  fileSize: z.number().positive(),
  mimeType: z.string().min(1),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = submitKYCDocumentSchema.parse(body);
    
    const result = await KYCService.submitKYCDocument({
      userId: user.id,
      documentType: validated.documentType,
      fileName: validated.fileName,
      fileUrl: validated.fileUrl,
      fileSize: validated.fileSize,
      mimeType: validated.mimeType,
    }, user.id);
    
    return success(result);
  });
}
