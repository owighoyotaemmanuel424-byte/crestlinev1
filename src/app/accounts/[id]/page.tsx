// src/app/accounts/[id]/page.tsx
// Account Detail Page

'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAccount, useTransactions } from '@/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { useToast } from '@/components/ui/toast';

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { account, isLoading: accountLoading, error: accountError } = useAccount(id);
  const { transactions, isLoading: transactionsLoading, error: transactionsError } = useTransactions({
    accountId: id,
    limit: 5,
  });
  const { error: showError } = useToast();

  const formatCurrency = (amount: number, currency: string = 'NGN') => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency,
    }).format(amount / 100);
  };

  const maskAccountNumber = (accountNumber: string) => {
    if (!accountNumber) return '';
    const visible = accountNumber.slice(-4);
    const masked = '*'.repeat(accountNumber.length - 4);
    return `${masked}${visible}`;
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'success';
      case 'frozen':
        return 'warning';
      case 'closed':
        return 'error';
      case 'pending':
        return 'info';
      default:
        return 'secondary';
    }
  };

  const transactionColumns = [
    {
      header: 'Date',
      accessor: 'createdAt',
      cell: (row: any) => (
        <div className="text-sm">
          {new Date(row.createdAt).toLocaleDateString()}
        </div>
      ),
    },
    {
      header: 'Reference',
      accessor: 'reference',
    },
    {
      header: 'Type',
      accessor: 'type',
    },
    {
      header: 'Description',
      accessor: 'description',
    },
    {
      header: 'Amount',
      accessor: 'amount',
      cell: (row: any) => (
        <div className="text-right font-medium">
          {formatCurrency(row.amount, row.currency)}
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (row: any) => (
        <Badge variant={row.status === 'completed' ? 'success' : row.status === 'pending' ? 'warning' : 'secondary'}>
          {row.status}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      cell: (row: any) => (
        <Link href={`/transactions/${row.id}`} passHref>
          <Button variant="ghost" size="sm">
            View
          </Button>
        </Link>
      ),
    },
  ];

  if (accountLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/accounts" passHref>
            <Button variant="ghost">← Back</Button>
          </Link>
          <h1 className="text-2xl font-bold">Account Details</h1>
        </div>
        <Card className="p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p>Loading account details...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (accountError || !account) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/accounts" passHref>
            <Button variant="ghost">← Back</Button>
          </Link>
          <h1 className="text-2xl font-bold">Account Details</h1>
        </div>
        <Card className="p-8">
          <div className="text-center text-red-500">
            <p>Error: {accountError || 'Account not found'}</p>
            <Button onClick={() => router.push('/accounts')} className="mt-4">
              Back to Accounts
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/accounts" passHref>
          <Button variant="ghost">← Back</Button>
        </Link>
        <h1 className="text-2xl font-bold">Account Details</h1>
      </div>

      {/* Account Information Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Account Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Account Name</label>
              <div className="text-lg">{account.name}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Account Number</label>
              <div className="text-lg font-mono">{maskAccountNumber(account.accountNumber)}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Account Type</label>
              <div className="text-lg">{account.accountType}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Currency</label>
              <div className="text-lg">{account.currency}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Status</label>
              <Badge variant={getStatusBadgeVariant(account.status)}>
                {account.status}
              </Badge>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Created</label>
              <div className="text-lg">
                {new Date(account.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </Card>

        {/* Balance Card */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Balances</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Current Balance</label>
              <div className="text-3xl font-bold text-green-600">
                {formatCurrency(account.balance, account.currency)}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Available Balance</label>
              <div className="text-3xl font-bold text-blue-600">
                {formatCurrency(account.availableBalance, account.currency)}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Transactions</h2>
          <Link href={`/transactions?accountId=${id}`} passHref>
            <Button variant="ghost" size="sm">
              View All
            </Button>
          </Link>
        </div>

        {transactionsLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">Loading transactions...</p>
          </div>
        ) : transactionsError ? (
          <div className="text-center text-red-500 py-8">
            <p>Error loading transactions: {transactionsError}</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No recent transactions</p>
          </div>
        ) : (
          <DataTable columns={transactionColumns} data={transactions} />
        )}
      </Card>

      {/* Quick Actions */}
      <Card className="p-6 mt-6">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Link href={`/transfer?accountId=${id}`} passHref>
            <Button className="w-full" variant="outline">
              Send Money
            </Button>
          </Link>
          <Link href={`/deposit?accountId=${id}`} passHref>
            <Button className="w-full" variant="outline">
              Deposit
            </Button>
          </Link>
          <Link href={`/withdraw?accountId=${id}`} passHref>
            <Button className="w-full" variant="outline">
              Withdraw
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}