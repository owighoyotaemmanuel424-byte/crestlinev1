// src/app/transactions/[id]/page.tsx
// Transaction Detail Page

'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTransaction } from '@/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function TransactionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { transaction, isLoading, error } = useTransaction(id);

  const formatCurrency = (amount: number, currency: string = 'NGN') => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency,
    }).format(amount / 100);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'success';
      case 'pending':
        return 'warning';
      case 'failed':
        return 'error';
      case 'reversed':
        return 'info';
      default:
        return 'secondary';
    }
  };

  const getTypeBadgeVariant = (type: string) => {
    switch (type.toLowerCase()) {
      case 'credit':
        return 'success';
      case 'debit':
        return 'error';
      case 'transfer':
        return 'info';
      case 'fee':
        return 'warning';
      default:
        return 'secondary';
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/transactions" passHref>
            <Button variant="ghost">← Back</Button>
          </Link>
          <h1 className="text-2xl font-bold">Transaction Details</h1>
        </div>
        <Card className="p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p>Loading transaction details...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/transactions" passHref>
            <Button variant="ghost">← Back</Button>
          </Link>
          <h1 className="text-2xl font-bold">Transaction Details</h1>
        </div>
        <Card className="p-8">
          <div className="text-center text-red-500">
            <p>Error: {error || 'Transaction not found'}</p>
            <Button onClick={() => router.push('/transactions')} className="mt-4">
              Back to Transactions
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/transactions" passHref>
          <Button variant="ghost">← Back</Button>
        </Link>
        <h1 className="text-2xl font-bold">Transaction Details</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Transaction Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Reference</label>
              <div className="text-lg font-mono">{transaction.reference}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Type</label>
              <Badge variant={getTypeBadgeVariant(transaction.type)}>
                {transaction.type}
              </Badge>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Status</label>
              <Badge variant={getStatusBadgeVariant(transaction.status)}>
                {transaction.status}
              </Badge>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Description</label>
              <div className="text-lg">{transaction.description}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Journal ID</label>
              <div className="text-lg font-mono">{transaction.journalId}</div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Financial Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Amount</label>
              <div className="text-3xl font-bold text-green-600">
                {formatCurrency(transaction.amount, transaction.currency)}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Currency</label>
              <div className="text-lg">{transaction.currency}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Created</label>
              <div className="text-lg">
                {new Date(transaction.createdAt).toLocaleString()}
              </div>
            </div>
            {transaction.completedAt && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground">Completed</label>
                <div className="text-lg">
                  {new Date(transaction.completedAt).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Account Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground">Account ID</label>
              <div className="text-lg font-mono">{transaction.accountId}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground">User ID</label>
              <div className="text-lg font-mono">{transaction.userId}</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-6 flex gap-4">
        <Link href="/transactions" passHref>
          <Button variant="outline">Back to List</Button>
        </Link>
        <Button variant="ghost" onClick={() => window.print()}>
          Print
        </Button>
      </div>
    </div>
  );
}