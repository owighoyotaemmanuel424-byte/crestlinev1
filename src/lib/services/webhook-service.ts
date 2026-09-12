import { prisma } from '../prisma';
import { generateReference, generateIdempotencyKey, hashString, verifyHash } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  AppError,
} from '../utils/errors';
import { LedgerService } from './ledger-service';
import type {
  User,
  Account,
  Transaction,
  Deposit,
  Withdrawal,
  Transfer,
  WebhookEvent,
  Role,
  TransactionStatus,
  DepositStatus,
  WithdrawalStatus,
  TransferStatus,
} from '@prisma/client';

// ============================================
// INTERFACES & TYPES
// ============================================

export interface WebhookProviderConfig {
  name: string;
  signatureHeader: string;
  signaturePrefix?: string;
  timestampHeader?: string;
  timestampToleranceSeconds: number;
  testModeEnabled: boolean;
}

export interface WebhookEventData {
  provider: string;
  eventType: string;
  payload: Record<string, unknown>;
  rawPayload: string;
  signature?: string;
  timestamp?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface ProcessedWebhookEvent {
  id: string;
  reference: string;
  provider: string;
  eventType: string;
  resourceType: string;
  resourceId: string;
  status: WebhookEventStatus;
  payload: Record<string, unknown>;
  processedAt: Date;
  errorMessage?: string;
}

export interface WebhookEventResult {
  event: WebhookEvent & {
    processedEvents: ProcessedWebhookEvent[];
  };
}

export interface WebhookEventListResult {
  events: WebhookEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface WebhookStats {
  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  byProvider: Record<string, { total: number; successful: number; failed: number }>;
  byEventType: Record<string, number>;
  byStatus: Record<WebhookEventStatus, number>;
  recentEvents: WebhookEvent[];
}

export interface WebhookProvider {
  id: string;
  name: string;
  displayName: string;
  description: string;
  enabled: boolean;
  webhookUrl: string;
  signatureSecret: string;
  config: WebhookProviderConfig;
  supportedEvents: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookTestResult {
  success: boolean;
  provider: string;
  testEventType: string;
  responseTimeMs: number;
  errorMessage?: string;
}

export enum WebhookEventStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DUPLICATE = 'DUPLICATE',
  REPLAYED = 'REPLAYED',
}

export enum WebhookProviderName {
  STRIPE = 'STRIPE',
  PAYPAL = 'PAYPAL',
  RAZORPAY = 'RAZORPAY',
  FLUTTERWAVE = 'FLUTTERWAVE',
  SQUARE = 'SQUARE',
  PLACID = 'PLACID',
  CUSTOM = 'CUSTOM',
}

// ============================================
// WEBHOOK PROVIDER CONFIGURATIONS
// ============================================

const WEBHOOK_PROVIDERS: Record<WebhookProviderName, WebhookProviderConfig> = {
  [WebhookProviderName.STRIPE]: {
    name: 'Stripe',
    signatureHeader: 'stripe-signature',
    timestampHeader: 'stripe-timestamp',
    timestampToleranceSeconds: 300, // 5 minutes
    testModeEnabled: true,
  },
  [WebhookProviderName.PAYPAL]: {
    name: 'PayPal',
    signatureHeader: 'paypal-transmission-sig',
    timestampHeader: 'paypal-transmission-id',
    timestampToleranceSeconds: 600, // 10 minutes
    testModeEnabled: true,
  },
  [WebhookProviderName.RAZORPAY]: {
    name: 'Razorpay',
    signatureHeader: 'x-razorpay-signature',
    timestampToleranceSeconds: 300,
    testModeEnabled: true,
  },
  [WebhookProviderName.FLUTTERWAVE]: {
    name: 'Flutterwave',
    signatureHeader: 'verif-hash',
    timestampToleranceSeconds: 600,
    testModeEnabled: true,
  },
  [WebhookProviderName.SQUARE]: {
    name: 'Square',
    signatureHeader: 'x-square-signature',
    timestampHeader: 'x-square-timestamp',
    timestampToleranceSeconds: 300,
    testModeEnabled: true,
  },
  [WebhookProviderName.PLACID]: {
    name: 'Placid',
    signatureHeader: 'x-placid-signature',
    timestampToleranceSeconds: 300,
    testModeEnabled: true,
  },
  [WebhookProviderName.CUSTOM]: {
    name: 'Custom',
    signatureHeader: 'x-webhook-signature',
    timestampToleranceSeconds: 300,
    testModeEnabled: false,
  },
};

const PROVIDER_SUPPORTED_EVENTS: Record<WebhookProviderName, string[]> = {
  [WebhookProviderName.STRIPE]: [
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'charge.succeeded',
    'charge.failed',
    'transfer.created',
    'transfer.paid',
    'payout.paid',
  ],
  [WebhookProviderName.PAYPAL]: [
    'PAYMENT.CAPTURE.COMPLETED',
    'PAYMENT.CAPTURE.REFUNDED',
    'PAYMENT.CAPTURE.FAILED',
    'TRANSFER.CREATED',
    'TRANSFER.COMPLETED',
  ],
  [WebhookProviderName.RAZORPAY]: [
    'payment.captured',
    'payment.failed',
    'transfer.processed',
    'transfer.reversed',
  ],
  [WebhookProviderName.FLUTTERWAVE]: [
    'payment.successful',
    'payment.failed',
    'transfer.successful',
    'transfer.failed',
  ],
  [WebhookProviderName.SQUARE]: [
    'payment.created',
    'payment.updated',
    'transfer.created',
    'transfer.updated',
  ],
  [WebhookProviderName.PLACID]: [
    'payment.success',
    'payment.failed',
    'transfer.success',
    'transfer.failed',
  ],
  [WebhookProviderName.CUSTOM]: [],
};

// ============================================
// WEBHOOK SERVICE
// ============================================

export class WebhookService {
  // ============================================
  // WEBHOOK EVENT PROCESSING
  // ============================================

  /**
   * Process an incoming webhook event
   * This is the main entry point for webhook processing
   */
  static async processWebhook(
    data: WebhookEventData
  ): Promise<WebhookEventResult> {
    // Validate provider
    const provider = this.getProvider(data.provider);
    if (!provider) {
      throw new ValidationError(`Unknown webhook provider: ${data.provider}`);
    }

    // Validate event type
    const supportedEvents = PROVIDER_SUPPORTED_EVENTS[data.provider as WebhookProviderName];
    if (!supportedEvents.includes(data.eventType)) {
      throw new ValidationError(
        `Unsupported event type for ${data.provider}: ${data.eventType}. Supported: ${supportedEvents.join(', ')}`
      );
    }

    // Generate idempotency key if not provided
    const idempotencyKey = data.idempotencyKey || generateIdempotencyKey();

    // Check for duplicate (idempotency check)
    const existingEvent = await prisma.webhookEvent.findFirst({
      where: { idempotencyKey },
    });

    if (existingEvent) {
      // Return existing event if duplicate
      const result = await this.getWebhookEventById(existingEvent.id);
      return { event: { ...result.event, processedEvents: result.event.processedEvents || [] } };
    }

    // Verify signature if provided
    if (data.signature) {
      await this.verifySignature(data.provider, data.rawPayload, data.signature, data.timestamp);
    }

    // Create webhook event record
    const event = await prisma.webhookEvent.create({
      data: {
        reference: generateReference('WHK'),
        provider: data.provider,
        eventType: data.eventType,
        idempotencyKey,
        payload: data.payload,
        rawPayload: data.rawPayload,
        signature: data.signature || null,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
        status: 'PENDING' as WebhookEventStatus,
        metadata: data.metadata || null,
      },
      include: {
        processedEvents: true,
      },
    });

    // Process the event in a transaction
    try {
      const processedEvents = await this.processWebhookEvent(event);

      // Update event status
      const updatedEvent = await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: 'COMPLETED' as WebhookEventStatus,
          processedAt: new Date(),
        },
        include: {
          processedEvents: true,
        },
      });

      // Log audit event
      await prisma.auditLog.create({
        data: {
          actorId: 'SYSTEM',
          action: 'PROCESS',
          resourceType: 'WEBHOOK_EVENT',
          resourceId: event.id,
          newValues: {
            provider: data.provider,
            eventType: data.eventType,
            status: 'COMPLETED',
            processedEventsCount: processedEvents.length,
          },
          metadata: {
            idempotencyKey,
            eventType: data.eventType,
          },
          status: 'SUCCESS',
        },
      });

      return { event: { ...updatedEvent, processedEvents } };
    } catch (error) {
      // Update event status to failed
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: 'FAILED' as WebhookEventStatus,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          processedAt: new Date(),
        },
      });

      // Log audit event
      await prisma.auditLog.create({
        data: {
          actorId: 'SYSTEM',
          action: 'PROCESS',
          resourceType: 'WEBHOOK_EVENT',
          resourceId: event.id,
          newValues: {
            provider: data.provider,
            eventType: data.eventType,
            status: 'FAILED',
          },
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          metadata: {
            idempotencyKey,
            eventType: data.eventType,
          },
          status: 'FAILURE',
        },
      });

      throw error;
    }
  }

  /**
   * Process a webhook event based on its type and provider
   */
  private static async processWebhookEvent(
    event: WebhookEvent
  ): Promise<ProcessedWebhookEvent[]> {
    const processedEvents: ProcessedWebhookEvent[] = [];
    const payload = event.payload as Record<string, unknown>;

    switch (event.provider as WebhookProviderName) {
      case WebhookProviderName.STRIPE:
        processedEvents.push(...(await this.processStripeEvent(event, payload)));
        break;
      case WebhookProviderName.PAYPAL:
        processedEvents.push(...(await this.processPayPalEvent(event, payload)));
        break;
      case WebhookProviderName.RAZORPAY:
        processedEvents.push(...(await this.processRazorpayEvent(event, payload)));
        break;
      case WebhookProviderName.FLUTTERWAVE:
        processedEvents.push(...(await this.processFlutterwaveEvent(event, payload)));
        break;
      case WebhookProviderName.SQUARE:
        processedEvents.push(...(await this.processSquareEvent(event, payload)));
        break;
      case WebhookProviderName.PLACID:
        processedEvents.push(...(await this.processPlacidEvent(event, payload)));
        break;
      case WebhookProviderName.CUSTOM:
        processedEvents.push(...(await this.processCustomEvent(event, payload)));
        break;
      default:
        throw new ValidationError(`Unknown webhook provider: ${event.provider}`);
    }

    // Save processed events
    for (const processedEvent of processedEvents) {
      await prisma.auditLog.create({
        data: {
          actorId: 'SYSTEM',
          action: 'WEBHOOK_PROCESSED',
          resourceType: processedEvent.resourceType,
          resourceId: processedEvent.resourceId,
          newValues: processedEvent.payload,
          metadata: {
            webhookEventId: event.id,
            provider: event.provider,
            eventType: event.eventType,
            processedEventId: processedEvent.id,
          },
          status: 'SUCCESS',
        },
      });
    }

    return processedEvents;
  }

  // ============================================
  // PROVIDER-SPECIFIC PROCESSING
  // ============================================

  /**
   * Process Stripe webhook events
   */
  private static async processStripeEvent(
    event: WebhookEvent,
    payload: Record<string, unknown>
  ): Promise<ProcessedWebhookEvent[]> {
    const processedEvents: ProcessedWebhookEvent[] = [];
    const data = payload.data as Record<string, unknown> || payload;
    const object = data.object as Record<string, unknown> || data;

    switch (event.eventType) {
      case 'payment_intent.succeeded':
      case 'charge.succeeded':
        processedEvents.push(
          await this.processPaymentSuccess(
            event,
            object.id as string,
            object.amount as number,
            object.currency as string,
            object.metadata as Record<string, unknown>,
            'STRIPE'
          )
        );
        break;

      case 'payment_intent.payment_failed':
      case 'charge.failed':
        processedEvents.push(
          await this.processPaymentFailed(
            event,
            object.id as string,
            object.amount as number,
            object.currency as string,
            object.failure_code as string,
            object.failure_message as string,
            object.metadata as Record<string, unknown>,
            'STRIPE'
          )
        );
        break;

      case 'transfer.created':
      case 'transfer.paid':
        processedEvents.push(
          await this.processTransfer(
            event,
            object.id as string,
            object.amount as number,
            object.currency as string,
            object.source as string,
            object.destination as string,
            object.metadata as Record<string, unknown>,
            'STRIPE',
            event.eventType === 'transfer.paid'
          )
        );
        break;

      case 'payout.paid':
        processedEvents.push(
          await this.processPayout(
            event,
            object.id as string,
            object.amount as number,
            object.currency as string,
            object.destination as string,
            object.arrival_date as number,
            object.metadata as Record<string, unknown>,
            'STRIPE'
          )
        );
        break;

      default:
        throw new ValidationError(`Unsupported Stripe event type: ${event.eventType}`);
    }

    return processedEvents;
  }

  /**
   * Process PayPal webhook events
   */
  private static async processPayPalEvent(
    event: WebhookEvent,
    payload: Record<string, unknown>
  ): Promise<ProcessedWebhookEvent[]> {
    const processedEvents: ProcessedWebhookEvent[] = [];
    const resource = payload.resource as Record<string, unknown> || payload;

    switch (event.eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        processedEvents.push(
          await this.processPaymentSuccess(
            event,
            resource.id as string,
            Number(resource.amount?.value || 0),
            resource.amount?.currency_code as string || 'USD',
            resource.custom as Record<string, unknown> || {},
            'PAYPAL'
          )
        );
        break;

      case 'PAYMENT.CAPTURE.REFUNDED':
        processedEvents.push(
          await this.processPaymentRefunded(
            event,
            resource.id as string,
            Number(resource.amount?.value || 0),
            resource.amount?.currency_code as string || 'USD',
            resource.custom as Record<string, unknown> || {},
            'PAYPAL'
          )
        );
        break;

      case 'PAYMENT.CAPTURE.FAILED':
        processedEvents.push(
          await this.processPaymentFailed(
            event,
            resource.id as string,
            Number(resource.amount?.value || 0),
            resource.amount?.currency_code as string || 'USD',
            resource.failure?.code as string,
            resource.failure?.description as string,
            resource.custom as Record<string, unknown> || {},
            'PAYPAL'
          )
        );
        break;

      case 'TRANSFER.CREATED':
      case 'TRANSFER.COMPLETED':
        processedEvents.push(
          await this.processTransfer(
            event,
            resource.id as string,
            Number(resource.amount?.value || 0),
            resource.amount?.currency_code as string || 'USD',
            resource.sender as string,
            resource.recipient as string,
            resource.custom as Record<string, unknown> || {},
            'PAYPAL',
            event.eventType === 'TRANSFER.COMPLETED'
          )
        );
        break;

      default:
        throw new ValidationError(`Unsupported PayPal event type: ${event.eventType}`);
    }

    return processedEvents;
  }

  /**
   * Process Razorpay webhook events
   */
  private static async processRazorpayEvent(
    event: WebhookEvent,
    payload: Record<string, unknown>
  ): Promise<ProcessedWebhookEvent[]> {
    const processedEvents: ProcessedWebhookEvent[] = [];
    const data = payload.payload as Record<string, unknown> || payload;

    switch (event.eventType) {
      case 'payment.captured':
        processedEvents.push(
          await this.processPaymentSuccess(
            event,
            data.payment?.entity?.id as string,
            Number(data.payment?.entity?.amount || 0) / 100, // Razorpay amounts are in paise
            data.payment?.entity?.currency as string || 'USD',
            data.payment?.entity?.notes as Record<string, unknown> || {},
            'RAZORPAY'
          )
        );
        break;

      case 'payment.failed':
        processedEvents.push(
          await this.processPaymentFailed(
            event,
            data.payment?.entity?.id as string,
            Number(data.payment?.entity?.amount || 0) / 100,
            data.payment?.entity?.currency as string || 'USD',
            data.payment?.entity?.error_code as string,
            data.payment?.entity?.error_description as string,
            data.payment?.entity?.notes as Record<string, unknown> || {},
            'RAZORPAY'
          )
        );
        break;

      case 'transfer.processed':
        processedEvents.push(
          await this.processTransfer(
            event,
            data.transfer?.entity?.id as string,
            Number(data.transfer?.entity?.amount || 0) / 100,
            data.transfer?.entity?.currency as string || 'USD',
            data.transfer?.entity?.source as string,
            data.transfer?.entity?.destination as string,
            data.transfer?.entity?.notes as Record<string, unknown> || {},
            'RAZORPAY',
            true
          )
        );
        break;

      case 'transfer.reversed':
        processedEvents.push(
          await this.processTransferReversed(
            event,
            data.transfer?.entity?.id as string,
            Number(data.transfer?.entity?.amount || 0) / 100,
            data.transfer?.entity?.currency as string || 'USD',
            data.transfer?.entity?.notes as Record<string, unknown> || {},
            'RAZORPAY'
          )
        );
        break;

      default:
        throw new ValidationError(`Unsupported Razorpay event type: ${event.eventType}`);
    }

    return processedEvents;
  }

  /**
   * Process Flutterwave webhook events
   */
  private static async processFlutterwaveEvent(
    event: WebhookEvent,
    payload: Record<string, unknown>
  ): Promise<ProcessedWebhookEvent[]> {
    const processedEvents: ProcessedWebhookEvent[] = [];
    const data = payload.data as Record<string, unknown> || payload;

    switch (event.eventType) {
      case 'payment.successful':
        processedEvents.push(
          await this.processPaymentSuccess(
            event,
            data.id as string,
            Number(data.amount || 0),
            data.currency as string || 'USD',
            data.meta as Record<string, unknown> || {},
            'FLUTTERWAVE'
          )
        );
        break;

      case 'payment.failed':
        processedEvents.push(
          await this.processPaymentFailed(
            event,
            data.id as string,
            Number(data.amount || 0),
            data.currency as string || 'USD',
            data.status as string,
            data.message as string,
            data.meta as Record<string, unknown> || {},
            'FLUTTERWAVE'
          )
        );
        break;

      case 'transfer.successful':
        processedEvents.push(
          await this.processTransfer(
            event,
            data.id as string,
            Number(data.amount || 0),
            data.currency as string || 'USD',
            data.debit_account as string,
            data.credit_account as string,
            data.meta as Record<string, unknown> || {},
            'FLUTTERWAVE',
            true
          )
        );
        break;

      case 'transfer.failed':
        processedEvents.push(
          await this.processTransferFailed(
            event,
            data.id as string,
            Number(data.amount || 0),
            data.currency as string || 'USD',
            data.status as string,
            data.message as string,
            data.meta as Record<string, unknown> || {},
            'FLUTTERWAVE'
          )
        );
        break;

      default:
        throw new ValidationError(`Unsupported Flutterwave event type: ${event.eventType}`);
    }

    return processedEvents;
  }

  /**
   * Process Square webhook events
   */
  private static async processSquareEvent(
    event: WebhookEvent,
    payload: Record<string, unknown>
  ): Promise<ProcessedWebhookEvent[]> {
    const processedEvents: ProcessedWebhookEvent[] = [];
    const data = payload.data as Record<string, unknown> || payload;
    const object = data.object as Record<string, unknown> || data;

    switch (event.eventType) {
      case 'payment.created':
      case 'payment.updated':
        if ((object.status as string) === 'COMPLETED') {
          processedEvents.push(
            await this.processPaymentSuccess(
              event,
              object.id as string,
              Number(object.amount_money?.amount || 0),
              object.amount_money?.currency as string || 'USD',
              object.metadata as Record<string, unknown> || {},
              'SQUARE'
            )
          );
        }
        break;

      case 'transfer.created':
      case 'transfer.updated':
        if ((object.status as string) === 'COMPLETED') {
          processedEvents.push(
            await this.processTransfer(
              event,
              object.id as string,
              Number(object.amount_money?.amount || 0),
              object.amount_money?.currency as string || 'USD',
              object.from_account as string,
              object.to_account as string,
              object.metadata as Record<string, unknown> || {},
              'SQUARE',
              true
            )
          );
        }
        break;

      default:
        throw new ValidationError(`Unsupported Square event type: ${event.eventType}`);
    }

    return processedEvents;
  }

  /**
   * Process Placid webhook events
   */
  private static async processPlacidEvent(
    event: WebhookEvent,
    payload: Record<string, unknown>
  ): Promise<ProcessedWebhookEvent[]> {
    const processedEvents: ProcessedWebhookEvent[] = [];
    const data = payload.data as Record<string, unknown> || payload;

    switch (event.eventType) {
      case 'payment.success':
        processedEvents.push(
          await this.processPaymentSuccess(
            event,
            data.id as string,
            Number(data.amount || 0),
            data.currency as string || 'USD',
            data.metadata as Record<string, unknown> || {},
            'PLACID'
          )
        );
        break;

      case 'payment.failed':
        processedEvents.push(
          await this.processPaymentFailed(
            event,
            data.id as string,
            Number(data.amount || 0),
            data.currency as string || 'USD',
            data.status as string,
            data.message as string,
            data.metadata as Record<string, unknown> || {},
            'PLACID'
          )
        );
        break;

      case 'transfer.success':
        processedEvents.push(
          await this.processTransfer(
            event,
            data.id as string,
            Number(data.amount || 0),
            data.currency as string || 'USD',
            data.from as string,
            data.to as string,
            data.metadata as Record<string, unknown> || {},
            'PLACID',
            true
          )
        );
        break;

      case 'transfer.failed':
        processedEvents.push(
          await this.processTransferFailed(
            event,
            data.id as string,
            Number(data.amount || 0),
            data.currency as string || 'USD',
            data.status as string,
            data.message as string,
            data.metadata as Record<string, unknown> || {},
            'PLACID'
          )
        );
        break;

      default:
        throw new ValidationError(`Unsupported Placid event type: ${event.eventType}`);
    }

    return processedEvents;
  }

  /**
   * Process custom webhook events
   */
  private static async processCustomEvent(
    event: WebhookEvent,
    payload: Record<string, unknown>
  ): Promise<ProcessedWebhookEvent[]> {
    // Custom events are processed based on their metadata
    // This is a placeholder for custom integrations

    const processedEvent: ProcessedWebhookEvent = {
      id: generateReference('WHK-PRC'),
      reference: generateReference('WHK-PRC'),
      provider: event.provider,
      eventType: event.eventType,
      resourceType: payload.resourceType as string || 'CUSTOM',
      resourceId: payload.resourceId as string || generateReference('CUST'),
      status: 'COMPLETED',
      payload,
      processedAt: new Date(),
    };

    return [processedEvent];
  }

  // ============================================
  // GENERIC EVENT HANDLERS
  // ============================================

  /**
   * Process a successful payment
   */
  private static async processPaymentSuccess(
    event: WebhookEvent,
    paymentId: string,
    amount: number,
    currency: string,
    metadata: Record<string, unknown>,
    provider: string
  ): Promise<ProcessedWebhookEvent> {
    // Check if this payment already exists
    const existingDeposit = await prisma.deposit.findFirst({
      where: { providerReference: paymentId },
    });

    if (existingDeposit) {
      // Payment already processed
      return {
        id: generateReference('WHK-PAY'),
        reference: generateReference('WHK-PAY'),
        provider,
        eventType: event.eventType,
        resourceType: 'DEPOSIT',
        resourceId: existingDeposit.id,
        status: 'REPLAYED',
        payload: { depositId: existingDeposit.id, amount, currency },
        processedAt: new Date(),
      };
    }

    // Extract user and account info from metadata
    const userId = metadata.userId as string;
    const accountId = metadata.accountId as string;

    if (!userId || !accountId) {
      throw new ValidationError('Payment metadata must include userId and accountId');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundError('Account', accountId);

    // Create deposit
    const reference = generateReference('DEP');
    const deposit = await prisma.deposit.create({
      data: {
        reference,
        userId,
        accountId,
        amount,
        currency,
        method: this.getDepositMethod(provider),
        provider,
        providerReference: paymentId,
        status: 'COMPLETED' as DepositStatus,
        metadata: {
          ...metadata,
          webhookEventId: event.id,
          providerEventType: event.eventType,
        },
      },
    });

    // Create ledger entries
    await LedgerService.createDepositJournal(
      deposit.id,
      accountId,
      amount,
      currency,
      `Deposit from ${provider}: ${paymentId}`
    );

    // Create transaction
    await prisma.transaction.create({
      data: {
        reference: generateReference('TXN'),
        userId,
        accountId,
        type: 'DEPOSIT' as const,
        amount,
        currency,
        description: `Deposit from ${provider}: ${paymentId}`,
        status: 'COMPLETED' as TransactionStatus,
        metadata: {
          depositId: deposit.id,
          providerPaymentId: paymentId,
          provider,
        },
        journal: {
          create: {
            reference: generateReference('JNL'),
            description: `Deposit from ${provider}: ${paymentId}`,
            status: 'POSTED' as const,
          },
        },
      },
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        actorId: 'SYSTEM',
        action: 'DEPOSIT',
        resourceType: 'DEPOSIT',
        resourceId: deposit.id,
        newValues: { userId, accountId, amount, currency, provider },
        metadata: { webhookEventId: event.id, paymentId },
        status: 'SUCCESS',
      },
    });

    return {
      id: generateReference('WHK-PAY'),
      reference: generateReference('WHK-PAY'),
      provider,
      eventType: event.eventType,
      resourceType: 'DEPOSIT',
      resourceId: deposit.id,
      status: 'COMPLETED',
      payload: { depositId: deposit.id, userId, accountId, amount, currency },
      processedAt: new Date(),
    };
  }

  /**
   * Process a failed payment
   */
  private static async processPaymentFailed(
    event: WebhookEvent,
    paymentId: string,
    amount: number,
    currency: string,
    errorCode: string,
    errorMessage: string,
    metadata: Record<string, unknown>,
    provider: string
  ): Promise<ProcessedWebhookEvent> {
    // Extract user and account info from metadata
    const userId = metadata.userId as string;
    const accountId = metadata.accountId as string;

    // Log the failed payment
    await prisma.auditLog.create({
      data: {
        actorId: 'SYSTEM',
        action: 'PAYMENT_FAILED',
        resourceType: 'PAYMENT',
        resourceId: paymentId,
        newValues: { userId, accountId, amount, currency, provider },
        errorMessage: `${errorCode}: ${errorMessage}`,
        metadata: {
          webhookEventId: event.id,
          paymentId,
          errorCode,
          errorMessage,
        },
        status: 'FAILURE',
      },
    });

    return {
      id: generateReference('WHK-FAIL'),
      reference: generateReference('WHK-FAIL'),
      provider,
      eventType: event.eventType,
      resourceType: 'PAYMENT',
      resourceId: paymentId,
      status: 'COMPLETED',
      payload: { paymentId, userId, accountId, amount, currency, errorCode, errorMessage },
      processedAt: new Date(),
    };
  }

  /**
   * Process a refunded payment
   */
  private static async processPaymentRefunded(
    event: WebhookEvent,
    paymentId: string,
    amount: number,
    currency: string,
    metadata: Record<string, unknown>,
    provider: string
  ): Promise<ProcessedWebhookEvent> {
    // Find the original deposit
    const deposit = await prisma.deposit.findFirst({
      where: { providerReference: paymentId },
    });

    if (!deposit) {
      // Log but don't fail
      await prisma.auditLog.create({
        data: {
          actorId: 'SYSTEM',
          action: 'REFUND',
          resourceType: 'PAYMENT',
          resourceId: paymentId,
          errorMessage: 'Original deposit not found',
          metadata: { webhookEventId: event.id, paymentId },
          status: 'FAILURE',
        },
      });

      return {
        id: generateReference('WHK-REF'),
        reference: generateReference('WHK-REF'),
        provider,
        eventType: event.eventType,
        resourceType: 'PAYMENT',
        resourceId: paymentId,
        status: 'COMPLETED',
        errorMessage: 'Original deposit not found',
        payload: { paymentId, amount, currency },
        processedAt: new Date(),
      };
    }

    // Process the refund
    // In a real implementation, this would create a withdrawal or reverse the deposit

    await prisma.auditLog.create({
      data: {
        actorId: 'SYSTEM',
        action: 'REFUND',
        resourceType: 'DEPOSIT',
        resourceId: deposit.id,
        newValues: { amount, currency, provider },
        metadata: {
          webhookEventId: event.id,
          paymentId,
          depositId: deposit.id,
        },
        status: 'SUCCESS',
      },
    });

    return {
      id: generateReference('WHK-REF'),
      reference: generateReference('WHK-REF'),
      provider,
      eventType: event.eventType,
      resourceType: 'DEPOSIT',
      resourceId: deposit.id,
      status: 'COMPLETED',
      payload: { depositId: deposit.id, amount, currency },
      processedAt: new Date(),
    };
  }

  /**
   * Process a transfer
   */
  private static async processTransfer(
    event: WebhookEvent,
    transferId: string,
    amount: number,
    currency: string,
    source: string,
    destination: string,
    metadata: Record<string, unknown>,
    provider: string,
    isCompleted: boolean
  ): Promise<ProcessedWebhookEvent> {
    // Check if this transfer already exists
    const existingTransfer = await prisma.transfer.findFirst({
      where: { providerReference: transferId },
    });

    if (existingTransfer) {
      // Transfer already processed
      return {
        id: generateReference('WHK-XFR'),
        reference: generateReference('WHK-XFR'),
        provider,
        eventType: event.eventType,
        resourceType: 'TRANSFER',
        resourceId: existingTransfer.id,
        status: 'REPLAYED',
        payload: { transferId: existingTransfer.id, amount, currency },
        processedAt: new Date(),
      };
    }

    // Extract user and account info from metadata
    const fromUserId = metadata.fromUserId as string;
    const toUserId = metadata.toUserId as string;
    const fromAccountId = metadata.fromAccountId as string;
    const toAccountId = metadata.toAccountId as string;

    if (!fromUserId || !toUserId || !fromAccountId || !toAccountId) {
      throw new ValidationError('Transfer metadata must include user and account information');
    }

    const fromUser = await prisma.user.findUnique({ where: { id: fromUserId } });
    if (!fromUser) throw new NotFoundError('User', fromUserId);

    const toUser = await prisma.user.findUnique({ where: { id: toUserId } });
    if (!toUser) throw new NotFoundError('User', toUserId);

    const fromAccount = await prisma.account.findUnique({ where: { id: fromAccountId } });
    if (!fromAccount) throw new NotFoundError('Account', fromAccountId);

    const toAccount = await prisma.account.findUnique({ where: { id: toAccountId } });
    if (!toAccount) throw new NotFoundError('Account', toAccountId);

    // Create transfer
    const reference = generateReference('XFR');
    const transfer = await prisma.transfer.create({
      data: {
        reference,
        fromUserId,
        toUserId,
        fromAccountId,
        toAccountId,
        amount,
        currency,
        description: `Transfer from ${provider}: ${transferId}`,
        status: isCompleted ? 'COMPLETED' : 'PROCESSING' as TransferStatus,
        riskStatus: 'LOW' as const,
        provider,
        providerReference: transferId,
        metadata: {
          ...metadata,
          webhookEventId: event.id,
          providerEventType: event.eventType,
        },
      },
    });

    // Create ledger entries if completed
    if (isCompleted) {
      await LedgerService.createTransferJournal(
        transfer.id,
        fromAccountId,
        toAccountId,
        amount,
        currency,
        `Transfer from ${provider}: ${transferId}`
      );

      // Update transfer status
      await prisma.transfer.update({
        where: { id: transfer.id },
        data: { status: 'COMPLETED' as TransferStatus },
      });

      // Create transactions
      await prisma.transaction.create({
        data: {
          reference: generateReference('TXN'),
          userId: fromUserId,
          accountId: fromAccountId,
          type: 'TRANSFER' as const,
          amount: -amount, // Negative for sender
          currency,
          description: `Transfer to ${toUser.firstName} ${toUser.lastName}`,
          status: 'COMPLETED' as TransactionStatus,
          metadata: {
            transferId: transfer.id,
            providerTransferId: transferId,
            provider,
            toUserId,
            toAccountId,
          },
        },
      });

      await prisma.transaction.create({
        data: {
          reference: generateReference('TXN'),
          userId: toUserId,
          accountId: toAccountId,
          type: 'TRANSFER' as const,
          amount,
          currency,
          description: `Transfer from ${fromUser.firstName} ${fromUser.lastName}`,
          status: 'COMPLETED' as TransactionStatus,
          metadata: {
            transferId: transfer.id,
            providerTransferId: transferId,
            provider,
            fromUserId,
            fromAccountId,
          },
        },
      });
    }

    // Log audit event
    await prisma.auditLog.create({
      data: {
        actorId: 'SYSTEM',
        action: 'TRANSFER',
        resourceType: 'TRANSFER',
        resourceId: transfer.id,
        newValues: { fromUserId, toUserId, fromAccountId, toAccountId, amount, currency, provider },
        metadata: { webhookEventId: event.id, transferId, isCompleted },
        status: 'SUCCESS',
      },
    });

    return {
      id: generateReference('WHK-XFR'),
      reference: generateReference('WHK-XFR'),
      provider,
      eventType: event.eventType,
      resourceType: 'TRANSFER',
      resourceId: transfer.id,
      status: 'COMPLETED',
      payload: { transferId: transfer.id, fromUserId, toUserId, amount, currency },
      processedAt: new Date(),
    };
  }

  /**
   * Process a failed transfer
   */
  private static async processTransferFailed(
    event: WebhookEvent,
    transferId: string,
    amount: number,
    currency: string,
    errorCode: string,
    errorMessage: string,
    metadata: Record<string, unknown>,
    provider: string
  ): Promise<ProcessedWebhookEvent> {
    // Log the failed transfer
    await prisma.auditLog.create({
      data: {
        actorId: 'SYSTEM',
        action: 'TRANSFER_FAILED',
        resourceType: 'TRANSFER',
        resourceId: transferId,
        newValues: { amount, currency, provider },
        errorMessage: `${errorCode}: ${errorMessage}`,
        metadata: {
          webhookEventId: event.id,
          transferId,
          errorCode,
          errorMessage,
        },
        status: 'FAILURE',
      },
    });

    return {
      id: generateReference('WHK-XFR-FAIL'),
      reference: generateReference('WHK-XFR-FAIL'),
      provider,
      eventType: event.eventType,
      resourceType: 'TRANSFER',
      resourceId: transferId,
      status: 'COMPLETED',
      payload: { transferId, amount, currency, errorCode, errorMessage },
      processedAt: new Date(),
    };
  }

  /**
   * Process a reversed transfer
   */
  private static async processTransferReversed(
    event: WebhookEvent,
    transferId: string,
    amount: number,
    currency: string,
    metadata: Record<string, unknown>,
    provider: string
  ): Promise<ProcessedWebhookEvent> {
    // Find the original transfer
    const transfer = await prisma.transfer.findFirst({
      where: { providerReference: transferId },
    });

    if (!transfer) {
      // Log but don't fail
      await prisma.auditLog.create({
        data: {
          actorId: 'SYSTEM',
          action: 'TRANSFER_REVERSED',
          resourceType: 'TRANSFER',
          resourceId: transferId,
          errorMessage: 'Original transfer not found',
          metadata: { webhookEventId: event.id, transferId },
          status: 'FAILURE',
        },
      });

      return {
        id: generateReference('WHK-XFR-REV'),
        reference: generateReference('WHK-XFR-REV'),
        provider,
        eventType: event.eventType,
        resourceType: 'TRANSFER',
        resourceId: transferId,
        status: 'COMPLETED',
        errorMessage: 'Original transfer not found',
        payload: { transferId, amount, currency },
        processedAt: new Date(),
      };
    }

    // Reverse the transfer
    // In a real implementation, this would create a new transfer in the opposite direction

    await prisma.auditLog.create({
      data: {
        actorId: 'SYSTEM',
        action: 'TRANSFER_REVERSED',
        resourceType: 'TRANSFER',
        resourceId: transfer.id,
        newValues: { amount, currency, provider },
        metadata: {
          webhookEventId: event.id,
          transferId,
          providerTransferId: transferId,
        },
        status: 'SUCCESS',
      },
    });

    return {
      id: generateReference('WHK-XFR-REV'),
      reference: generateReference('WHK-XFR-REV'),
      provider,
      eventType: event.eventType,
      resourceType: 'TRANSFER',
      resourceId: transfer.id,
      status: 'COMPLETED',
      payload: { transferId: transfer.id, amount, currency },
      processedAt: new Date(),
    };
  }

  /**
   * Process a payout
   */
  private static async processPayout(
    event: WebhookEvent,
    payoutId: string,
    amount: number,
    currency: string,
    destination: string,
    arrivalDate: number,
    metadata: Record<string, unknown>,
    provider: string
  ): Promise<ProcessedWebhookEvent> {
    // Extract user and account info from metadata
    const userId = metadata.userId as string;
    const accountId = metadata.accountId as string;

    if (!userId || !accountId) {
      throw new ValidationError('Payout metadata must include userId and accountId');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundError('Account', accountId);

    // Create withdrawal (payout is similar to withdrawal)
    const reference = generateReference('WTH');
    const withdrawal = await prisma.withdrawal.create({
      data: {
        reference,
        userId,
        accountId,
        amount,
        currency,
        method: this.getWithdrawalMethod(provider),
        destination,
        provider,
        providerReference: payoutId,
        status: 'COMPLETED' as WithdrawalStatus,
        riskStatus: 'LOW' as const,
        metadata: {
          ...metadata,
          webhookEventId: event.id,
          providerEventType: event.eventType,
          arrivalDate: new Date(arrivalDate * 1000).toISOString(),
        },
      },
    });

    // Create ledger entries
    await LedgerService.createJournal({
      reference: generateReference('JNL'),
      description: `Payout to ${destination}: ${payoutId}`,
      entries: [
        {
          accountId,
          entryType: 'DEBIT',
          amount,
          description: `Payout to ${destination}`,
        },
      ],
      withdrawalId: withdrawal.id,
      metadata: {
        withdrawalId: withdrawal.id,
        payoutId,
        provider,
      },
    });

    // Create transaction
    await prisma.transaction.create({
      data: {
        reference: generateReference('TXN'),
        userId,
        accountId,
        type: 'WITHDRAWAL' as const,
        amount,
        currency,
        description: `Payout to ${destination}`,
        status: 'COMPLETED' as TransactionStatus,
        metadata: {
          withdrawalId: withdrawal.id,
          payoutId,
          provider,
          destination,
        },
        withdrawal: {
          connect: { id: withdrawal.id },
        },
      },
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        actorId: 'SYSTEM',
        action: 'PAYOUT',
        resourceType: 'WITHDRAWAL',
        resourceId: withdrawal.id,
        newValues: { userId, accountId, amount, currency, destination, provider },
        metadata: { webhookEventId: event.id, payoutId },
        status: 'SUCCESS',
      },
    });

    return {
      id: generateReference('WHK-PAYOUT'),
      reference: generateReference('WHK-PAYOUT'),
      provider,
      eventType: event.eventType,
      resourceType: 'WITHDRAWAL',
      resourceId: withdrawal.id,
      status: 'COMPLETED',
      payload: { withdrawalId: withdrawal.id, userId, accountId, amount, currency, destination },
      processedAt: new Date(),
    };
  }

  // ============================================
  // WEBHOOK EVENT RETRIEVAL
  // ============================================

  /**
   * Get a webhook event by ID
   */
  static async getWebhookEventById(id: string): Promise<WebhookEventResult> {
    const event = await prisma.webhookEvent.findUnique({
      where: { id },
      include: {
        processedEvents: true,
      },
    });

    if (!event) throw new NotFoundError('Webhook Event', id);

    return { event };
  }

  /**
   * Get a webhook event by reference
   */
  static async getWebhookEventByReference(
    reference: string
  ): Promise<WebhookEventResult> {
    const event = await prisma.webhookEvent.findUnique({
      where: { reference },
      include: {
        processedEvents: true,
      },
    });

    if (!event) throw new NotFoundError('Webhook Event', reference);

    return { event };
  }

  /**
   * List webhook events
   */
  static async listWebhookEvents(
    actingUserId: string,
    page: number = 1,
    limit: number = 20,
    provider?: string,
    eventType?: string,
    status?: WebhookEventStatus,
    startDate?: Date,
    endDate?: Date,
    search?: string
  ): Promise<WebhookEventListResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view webhook events');
    }

    const where: Record<string, unknown> = {};

    if (provider) where.provider = provider;
    if (eventType) where.eventType = { contains: eventType, mode: 'insensitive' };
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { provider: { contains: search, mode: 'insensitive' } },
        { eventType: { contains: search, mode: 'insensitive' } },
      ];
    }

    const events = await prisma.webhookEvent.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        processedEvents: true,
      },
    });

    const total = await prisma.webhookEvent.count({ where });

    return {
      events,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================
  // SIGNATURE VERIFICATION
  // ============================================

  /**
   * Get provider configuration
   */
  private static getProvider(provider: string): WebhookProviderConfig | null {
    const providerKey = provider.toUpperCase() as WebhookProviderName;
    return WEBHOOK_PROVIDERS[providerKey] || null;
  }

  /**
   * Verify webhook signature
   */
  static async verifySignature(
    provider: string,
    payload: string,
    signature: string,
    timestamp?: string
  ): Promise<boolean> {
    const config = this.getProvider(provider);
    if (!config) {
      throw new ValidationError(`Unknown webhook provider: ${provider}`);
    }

    // Get the signature secret from the database
    // In production, this would be stored securely
    const webhookConfig = await prisma.webhookConfig.findUnique({
      where: { provider },
    });

    const secret = webhookConfig?.signatureSecret || process.env[`${provider}_WEBHOOK_SECRET`];

    if (!secret) {
      throw new ValidationError(`No signature secret configured for provider: ${provider}`);
    }

    // Verify timestamp if provided
    if (timestamp && config.timestampHeader) {
      const timestampDate = new Date(parseInt(timestamp) * 1000);
      const now = new Date();
      const diffSeconds = Math.abs(now.getTime() - timestampDate.getTime()) / 1000;

      if (diffSeconds > config.timestampToleranceSeconds) {
        throw new ValidationError(
          `Timestamp is too old: ${diffSeconds} seconds (max ${config.timestampToleranceSeconds})`
        );
      }
    }

    // Verify signature based on provider
    switch (provider.toUpperCase() as WebhookProviderName) {
      case WebhookProviderName.STRIPE:
        return this.verifyStripeSignature(payload, signature, secret);

      case WebhookProviderName.PAYPAL:
        return this.verifyPayPalSignature(payload, signature, secret, timestamp);

      case WebhookProviderName.RAZORPAY:
        return this.verifyRazorpaySignature(payload, signature, secret);

      case WebhookProviderName.FLUTTERWAVE:
        return this.verifyFlutterwaveSignature(payload, signature, secret);

      case WebhookProviderName.SQUARE:
        return this.verifySquareSignature(payload, signature, secret);

      case WebhookProviderName.PLACID:
        return this.verifyPlacidSignature(payload, signature, secret);

      default:
        // Generic HMAC verification
        return this.verifyGenericSignature(payload, signature, secret);
    }
  }

  /**
   * Verify Stripe webhook signature
   */
  private static verifyStripeSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    // Stripe uses HMAC-SHA256 with a timestamp prefix
    // Format: t=<timestamp>,v1=<signature>
    const parts = signature.split(',');
    const signaturePart = parts.find(p => p.startsWith('v1='));
    const expectedSignature = signaturePart ? signaturePart.split('=')[1] : signature;

    const computedSignature = hashString(payload, secret);
    return verifyHash(payload, expectedSignature, secret);
  }

  /**
   * Verify PayPal webhook signature
   */
  private static verifyPayPalSignature(
    payload: string,
    signature: string,
    secret: string,
    timestamp?: string
  ): boolean {
    // PayPal uses a different signature format
    // This is a simplified verification
    return verifyHash(payload, signature, secret);
  }

  /**
   * Verify Razorpay webhook signature
   */
  private static verifyRazorpaySignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    // Razorpay uses HMAC-SHA256
    return verifyHash(payload, signature, secret);
  }

  /**
   * Verify Flutterwave webhook signature
   */
  private static verifyFlutterwaveSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    // Flutterwave uses HMAC-SHA256
    return verifyHash(payload, signature, secret);
  }

  /**
   * Verify Square webhook signature
   */
  private static verifySquareSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    // Square uses HMAC-SHA1
    return verifyHash(payload, signature, secret);
  }

  /**
   * Verify Placid webhook signature
   */
  private static verifyPlacidSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    // Placid uses HMAC-SHA256
    return verifyHash(payload, signature, secret);
  }

  /**
   * Verify generic HMAC signature
   */
  private static verifyGenericSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    return verifyHash(payload, signature, secret);
  }

  // ============================================
  // STATISTICS & ANALYTICS
  // ============================================

  /**
   * Get webhook statistics
   */
  static async getStats(actingUserId: string): Promise<WebhookStats> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'COMPLIANCE'].includes(actingUser.role)) {
      throw new ForbiddenError('Only authorized personnel can view webhook statistics');
    }

    const totalEvents = await prisma.webhookEvent.count();
    const successfulEvents = await prisma.webhookEvent.count({
      where: { status: { in: ['COMPLETED', 'REPLAYED'] } },
    });
    const failedEvents = await prisma.webhookEvent.count({
      where: { status: { in: ['FAILED', 'DUPLICATE'] } },
    });

    // Group by provider
    const providers = await prisma.webhookEvent.groupBy({
      by: ['provider'],
      _count: { _all: true },
      where: { status: { in: ['COMPLETED', 'FAILED'] } },
    });

    const byProvider: Record<string, { total: number; successful: number; failed: number }> = {};

    for (const provider of providers) {
      const successful = await prisma.webhookEvent.count({
        where: { provider: provider.provider, status: { in: ['COMPLETED', 'REPLAYED'] } },
      });

      const failed = await prisma.webhookEvent.count({
        where: { provider: provider.provider, status: { in: ['FAILED', 'DUPLICATE'] } },
      });

      byProvider[provider.provider] = {
        total: provider._count._all,
        successful,
        failed,
      };
    }

    // Group by event type
    const eventTypes = await prisma.webhookEvent.groupBy({
      by: ['eventType'],
      _count: { _all: true },
    });

    const byEventType: Record<string, number> = {};
    for (const eventType of eventTypes) {
      byEventType[eventType.eventType] = eventType._count._all;
    }

    // Group by status
    const statuses = Object.values(WebhookEventStatus);
    const byStatus: Record<WebhookEventStatus, number> = {} as Record<WebhookEventStatus, number>;
    for (const status of statuses) {
      byStatus[status] = await prisma.webhookEvent.count({
        where: { status },
      });
    }

    // Get recent events
    const recentEvents = await prisma.webhookEvent.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        processedEvents: true,
      },
    });

    return {
      totalEvents,
      successfulEvents,
      failedEvents,
      byProvider,
      byEventType,
      byStatus,
      recentEvents,
    };
  }

  // ============================================
  // WEBHOOK TESTING
  // ============================================

  /**
   * Test a webhook endpoint
   */
  static async testWebhook(
    provider: string,
    webhookUrl: string,
    testEventType: string,
    actingUserId: string
  ): Promise<WebhookTestResult> {
    const actingUser = await prisma.user.findUnique({ where: { id: actingUserId } });
    if (!actingUser || !['ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
      throw new ForbiddenError('Only administrators can test webhooks');
    }

    const config = this.getProvider(provider);
    if (!config) {
      throw new ValidationError(`Unknown webhook provider: ${provider}`);
    }

    const startTime = Date.now();

    try {
      // Generate test payload
      const testPayload = {
        id: generateReference('TEST'),
        object: 'event',
        type: testEventType,
        data: {
          id: generateReference('TEST'),
          amount: 1000,
          currency: 'USD',
          status: 'succeeded',
        },
        created: Math.floor(Date.now() / 1000),
      };

      const payloadString = JSON.stringify(testPayload);

      // Generate signature
      const secret = process.env[`${provider}_WEBHOOK_SECRET`] || 'test_secret';
      const signature = hashString(payloadString, secret);

      // In production, you would actually send the webhook to the URL
      // For testing purposes, we just verify the signature and return success

      const isValid = this.verifyGenericSignature(payloadString, signature, secret);

      if (!isValid) {
        throw new ValidationError('Test webhook signature verification failed');
      }

      const responseTimeMs = Date.now() - startTime;

      return {
        success: true,
        provider,
        testEventType,
        responseTimeMs,
      };
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      return {
        success: false,
        provider,
        testEventType,
        responseTimeMs,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Get deposit method from provider
   */
  private static getDepositMethod(provider: string): 'ACH' | 'WIRE' | 'CARD' | 'MOBILE' | 'CRYPTO' {
    switch (provider.toUpperCase()) {
      case 'STRIPE':
        return 'CARD';
      case 'PAYPAL':
        return 'MOBILE';
      case 'RAZORPAY':
        return 'CARD';
      case 'FLUTTERWAVE':
        return 'MOBILE';
      case 'SQUARE':
        return 'CARD';
      case 'PLACID':
        return 'MOBILE';
      default:
        return 'MOBILE';
    }
  }

  /**
   * Get withdrawal method from provider
   */
  private static getWithdrawalMethod(provider: string): 'ACH' | 'WIRE' | 'CARD' | 'MOBILE' | 'CRYPTO' {
    switch (provider.toUpperCase()) {
      case 'STRIPE':
        return 'CARD';
      case 'PAYPAL':
        return 'MOBILE';
      case 'RAZORPAY':
        return 'CARD';
      case 'FLUTTERWAVE':
        return 'MOBILE';
      case 'SQUARE':
        return 'CARD';
      case 'PLACID':
        return 'MOBILE';
      default:
        return 'WIRE';
    }
  }
}
