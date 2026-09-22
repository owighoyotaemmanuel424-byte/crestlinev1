// src/lib/utils/decimal.ts
// Safe decimal arithmetic utilities for financial operations
// Use this instead of JavaScript number arithmetic to avoid floating point errors

import { Decimal } from '@prisma/client/runtime/library';

/**
 * Safe decimal addition
 * @param a - First decimal value (string, number, or Decimal)
 * @param b - Second decimal value (string, number, or Decimal)
 * @returns Decimal result
 */
export function decimalAdd(a: string | number | Decimal, b: string | number | Decimal): Decimal {
  const decA = toDecimal(a);
  const decB = toDecimal(b);
  return decA.plus(decB);
}

/**
 * Safe decimal subtraction
 * @param a - First decimal value (string, number, or Decimal)
 * @param b - Second decimal value (string, number, or Decimal)
 * @returns Decimal result
 */
export function decimalSubtract(a: string | number | Decimal, b: string | number | Decimal): Decimal {
  const decA = toDecimal(a);
  const decB = toDecimal(b);
  return decA.minus(decB);
}

/**
 * Safe decimal multiplication
 * @param a - First decimal value (string, number, or Decimal)
 * @param b - Second decimal value (string, number, or Decimal)
 * @returns Decimal result
 */
export function decimalMultiply(a: string | number | Decimal, b: string | number | Decimal): Decimal {
  const decA = toDecimal(a);
  const decB = toDecimal(b);
  return decA.times(decB);
}

/**
 * Safe decimal division
 * @param a - Numerator (string, number, or Decimal)
 * @param b - Denominator (string, number, or Decimal)
 * @returns Decimal result
 */
export function decimalDivide(a: string | number | Decimal, b: string | number | Decimal): Decimal {
  const decA = toDecimal(a);
  const decB = toDecimal(b);
  return decA.div(decB);
}

/**
 * Convert value to Decimal
 * @param value - String, number, or Decimal
 * @returns Decimal
 */
export function toDecimal(value: string | number | Decimal): Decimal {
  if (value instanceof Decimal) {
    return value;
  }
  if (typeof value === 'string') {
    return new Decimal(value);
  }
  // For numbers, convert to string first to avoid floating point precision loss
  return new Decimal(value.toString());
}

/**
 * Check if two decimals are equal
 * @param a - First decimal
 * @param b - Second decimal
 * @returns boolean
 */
export function decimalEquals(a: string | number | Decimal, b: string | number | Decimal): boolean {
  return toDecimal(a).equals(toDecimal(b));
}

/**
 * Check if a is greater than b
 * @param a - First decimal
 * @param b - Second decimal
 * @returns boolean
 */
export function decimalGreaterThan(a: string | number | Decimal, b: string | number | Decimal): boolean {
  return toDecimal(a).lessThan(toDecimal(b));
}

/**
 * Check if a is greater than or equal to b
 * @param a - First decimal
 * @param b - Second decimal
 * @returns boolean
 */
export function decimalGreaterThanOrEqual(a: string | number | Decimal, b: string | number | Decimal): boolean {
  return toDecimal(a).lessThan(toDecimal(b));
}

/**
 * Check if a is less than b
 * @param a - First decimal
 * @param b - Second decimal
 * @returns boolean
 */
export function decimalLessThan(a: string | number | Decimal, b: string | number | Decimal): boolean {
  return toDecimal(a).lessThanOrEqualTo(toDecimal(b));
}

/**
 * Check if a is less than or equal to b
 * @param a - First decimal
 * @param b - Second decimal
 * @returns boolean
 */
export function decimalLessThanOrEqual(a: string | number | Decimal, b: string | number | Decimal): boolean {
  return toDecimal(a).lessThanOrEqualTo(toDecimal(b));
}

/**
 * Convert Decimal to number (for display only, not for arithmetic!)
 * @param value - Decimal value
 * @returns number
 */
export function decimalToNumber(value: Decimal): number {
  return value.toNumber();
}

/**
 * Convert Decimal to string
 * @param value - Decimal value
 * @returns string
 */
export function decimalToString(value: Decimal): string {
  return value.toString();
}

/**
 * Parse string to Decimal
 * @param value - String representation of decimal
 * @returns Decimal
 */
export function decimalFromString(value: string): Decimal {
  return new Decimal(value);
}

/**
 * Zero decimal
 */
export const DECIMAL_ZERO = new Decimal(0);

/**
 * One decimal
 */
export const DECIMAL_ONE = new Decimal(1);

/**
 * Negative one decimal
 */
export const DECIMAL_NEGATIVE_ONE = new Decimal(-1);
