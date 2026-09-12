import { prisma } from '../prisma';
import { generateReference } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  AppError,
} from '../utils/errors';
import type { User, AuditLog, AuditAction, ResourceType, AuditStatus, Role } from '@prisma/client';

// ============================================
// INTERFACES & TYPES
// ============================================

export interface AuditEventData {
  actorId: string;
  action: AuditAction;
  resourceType: ResourceType;
  resourceId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  status?: AuditStatus;
  errorMessage?: string;
}

export interface AuditEvent {
  id: string;
  actorId: string | null;
  actor: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'> | null;
  action: AuditAction;
  resourceType: ResourceType;
  resourceId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: AuditStatus;
  errorMessage: string | null;
  createdAt: Date;
}

export interface AuditEventListResult {
  events: AuditEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditQuery {
  actorId?: string;
  action?: AuditAction;
  resourceType?: ResourceType;
  resourceId?: string;
  status?: AuditStatus;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

export interface AuditExportData {
  events: AuditEvent[];
  generatedAt: Date;
  generatedBy: string;
  filters: AuditQuery;
}

export interface AuditStats {
  totalEvents: number;
  byAction: Record<AuditAction, number>;
  byResourceType: Record<ResourceType, number>;
  byStatus: Record<AuditStatus, number>;
  byActor: Record<string, number>;
  recentEvents: AuditEvent[];
}

// ============================================
// CONSTANTS
// ============================================

const AUDIT_RETENTION_DAYS = 365 * 7; // 7 years
const MAX_AUDIT_EVENTS_PER_QUERY = 1000;

// ============================================
// AUDIT SERVICE
// ============================================

export class AuditService {
  // ============================================
  // CREATE AUDIT EVENTS
  // ============================================

  /**
   * Create an audit event with full validation and security checks
   * This is the primary method for logging audit events
   */
  static async createEvent(data: AuditEventData): Promise<AuditEvent> {
    // Validate required fields
    if (!data.actorId || !data.action || !data.resourceType || !data.resourceId) {
      throw new ValidationError('actorId, action, resourceType, and resourceId are required');
    }

    // Validate actor exists (except for SYSTEM)
    if (data.actorId !== 'SYSTEM') {
      const actor = await prisma.user.findUnique({ where: { id: data.actorId } });
      if (!actor) {
        // Log but don't fail - use the actorId as-is
        console.warn(`AuditService: Actor ${data.actorId} not found, but audit event will be created`);
      }
    }

    // Create the audit event
    const event = await prisma.auditLog.create({
      data: {
        actorId: data.actorId === 'SYSTEM' ? null : data.actorId,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        oldValues: data.oldValues || null,
        newValues: data.newValues || null,
        metadata: data.metadata || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
        status: data.status || ('SUCCESS' as AuditStatus),
        errorMessage: data.errorMessage || null,
      },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    return this.formatEvent(event);
  }

  /**
   * Create multiple audit events in a single transaction
   */
  static async createEvents(events: AuditEventData[]): Promise<AuditEvent[]> {
    if (events.length === 0) return [];

    return prisma.$transaction(
      events.map(data =>
        prisma.auditLog.create({
          data: {
            actorId: data.actorId === 'SYSTEM' ? null : data.actorId,
            action: data.action,
            resourceType: data.resourceType,
            resourceId: data.resourceId,
            oldValues: data.oldValues || null,
            newValues: data.newValues || null,
            metadata: data.metadata || null,
            ipAddress: data.ipAddress || null,
            userAgent: data.userAgent || null,
            status: data.status || ('SUCCESS' as AuditStatus),
            errorMessage: data.errorMessage || null,
          },
          include: {
            actor: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        })
      )
    ).then(results => results.map(this.formatEvent));
  }

  // ============================================
  // READ AUDIT EVENTS
  // ============================================

  /**
   * Get a single audit event by ID
   */
  static async getEventById(id: string, actingUserId: string): Promise<AuditEvent> {
    const event = await prisma.auditLog.findUnique({
      where: { id },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    if (!event) throw new NotFoundError('Audit Event', id);

    // Authorization check
    if (!this.hasAuditAccess(actingUserId, event)) {
      throw new ForbiddenError('You do not have access to this audit event');
    }

    return this.formatEvent(event);
  }

  /**
   * List audit events with filtering and pagination
   */
  static async listEvents(
    query: AuditQuery = {},
    actingUserId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<AuditEventListResult> {
    // Validate limit
    limit = Math.min(limit, MAX_AUDIT_EVENTS_PER_QUERY);

    // Get acting user to determine access level
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser) throw new NotFoundError('User', actingUserId);

    // Build where clause
    const where: Record<string, unknown> = {};

    // Date range filter
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = query.startDate;
      if (query.endDate) where.createdAt.lte = query.endDate;
    }

    // Actor filter - only allow filtering by own ID for non-admins
    if (query.actorId) {
      if (actingUser.role !== 'SUPER_ADMIN' && query.actorId !== actingUserId) {
        throw new ForbiddenError('You can only filter audit events by your own user ID');
      }
      where.actorId = query.actorId;
    }

    // Action filter
    if (query.action) where.action = query.action;

    // Resource type filter
    if (query.resourceType) where.resourceType = query.resourceType;

    // Resource ID filter
    if (query.resourceId) where.resourceId = query.resourceId;

    // Status filter
    if (query.status) where.status = query.status;

    // Search filter (searches in metadata, oldValues, newValues)
    if (query.search) {
      where.OR = [
        { metadata: { path: ['$'], string_contains: query.search, mode: 'insensitive' } },
        { oldValues: { path: ['$'], string_contains: query.search, mode: 'insensitive' } },
        { newValues: { path: ['$'], string_contains: query.search, mode: 'insensitive' } },
        { resourceId: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // For non-admin users, restrict to their own events or events they have access to
    if (!['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      where.OR = [
        { actorId: actingUserId },
        { resourceType: 'USER', resourceId: actingUserId },
        { resourceType: 'ACCOUNT', 
          resource: { 
            userId: actingUserId 
          } 
        },
        { resourceType: 'TRANSACTION', 
          resource: { 
            userId: actingUserId 
          } 
        },
      ];
    }

    // Execute query
    const events = await prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    const total = await prisma.auditLog.count({ where });

    return {
      events: events.map(this.formatEvent),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * List audit events for a specific resource
   */
  static async listEventsForResource(
    resourceType: ResourceType,
    resourceId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<AuditEventListResult> {
    // Verify user has access to the resource
    await this.verifyResourceAccess(resourceType, resourceId, actingUserId);

    const where = {
      resourceType,
      resourceId,
    };

    const events = await prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    const total = await prisma.auditLog.count({ where });

    return {
      events: events.map(this.formatEvent),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * List audit events for a specific user (actor)
   */
  static async listEventsForActor(
    actorId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<AuditEventListResult> {
    // Authorization check
    if (actorId !== actingUserId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
        throw new ForbiddenError('You can only view your own audit events');
      }
    }

    const where = { actorId };

    const events = await prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    const total = await prisma.auditLog.count({ where });

    return {
      events: events.map(this.formatEvent),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================
  // AUDIT STATISTICS & ANALYTICS
  // ============================================

  /**
   * Get audit statistics
   */
  static async getStats(
    actingUserId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<AuditStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser) throw new NotFoundError('User', actingUserId);

    const where: Record<string, unknown> = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    // For non-admin users, restrict to their own events
    if (!['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      where.OR = [
        { actorId: actingUserId },
        { resourceType: 'USER', resourceId: actingUserId },
      ];
    }

    const totalEvents = await prisma.auditLog.count({ where });

    // Get counts by action
    const actions = await prisma.auditLog.groupBy({
      by: ['action'],
      where,
      _count: { _all: true },
    });

    const byAction: Record<AuditAction, number> = {
      CREATE: 0,
      UPDATE: 0,
      DELETE: 0,
      LOGIN: 0,
      LOGOUT: 0,
      REGISTER: 0,
      RESET_PASSWORD: 0,
      RESET_PASSWORD_REQUEST: 0,
      FREEZE: 0,
      UNFREEZE: 0,
      TRANSFER: 0,
      DEPOSIT: 0,
      WITHDRAWAL: 0,
      SANCTIONS_SCREENING: 0,
      TRANSACTION_MONITORING: 0,
      AUTO_APPROVE: 0,
    };

    for (const action of actions) {
      byAction[action.action as AuditAction] = action._count._all;
    }

    // Get counts by resource type
    const resourceTypes = await prisma.auditLog.groupBy({
      by: ['resourceType'],
      where,
      _count: { _all: true },
    });

    const byResourceType: Record<ResourceType, number> = {
      USER: 0,
      ACCOUNT: 0,
      TRANSACTION: 0,
      TRANSFER: 0,
      DEPOSIT: 0,
      WITHDRAWAL: 0,
      CARD: 0,
      BENEFICIARY: 0,
      KYC_PROFILE: 0,
      KYC_DOCUMENT: 0,
      LOAN_APPLICATION: 0,
      LOAN_DISBURSEMENT: 0,
      LOAN_REPAYMENT: 0,
      INVESTMENT_PORTFOLIO: 0,
      INVESTMENT: 0,
      INVESTMENT_TRANSACTION: 0,
      SAVINGS_GOAL: 0,
      SAVINGS_CONTRIBUTION: 0,
      SAVINGS_WITHDRAWAL: 0,
      SUPPORT_TICKET: 0,
      SUPPORT_MESSAGE: 0,
      SUPPORT_ATTACHMENT: 0,
      NOTIFICATION: 0,
      SESSION: 0,
      SECURITY_SETTINGS: 0,
      PROFILE: 0,
      AML_CASE: 0,
      FRAUD_ALERT: 0,
      WEBHOOK_EVENT: 0,
      JOURNAL: 0,
      LEDGER_ENTRY: 0,
      FEE: 0,
    };

    for (const rt of resourceTypes) {
      byResourceType[rt.resourceType as ResourceType] = rt._count._all;
    }

    // Get counts by status
    const statuses = await prisma.auditLog.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });

    const byStatus: Record<AuditStatus, number> = {
      SUCCESS: 0,
      FAILURE: 0,
      PENDING: 0,
    };

    for (const status of statuses) {
      byStatus[status.status as AuditStatus] = status._count._all;
    }

    // Get counts by actor
    const actors = await prisma.auditLog.groupBy({
      by: ['actorId'],
      where: { actorId: { not: null } },
      _count: { _all: true },
    });

    const byActor: Record<string, number> = {};
    for (const actor of actors) {
      if (actor.actorId) {
        const user = await prisma.user.findUnique({ where: { id: actor.actorId } });
        const displayName = user ? `${user.firstName} ${user.lastName} (${user.email})` : actor.actorId;
        byActor[displayName] = actor._count._all;
      }
    }

    // Get recent events
    const recentEvents = await prisma.auditLog.findMany({
      where,
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    return {
      totalEvents,
      byAction,
      byResourceType,
      byStatus,
      byActor,
      recentEvents: recentEvents.map(this.formatEvent),
    };
  }

  // ============================================
  // AUDIT EXPORT
  // ============================================

  /**
   * Export audit events as CSV or JSON
   */
  static async exportEvents(
    query: AuditQuery = {},
    actingUserId: string,
    format: 'csv' | 'json' = 'json'
  ): Promise<string> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser) throw new NotFoundError('User', actingUserId);

    // Only allow export for admins
    if (!['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only administrators can export audit events');
    }

    // Get all events matching the query
    const where: Record<string, unknown> = {};

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = query.startDate;
      if (query.endDate) where.createdAt.lte = query.endDate;
    }
    if (query.actorId) where.actorId = query.actorId;
    if (query.action) where.action = query.action;
    if (query.resourceType) where.resourceType = query.resourceType;
    if (query.resourceId) where.resourceId = query.resourceId;
    if (query.status) where.status = query.status;

    const events = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    const formattedEvents = events.map(this.formatEvent);

    if (format === 'json') {
      const exportData: AuditExportData = {
        events: formattedEvents,
        generatedAt: new Date(),
        generatedBy: actingUserId,
        filters: query,
      };
      return JSON.stringify(exportData, null, 2);
    }

    // CSV format
    const headers = [
      'ID',
      'Timestamp',
      'Actor',
      'Actor Email',
      'Action',
      'Resource Type',
      'Resource ID',
      'Status',
      'IP Address',
      'User Agent',
      'Old Values',
      'New Values',
      'Metadata',
      'Error Message',
    ];

    const rows = formattedEvents.map(event => [
      event.id,
      event.createdAt.toISOString(),
      event.actor?.firstName && event.actor?.lastName 
        ? `${event.actor.firstName} ${event.actor.lastName}`
        : event.actorId || 'SYSTEM',
      event.actor?.email || '',
      event.action,
      event.resourceType,
      event.resourceId,
      event.status,
      event.ipAddress || '',
      event.userAgent || '',
      JSON.stringify(event.oldValues || {}),
      JSON.stringify(event.newValues || {}),
      JSON.stringify(event.metadata || {}),
      event.errorMessage || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
  }

  // ============================================
  // AUDIT CLEANUP
  // ============================================

  /**
   * Delete audit events older than retention period
   * WARNING: This is a destructive operation
   */
  static async cleanupOldEvents(actingUserId: string, dryRun: boolean = true): Promise<{
    count: number;
    deletedIds: string[];
    dryRun: boolean;
  }> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || actingUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only super administrators can cleanup audit events');
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - AUDIT_RETENTION_DAYS);

    const oldEvents = await prisma.auditLog.findMany({
      where: { createdAt: { lt: cutoffDate } },
      select: { id: true },
    });

    const deletedIds: string[] = [];
    let count = 0;

    if (!dryRun) {
      await prisma.auditLog.deleteMany({
        where: { id: { in: oldEvents.map(e => e.id) } },
      });
      count = oldEvents.length;
      deletedIds.push(...oldEvents.map(e => e.id));

      await this.createEvent({
        actorId: actingUserId,
        action: 'DELETE',
        resourceType: 'AUDIT_LOG',
        resourceId: 'BULK_CLEANUP',
        metadata: {
          count,
          cutoffDate: cutoffDate.toISOString(),
          deletedIds,
        },
        status: 'SUCCESS',
      });
    }

    return {
      count: oldEvents.length,
      deletedIds: dryRun ? oldEvents.map(e => e.id) : deletedIds,
      dryRun,
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Format audit log to AuditEvent
   */
  private static formatEvent(event: AuditLog & { actor: User | null }): AuditEvent {
    return {
      id: event.id,
      actorId: event.actorId,
      actor: event.actor ? {
        id: event.actor.id,
        email: event.actor.email,
        firstName: event.actor.firstName,
        lastName: event.actor.lastName,
        role: event.actor.role,
      } : null,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      oldValues: event.oldValues as Record<string, unknown> | null,
      newValues: event.newValues as Record<string, unknown> | null,
      metadata: event.metadata as Record<string, unknown> | null,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      status: event.status,
      errorMessage: event.errorMessage,
      createdAt: event.createdAt,
    };
  }

  /**
   * Check if user has access to an audit event
   */
  private static async hasAuditAccess(actingUserId: string, event: AuditLog): Promise<boolean> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser) return false;

    // Super admins and compliance can see everything
    if (['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      return true;
    }

    // Users can see their own events
    if (event.actorId === actingUserId) {
      return true;
    }

    // Users can see events related to their resources
    if (event.resourceType === 'USER' && event.resourceId === actingUserId) {
      return true;
    }

    // Check if user owns the resource
    return this.checkResourceOwnership(event.resourceType, event.resourceId, actingUserId);
  }

  /**
   * Verify user has access to a resource
   */
  private static async verifyResourceAccess(
    resourceType: ResourceType,
    resourceId: string,
    actingUserId: string
  ): Promise<void> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser) throw new NotFoundError('User', actingUserId);

    // Admins can access everything
    if (['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE'].includes(actingUser.role)) {
      return;
    }

    // Check ownership
    if (!(await this.checkResourceOwnership(resourceType, resourceId, actingUserId))) {
      throw new ForbiddenError(`You do not have access to this ${resourceType}`);
    }
  }

  /**
   * Check if a user owns a resource
   */
  private static async checkResourceOwnership(
    resourceType: ResourceType,
    resourceId: string,
    userId: string
  ): Promise<boolean> {
    try {
      switch (resourceType) {
        case 'USER':
          return resourceId === userId;
        case 'ACCOUNT':
          const account = await prisma.account.findUnique({ where: { id: resourceId } });
          return account?.userId === userId;
        case 'TRANSACTION':
          const transaction = await prisma.transaction.findUnique({ where: { id: resourceId } });
          return transaction?.userId === userId;
        case 'TRANSFER':
          const transfer = await prisma.transfer.findUnique({ where: { id: resourceId } });
          return transfer?.fromUserId === userId || transfer?.toUserId === userId;
        case 'DEPOSIT':
          const deposit = await prisma.deposit.findUnique({ where: { id: resourceId } });
          return deposit?.userId === userId;
        case 'WITHDRAWAL':
          const withdrawal = await prisma.withdrawal.findUnique({ where: { id: resourceId } });
          return withdrawal?.userId === userId;
        case 'CARD':
          const card = await prisma.card.findUnique({ where: { id: resourceId } });
          return card?.userId === userId;
        case 'BENEFICIARY':
          const beneficiary = await prisma.beneficiary.findUnique({ where: { id: resourceId } });
          return beneficiary?.userId === userId;
        case 'KYC_PROFILE':
          const kycProfile = await prisma.kYCProfile.findUnique({ where: { userId: resourceId } });
          return kycProfile?.userId === userId;
        case 'KYC_DOCUMENT':
          const kycDocument = await prisma.kYCDocument.findUnique({ where: { id: resourceId } });
          return kycDocument?.userId === userId;
        case 'LOAN_APPLICATION':
          const loanApplication = await prisma.loanApplication.findUnique({ where: { id: resourceId } });
          return loanApplication?.userId === userId;
        case 'INVESTMENT_PORTFOLIO':
          const portfolio = await prisma.investmentPortfolio.findUnique({ where: { id: resourceId } });
          return portfolio?.userId === userId;
        case 'SAVINGS_GOAL':
          const savingsGoal = await prisma.savingsGoal.findUnique({ where: { id: resourceId } });
          return savingsGoal?.userId === userId;
        case 'SUPPORT_TICKET':
          const ticket = await prisma.supportTicket.findUnique({ where: { id: resourceId } });
          return ticket?.userId === userId;
        default:
          // For other resource types, require admin access
          return false;
      }
    } catch {
      return false;
    }
  }
}
