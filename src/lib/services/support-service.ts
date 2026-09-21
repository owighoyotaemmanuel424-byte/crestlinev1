import { prisma } from '../prisma';
import { generateReference, generateIdempotencyKey } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  AppError,
} from '../utils/errors';
import {
  type User,
  type SupportTicket,
  type SupportMessage,
  type SupportAttachment,
  SupportCategory,
  SupportPriority,
  SupportTicketStatus,
  Role,
} from '@prisma/client';

// ============================================
// INTERFACES & TYPES
// ============================================

export interface CreateTicketData {
  userId: string;
  subject: string;
  category: SupportCategory;
  priority?: SupportPriority;
  description: string;
  attachments?: Array<{
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface UpdateTicketData {
  subject?: string;
  category?: SupportCategory;
  priority?: SupportPriority;
  status?: SupportTicketStatus;
  assignedToId?: string;
  metadata?: Record<string, unknown>;
}

export interface AddMessageData {
  ticketId: string;
  senderId: string;
  message: string;
  isInternal?: boolean;
  attachments?: Array<{
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface UpdateMessageData {
  message?: string;
  isInternal?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ResolveTicketData {
  ticketId: string;
  resolutionNotes?: string;
  metadata?: Record<string, unknown>;
}

export interface TicketResult {
  ticket: SupportTicket & {
    user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
    assignedTo?: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'> | null;
    resolvedBy?: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'> | null;
    messages: (SupportMessage & {
      sender: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
      attachments: SupportAttachment[];
    })[];
    attachments: SupportAttachment[];
    messagesCount: number;
    unreadMessagesCount: number;
    isAssignedToMe: boolean;
    canAccess: boolean;
  };
}

export interface MessageResult {
  message: SupportMessage & {
    ticket: Pick<SupportTicket, 'id' | 'reference' | 'subject' | 'userId'>;
    sender: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
    attachments: SupportAttachment[];
  };
}

export interface AttachmentResult {
  attachment: SupportAttachment & {
    ticket: Pick<SupportTicket, 'id' | 'reference' | 'subject'>;
    message?: Pick<SupportMessage, 'id' | 'message'> | null;
  };
}

export interface TicketListResult {
  tickets: TicketResult['ticket'][];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface MessageListResult {
  messages: MessageResult['message'][];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SupportStats {
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  byCategory: Record<SupportCategory, number>;
  byPriority: Record<SupportPriority, number>;
  byStatus: Record<SupportTicketStatus, number>;
  averageResolutionTime: number;
  topAssignees: Array<{
    userId: string;
    displayName: string;
    assignedCount: number;
    resolvedCount: number;
  }>;
}

export interface TicketAnalytics {
  createdByPeriod: Record<'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'THIS_YEAR', number>;
  resolvedByPeriod: Record<'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'THIS_YEAR', number>;
  averageResponseTime: number;
  averageResolutionTime: number;
  satisfactionScore: number;
}

export interface QuickReply {
  id: string;
  category: SupportCategory;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// CONSTANTS
// ============================================

const SUPPORT_CONFIG = {
  MAX_SUBJECT_LENGTH: 200,
  MAX_MESSAGE_LENGTH: 5000,
  MAX_ATTACHMENTS_PER_MESSAGE: 5,
  MAX_ATTACHMENT_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_MIME_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  DEFAULT_PRIORITY: 'MEDIUM' as SupportPriority,
  AUTO_ASSIGN_ENABLED: false,
  AUTO_CLOSE_DAYS: 7, // Auto-close resolved tickets after 7 days
} as const;

// ============================================
// SUPPORT SERVICE
// ============================================

export class SupportService {
  // ============================================
  // TICKET MANAGEMENT
  // ============================================

  /**
   * Create a new support ticket
   */
  static async createTicket(
    data: CreateTicketData,
    actingUserId: string
  ): Promise<TicketResult['ticket']> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User', data.userId);

    // Authorization check
    if (actingUserId !== data.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(actingUser.role)) {
        throw new ForbiddenError('You can only create tickets for yourself');
      }
    }

    // Validate inputs
    if (!data.subject || data.subject.length > SUPPORT_CONFIG.MAX_SUBJECT_LENGTH) {
      throw new ValidationError(`Subject must be between 1 and ${SUPPORT_CONFIG.MAX_SUBJECT_LENGTH} characters`);
    }

    if (!data.description || data.description.length > SUPPORT_CONFIG.MAX_MESSAGE_LENGTH) {
      throw new ValidationError(`Description must be between 1 and ${SUPPORT_CONFIG.MAX_MESSAGE_LENGTH} characters`);
    }

    // Generate reference
    const reference = generateReference('SUP');

    // Create ticket
    const ticket = await prisma.supportTicket.create({
      data: {
        reference,
        userId: data.userId,
        subject: data.subject,
        category: data.category,
        priority: data.priority || SUPPORT_CONFIG.DEFAULT_PRIORITY,
        description: data.description,
        status: 'OPEN' as SupportTicketStatus,
        metadata: data.metadata as any,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            attachments: true,
          },
        },
        attachments: true,
      },
    });

    // Create attachments if provided
    if (data.attachments && data.attachments.length > 0) {
      await Promise.all(
        data.attachments.map(attachment =>
          prisma.supportAttachment.create({
            data: {
              ticketId: ticket.id,
              fileName: attachment.fileName,
              fileUrl: attachment.fileUrl,
              fileSize: attachment.fileSize,
              mimeType: attachment.mimeType,
            },
          })
        )
      );
    }

    // Create initial message
    await prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: data.userId,
        message: data.description,
        isInternal: false,
      },
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'CREATE',
        resourceType: 'SUPPORT_TICKET',
        resourceId: ticket.id,
        newValues: {
          reference,
          userId: data.userId,
          subject: data.subject,
          category: data.category,
          priority: data.priority || SUPPORT_CONFIG.DEFAULT_PRIORITY,
        },
        metadata: data.metadata as any,
        status: 'SUCCESS',
      },
    });

    // Send notification to support team
    const supportUsers = await prisma.user.findMany({
      where: { role: { in: ['SUPPORT', 'ADMIN', 'SUPER_ADMIN'] } },
    });

    for (const supportUser of supportUsers) {
      await prisma.notification.create({
        data: {
          userId: supportUser.id,
          title: `New Support Ticket: ${data.subject}`,
          message: `A new support ticket has been created by ${user.firstName} ${user.lastName}`,
          type: 'INFO',
          category: 'SUPPORT',
          isRead: false,
          metadata: {
            ticketId: ticket.id,
            reference,
            category: data.category,
            priority: data.priority || SUPPORT_CONFIG.DEFAULT_PRIORITY,
          },
        },
      });
    }

    return this.formatTicket(ticket, actingUserId);
  }

  /**
   * Get a ticket by ID
   */
  static async getTicketById(
    id: string,
    actingUserId: string
  ): Promise<TicketResult['ticket']> {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            attachments: true,
          },
        },
        attachments: true,
      },
    });

    if (!ticket) throw new NotFoundError('Support Ticket', id);

    // Authorization check
    await this.verifyTicketAccess(ticket, actingUserId);

    return this.formatTicket(ticket, actingUserId);
  }

  /**
   * Get a ticket by reference
   */
  static async getTicketByReference(
    reference: string,
    actingUserId: string
  ): Promise<TicketResult['ticket']> {
    const ticket = await prisma.supportTicket.findUnique({
      where: { reference },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            attachments: true,
          },
        },
        attachments: true,
      },
    });

    if (!ticket) throw new NotFoundError('Support Ticket', reference);

    // Authorization check
    await this.verifyTicketAccess(ticket, actingUserId);

    return this.formatTicket(ticket, actingUserId);
  }

  /**
   * List tickets for a user
   */
  static async listUserTickets(
    userId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: SupportTicketStatus,
    category?: SupportCategory,
    priority?: SupportPriority,
    search?: string
  ): Promise<TicketListResult> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    // Authorization check
    if (actingUserId !== userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to these tickets');
      }
    }

    const where: any = { userId };
    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
      ];
    }

    const tickets = await prisma.supportTicket.findMany({
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
        assignedTo: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            attachments: true,
          },
        },
        attachments: true,
      },
    });

    const total = await prisma.supportTicket.count({ where });

    return {
      tickets: await Promise.all(tickets.map(t => this.formatTicket(t, actingUserId))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * List all tickets (admin/support only)
   */
  static async listAllTickets(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    status?: SupportTicketStatus,
    category?: SupportCategory,
    priority?: SupportPriority,
    assignedToId?: string,
    search?: string
  ): Promise<TicketListResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(actingUser.role)) {
      throw new ForbiddenError('Only support personnel can view all tickets');
    }

    const where: any = {};
    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;
    if (assignedToId) where.assignedToId = assignedToId;
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const tickets = await prisma.supportTicket.findMany({
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
        assignedTo: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            attachments: true,
          },
        },
        attachments: true,
      },
    });

    const total = await prisma.supportTicket.count({ where });

    return {
      tickets: await Promise.all(tickets.map(t => this.formatTicket(t, actingUserId))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update a ticket
   */
  static async updateTicket(
    id: string,
    data: UpdateTicketData,
    actingUserId: string
  ): Promise<TicketResult['ticket']> {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: true,
            attachments: true,
          },
        },
        attachments: true,
      },
    });

    if (!ticket) throw new NotFoundError('Support Ticket', id);

    // Authorization check
    await this.verifyTicketAccess(ticket, actingUserId);

    const oldStatus = ticket.status;
    const oldPriority = ticket.priority;
    const oldAssignedToId = ticket.assignedToId;

    const updatedTicket = await prisma.supportTicket.update({
      where: { id },
      data: {
        subject: data.subject,
        category: data.category,
        priority: data.priority,
        status: data.status,
        assignedToId: data.assignedToId,
        metadata: data.metadata as any,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            attachments: true,
          },
        },
        attachments: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'UPDATE',
        resourceType: 'SUPPORT_TICKET',
        resourceId: ticket.id,
        oldValues: {
          subject: ticket.subject,
          status: oldStatus,
          priority: oldPriority,
          assignedToId: oldAssignedToId,
        },
        newValues: {
          subject: data.subject || ticket.subject,
          status: data.status || oldStatus,
          priority: data.priority || oldPriority,
          assignedToId: data.assignedToId || oldAssignedToId,
        },
        status: 'SUCCESS',
      },
    });

    return this.formatTicket(updatedTicket, actingUserId);
  }

  /**
   * Assign a ticket to a support agent
   */
  static async assignTicket(
    ticketId: string,
    assignedToId: string,
    actingUserId: string
  ): Promise<TicketResult['ticket']> {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: true,
            attachments: true,
          },
        },
        attachments: true,
      },
    });

    if (!ticket) throw new NotFoundError('Support Ticket', ticketId);

    // Authorization check
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(actingUser.role)) {
      throw new ForbiddenError('Only support personnel can assign tickets');
    }

    const assignedTo = await prisma.user.findUnique({ where: { id: assignedToId } });
    if (!assignedTo) throw new NotFoundError('User', assignedToId);

    if (!['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(assignedTo.role)) {
      throw new ValidationError('Assigned user must be a support agent');
    }

    const updatedTicket = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        assignedToId,
        status: 'IN_PROGRESS' as SupportTicketStatus,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            attachments: true,
          },
        },
        attachments: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'ASSIGN',
        resourceType: 'SUPPORT_TICKET',
        resourceId: ticket.id,
        oldValues: { assignedToId: ticket.assignedToId, status: ticket.status },
        newValues: { assignedToId, status: 'IN_PROGRESS' },
        status: 'SUCCESS',
      },
    });

    // Send notification to assigned agent
    await prisma.notification.create({
      data: {
        userId: assignedToId,
        title: `Ticket Assigned: ${ticket.subject}`,
        message: `You have been assigned to support ticket ${ticket.reference}`,
        type: 'INFO',
        category: 'SUPPORT',
        isRead: false,
        metadata: {
          ticketId: ticket.id,
          reference: ticket.reference,
          subject: ticket.subject,
        },
      },
    });

    return this.formatTicket(updatedTicket, actingUserId);
  }

  /**
   * Resolve a ticket
   */
  static async resolveTicket(
    data: ResolveTicketData,
    actingUserId: string
  ): Promise<TicketResult['ticket']> {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: data.ticketId },
      include: {
        user: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: true,
            attachments: true,
          },
        },
        attachments: true,
      },
    });

    if (!ticket) throw new NotFoundError('Support Ticket', data.ticketId);

    // Authorization check
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(actingUser.role)) {
      throw new ForbiddenError('Only support personnel can resolve tickets');
    }

    // Check if user is assigned to this ticket
    if (ticket.assignedToId && ticket.assignedToId !== actingUserId && !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
      throw new ForbiddenError('You are not assigned to this ticket');
    }

    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      throw new ValidationError('Ticket is already resolved or closed');
    }

    const resolvedTicket = await prisma.supportTicket.update({
      where: { id: data.ticketId },
      data: {
        status: 'RESOLVED' as SupportTicketStatus,
        resolvedAt: new Date(),
        resolvedById: actingUserId,
        metadata: {
          ...(ticket.metadata as Record<string, unknown> || {}),
          resolutionNotes: data.resolutionNotes,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            attachments: true,
          },
        },
        attachments: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'RESOLVE',
        resourceType: 'SUPPORT_TICKET',
        resourceId: ticket.id,
        oldValues: { status: ticket.status },
        newValues: { status: 'RESOLVED', resolvedById: actingUserId, resolvedAt: new Date() },
        metadata: { resolutionNotes: data.resolutionNotes },
        status: 'SUCCESS',
      },
    });

    // Send notification to ticket owner
    await prisma.notification.create({
      data: {
        userId: ticket.userId,
        title: `Ticket Resolved: ${ticket.subject}`,
        message: `Your support ticket ${ticket.reference} has been resolved.`,
        type: 'SUCCESS',
        category: 'SUPPORT',
        isRead: false,
        metadata: {
          ticketId: ticket.id,
          reference: ticket.reference,
          resolutionNotes: data.resolutionNotes,
        },
      },
    });

    return this.formatTicket(resolvedTicket, actingUserId);
  }

  /**
   * Close a ticket
   */
  static async closeTicket(id: string, actingUserId: string): Promise<TicketResult['ticket']> {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: true,
            attachments: true,
          },
        },
        attachments: true,
      },
    });

    if (!ticket) throw new NotFoundError('Support Ticket', id);

    // Authorization check
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(actingUser.role)) {
      throw new ForbiddenError('Only support personnel can close tickets');
    }

    if (ticket.status === 'CLOSED') {
      throw new ValidationError('Ticket is already closed');
    }

    if (ticket.status !== 'RESOLVED') {
      throw new ValidationError('Ticket must be resolved before closing');
    }

    const closedTicket = await prisma.supportTicket.update({
      where: { id },
      data: {
        status: 'CLOSED' as SupportTicketStatus,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            attachments: true,
          },
        },
        attachments: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'CLOSE',
        resourceType: 'SUPPORT_TICKET',
        resourceId: ticket.id,
        oldValues: { status: ticket.status },
        newValues: { status: 'CLOSED' },
        status: 'SUCCESS',
      },
    });

    return this.formatTicket(closedTicket, actingUserId);
  }

  // ============================================
  // MESSAGE MANAGEMENT
  // ============================================

  /**
   * Add a message to a ticket
   */
  static async addMessage(
    data: AddMessageData,
    actingUserId: string
  ): Promise<MessageResult['message']> {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: data.ticketId },
      include: { user: true },
    });

    if (!ticket) throw new NotFoundError('Support Ticket', data.ticketId);

    // Authorization check
    if (actingUserId !== data.senderId && actingUserId !== ticket.userId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this ticket');
      }
    }

    // Validate message
    if (!data.message || data.message.length > SUPPORT_CONFIG.MAX_MESSAGE_LENGTH) {
      throw new ValidationError(`Message must be between 1 and ${SUPPORT_CONFIG.MAX_MESSAGE_LENGTH} characters`);
    }

    // Create message
    const message = await prisma.supportMessage.create({
      data: {
        ticketId: data.ticketId,
        senderId: data.senderId,
        message: data.message,
        isInternal: data.isInternal || false,
      },
      include: {
        ticket: {
          select: {
            id: true,
            reference: true,
            subject: true,
            userId: true,
          },
        },
        sender: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        attachments: true,
      },
    });

    // Create attachments if provided
    if (data.attachments && data.attachments.length > 0) {
      await Promise.all(
        data.attachments.map(attachment =>
          prisma.supportAttachment.create({
            data: {
              ticketId: data.ticketId,
              messageId: message.id,
              fileName: attachment.fileName,
              fileUrl: attachment.fileUrl,
              fileSize: attachment.fileSize,
              mimeType: attachment.mimeType,
            },
          })
        )
      );
    }

    // Update ticket status if it was waiting for customer
    if (ticket.status === 'WAITING_FOR_CUSTOMER' && data.senderId === ticket.userId) {
      await prisma.supportTicket.update({
        where: { id: data.ticketId },
        data: { status: 'IN_PROGRESS' as SupportTicketStatus },
      });

      await prisma.auditLog.create({
        data: {
          actorId: actingUserId,
          action: 'UPDATE',
          resourceType: 'SUPPORT_TICKET',
          resourceId: ticket.id,
          oldValues: { status: ticket.status },
          newValues: { status: 'IN_PROGRESS' },
          metadata: { reason: 'Customer replied' },
          status: 'SUCCESS',
        },
      });
    }

    // Log audit event
    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'CREATE',
        resourceType: 'SUPPORT_MESSAGE',
        resourceId: message.id,
        newValues: {
          ticketId: data.ticketId,
          senderId: data.senderId,
          isInternal: data.isInternal || false,
        },
        metadata: data.metadata as any,
        status: 'SUCCESS',
      },
    });

    // Send notification to ticket participants
    const participants = [ticket.userId];
    if (ticket.assignedToId) participants.push(ticket.assignedToId);

    for (const participantId of participants) {
      if (participantId !== data.senderId) {
        await prisma.notification.create({
          data: {
            userId: participantId,
            title: `New Message: ${ticket.subject}`,
            message: data.isInternal ? 'New internal note added' : `New message: ${data.message.substring(0, 100)}...`,
            type: 'INFO',
            category: 'SUPPORT',
            isRead: false,
            metadata: {
              ticketId: ticket.id,
              reference: ticket.reference,
              messageId: message.id,
              isInternal: data.isInternal || false,
            },
          },
        });
      }
    }

    // Update message with attachments
    const messageWithAttachments = await prisma.supportMessage.findUnique({
      where: { id: message.id },
      include: {
        ticket: {
          select: {
            id: true,
            reference: true,
            subject: true,
            userId: true,
          },
        },
        sender: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        attachments: true,
      },
    });

    return this.formatMessage(messageWithAttachments!);
  }

  /**
   * Get a message by ID
   */
  static async getMessageById(
    id: string,
    actingUserId: string
  ): Promise<MessageResult['message']> {
    const message = await prisma.supportMessage.findUnique({
      where: { id },
      include: {
        ticket: {
          select: {
            id: true,
            reference: true,
            subject: true,
            userId: true,
          },
        },
        sender: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        attachments: true,
      },
    });

    if (!message) throw new NotFoundError('Support Message', id);

    // Authorization check
    if (actingUserId !== message.ticket.userId && actingUserId !== message.senderId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(actingUser.role)) {
        throw new ForbiddenError('You do not have access to this message');
      }
    }

    return this.formatMessage(message);
  }

  /**
   * List messages for a ticket
   */
  static async listMessages(
    ticketId: string,
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    isInternal?: boolean
  ): Promise<MessageListResult> {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundError('Support Ticket', ticketId);

    // Authorization check
    await this.verifyTicketAccess(ticket, actingUserId);

    const where: any = { ticketId };
    if (isInternal !== undefined) where.isInternal = isInternal;

    const messages = await prisma.supportMessage.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        ticket: {
          select: {
            id: true,
            reference: true,
            subject: true,
            userId: true,
          },
        },
        sender: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        attachments: true,
      },
    });

    const total = await prisma.supportMessage.count({ where });

    return {
      messages: messages.map(this.formatMessage),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update a message
   */
  static async updateMessage(
    id: string,
    data: UpdateMessageData,
    actingUserId: string
  ): Promise<MessageResult['message']> {
    const message = await prisma.supportMessage.findUnique({
      where: { id },
      include: {
        ticket: {
          select: {
            id: true,
            reference: true,
            subject: true,
            userId: true,
          },
        },
        sender: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        attachments: true,
      },
    });

    if (!message) throw new NotFoundError('Support Message', id);

    // Authorization check
    if (actingUserId !== message.senderId) {
      const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(actingUser.role)) {
        throw new ForbiddenError('You can only update your own messages');
      }
    }

    // Validate message
    if (data.message && data.message.length > SUPPORT_CONFIG.MAX_MESSAGE_LENGTH) {
      throw new ValidationError(`Message must be less than ${SUPPORT_CONFIG.MAX_MESSAGE_LENGTH} characters`);
    }

    const updatedMessage = await prisma.supportMessage.update({
      where: { id },
      data: {
        message: data.message,
        isInternal: data.isInternal,
        metadata: data.metadata as any,
      },
      include: {
        ticket: {
          select: {
            id: true,
            reference: true,
            subject: true,
            userId: true,
          },
        },
        sender: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        attachments: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actingUserId,
        action: 'UPDATE',
        resourceType: 'SUPPORT_MESSAGE',
        resourceId: message.id,
        oldValues: { message: message.message, isInternal: message.isInternal },
        newValues: {
          message: data.message || message.message,
          isInternal: data.isInternal !== undefined ? data.isInternal : message.isInternal,
        },
        metadata: data.metadata as any,
        status: 'SUCCESS',
      },
    });

    return this.formatMessage(updatedMessage);
  }

  // ============================================
  // ATTACHMENT MANAGEMENT
  // ============================================

  /**
   * Get an attachment by ID
   */
  static async getAttachmentById(
    id: string,
    actingUserId: string
  ): Promise<AttachmentResult['attachment']> {
    const attachment = await prisma.supportAttachment.findUnique({
      where: { id },
      include: {
        ticket: {
          select: {
            id: true,
            reference: true,
            subject: true,
          },
        },
        message: {
          select: {
            id: true,
            message: true,
          },
        },
      },
    });

    if (!attachment) throw new NotFoundError('Support Attachment', id);

    // Authorization check
    if (attachment.ticket) {
      await this.verifyTicketAccess(attachment.ticket as SupportTicket, actingUserId);
    }

    return this.formatAttachment(attachment);
  }

  /**
   * List attachments for a ticket
   */
  static async listAttachments(
    ticketId: string,
    actingUserId: string
  ): Promise<AttachmentResult['attachment'][]> {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundError('Support Ticket', ticketId);

    // Authorization check
    await this.verifyTicketAccess(ticket, actingUserId);

    const attachments = await prisma.supportAttachment.findMany({
      where: { ticketId },
      include: {
        ticket: {
          select: {
            id: true,
            reference: true,
            subject: true,
          },
        },
        message: {
          select: {
            id: true,
            message: true,
          },
        },
      },
    });

    return attachments.map(a => this.formatAttachment(a));
  }

  // ============================================
  // STATISTICS & ANALYTICS
  // ============================================

  /**
   * Get support statistics
   */
  static async getStats(actingUserId: string): Promise<SupportStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(actingUser.role)) {
      throw new ForbiddenError('Only support personnel can view support statistics');
    }

    const totalTickets = await prisma.supportTicket.count();
    const openTickets = await prisma.supportTicket.count({
      where: { status: 'OPEN' },
    });
    const inProgressTickets = await prisma.supportTicket.count({
      where: { status: 'IN_PROGRESS' },
    });
    const resolvedTickets = await prisma.supportTicket.count({
      where: { status: 'RESOLVED' },
    });
    const closedTickets = await prisma.supportTicket.count({
      where: { status: 'CLOSED' },
    });

    // Group by category
    const categories = Object.values(SupportCategory);
    const byCategory: Record<SupportCategory, number> = {} as Record<SupportCategory, number>;
    for (const category of categories) {
      byCategory[category] = await prisma.supportTicket.count({
        where: { category },
      });
    }

    // Group by priority
    const priorities = Object.values(SupportPriority);
    const byPriority: Record<SupportPriority, number> = {} as Record<SupportPriority, number>;
    for (const priority of priorities) {
      byPriority[priority] = await prisma.supportTicket.count({
        where: { priority },
      });
    }

    // Group by status
    const statuses = Object.values(SupportTicketStatus);
    const byStatus: Record<SupportTicketStatus, number> = {} as Record<SupportTicketStatus, number>;
    for (const status of statuses) {
      byStatus[status] = await prisma.supportTicket.count({
        where: { status },
      });
    }

    // Calculate average resolution time
    const resolvedTicketsWithDates = await prisma.supportTicket.findMany({
      where: { status: 'RESOLVED', resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true },
    });

    const resolutionTimes = resolvedTicketsWithDates.map(t => {
      return t.resolvedAt!.getTime() - t.createdAt.getTime();
    });

    const averageResolutionTime = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
      : 0;

    // Get top assignees
    const assignees = await prisma.supportTicket.groupBy({
      by: ['assignedToId'],
      where: { assignedToId: { not: null } },
      _count: { _all: true },
    });

    const topAssignees: Array<{
      userId: string;
      displayName: string;
      assignedCount: number;
      resolvedCount: number;
    }> = [];

    for (const assignee of assignees) {
      if (assignee.assignedToId) {
        const user = await prisma.user.findUnique({
          where: { id: assignee.assignedToId },
        });

        const resolvedCount = await prisma.supportTicket.count({
          where: {
            assignedToId: assignee.assignedToId,
            status: 'RESOLVED',
          },
        });

        topAssignees.push({
          userId: assignee.assignedToId,
          displayName: user ? `${user.firstName} ${user.lastName}` : assignee.assignedToId,
          assignedCount: assignee._count._all,
          resolvedCount,
        });
      }
    }

    // Sort by assigned count
    topAssignees.sort((a, b) => b.assignedCount - a.assignedCount);

    return {
      totalTickets,
      openTickets,
      inProgressTickets,
      resolvedTickets,
      closedTickets,
      byCategory,
      byPriority,
      byStatus,
      averageResolutionTime,
      topAssignees: topAssignees.slice(0, 10),
    };
  }

  /**
   * Get ticket analytics
   */
  static async getAnalytics(actingUserId: string): Promise<TicketAnalytics> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(actingUser.role)) {
      throw new ForbiddenError('Only support personnel can view ticket analytics');
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - today.getDay() * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisYear = new Date(now.getFullYear(), 0, 1);

    // Created by period
    const createdToday = await prisma.supportTicket.count({
      where: { createdAt: { gte: today } },
    });

    const createdThisWeek = await prisma.supportTicket.count({
      where: { createdAt: { gte: thisWeek } },
    });

    const createdThisMonth = await prisma.supportTicket.count({
      where: { createdAt: { gte: thisMonth } },
    });

    const createdThisYear = await prisma.supportTicket.count({
      where: { createdAt: { gte: thisYear } },
    });

    // Resolved by period
    const resolvedToday = await prisma.supportTicket.count({
      where: { resolvedAt: { gte: today }, status: 'RESOLVED' },
    });

    const resolvedThisWeek = await prisma.supportTicket.count({
      where: { resolvedAt: { gte: thisWeek }, status: 'RESOLVED' },
    });

    const resolvedThisMonth = await prisma.supportTicket.count({
      where: { resolvedAt: { gte: thisMonth }, status: 'RESOLVED' },
    });

    const resolvedThisYear = await prisma.supportTicket.count({
      where: { resolvedAt: { gte: thisYear }, status: 'RESOLVED' },
    });

    // Calculate average response time (time from ticket creation to first support response)
    const ticketsWithMessages = await prisma.supportTicket.findMany({
      where: {
        status: { in: ['RESOLVED', 'CLOSED'] },
        messages: { some: { sender: { role: { in: ['SUPPORT', 'ADMIN', 'SUPER_ADMIN'] } } } },
      },
      include: {
        messages: {
          where: { sender: { role: { in: ['SUPPORT', 'ADMIN', 'SUPER_ADMIN'] } } },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    const responseTimes = ticketsWithMessages
      .filter(t => t.messages.length > 0)
      .map(t => t.messages[0].createdAt.getTime() - t.createdAt.getTime());

    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    // Calculate average resolution time
    const resolvedTicketsWithDates = await prisma.supportTicket.findMany({
      where: { status: 'RESOLVED', resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true },
    });

    const resolutionTimes = resolvedTicketsWithDates.map(t => {
      return t.resolvedAt!.getTime() - t.createdAt.getTime();
    });

    const averageResolutionTime = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
      : 0;

    // Satisfaction score (placeholder - would come from surveys in production)
    const satisfactionScore = 85; // Default placeholder

    return {
      createdByPeriod: {
        TODAY: createdToday,
        THIS_WEEK: createdThisWeek,
        THIS_MONTH: createdThisMonth,
        THIS_YEAR: createdThisYear,
      },
      resolvedByPeriod: {
        TODAY: resolvedToday,
        THIS_WEEK: resolvedThisWeek,
        THIS_MONTH: resolvedThisMonth,
        THIS_YEAR: resolvedThisYear,
      },
      averageResponseTime,
      averageResolutionTime,
      satisfactionScore,
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Format ticket with calculated values
   */
  private static async formatTicket(
    ticket: SupportTicket & {
      user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
      assignedTo?: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'> | null;
      resolvedBy?: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'> | null;
      messages: (SupportMessage & {
        sender: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
        attachments: SupportAttachment[];
      })[];
      attachments: SupportAttachment[];
    },
    actingUserId: string
  ): Promise<TicketResult['ticket']> {
    const messages = ticket.messages || [];
    const messagesCount = messages.length;

    // Count unread messages for the acting user
    const unreadMessagesCount = messages.filter(
      m => m.sender.id !== actingUserId && !m.isRead
    ).length;

    // Mark messages as read for the acting user
    if (actingUserId === ticket.userId) {
      await prisma.supportMessage.updateMany({
        where: {
          ticketId: ticket.id,
          senderId: { not: actingUserId },
          isRead: false,
        },
        data: { isRead: true },
      });
    }

    const isAssignedToMe = ticket.assignedToId === actingUserId;

    // Check if user can access this ticket
    const canAccess = 
      actingUserId === ticket.userId ||
      actingUserId === ticket.assignedToId ||
      isAssignedToMe;

    return {
      ...ticket,
      user: ticket.user,
      assignedTo: ticket.assignedTo || null,
      resolvedBy: ticket.resolvedBy || null,
      messages: messages.map(m => ({
        ...m,
        sender: m.sender,
        attachments: m.attachments,
      })),
      attachments: ticket.attachments,
      messagesCount,
      unreadMessagesCount,
      isAssignedToMe,
      canAccess,
    };
  }

  /**
   * Format message with related data
   */
  private static formatMessage(message: SupportMessage & {
    ticket: Pick<SupportTicket, 'id' | 'reference' | 'subject' | 'userId'>;
    sender: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
    attachments: SupportAttachment[];
  }): MessageResult['message'] {
    return {
      ...message,
      ticket: message.ticket,
      sender: message.sender,
      attachments: message.attachments,
    };
  }

  /**
   * Format attachment with related data
   */
  private static formatAttachment(attachment: SupportAttachment & {
    ticket: Pick<SupportTicket, 'id' | 'reference' | 'subject'>;
    message?: Pick<SupportMessage, 'id' | 'message'> | null;
  }): AttachmentResult['attachment'] {
    return {
      ...attachment,
      ticket: attachment.ticket,
      message: attachment.message || null,
    };
  }

  /**
   * Verify user has access to a ticket
   */
  private static async verifyTicketAccess(
    ticket: SupportTicket,
    actingUserId: string
  ): Promise<void> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser) throw new NotFoundError('User', actingUserId);

    // Admins and support can see all tickets
    if (['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(actingUser.role)) {
      return;
    }

    // Users can see their own tickets
    if (ticket.userId === actingUserId) {
      return;
    }

    // Assigned agents can see their assigned tickets
    if (ticket.assignedToId === actingUserId) {
      return;
    }

    throw new ForbiddenError('You do not have access to this ticket');
  }
}
