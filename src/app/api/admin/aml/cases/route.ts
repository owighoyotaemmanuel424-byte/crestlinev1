import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AMLService } from '@/lib/services/aml-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser, complianceMiddleware } from '@/lib/middleware/auth';

// GET /api/admin/aml/cases - List AML cases (compliance only)
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') as any;
    const severity = searchParams.get('severity') as any;
    const caseType = searchParams.get('caseType') as any;
    
    const result = await AMLService.listAMLCases(
      user.id,
      page,
      limit,
      status,
      severity,
      caseType
    );
    
    return paginated(result.cases, result.page, result.limit, result.total);
  });
}

// POST /api/admin/aml/cases - Create AML case (compliance only)
const createAMLCaseSchema = z.object({
  userId: z.string().uuid(),
  caseType: z.enum(['SANCTIONS_MATCH', 'SUSPICIOUS_TRANSACTION', 'HIGH_RISK_COUNTRY', 'PEPS_MATCH', 'UNUSUAL_ACTIVITY', 'STRUCTURING', 'SOURCE_OF_FUNDS', 'IDENTITY_VERIFICATION', 'OTHER']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  description: z.string().min(1),
  relatedTransactionId: z.string().uuid().optional(),
  relatedResourceType: z.string().optional(),
  relatedResourceId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = createAMLCaseSchema.parse(body);
    
    const result = await AMLService.createAMLCase(
      {
        userId: validated.userId,
        caseType: validated.caseType,
        severity: validated.severity,
        description: validated.description,
        relatedTransactionId: validated.relatedTransactionId,
        relatedResourceType: validated.relatedResourceType,
        relatedResourceId: validated.relatedResourceId,
        metadata: validated.metadata,
      },
      user.id
    );
    
    return success(result);
  });
}
