import { prisma } from '../prisma';
import { generateReference, generateIdempotencyKey } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  AppError,
} from '../utils/errors';
import type {
  User,
  KYCProfile,
  KYCDocument,
  KYCStatus,
  KYCTier,
  KYCDocumentType,
  DocumentStatus,
  Role,
  AuditLog,
} from '@prisma/client';

// ============================================
// INTERFACES & TYPES
// ============================================

export interface CreateKYCProfileData {
  userId: string;
  tier?: KYCTier;
  notes?: string;
}