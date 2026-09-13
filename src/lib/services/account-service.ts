import { prisma } from '../prisma';
import { generateReference } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  InsufficientBalanceError,
  AccountError,
} from '../utils/errors';
import { Decimal } from '@prisma/client/runtime/library';
import type {
  User,
  Account,
  AccountType,
  AccountStatus,
  Role,
  Currency,
} from '@prisma/client';

// ============================================
// DECIMAL UTILITIES
// ============================================

/**
 * Convert amount to Decimal for safe financial arithmetic
 * Accepts number, string, or Decimal
 */
function toDecimal(amount: number | string | Decimal): Decimal {
  if (amount instanceof Decimal) {
    return amount;
  }
  if (typeof amount === 'string') {
    return new Decimal(amount);
  }
  return new Decimal(amount.toString());
}

// ============================================
// CONSTANTS
// ============================================

const ACCOUNT_CONFIG = {
  MIN_OPENING_BALANCE: new Decimal(0),
  MAX_OPENING_BALANCE: new Decimal(10000000),
  MIN_BALANCE: new Decimal(0),
  MAX_BALANCE: new Decimal(100000000),
  DEFAULT_CURRENCY: 'USD' as Currency,
  SUPPORTED_CURRENCIES: ['USD', 'NGN', 'EUR', 'GBP'] as Currency[],
  MAX_DESCRIPTION_LENGTH: 500,
  DEFAULT_ACCOUNT_TYPE: 'SAVINGS' as AccountType,
  DEFAULT_STATUS: 'ACTIVE' as AccountStatus,
} as const;