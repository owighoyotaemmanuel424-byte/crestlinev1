import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FraudService } from '@/lib/services/fraud-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser, operatorMiddleware } from '@/lib/middleware/auth';

// GET /api/admin/fraud/alerts - List fraud alerts (operator/admin only)
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') as any;
    const severity = searchParams.get('severity') as any;
    const alertType = searchParams.get('alertType') as any;
    const userId = searchParams.get('userId');
    
    const result = await FraudService.listFraudAlerts(
      user.id,
      page,
      limit,
      status,
      severity,
      alertType,
      userId
    );
    
    return paginated(result.alerts, result.page, result.limit, result.total);
  });
}

// POST /api/admin/fraud/alerts - Create fraud alert (operator/admin only)
const createFraudAlertSchema = z.object({
  userId: z.string().uuid(),
  alertType: z.enum(['VELOCITY', 'UNUSUAL_ACTIVITY', 'HIGH_VALUE', 'NEW_DEVICE', 'NEW_LOCATION', 'FAILED_LOGIN', 'CARD_NOT_PRESENT', 'SUSPICIOUS_IP', 'ACCOUNT_TAKEOVER', 'CHARGEBACK', 'MANUAL_REVIEW', 'OTHER']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  description: z.string().min(1),
  relatedTransactionId: z.string().uuid().optional(),
  relatedTransferId: z.string().uuid().optional(),
  relatedWithdrawalId: z.string().uuid().optional(),
  relatedCardId: z.string().uuid().optional(),
  relatedAccountId: z.string().uuid().optional(),
  amount: z.number().optional(),
  currency: z.string().length(3).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = createFraudAlertSchema.parse(body);
    
    const result = await FraudService.createFraudAlert(
      {
        userId: validated.userId,
        alertType: validated.alertType,
        severity: validated.severity,
        description: validated.description,
        relatedTransactionId: validated.relatedTransactionId,
        relatedTransferId: validated.relatedTransferId,
        relatedWithdrawalId: validated.relatedWithdrawalId,
        relatedCardId: validated.relatedCardId,
        relatedAccountId: validated.relatedAccountId,
        amount: validated.amount,
        currency: validated.currency,
        metadata: validated.metadata,
      },
      user.id
    );
    
    return success(result);
  });
}
