import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CardService } from '@/lib/services/card-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/cards/:id
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return handleRouteError(request, { params }, async () => {
    const user = getAuthUser(request);
    const result = await CardService.getCardById(params.id, user.id);
    return success(result);
  });
}

// PATCH /api/cards/:id
const updateCardSchema = z.object({
  isDefault: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'FROZEN', 'EXPIRED', 'REVOKED']).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  return handleRouteError(request, { params }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = updateCardSchema.parse(body);
    const result = await CardService.updateCard(params.id, validated, user.id);
    return success(result);
  });
}

// DELETE /api/cards/:id
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  return handleRouteError(request, { params }, async () => {
    const user = getAuthUser(request);
    const result = await CardService.deleteCard(params.id, user.id);
    return success(result);
  });
}
