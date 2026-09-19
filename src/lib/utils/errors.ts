// Custom error classes for Crestline Capital

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    super(404, `${resource} not found${identifier ? ` with id: ${identifier}` : ''}`, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, message, 'VALIDATION_ERROR', details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(429, message, 'RATE_LIMIT_EXCEEDED');
  }
}

// Financial Errors
export class InsufficientBalanceError extends AppError {
  constructor(accountId: string, required: number, available: number) {
    super(
      400,
      `Insufficient balance in account ${accountId}. Required: ${required}, Available: ${available}`,
      'INSUFFICIENT_BALANCE'
    );
  }
}

export class InvalidAmountError extends AppError {
  constructor(message: string) {
    super(400, message, 'INVALID_AMOUNT');
  }
}

export class TransferError extends AppError {
  constructor(message: string) {
    super(400, message, 'TRANSFER_ERROR');
  }
}

export class InvalidRecipientError extends AppError {
  constructor(message: string) {
    super(400, message, 'INVALID_RECIPIENT');
  }
}

// Beneficiary Errors
export class BeneficiaryError extends AppError {
  constructor(message: string) {
    super(400, message, 'BENEFICIARY_ERROR');
  }
}

export class BeneficiaryOwnershipError extends AppError {
  constructor() {
    super(403, 'You do not own this beneficiary', 'BENEFICIARY_OWNERSHIP_ERROR');
  }
}

// Account Errors
export class AccountError extends AppError {
  constructor(message: string) {
    super(400, message, 'ACCOUNT_ERROR');
  }
}

export class AccountFrozenError extends AppError {
  constructor(accountId: string) {
    super(400, `Account ${accountId} is frozen`, 'ACCOUNT_FROZEN');
  }
}

export class AccountClosedError extends AppError {
  constructor(accountId: string) {
    super(400, `Account ${accountId} is closed`, 'ACCOUNT_CLOSED');
  }
}

// KYC Errors
export class KYCError extends AppError {
  constructor(message: string) {
    super(400, message, 'KYC_ERROR');
  }
}

export class KYCRequiredError extends AppError {
  constructor() {
    super(403, 'KYC verification required', 'KYC_REQUIRED');
  }
}

// Card Errors
export class CardError extends AppError {
  constructor(message: string) {
    super(400, message, 'CARD_ERROR');
  }
}

export class CardFrozenError extends AppError {
  constructor(cardId: string) {
    super(400, `Card ${cardId} is frozen`, 'CARD_FROZEN');
  }
}

// Authentication Errors
export class AuthError extends AppError {
  constructor(message: string) {
    super(401, message, 'AUTH_ERROR');
  }
}

// Idempotency Errors
export class IdempotencyError extends AppError {
  constructor(message: string) {
    super(409, message, 'IDEMPOTENCY_ERROR');
  }
}

// Webhook Errors
export class WebhookError extends AppError {
  constructor(message: string) {
    super(400, message, 'WEBHOOK_ERROR');
  }
}

// State Machine Errors
export class InvalidStateTransitionError extends AppError {
  constructor(from: string, to: string) {
    super(400, `Cannot transition from ${from} to ${to}`, 'INVALID_STATE_TRANSITION');
  }
}

// Ownership Errors
export class OwnershipError extends AppError {
  constructor(resource: string) {
    super(403, `You do not own this ${resource}`, 'OWNERSHIP_ERROR');
  }
}

// Limit Errors
export class DailyLimitExceededError extends AppError {
  constructor(userId: string, limit?: number, attempted?: number) {
    const message = limit !== undefined && attempted !== undefined
      ? `Daily limit exceeded for user ${userId}. Limit: ${limit}, attempted: ${attempted}`
      : 'Daily limit exceeded';
    super(429, message, 'DAILY_LIMIT_EXCEEDED');
  }
}

export class MonthlyLimitExceededError extends AppError {
  constructor(userId: string, limit?: number, attempted?: number) {
    const message = limit !== undefined && attempted !== undefined
      ? `Monthly limit exceeded for user ${userId}. Limit: ${limit}, attempted: ${attempted}`
      : 'Monthly limit exceeded';
    super(429, message, 'MONTHLY_LIMIT_EXCEEDED');
  }
}

// Error handler utility
export function handlePrismaError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const prismaError = error as { code?: string; message?: string };

  switch (prismaError.code) {
    case 'P2002':
      return new ConflictError('Unique constraint violation');
    case 'P2025':
      return new NotFoundError('Record not found');
    case 'P2003':
      return new ValidationError('Foreign key constraint violation');
    case 'P2011':
      return new ValidationError('Null constraint violation');
    default:
      return new AppError(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

