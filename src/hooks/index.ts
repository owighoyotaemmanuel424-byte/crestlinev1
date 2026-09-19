// src/hooks/index.ts
// Export all hooks

export { useAuth, type UseAuthReturn, type AuthState } from './useAuth';
export { useToast, type UseToastReturn, type ToastType, type ToastMessage } from './use-toast';
export { useAccounts, type UseAccountsReturn, type UseAccountsState, useAccount, type UseAccountReturn, type UseAccountState } from './useAccounts';
export { useTransactions, type UseTransactionsReturn, type UseTransactionsState } from './useTransactions';
export { useTransaction, type UseTransactionReturn, type UseTransactionState } from './useTransaction';
export { useTransfers, type UseTransfersReturn } from './useTransfers';
export { useDeposits, type UseDepositsReturn } from './useDeposits';
export { useWithdrawals, type UseWithdrawalsReturn } from './useWithdrawals';
export { useBeneficiaries, type UseBeneficiariesReturn } from './useBeneficiaries';
export { useProfile, type UseProfileReturn } from './useProfile';
export { useNotifications, type UseNotificationsReturn } from './useNotifications';
export { useKYC, type UseKYCReturn } from './useKYC';
export { useCards, type UseCardsReturn } from './useCards';
export { useSettings, type UseSettingsReturn } from './useSettings';
export { useDashboard, type UseDashboardReturn } from './useDashboard';