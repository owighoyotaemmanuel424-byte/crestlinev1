import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CardService } from '@/lib/services/card-service';
import { success, paginated } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// GET /api/cards
export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') as any;
    
    const result = await CardService.listCards(user.id, { page, limit, status });
    return paginated(result.cards, result.page, result.limit, result.total);
  });
}

// POST /api/cards
const createCardSchema = z.object({
  accountId: z.string().uuid().optional(),
  cardNumber: z.string().min(16).max(19),
  expiryMonth: z.number().min(1).max(12),
  expiryYear: z.number().min(2020).max(2050),
  cvv: z.string().min(3).max(4),
  cardType: z.enum(['VISA', 'MASTERCARD', 'VERVE', 'AMEX', 'DEBIT', 'CREDIT', 'VIRTUAL', 'PREPAID']),
  nameOnCard: z.string().min(1),
  isDefault: z.boolean().optional().default(false),
  billingAddress: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    postalCode: z.string().optional(),
  }).optional(),
});

export async function POST(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = createCardSchema.parse(body);
    
    const CARD_BRAND_ALIASES: Record<
      string,
      'VISA' | 'MASTERCARD' | 'AMEX' | 'DISCOVER' | 'OTHER'
    > = {
      VISA: 'VISA',
      MASTERCARD: 'MASTERCARD',
      AMEX: 'AMEX',
      VERVE: 'OTHER',
      DEBIT: 'OTHER',
      CREDIT: 'OTHER',
      VIRTUAL: 'OTHER',
      PREPAID: 'OTHER',
      DISCOVER: 'DISCOVER',
    };
    const CARD_TYPE_ALIASES: Record<string, 'DEBIT' | 'CREDIT' | 'VIRTUAL' | 'PREPAID'> = {
      VISA: 'DEBIT',
      MASTERCARD: 'DEBIT',
      VERVE: 'DEBIT',
      AMEX: 'DEBIT',
      DEBIT: 'DEBIT',
      CREDIT: 'CREDIT',
      VIRTUAL: 'VIRTUAL',
      PREPAID: 'PREPAID',
    };

    const result = await CardService.createCard({
      userId: user.id,
      accountId: validated.accountId,
      cardType: CARD_TYPE_ALIASES[validated.cardType],
      cardBrand: CARD_BRAND_ALIASES[validated.cardType],
      expiryMonth: validated.expiryMonth,
      expiryYear: validated.expiryYear,
    }, user.id);
    
    return success(result);
  });
}
