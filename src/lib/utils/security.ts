import crypto from 'crypto';

// Generate a unique reference number
export function generateReference(prefix: string = 'CL'): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// Generate an idempotency key
export function generateIdempotencyKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Hash a string using SHA-256
export function hashString(input: string, salt?: string): string {
  const fullInput = salt ? `${input}:${salt}` : input;
  return crypto.createHash('sha256').update(fullInput).digest('hex');
}

// Verify a hash
export function verifyHash(input: string, hash: string, salt?: string): boolean {
  const computedHash = hashString(input, salt);
  return computedHash === hash;
}

// Mask sensitive data
export function maskString(input: string, visibleChars: number = 4): string {
  if (input.length <= visibleChars) return '****';
  const visible = input.slice(-visibleChars);
  const masked = '*'.repeat(input.length - visibleChars);
  return `${masked}${visible}`;
}

// Mask card number (show last 4 digits)
export function maskCardNumber(cardNumber: string): string {
  return maskString(cardNumber, 4);
}

// Mask account number (show last 4 digits)
export function maskAccountNumber(accountNumber: string): string {
  return maskString(accountNumber, 4);
}

// Generate a secure token
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// Generate a short code (for SMS, etc.)
export function generateShortCode(length: number = 6): string {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
}

// Sanitize input to prevent XSS
export function sanitizeInput(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Validate and sanitize email
export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Check if a string is a valid UUID
export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Check if a string is a valid CUID
export function isValidCUID(str: string): boolean {
  return /^c[l5-9a-f]{24}$/.test(str);
}

// Generate a secure password
export function generateSecurePassword(length: number = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}

// Rate limiting utilities
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  maxRequests: 100,
};

export const STRICT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 10,
};

export const AUTH_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 5,
};
