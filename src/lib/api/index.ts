// src/lib/api/index.ts
// API Client Index - Export all API modules

export { apiClient, ApiClient, ApiError, BackendResponse, BackendSuccessResponse, BackendErrorResponse } from './client';
export { accountsApi } from './accounts';
export { transactionsApi } from './transactions';
export { transfersApi } from './transfers';
export { depositsApi } from './deposits';
export { withdrawalsApi } from './withdrawals';
export { usersApi } from './users';
export { notificationsApi } from './notifications';
export { beneficiariesApi } from './beneficiaries';

// Re-export types
export type { Account, AccountListParams, AccountListResult, CreateAccountData, UpdateAccountData } from './accounts';
export type { Transaction, TransactionListParams, TransactionListResult } from './transactions';
export type { Transfer, TransferListParams, TransferListResult, CreateTransferData } from './transfers';
export type { Deposit, DepositListParams, DepositListResult, CreateDepositData } from './deposits';
export type { Withdrawal, WithdrawalListParams, WithdrawalListResult, CreateWithdrawalData } from './withdrawals';
export type { User, ProfileUpdateData, PasswordUpdateData } from './users';
export type { Notification, NotificationListParams, NotificationListResult } from './notifications';
export type { Beneficiary, BeneficiaryListParams, BeneficiaryListResult, CreateBeneficiaryData, UpdateBeneficiaryData } from './beneficiaries';
