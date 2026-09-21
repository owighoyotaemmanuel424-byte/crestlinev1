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
} from '@prisma/client';

// ============================================
// INTERFACES & TYPES
// ============================================

export interface CreateKYCProfileData {
  userId: string;
  tier?: KYCTier;
  notes?: string;
}

export interface UpdateKYCProfileData {
  tier?: KYCTier;
  status?: KYCStatus;
  rejectionReason?: string | null;
  notes?: string;
}

export interface SubmitDocumentData {
  userId: string;
  kycProfileId?: string;
  documentType: KYCDocumentType;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  metadata?: Record<string, unknown>;
}

export interface ReviewDocumentData {
  documentId: string;
  status: DocumentStatus;
  reviewNotes?: string;
  rejectionReason?: string;
}

export interface KYCProfileResult {
  profile: KYCProfile & {
    user?: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
    documents?: KYCDocument[];
  };
}

export interface KYCProfileListResult {
  profiles: (KYCProfile & {
    user?: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
  })[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DocumentResult {
  document: KYCDocument & {
    profile?: Pick<KYCProfile, 'id' | 'userId' | 'tier' | 'status'>;
  };
}

export interface KYCStats {
  totalProfiles: number;
  pending: number;
  approved: number;
  rejected: number;
  byTier: Record<KYCTier, number>;
}

// ============================================
// HELPER TYPES
// ============================================

type KYCTierType = KYCTier;
type KYCStatusType = KYCStatus;
type DocumentStatusType = DocumentStatus;

// ============================================
// KYC SERVICE
// ============================================

export class KYCService {
  static async createProfile(
    data: CreateKYCProfileData,
    actingUserId?: string
  ): Promise<KYCProfileResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);
    const existingProfile = await prisma.kYCProfile.findUnique({ where: { userId: data.userId } });
    if (existingProfile) throw new ConflictError('KYC profile already exists for this user');
    if (actingUserId && actingUserId !== data.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('Only administrators or compliance officers can create KYC profiles for other users');
      }
    }
    const profileReference = generateReference('KYC');
    const profile = await prisma.kYCProfile.create({
      data: {
        userId: data.userId,
        tier: data.tier || ('TIER_1' as KYCTierType),
        status: 'PENDING' as KYCStatusType,
        notes: data.notes,
      },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        documents: true,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId || data.userId,
        action: 'CREATE',
        resourceType: 'KYC_PROFILE',
        resourceId: profile.id,
        newValues: { tier: profile.tier, status: profile.status },
        status: 'SUCCESS',
      },
    });
    return { profile };
  }

  static async getProfileById(id: string, actingUserId?: string): Promise<KYCProfileResult> {
    const profile = await prisma.kYCProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!profile) throw new NotFoundError('KYC Profile', id);
    if (actingUserId && actingUserId !== profile.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this KYC profile');
      }
    }
    return { profile };
  }

  static async getProfileByUserId(userId: string, actingUserId?: string): Promise<KYCProfileResult> {
    const profile = await prisma.kYCProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!profile) throw new NotFoundError('KYC Profile', `for user ${userId}`);
    if (actingUserId && actingUserId !== profile.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this KYC profile');
      }
    }
    return { profile };
  }

  static async getUserProfiles(userId: string, page: number = 1, limit: number = 20, actingUserId?: string): Promise<KYCProfileListResult> {
    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these KYC profiles');
      }
    }
    const profiles = await prisma.kYCProfile.findMany({
      where: { userId },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    const total = await prisma.kYCProfile.count({ where: { userId } });
    return { profiles, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async getAllProfiles(actingUserId: string, page: number = 1, limit: number = 20, search?: string, status?: KYCStatusType, tier?: KYCTierType): Promise<KYCProfileListResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only administrators or compliance officers can view all KYC profiles');
    }
    const where: any = {};
    if (search) {
      where.OR = [
        { notes: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (status) where.status = status;
    if (tier) where.tier = tier;
    const profiles = await prisma.kYCProfile.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    const total = await prisma.kYCProfile.count({ where });
    return { profiles, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async updateProfile(id: string, data: UpdateKYCProfileData, actingUserId: string): Promise<KYCProfileResult> {
    const profile = await prisma.kYCProfile.findUnique({ where: { id }, include: { user: true, documents: true } });
    if (!profile) throw new NotFoundError('KYC Profile', id);
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser) throw new ForbiddenError('User not found');
    const isOwner = actingUserId === profile.userId;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role);
    if (!isOwner && !isAdmin) throw new ForbiddenError('You do not have permission to update this KYC profile');
    if (isOwner && !isAdmin && profile.status !== 'PENDING') throw new ForbiddenError('Only administrators can update submitted KYC profiles');
    if (data.status) {
      const validTransitions: Record<KYCStatusType, KYCStatusType[]> = {
        PENDING: ['PENDING', 'SUBMITTED', 'REJECTED'],
        SUBMITTED: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'],
        UNDER_REVIEW: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REQUESTED_CHANGES'],
        REQUESTED_CHANGES: ['REQUESTED_CHANGES', 'SUBMITTED', 'REJECTED'],
        APPROVED: ['APPROVED', 'EXPIRED', 'SUSPENDED'],
        REJECTED: ['REJECTED', 'PENDING'],
        EXPIRED: ['EXPIRED', 'PENDING', 'SUBMITTED'],
        SUSPENDED: ['SUSPENDED', 'PENDING'],
      };
      const currentStatus = profile.status as KYCStatusType;
      const allowedTransitions = validTransitions[currentStatus] || [];
      if (!allowedTransitions.includes(data.status)) throw new ValidationError(`Invalid status transition from ${currentStatus} to ${data.status}`);
      if (['APPROVED', 'REJECTED'].includes(data.status) && !isAdmin) throw new ForbiddenError('Only administrators or compliance officers can approve or reject KYC profiles');
    }
    const oldValues = { tier: profile.tier, status: profile.status, rejectionReason: profile.rejectionReason, notes: profile.notes };
    const updateData: Record<string, unknown> = {};
    if (data.tier !== undefined) updateData.tier = data.tier;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.rejectionReason !== undefined) updateData.rejectionReason = data.rejectionReason === null ? null : data.rejectionReason;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.status) {
      if (data.status === 'APPROVED') { updateData.approvedAt = new Date(); updateData.approvedById = actingUserId; }
      else if (data.status === 'SUBMITTED') updateData.submittedAt = new Date();
      else if (data.status === 'REJECTED') { updateData.rejectedAt = new Date(); updateData.rejectedById = actingUserId; }
    }
    const updatedProfile = await prisma.kYCProfile.update({
      where: { id },
      data: updateData,
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } }, documents: true },
    });
    await prisma.auditLog.create({
      data: { actorId: actingUserId, action: 'UPDATE', resourceType: 'KYC_PROFILE', resourceId: profile.id, oldValues: oldValues as any, newValues: updateData as any, status: 'SUCCESS' },
    });
    return { profile: updatedProfile };
  }

  static async submitDocument(data: SubmitDocumentData, actingUserId?: string): Promise<DocumentResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);
    let profile: KYCProfile | null = null;
    if (data.kycProfileId) profile = await prisma.kYCProfile.findUnique({ where: { id: data.kycProfileId } });
    else profile = await prisma.kYCProfile.findUnique({ where: { userId: data.userId } });
    if (!profile) throw new NotFoundError('KYC Profile', data.kycProfileId || `for user ${data.userId}`);
    if (actingUserId && actingUserId !== data.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) throw new ForbiddenError('Only administrators or compliance officers can submit documents for other users');
    }
    const existingDocument = await prisma.kYCDocument.findFirst({ where: { kycProfileId: profile.id, documentType: data.documentType } });
    if (existingDocument) throw new ConflictError(`Document of type ${data.documentType} already exists for this profile`);
    const documentReference = generateReference('KYC-DOC');
    const document = await prisma.kYCDocument.create({
      data: {
        kycProfileId: profile.id,
        userId: data.userId,
        documentType: data.documentType,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        status: 'PENDING' as DocumentStatusType,
        metadata: data.metadata as any,
      },
      include: { kycProfile: { select: { id: true, userId: true, tier: true, status: true } } },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId || data.userId,
        action: 'CREATE',
        resourceType: 'KYC_DOCUMENT',
        resourceId: document.id,
        newValues: { documentType: document.documentType, fileName: document.fileName },
        status: 'SUCCESS',
      },
    });
    return { document };
  }

  static async getDocumentById(id: string, actingUserId?: string): Promise<DocumentResult> {
    const document = await prisma.kYCDocument.findUnique({
      where: { id },
      include: { kycProfile: { select: { id: true, userId: true, tier: true, status: true } } },
    });
    if (!document) throw new NotFoundError('KYC Document', id);
    if (actingUserId && actingUserId !== document.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'OPERATOR'].includes(actingUser.role)) throw new ForbiddenError('You do not have access to this document');
    }
    return { document };
  }

  static async reviewDocument(data: ReviewDocumentData, actingUserId: string): Promise<DocumentResult> {
    const document = await prisma.kYCDocument.findUnique({ where: { id: data.documentId }, include: { kycProfile: true } });
    if (!document) throw new NotFoundError('KYC Document', data.documentId);
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) throw new ForbiddenError('Only administrators or compliance officers can review KYC documents');
    const oldValues = { status: document.status, reviewNotes: document.reviewNotes };
    const updateData: Record<string, unknown> = { status: data.status, reviewedAt: new Date(), reviewedById: actingUserId };
    if (data.reviewNotes !== undefined) updateData.reviewNotes = data.reviewNotes;
    if (data.rejectionReason !== undefined) updateData.rejectionReason = data.rejectionReason;
    const updatedDocument = await prisma.kYCDocument.update({
      where: { id: data.documentId },
      data: updateData,
      include: { kycProfile: { select: { id: true, userId: true, tier: true, status: true } } },
    });
    await prisma.auditLog.create({
      data: { actorId: actingUserId, action: 'REVIEW', resourceType: 'KYC_DOCUMENT', resourceId: document.id, oldValues: oldValues as any, newValues: updateData as any, status: 'SUCCESS' },
    });
    return { document: updatedDocument };
  }

  static async deleteDocument(id: string, actingUserId: string): Promise<void> {
    const document = await prisma.kYCDocument.findUnique({ where: { id } });
    if (!document) throw new NotFoundError('KYC Document', id);
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) throw new ForbiddenError('Only administrators or compliance officers can delete KYC documents');
    await prisma.kYCDocument.delete({ where: { id } });
    await prisma.auditLog.create({
      data: { actorId: actingUserId, action: 'DELETE', resourceType: 'KYC_DOCUMENT', resourceId: document.id, oldValues: { documentType: document.documentType }, status: 'SUCCESS' },
    });
  }

  static async getStats(actingUserId: string): Promise<KYCStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) throw new ForbiddenError('Only administrators or compliance officers can view KYC statistics');
    const totalProfiles = await prisma.kYCProfile.count();
    const pending = await prisma.kYCProfile.count({ where: { status: 'PENDING' } });
    const approved = await prisma.kYCProfile.count({ where: { status: 'APPROVED' } });
    const rejected = await prisma.kYCProfile.count({ where: { status: 'REJECTED' } });
    const tiers = await prisma.kYCProfile.groupBy({ by: ['tier'], _count: { _all: true } });
    const byTier: Record<string, number> = { TIER_0: 0, TIER_1: 0, TIER_2: 0, TIER_3: 0 };
    for (const t of tiers) { const tier = t.tier as KYCTier; if (byTier[tier] !== undefined) byTier[tier] = t._count._all; }
    return { totalProfiles, pending, approved, rejected, byTier };
  }

  static async getProfileStatus(userId: string): Promise<{ status: KYCStatusType; tier: KYCTierType }> {
    const profile = await prisma.kYCProfile.findUnique({ where: { userId }, select: { status: true, tier: true } });
    if (!profile) return { status: 'NOT_STARTED' as KYCStatusType, tier: 'TIER_0' as KYCTierType };
    return { status: profile.status, tier: profile.tier };
  }

  static async isKYCApproved(userId: string): Promise<boolean> {
    const profile = await prisma.kYCProfile.findUnique({ where: { userId }, select: { status: true } });
    return profile?.status === 'APPROVED';
  }

  static async getRequiredDocumentsForTier(tier: KYCTierType): Promise<KYCDocumentType[]> {
    const tierRequirements: Record<string, KYCDocumentType[]> = {
      TIER_0: [],
      TIER_1: ['GOVERNMENT_ID', 'SELFIE'],
      TIER_2: ['GOVERNMENT_ID', 'SELFIE', 'PROOF_OF_ADDRESS'],
      TIER_3: ['GOVERNMENT_ID', 'SELFIE', 'PROOF_OF_ADDRESS', 'TAX_ID'],
    };
    return tierRequirements[tier] || [];
  }

  static async getMissingDocuments(userId: string): Promise<{ required: KYCDocumentType[]; submitted: KYCDocumentType[]; missing: KYCDocumentType[] }> {
    const profile = await prisma.kYCProfile.findUnique({ where: { userId }, include: { documents: true } });
    if (!profile) return { required: [], submitted: [], missing: [] };
    const required = await this.getRequiredDocumentsForTier(profile.tier);
    const submitted = profile.documents.map((d) => d.documentType);
    const missing = required.filter((r) => !submitted.includes(r));
    return { required, submitted, missing };
  }
}