import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
type DecimalLike = { toNumber(): number };

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format currency - now supports Decimal for precise monetary calculations
export function formatCurrency(amount: DecimalLike | number | string, currency: string = 'USD'): string {
  // Convert Decimal to number for formatting
  const num = typeof amount === 'object' && amount !== null && 'toNumber' in amount
    ? amount.toNumber()
    : typeof amount === 'string'
      ? parseFloat(amount)
      : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(num);
}

// Coerce API money values (Decimal, string or number) into a plain number
export function toAmount(
  value: DecimalLike | number | string | null | undefined
): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'object' && 'toNumber' in value) return value.toNumber();
  if (typeof value === 'string') return parseFloat(value) || 0;
  return value;
}

// Format date
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(d);
}

// Format date with time
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

// Truncate text
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length) + '...';
}

// Mask sensitive data
export function maskData(data: string, visibleChars: number = 4): string {
  if (data.length <= visibleChars) return data;
  return data.slice(0, visibleChars) + '*'.repeat(data.length - visibleChars);
}

// Mask card number
export function maskCardNumber(cardNumber: string): string {
  if (!cardNumber || cardNumber.length < 4) return cardNumber;
  return '**** **** **** ' + cardNumber.slice(-4);
}

// Mask account number
export function maskAccountNumber(accountNumber: string): string {
  if (!accountNumber || accountNumber.length < 4) return accountNumber;
  return '**' + accountNumber.slice(-4);
}

// Generate initials from name
export function getInitials(firstName: string, lastName: string): string {
  return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
}

// Get status color
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    ACTIVE: 'text-green-400',
    PENDING: 'text-yellow-400',
    COMPLETED: 'text-green-400',
    FAILED: 'text-red-400',
    CANCELLED: 'text-gray-400',
    HOLD: 'text-yellow-400',
    FROZEN: 'text-blue-400',
    SUSPENDED: 'text-orange-400',
    CLOSED: 'text-gray-400',
    REVERSED: 'text-purple-400',
    PROCESSING: 'text-blue-400',
    DRAFT: 'text-gray-400',
    APPROVED: 'text-green-400',
    REJECTED: 'text-red-400',
    UNDER_REVIEW: 'text-yellow-400',
    OPEN: 'text-blue-400',
    RESOLVED: 'text-green-400',
    DISMISSED: 'text-gray-400',
    ESCALATED: 'text-orange-400',
    FALSE_POSITIVE: 'text-purple-400',
  };
  return colors[status.toUpperCase()] || 'text-gray-400';
}

// Get status badge variant
export function getStatusBadgeVariant(status: string): string {
  const variants: Record<string, string> = {
    ACTIVE: 'bg-green-500/10 text-green-400',
    PENDING: 'bg-yellow-500/10 text-yellow-400',
    COMPLETED: 'bg-green-500/10 text-green-400',
    FAILED: 'bg-red-500/10 text-red-400',
    CANCELLED: 'bg-gray-500/10 text-gray-400',
    HOLD: 'bg-yellow-500/10 text-yellow-400',
    FROZEN: 'bg-blue-500/10 text-blue-400',
    SUSPENDED: 'bg-orange-500/10 text-orange-400',
    CLOSED: 'bg-gray-500/10 text-gray-400',
    REVERSED: 'bg-purple-500/10 text-purple-400',
    PROCESSING: 'bg-blue-500/10 text-blue-400',
    DRAFT: 'bg-gray-500/10 text-gray-400',
    APPROVED: 'bg-green-500/10 text-green-400',
    REJECTED: 'bg-red-500/10 text-red-400',
    UNDER_REVIEW: 'bg-yellow-500/10 text-yellow-400',
    OPEN: 'bg-blue-500/10 text-blue-400',
    RESOLVED: 'bg-green-500/10 text-green-400',
    DISMISSED: 'bg-gray-500/10 text-gray-400',
    ESCALATED: 'bg-orange-500/10 text-orange-400',
    FALSE_POSITIVE: 'bg-purple-500/10 text-purple-400',
  };
  return variants[status.toUpperCase()] || 'bg-gray-500/10 text-gray-400';
}

// Get role color
export function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    CUSTOMER: 'text-blue-400',
    SUPPORT: 'text-green-400',
    OPERATOR: 'text-yellow-400',
    COMPLIANCE: 'text-purple-400',
    ADMIN: 'text-orange-400',
    SUPER_ADMIN: 'text-red-400',
  };
  return colors[role.toUpperCase()] || 'text-gray-400';
}

// Get account type color
export function getAccountTypeColor(type: string): string {
  const colors: Record<string, string> = {
    CHECKING: 'text-blue-400',
    SAVINGS: 'text-green-400',
    LOAN: 'text-orange-400',
    INVESTMENT: 'text-purple-400',
    CREDIT: 'text-red-400',
  };
  return colors[type.toUpperCase()] || 'text-gray-400';
}

// Get transaction type icon
export function getTransactionTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    DEPOSIT: '📥',
    WITHDRAWAL: '📤',
    TRANSFER: '🔄',
    FEE: '💸',
    INTEREST: '💰',
    LOAN_DISBURSEMENT: '🏦',
    LOAN_REPAYMENT: '💳',
    INVESTMENT: '📈',
    SAVINGS_CONTRIBUTION: '🏷️',
    REFUND: '🔙',
    REVERSAL: '↩️',
    ADJUSTMENT: '⚖️',
  };
  return icons[type.toUpperCase()] || '📊';
}

// Get risk status color
export function getRiskStatusColor(status: string): string {
  const colors: Record<string, string> = {
    LOW: 'text-green-400',
    MEDIUM: 'text-yellow-400',
    HIGH: 'text-orange-400',
    CRITICAL: 'text-red-400',
  };
  return colors[status.toUpperCase()] || 'text-gray-400';
}

// Format phone number
export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

// Capitalize first letter
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Generate avatar color from name
export function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-red-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}