/**
 * Declarative config for the operations console queues.
 *
 * Each entry maps a module card on /admin to an existing admin API endpoint,
 * the columns worth showing an operator, the filters the endpoint supports and
 * the privileged actions behind it. Keeping it as data means the queue page,
 * the overview counts and the console navigation all stay in sync.
 */

export type AdminCellKind =
  | 'reference'
  | 'person'
  | 'user'
  | 'transfer'
  | 'amount'
  | 'path'
  | 'date'
  | 'status'
  | 'role'
  | 'risk';

export interface AdminColumn {
  header: string;
  kind: AdminCellKind;
  /** Dot path into the row for kinds that read a single value. */
  path?: string;
  className?: string;
  mono?: boolean;
}

export type AdminFieldType = 'text' | 'number' | 'textarea';

export interface AdminActionField {
  name: string;
  label: string;
  type: AdminFieldType;
  required?: boolean;
  placeholder?: string;
}

export interface AdminAction {
  key: string;
  label: string;
  /** POST target; `:id` is replaced with the row id. */
  path: string;
  tone?: 'primary' | 'danger' | 'neutral';
  description?: string;
  fields?: AdminActionField[];
}

export interface AdminResource {
  slug: string;
  label: string;
  singular: string;
  description: string;
  endpoint: string;
  /** Set when the endpoint returns its array under a non-standard key. */
  listKey?: string;
  /** Query parameter the endpoint uses for free-text search. */
  searchParam?: string;
  searchPlaceholder?: string;
  statuses?: string[];
  columns: AdminColumn[];
  actions?: AdminAction[];
}

const NOTE_FIELD: AdminActionField = {
  name: 'notes',
  label: 'Operator note',
  type: 'textarea',
  placeholder: 'Context is written to the immutable audit trail.',
};

export const ADMIN_RESOURCES: AdminResource[] = [
  {
    slug: 'customers',
    label: 'Customers',
    singular: 'customer',
    description: 'Profiles, roles and account status across the bank.',
    endpoint: '/api/admin/customers',
    searchParam: 'search',
    searchPlaceholder: 'Search by email…',
    statuses: ['ACTIVE', 'PENDING', 'SUSPENDED', 'CLOSED'],
    columns: [
      { header: 'Customer', kind: 'person' },
      { header: 'Role', kind: 'role', path: 'role' },
      { header: 'Status', kind: 'status', path: 'status' },
      { header: 'Joined', kind: 'date', path: 'createdAt' },
    ],
  },
  {
    slug: 'kyc',
    label: 'KYC reviews',
    singular: 'KYC review',
    description: 'Identity checks awaiting a compliance decision.',
    endpoint: '/api/admin/kyc',
    searchParam: 'search',
    searchPlaceholder: 'Search customers…',
    statuses: [
      'PENDING',
      'SUBMITTED',
      'UNDER_REVIEW',
      'REQUESTED_CHANGES',
      'APPROVED',
      'REJECTED',
      'EXPIRED',
      'SUSPENDED',
    ],
    columns: [
      { header: 'Customer', kind: 'user', path: 'user' },
      { header: 'Tier', kind: 'path', path: 'tier', mono: true },
      { header: 'Status', kind: 'status', path: 'status' },
      { header: 'Updated', kind: 'date', path: 'updatedAt' },
    ],
    actions: [
      {
        key: 'request_info',
        label: 'Request info',
        path: '/api/admin/kyc/:id/request_info',
        description: 'Ask the customer for more documentation before deciding.',
        fields: [
          {
            name: 'requestedDocuments',
            label: 'Requested documents',
            type: 'text',
            placeholder: 'Proof of address, source of funds…',
          },
          NOTE_FIELD,
        ],
      },
      {
        key: 'approve',
        label: 'Approve',
        path: '/api/admin/kyc/:id/approve',
        description: 'Approve this identity check and raise the verification tier.',
        fields: [NOTE_FIELD],
      },
      {
        key: 'reject',
        label: 'Reject',
        path: '/api/admin/kyc/:id/reject',
        tone: 'danger',
        description: 'Reject this identity check and record the reason.',
        fields: [
          {
            name: 'rejectionReason',
            label: 'Rejection reason',
            type: 'textarea',
            required: true,
            placeholder: 'Shared with the customer and stored in the audit trail.',
          },
        ],
      },
    ],
  },
  {
    slug: 'deposits',
    label: 'Deposits',
    singular: 'deposit',
    description: 'Inbound payments clearing into customer accounts.',
    endpoint: '/api/admin/deposits',
    statuses: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED', 'HOLD'],
    columns: [
      { header: 'Reference', kind: 'reference' },
      { header: 'Customer', kind: 'user', path: 'user' },
      { header: 'Method', kind: 'path', path: 'method' },
      { header: 'Amount', kind: 'amount', path: 'amount' },
      { header: 'Status', kind: 'status', path: 'status' },
      { header: 'Created', kind: 'date', path: 'createdAt' },
    ],
  },
  {
    slug: 'withdrawals',
    label: 'Withdrawals',
    singular: 'withdrawal',
    description: 'Payout requests awaiting review, hold or rejection.',
    endpoint: '/api/admin/withdrawals',
    statuses: [
      'PENDING',
      'PROCESSING',
      'APPROVED',
      'REJECTED',
      'COMPLETED',
      'FAILED',
      'HOLD',
      'CANCELLED',
    ],
    columns: [
      { header: 'Reference', kind: 'reference' },
      { header: 'Customer', kind: 'user', path: 'user' },
      { header: 'Amount', kind: 'amount', path: 'amount' },
      { header: 'Method', kind: 'path', path: 'method' },
      { header: 'Risk', kind: 'risk', path: 'riskStatus' },
      { header: 'Status', kind: 'status', path: 'status' },
      { header: 'Created', kind: 'date', path: 'createdAt' },
    ],
    actions: [
      {
        key: 'approve',
        label: 'Approve',
        path: '/api/admin/withdrawals/:id/approve',
        description: 'Release this payout for settlement.',
        fields: [NOTE_FIELD],
      },
      {
        key: 'hold',
        label: 'Hold',
        path: '/api/admin/withdrawals/:id/hold',
        tone: 'neutral',
        description: 'Park this payout while it is investigated.',
        fields: [NOTE_FIELD],
      },
      {
        key: 'reject',
        label: 'Reject',
        path: '/api/admin/withdrawals/:id/reject',
        tone: 'danger',
        description: 'Reject this payout and record the reason.',
        fields: [
          {
            name: 'reason',
            label: 'Rejection reason',
            type: 'textarea',
            required: true,
          },
        ],
      },
    ],
  },
  {
    slug: 'transfers',
    label: 'Transfers',
    singular: 'transfer',
    description: 'Account-to-account movements and their risk posture.',
    endpoint: '/api/admin/transfers',
    statuses: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED', 'HOLD'],
    columns: [
      { header: 'Reference', kind: 'reference' },
      { header: 'Movement', kind: 'transfer' },
      { header: 'Amount', kind: 'amount', path: 'amount' },
      { header: 'Risk', kind: 'risk', path: 'riskStatus' },
      { header: 'Status', kind: 'status', path: 'status' },
      { header: 'Created', kind: 'date', path: 'createdAt' },
    ],
  },
  {
    slug: 'transactions',
    label: 'Transactions',
    singular: 'transaction',
    description: 'Posted ledger activity across every account.',
    endpoint: '/api/admin/transactions',
    statuses: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED', 'HOLD'],
    columns: [
      { header: 'Reference', kind: 'reference' },
      { header: 'Customer', kind: 'user', path: 'user' },
      { header: 'Type', kind: 'path', path: 'type' },
      { header: 'Amount', kind: 'amount', path: 'amount' },
      { header: 'Status', kind: 'status', path: 'status' },
      { header: 'Created', kind: 'date', path: 'createdAt' },
    ],
  },
  {
    slug: 'loans',
    label: 'Loan applications',
    singular: 'loan application',
    description: 'Credit requests in underwriting, hold or awaiting disbursement.',
    endpoint: '/api/admin/loans',
    statuses: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
    columns: [
      { header: 'Reference', kind: 'reference' },
      { header: 'Customer', kind: 'user', path: 'user' },
      { header: 'Requested', kind: 'amount', path: 'requestedAmount' },
      { header: 'Status', kind: 'status', path: 'status' },
      { header: 'Created', kind: 'date', path: 'createdAt' },
    ],
    actions: [
      {
        key: 'approve',
        label: 'Approve',
        path: '/api/admin/loans/:id/approve',
        description: 'Approve the application. Leave the terms blank to keep the requested ones.',
        fields: [
          { name: 'approvedAmount', label: 'Approved amount', type: 'number' },
          { name: 'interestRate', label: 'Interest rate (%)', type: 'number' },
          { name: 'term', label: 'Term (months)', type: 'number' },
          NOTE_FIELD,
        ],
      },
      {
        key: 'hold',
        label: 'Hold',
        path: '/api/admin/loans/:id/hold',
        tone: 'neutral',
        description: 'Pause underwriting on this application.',
        fields: [NOTE_FIELD],
      },
      {
        key: 'disburse',
        label: 'Disburse',
        path: '/api/admin/loans/:id/disburse',
        description: 'Fund the approved loan into the customer account.',
        fields: [NOTE_FIELD],
      },
      {
        key: 'reject',
        label: 'Reject',
        path: '/api/admin/loans/:id/reject',
        tone: 'danger',
        description: 'Decline this application and record the reason.',
        fields: [
          {
            name: 'reason',
            label: 'Rejection reason',
            type: 'textarea',
            required: true,
          },
        ],
      },
    ],
  },
  {
    slug: 'fraud',
    label: 'Fraud alerts',
    singular: 'fraud alert',
    description: 'Anomalies queued for triage by fraud and compliance.',
    endpoint: '/api/admin/fraud',
    listKey: 'fraudAlerts',
    searchParam: 'search',
    searchPlaceholder: 'Search alerts, customers…',
    statuses: ['OPEN', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'DISMISSED', 'FALSE_POSITIVE'],
    columns: [
      { header: 'Reference', kind: 'reference' },
      { header: 'Customer', kind: 'user', path: 'user' },
      { header: 'Alert', kind: 'path', path: 'alertType' },
      { header: 'Score', kind: 'path', path: 'riskScore', mono: true },
      { header: 'Risk', kind: 'risk', path: 'riskLevel' },
      { header: 'Status', kind: 'status', path: 'status' },
      { header: 'Raised', kind: 'date', path: 'createdAt' },
    ],
    actions: [
      {
        key: 'review',
        label: 'Review',
        path: '/api/admin/fraud/:id/review',
        description: 'Move this alert into review and take ownership of it.',
        fields: [NOTE_FIELD],
      },
      {
        key: 'resolve',
        label: 'Resolve',
        path: '/api/admin/fraud/:id/resolve',
        description: 'Close the alert as a confirmed finding.',
        fields: [NOTE_FIELD],
      },
      {
        key: 'escalate',
        label: 'Escalate',
        path: '/api/admin/fraud/:id/escalate',
        tone: 'neutral',
        description: 'Escalate to the fraud desk for deeper investigation.',
        fields: [
          { name: 'escalateTo', label: 'Escalate to', type: 'text' },
          NOTE_FIELD,
        ],
      },
      {
        key: 'dismiss',
        label: 'Dismiss',
        path: '/api/admin/fraud/:id/dismiss',
        tone: 'danger',
        description: 'Dismiss this alert and record why it is not actionable.',
        fields: [
          { name: 'reason', label: 'Dismissal reason', type: 'textarea', required: true },
        ],
      },
    ],
  },
];

export function getAdminResource(slug: string | undefined): AdminResource | undefined {
  if (!slug) return undefined;
  return ADMIN_RESOURCES.find((resource) => resource.slug === slug);
}
