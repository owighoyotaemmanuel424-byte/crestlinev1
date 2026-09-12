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

export interface UpdateKYCProfileData {
  tier?: KYCTier;
  status?: KYCStatus;
  rejectionReason?: string;
  notes?: string;
}

export interface SubmitKYCDocumentData {
  userId: string;
  kycProfileId?: string;
  documentType: KYCDocumentType;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}

export interface ReviewKYCDocumentData {
  documentId: string;
  status: DocumentStatus;
  reviewNotes?: string;
}

export interface RiskAssessmentData {
  userId: string;
  riskScore: number;
  riskFactors: string[];
  notes?: string;
}

export interface SanctionsScreeningData {
  userId: string;
  name: string;
  dateOfBirth?: Date;
  country?: string;
  identificationNumber?: string;
}

export interface SanctionsScreeningResult {
  id: string;
  userId: string;
  status: 'CLEAR' | 'MATCH' | 'PENDING_REVIEW';
  matches: SanctionsMatch[];
  notes?: string;
  createdAt: Date;
}

export interface SanctionsMatch {
  name: string;
  type: string;
  source: string;
  similarityScore: number;
  details: Record<string, unknown>;
}

export interface AMLCaseData {
  userId: string;
  caseType: AMLCaseType;
  severity: AMLCaseSeverity;
  description: string;
  relatedTransactionId?: string;
  relatedResourceType?: string;
  relatedResourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateAMLCaseData {
  status?: AMLCaseStatus;
  assignedToId?: string;
  resolutionNotes?: string;
  severity?: AMLCaseSeverity;
  metadata?: Record<string, unknown>;
}

export enum AMLCaseType {
  SANCTIONS_MATCH = 'SANCTIONS_MATCH',
  SUSPICIOUS_TRANSACTION = 'SUSPICIOUS_TRANSACTION',
  HIGH_RISK_COUNTRY = 'HIGH_RISK_COUNTRY',
  PEPS_MATCH = 'PEPS_MATCH',
  UNUSUAL_ACTIVITY = 'UNUSUAL_ACTIVITY',
  STRUCTURING = 'STRUCTURING',
  SOURCE_OF_FUNDS = 'SOURCE_OF_FUNDS',
  IDENTITY_VERIFICATION = 'IDENTITY_VERIFICATION',
  OTHER = 'OTHER',
}

export enum AMLCaseSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum AMLCaseStatus {
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  ESCALATED = 'ESCALATED',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  FALSE_POSITIVE = 'FALSE_POSITIVE',
}

export interface AMLCase {
  id: string;
  reference: string;
  userId: string;
  caseType: AMLCaseType;
  severity: AMLCaseSeverity;
  status: AMLCaseStatus;
  description: string;
  assignedToId: string | null;
  resolutionNotes: string | null;
  relatedTransactionId: string | null;
  relatedResourceType: string | null;
  relatedResourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  resolvedById: string | null;
}

export interface KYCProfileResult {
  profile: KYCProfile & {
    user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'>;
    documents: KYCDocument[];
  };
}

export interface KYCProfileListResult {
  profiles: KYCProfile[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AMLCaseResult {
  case: AMLCase;
}

export interface AMLCaseListResult {
  cases: AMLCase[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// CONSTANTS
// ============================================

const AML_CONFIG = {
  RISK_SCORE_THRESHOLDS: {
    LOW: 0,
    MEDIUM: 30,
    HIGH: 70,
    CRITICAL: 90,
  },
  HIGH_RISK_COUNTRIES: ['IR', 'KP', 'SY', 'SD', 'CU', 'BY', 'RU'],
  SANCTIONS_SOURCES: ['OFAC', 'UN', 'EU', 'UK', ' WORLD_BANK'],
  PEPS_SOURCES: ['WORLD_BANK', 'TRANSPARENCY_INTERNATIONAL'],
  MAX_DAILY_TRANSACTION: 1000000,
  MAX_SINGLE_TRANSACTION: 500000,
  VELOCITY_THRESHOLD: 10,
} as const;

// ============================================
// AML SERVICE
// ============================================

export class AMLService {
  // ============================================
  // KYC PROFILE MANAGEMENT
  // ============================================

  static async getKYCProfile(userId: string, actingUserId?: string): Promise<KYCProfileResult> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    // Ownership check
    if (actingUserId && actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'OPERATOR'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this KYC profile');
      }
    }

    const profile = await prisma.kYCProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!profile) throw new NotFoundError('KYC Profile', userId);

    return { profile };
  }

  static async createKYCProfile(
    data: CreateKYCProfileData,
    actingUserId: string
  ): Promise<KYCProfileResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'OPERATOR'].includes(actingUser.role)) {
      throw new ForbiddenError('Only compliance personnel can create KYC profiles');
    }

    const existingProfile = await prisma.kYCProfile.findUnique({ where: { userId: data.userId } });
    if (existingProfile) {
      throw new ConflictError('KYC profile already exists for this user');
    }

    const profile = await prisma.kYCProfile.create({
      data: {
        userId: data.userId,
        tier: data.tier || ('TIER_1' as KYCTier),
        status: 'PENDING' as KYCStatus,
        notes: data.notes,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        documents: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'CREATE',
        resourceType: 'KYC_PROFILE',
        resourceId: profile.id,
        newValues: { userId: data.userId, tier: profile.tier, status: profile.status },
        status: 'SUCCESS',
      },
    });

    return { profile };
  }

  static async updateKYCProfile(
    userId: string,
    data: UpdateKYCProfileData,
    actingUserId: string
  ): Promise<KYCProfileResult> {
    const profile = await prisma.kYCProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundError('KYC Profile', userId);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only compliance personnel can update KYC profiles');
    }

    const oldStatus = profile.status;
    const oldTier = profile.tier;

    const updatedProfile = await prisma.kYCProfile.update({
      where: { userId },
      data: {
        tier: data.tier,
        status: data.status,
        rejectionReason: data.rejectionReason,
        notes: data.notes,
        verifiedAt: data.status === 'APPROVED' ? new Date() : undefined,
        verifiedById: data.status === 'APPROVED' ? actingUserId : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        documents: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'UPDATE',
        resourceType: 'KYC_PROFILE',
        resourceId: profile.id,
        oldValues: { status: oldStatus, tier: oldTier, rejectionReason: profile.rejectionReason },
        newValues: {
          status: updatedProfile.status,
          tier: updatedProfile.tier,
          rejectionReason: updatedProfile.rejectionReason,
        },
        status: 'SUCCESS',
      },
    });

    // Send notification to user
    if (updatedProfile.status === 'APPROVED' || updatedProfile.status === 'REJECTED') {
      await prisma.notification.create({
        data: {
          userId: updatedProfile.userId,
          title: `KYC ${updatedProfile.status}`,
          message: `Your KYC verification has been ${updatedProfile.status.toLowerCase()}.`,
          type: updatedProfile.status === 'APPROVED' ? 'SUCCESS' : 'WARNING',
          category: 'KYC',
          isRead: false,
          metadata: { status: updatedProfile.status },
        },
      });
    }

    return { profile: updatedProfile };
  }

  static async listKYCProfiles(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: KYCStatus,
    tier?: KYCTier,
    search?: string
  ): Promise<KYCProfileListResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only compliance personnel can view KYC profiles');
    }

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (tier) where.tier = tier;
    if (search) {
      where.user = {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const profiles = await prisma.kYCProfile.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    const total = await prisma.kYCProfile.count({ where });

    return {
      profiles,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================
  // KYC DOCUMENT MANAGEMENT
  // ============================================

  static async submitKYCDocument(
    data: SubmitKYCDocumentData,
    actingUserId: string
  ): Promise<KYCDocument> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    // Check if user can submit documents (either themselves or admin)
    if (actingUserId !== data.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You can only submit documents for your own account');
      }
    }

    // Get or create KYC profile
    let kycProfile = await prisma.kYCProfile.findUnique({ where: { userId: data.userId } });
    if (!kycProfile) {
      kycProfile = await prisma.kYCProfile.create({
        data: {
          userId: data.userId,
          tier: 'TIER_1' as KYCTier,
          status: 'PENDING' as KYCStatus,
        },
      });
    }

    const document = await prisma.kYCDocument.create({
      data: {
        userId: data.userId,
        kycProfileId: kycProfile.id,
        documentType: data.documentType,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        status: 'PENDING' as DocumentStatus,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'CREATE',
        resourceType: 'KYC_DOCUMENT',
        resourceId: document.id,
        newValues: {
          userId: data.userId,
          documentType: data.documentType,
          fileName: data.fileName,
          status: 'PENDING',
        },
        status: 'SUCCESS',
      },
    });

    return document;
  }

  static async reviewKYCDocument(
    documentId: string,
    data: ReviewKYCDocumentData,
    actingUserId: string
  ): Promise<KYCDocument> {
    const document = await prisma.kYCDocument.findUnique({
      where: { id: documentId },
      include: { user: true },
    });
    if (!document) throw new NotFoundError('KYC Document', documentId);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only compliance personnel can review KYC documents');
    }

    const oldStatus = document.status;

    const updatedDocument = await prisma.kYCDocument.update({
      where: { id: documentId },
      data: {
        status: data.status,
        reviewNotes: data.reviewNotes,
        reviewedById: actingUserId,
        reviewedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'UPDATE',
        resourceType: 'KYC_DOCUMENT',
        resourceId: document.id,
        oldValues: { status: oldStatus },
        newValues: { status: data.status, reviewNotes: data.reviewNotes },
        status: 'SUCCESS',
      },
    });

    // Update KYC profile status if all documents are approved
    if (data.status === 'APPROVED') {
      const profile = await prisma.kYCProfile.findUnique({
        where: { userId: document.userId },
        include: { documents: true },
      });

      if (profile) {
        const allApproved = profile.documents.every(d => d.status === 'APPROVED');
        if (allApproved && profile.status !== 'APPROVED') {
          await prisma.kYCProfile.update({
            where: { userId: document.userId },
            data: {
              status: 'APPROVED' as KYCStatus,
              verifiedAt: new Date(),
              verifiedById: actingUserId,
            },
          });

          await prisma.auditLog.create({
            data: {
              actorId: actingUserId,
              action: 'AUTO_APPROVE',
              resourceType: 'KYC_PROFILE',
              resourceId: profile.id,
              metadata: { reason: 'All documents approved' },
              status: 'SUCCESS',
            },
          });
        }
      }
    }

    return updatedDocument;
  }

  static async listKYCDocuments(
    userId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: DocumentStatus
  ): Promise<{ documents: KYCDocument[]; total: number; page: number; limit: number; totalPages: number }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    if (actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these documents');
      }
    }

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;

    const documents = await prisma.kYCDocument.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.kYCDocument.count({ where });

    return {
      documents,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================
  // RISK ASSESSMENT
  // ============================================

  static async calculateRiskScore(userId: string): Promise<{ score: number; factors: string[]; tier: KYCTier }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        kycProfile: true,
        accounts: true,
        transactions: {
          where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) throw new NotFoundError('User', userId);

    const factors: string[] = [];
    let score = 0;

    // Country risk
    if (user.country && AML_CONFIG.HIGH_RISK_COUNTRIES.includes(user.country)) {
      score += 40;
      factors.push(`High-risk country: ${user.country}`);
    }

    // KYC tier
    if (user.kycProfile) {
      const tierScores: Record<KYCTier, number> = {
        TIER_0: 100,
        TIER_1: 30,
        TIER_2: 10,
        TIER_3: 0,
      };
      score += tierScores[user.kycProfile.tier] || 0;
      factors.push(`KYC tier: ${user.kycProfile.tier}`);
    } else {
      score += 50;
      factors.push('No KYC profile');
    }

    // Transaction velocity
    const recentTransactions = user.transactions.length;
    if (recentTransactions > AML_CONFIG.VELOCITY_THRESHOLD) {
      score += Math.min(20, (recentTransactions - AML_CONFIG.VELOCITY_THRESHOLD) * 2);
      factors.push(`High transaction velocity: ${recentTransactions} in 30 days`);
    }

    // Account count
    if (user.accounts.length > 5) {
      score += (user.accounts.length - 5) * 5;
      factors.push(`Multiple accounts: ${user.accounts.length}`);
    }

    // Cap score at 100
    score = Math.min(100, Math.max(0, score));

    // Determine tier based on score
    let tier: KYCTier = 'TIER_3';
    if (score >= AML_CONFIG.RISK_SCORE_THRESHOLDS.CRITICAL) tier = 'TIER_0';
    else if (score >= AML_CONFIG.RISK_SCORE_THRESHOLDS.HIGH) tier = 'TIER_1';
    else if (score >= AML_CONFIG.RISK_SCORE_THRESHOLDS.MEDIUM) tier = 'TIER_2';

    return { score, factors, tier };
  }

  static async performSanctionsScreening(
    data: SanctionsScreeningData
  ): Promise<SanctionsScreeningResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    // In production, this would call external sanctions screening APIs
    // For now, we implement a mock that checks against known patterns
    const matches: SanctionsMatch[] = [];

    // Check name against sanctions lists (mock)
    const sanitizedName = data.name.toUpperCase().trim();
    
    // Mock: Check for known sanctions patterns
    const sanctionsPatterns = [
      { name: 'TERRORIST', type: 'SANCTION', source: 'OFAC' },
      { name: 'NARCOTICS', type: 'SANCTION', source: 'OFAC' },
      { name: 'WEAPONS', type: 'SANCTION', source: 'UN' },
    ];

    for (const pattern of sanctionsPatterns) {
      if (sanitizedName.includes(pattern.name)) {
        matches.push({
          name: data.name,
          type: pattern.type,
          source: pattern.source,
          similarityScore: 100,
          details: { reason: 'Name match' },
        });
      }
    }

    // Check country
    if (data.country && AML_CONFIG.HIGH_RISK_COUNTRIES.includes(data.country)) {
      matches.push({
        name: data.country,
        type: 'HIGH_RISK_COUNTRY',
        source: 'FATF',
        similarityScore: 100,
        details: { country: data.country },
      });
    }

    // Determine status
    let status: 'CLEAR' | 'MATCH' | 'PENDING_REVIEW' = 'CLEAR';
    if (matches.length > 0) {
      status = matches.some(m => m.similarityScore >= 90) ? 'MATCH' : 'PENDING_REVIEW';
    }

    const result: SanctionsScreeningResult = {
      id: generateReference('SAN'),
      userId: data.userId,
      status,
      matches,
      notes: status === 'MATCH' ? 'Sanctions match detected - requires immediate review' : undefined,
      createdAt: new Date(),
    };

    // Log screening result
    await prisma.auditLog.create({
      data: {
        actorId: 'SYSTEM',
        action: 'SANCTIONS_SCREENING',
        resourceType: 'USER',
        resourceId: data.userId,
        metadata: {
          status,
          matchesCount: matches.length,
          name: data.name,
          country: data.country,
        },
        status: 'SUCCESS',
      },
    });

    // Auto-create AML case if match found
    if (status === 'MATCH') {
      await this.createAMLCase({
        userId: data.userId,
        caseType: AMLCaseType.SANCTIONS_MATCH,
        severity: AMLCaseSeverity.CRITICAL,
        description: `Sanctions screening match detected for user ${data.userId}`,
        metadata: {
          matches,
          screeningId: result.id,
        },
      }, 'SYSTEM');
    }

    return result;
  }

  // ============================================
  // AML CASE MANAGEMENT
  // ============================================

  static async createAMLCase(
    data: AMLCaseData,
    actingUserId: string
  ): Promise<AMLCaseResult> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only compliance personnel can create AML cases');
    }

    // Check for duplicate cases
    const existingCase = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'AML_CASE',
        resourceId: data.relatedTransactionId || data.userId,
        action: 'CREATE',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    if (existingCase) {
      throw new ConflictError('An AML case for this resource already exists within the last 24 hours');
    }

    const reference = generateReference('AML');

    // Create AML case (using AuditLog as the backing store with resourceType = AML_CASE)
    const caseData = {
      id: reference,
      reference,
      userId: data.userId,
      caseType: data.caseType,
      severity: data.severity,
      status: AMLCaseStatus.OPEN,
      description: data.description,
      assignedToId: null,
      resolutionNotes: null,
      relatedTransactionId: data.relatedTransactionId || null,
      relatedResourceType: data.relatedResourceType || null,
      relatedResourceId: data.relatedResourceId || null,
      metadata: data.metadata || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      resolvedAt: null,
      resolvedById: null,
    };

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'CREATE',
        resourceType: 'AML_CASE',
        resourceId: reference,
        newValues: caseData,
        metadata: {
          caseType: data.caseType,
          severity: data.severity,
          description: data.description,
        },
        status: 'SUCCESS',
      },
    });

    // Send notification to compliance team
    const complianceUsers = await prisma.user.findMany({
      where: { role: { in: ['COMPLIANCE', 'ADMIN', 'SUPER_ADMIN'] } },
    });

    for (const complianceUser of complianceUsers) {
      await prisma.notification.create({
        data: {
          userId: complianceUser.id,
          title: `New AML Case: ${data.caseType}`,
          message: `A new AML case has been created for user ${data.userId}. Severity: ${data.severity}`,
          type: 'WARNING',
          category: 'SECURITY',
          isRead: false,
          metadata: { caseId: reference, caseType: data.caseType, severity: data.severity },
        },
      });
    }

    return { case: caseData };
  }

  static async getAMLCase(caseId: string, actingUserId: string): Promise<AMLCaseResult> {
    // Retrieve AML case from AuditLog
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'AML_CASE',
        resourceId: caseId,
        action: 'CREATE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!auditLog) throw new NotFoundError('AML Case', caseId);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only compliance personnel can view AML cases');
    }

    const newValues = auditLog.newValues as unknown as Partial<AMLCase>;
    const caseData: AMLCase = {
      id: auditLog.resourceId,
      reference: newValues.reference || caseId,
      userId: newValues.userId || '',
      caseType: newValues.caseType || AMLCaseType.OTHER,
      severity: newValues.severity || AMLCaseSeverity.LOW,
      status: newValues.status || AMLCaseStatus.OPEN,
      description: newValues.description || '',
      assignedToId: newValues.assignedToId || null,
      resolutionNotes: newValues.resolutionNotes || null,
      relatedTransactionId: newValues.relatedTransactionId || null,
      relatedResourceType: newValues.relatedResourceType || null,
      relatedResourceId: newValues.relatedResourceId || null,
      metadata: newValues.metadata as Record<string, unknown> || null,
      createdAt: auditLog.createdAt,
      updatedAt: auditLog.createdAt,
      resolvedAt: newValues.resolvedAt || null,
      resolvedById: newValues.resolvedById || null,
    };

    return { case: caseData };
  }

  static async updateAMLCase(
    caseId: string,
    data: UpdateAMLCaseData,
    actingUserId: string
  ): Promise<AMLCaseResult> {
    const existingCase = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'AML_CASE',
        resourceId: caseId,
        action: 'CREATE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!existingCase) throw new NotFoundError('AML Case', caseId);

    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only compliance personnel can update AML cases');
    }

    const newValues = existingCase.newValues as unknown as Partial<AMLCase>;
    const oldCase: AMLCase = {
      id: existingCase.resourceId,
      reference: newValues.reference || caseId,
      userId: newValues.userId || '',
      caseType: newValues.caseType || AMLCaseType.OTHER,
      severity: newValues.severity || AMLCaseSeverity.LOW,
      status: newValues.status || AMLCaseStatus.OPEN,
      description: newValues.description || '',
      assignedToId: newValues.assignedToId || null,
      resolutionNotes: newValues.resolutionNotes || null,
      relatedTransactionId: newValues.relatedTransactionId || null,
      relatedResourceType: newValues.relatedResourceType || null,
      relatedResourceId: newValues.relatedResourceId || null,
      metadata: newValues.metadata as Record<string, unknown> || null,
      createdAt: existingCase.createdAt,
      updatedAt: existingCase.createdAt,
      resolvedAt: newValues.resolvedAt || null,
      resolvedById: newValues.resolvedById || null,
    };

    const updatedCase: AMLCase = {
      ...oldCase,
      ...data,
      status: data.status || oldCase.status,
      assignedToId: data.assignedToId || oldCase.assignedToId,
      resolutionNotes: data.resolutionNotes || oldCase.resolutionNotes,
      severity: data.severity || oldCase.severity,
      metadata: data.metadata ? { ...(oldCase.metadata || {}), ...data.metadata } : oldCase.metadata,
      updatedAt: new Date(),
      resolvedAt: (data.status === 'RESOLVED' || data.status === 'CLOSED' || data.status === 'FALSE_POSITIVE') ? new Date() : oldCase.resolvedAt,
      resolvedById: (data.status === 'RESOLVED' || data.status === 'CLOSED' || data.status === 'FALSE_POSITIVE') ? actingUserId : oldCase.resolvedById,
    };

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'UPDATE',
        resourceType: 'AML_CASE',
        resourceId: caseId,
        oldValues: oldCase,
        newValues: updatedCase,
        status: 'SUCCESS',
      },
    });

    return { case: updatedCase };
  }

  static async listAMLCases(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: AMLCaseStatus,
    severity?: AMLCaseSeverity,
    caseType?: AMLCaseType,
    assignedToId?: string,
    search?: string
  ): Promise<AMLCaseListResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only compliance personnel can view AML cases');
    }

    // Get all CREATE actions for AML_CASE
    const where: Record<string, unknown> = {
      resourceType: 'AML_CASE',
      action: 'CREATE',
    };

    if (status) {
      where.newValues = {
        path: ['status'],
        string_contains: status,
      };
    }

    // Note: This is a simplified query. In production, you'd need to properly filter
    // the JSON newValues field. This may require raw SQL or a more sophisticated approach.
    const auditLogs = await prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const cases: AMLCase[] = auditLogs.map(log => {
      const newValues = log.newValues as unknown as Partial<AMLCase>;
      return {
        id: log.resourceId,
        reference: newValues.reference || log.resourceId,
        userId: newValues.userId || '',
        caseType: newValues.caseType || AMLCaseType.OTHER,
        severity: newValues.severity || AMLCaseSeverity.LOW,
        status: newValues.status || AMLCaseStatus.OPEN,
        description: newValues.description || '',
        assignedToId: newValues.assignedToId || null,
        resolutionNotes: newValues.resolutionNotes || null,
        relatedTransactionId: newValues.relatedTransactionId || null,
        relatedResourceType: newValues.relatedResourceType || null,
        relatedResourceId: newValues.relatedResourceId || null,
        metadata: newValues.metadata as Record<string, unknown> || null,
        createdAt: log.createdAt,
        updatedAt: log.createdAt,
        resolvedAt: newValues.resolvedAt || null,
        resolvedById: newValues.resolvedById || null,
      };
    });

    const total = await prisma.auditLog.count({ where });

    return {
      cases,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================
  // TRANSACTION MONITORING
  // ============================================

  static async monitorTransaction(
    transactionId: string,
    userId: string,
    amount: number,
    currency: string = 'USD',
    transactionType: string
  ): Promise<{ isSuspicious: boolean; riskFactors: string[]; caseId?: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { kycProfile: true, accounts: true },
    });

    if (!user) throw new NotFoundError('User', userId);

    const riskFactors: string[] = [];
    let isSuspicious = false;
    let caseId: string | undefined;

    // Check amount against thresholds
    if (amount >= AML_CONFIG.MAX_SINGLE_TRANSACTION) {
      riskFactors.push(`Transaction amount (${amount}) exceeds single transaction threshold (${AML_CONFIG.MAX_SINGLE_TRANSACTION})`);
      isSuspicious = true;
    }

    // Check daily velocity
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dailyCount = await prisma.transaction.count({
      where: {
        userId,
        createdAt: { gte: today, lt: tomorrow },
      },
    });

    if (dailyCount >= AML_CONFIG.VELOCITY_THRESHOLD) {
      riskFactors.push(`Daily transaction count (${dailyCount}) exceeds velocity threshold (${AML_CONFIG.VELOCITY_THRESHOLD})`);
      isSuspicious = true;
    }

    // Check user risk tier
    if (user.kycProfile) {
      if (user.kycProfile.tier === 'TIER_0') {
        riskFactors.push('User has TIER_0 KYC status');
        isSuspicious = true;
      } else if (user.kycProfile.tier === 'TIER_1' && amount > 50000) {
        riskFactors.push('High-value transaction for TIER_1 user');
        isSuspicious = true;
      }
    } else {
      riskFactors.push('User has no KYC profile');
      isSuspicious = true;
    }

    // Check country risk
    if (user.country && AML_CONFIG.HIGH_RISK_COUNTRIES.includes(user.country)) {
      riskFactors.push(`User country (${user.country}) is high-risk`);
      isSuspicious = true;
    }

    // Create AML case if suspicious
    if (isSuspicious) {
      const result = await this.createAMLCase({
        userId,
        caseType: AMLCaseType.SUSPICIOUS_TRANSACTION,
        severity: riskFactors.length >= 3 ? AMLCaseSeverity.HIGH : AMLCaseSeverity.MEDIUM,
        description: `Suspicious transaction detected: ${transactionType} of ${amount} ${currency}`,
        relatedTransactionId: transactionId,
        relatedResourceType: 'TRANSACTION',
        relatedResourceId: transactionId,
        metadata: {
          amount,
          currency,
          transactionType,
          riskFactors,
        },
      }, 'SYSTEM');

      caseId = result.case.id;
    }

    // Log monitoring result
    await prisma.auditLog.create({
      data: {
        actorId: 'SYSTEM',
        action: 'TRANSACTION_MONITORING',
        resourceType: 'TRANSACTION',
        resourceId: transactionId,
        metadata: {
          isSuspicious,
          riskFactors,
          caseId,
        },
        status: 'SUCCESS',
      },
    });

    return { isSuspicious, riskFactors, caseId };
  }

  // ============================================
  // COMPLIANCE REPORTING
  // ============================================

  static async generateComplianceReport(
    actingUserId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalCases: number;
    openCases: number;
    resolvedCases: number;
    highRiskUsers: number;
    sanctionsMatches: number;
    suspiciousTransactions: number;
  }> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only compliance personnel can generate reports');
    }

    // Count AML cases
    const totalCases = await prisma.auditLog.count({
      where: {
        resourceType: 'AML_CASE',
        action: 'CREATE',
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    const openCases = await prisma.auditLog.count({
      where: {
        resourceType: 'AML_CASE',
        action: 'CREATE',
        createdAt: { gte: startDate, lte: endDate },
        newValues: {
          path: ['status'],
          string_contains: 'OPEN',
        },
      },
    });

    const resolvedCases = await prisma.auditLog.count({
      where: {
        resourceType: 'AML_CASE',
        action: 'UPDATE',
        createdAt: { gte: startDate, lte: endDate },
        newValues: {
          path: ['status'],
          string_contains: 'RESOLVED',
        },
      },
    });

    // Count high-risk users
    const allUsers = await prisma.user.findMany({
      include: { kycProfile: true },
    });

    let highRiskUsers = 0;
    let sanctionsMatches = 0;

    for (const user of allUsers) {
      const risk = await this.calculateRiskScore(user.id);
      if (risk.score >= AML_CONFIG.RISK_SCORE_THRESHOLDS.HIGH) {
        highRiskUsers++;
      }

      // Check for sanctions screening matches
      const screeningLogs = await prisma.auditLog.findMany({
        where: {
          resourceType: 'USER',
          resourceId: user.id,
          action: 'SANCTIONS_SCREENING',
          createdAt: { gte: startDate, lte: endDate },
          metadata: {
            path: ['status'],
            string_contains: 'MATCH',
          },
        },
      });

      if (screeningLogs.length > 0) {
        sanctionsMatches++;
      }
    }

    // Count suspicious transactions
    const suspiciousTransactions = await prisma.auditLog.count({
      where: {
        resourceType: 'TRANSACTION',
        action: 'TRANSACTION_MONITORING',
        createdAt: { gte: startDate, lte: endDate },
        metadata: {
          path: ['isSuspicious'],
          equals: true,
        },
      },
    });

    return {
      totalCases,
      openCases,
      resolvedCases,
      highRiskUsers,
      sanctionsMatches,
      suspiciousTransactions,
    };
  }
}
