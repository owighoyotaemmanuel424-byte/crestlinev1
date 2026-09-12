import { NextResponse } from 'next/server';
import { z } from 'zod';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser, superAdminMiddleware } from '@/lib/middleware/auth';

// GET /api/admin/settings - Get system settings (super admin only)
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    // In a real implementation, this would fetch from database
    const settings = {
      maintenanceMode: false,
      maxTransactionAmount: 1000000,
      maxDailyTransaction: 5000000,
      supportedCurrencies: ['USD', 'NGN', 'EUR', 'GBP'],
      feeStructure: {
        deposit: 0,
        withdrawal: 0.005,
        transfer: 0.0025,
      },
    };
    
    return success(settings);
  });
}

// PUT /api/admin/settings - Update system settings (super admin only)
const updateSettingsSchema = z.object({
  maintenanceMode: z.boolean().optional(),
  maxTransactionAmount: z.number().positive().optional(),
  maxDailyTransaction: z.number().positive().optional(),
  supportedCurrencies: z.array(z.string().length(3)).optional(),
});

export async function PUT(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = updateSettingsSchema.parse(body);
    
    // In a real implementation, this would update database
    const updatedSettings = {
      ...validated,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    };
    
    return success(updatedSettings);
  });
}
