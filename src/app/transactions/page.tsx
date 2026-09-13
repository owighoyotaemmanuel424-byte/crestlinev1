// src/app/transactions/page.tsx
// Transactions List Page

'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTransactions } from '@/hooks';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';

export default function TransactionsPage() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get('accountId') || undefined;
  const type = searchParams.get('type') || undefined;
  const status = searchParams.get('status') || undefined;
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [localType, setLocalType] = useState(type || '');
  const [localStatus, setLocalStatus] = useState(status || '');

  const { transactions, total, totalPages, isLoading, error, refetch } = useTransactions({
    page,
    limit,
    accountId,
    type: localType || undefined,
    status: localStatus || undefined,
    startDate,
    endDate,
  });

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

  const columns = useMemo(() => [
    {
      header: 'Date',
      accessor: 'createdAt',
      cell: (row: any) => (
        <div className="text-sm whitespace-nowrap">
          {new Date(row.createdAt).toLocaleDateString()}
        </div>
      ),
    },
    {
      header: 'Reference',
      accessor: 'reference',
      cell: (row: any) => (
        <Link href={`/transactions/${row.id}`} className="text-blue-600 hover:underline">
          {row.reference}
        </Link>
      ),
    },
    {
      header: 'Type',
      accessor: 'type',
      cell: (row: any) => (
        <Badge variant={getTypeBadgeVariant(row.type)}>
          {row.type}
        </Badge>
      ),
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
        <Badge variant={getStatusBadgeVariant(row.status)}>
          {row.status}
        </Badge>
      ),
    },
    {
      header: 'Account',
      accessor: 'accountId',
      cell: (row: any) => (
        <div className="text-sm">
          {row.account?.name || row.accountId?.slice(-4)}
        </div>
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
  ], []);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  };

  const handleSearch = () => {
    setPage(1);
    refetch();
  };

  if (isLoading && page === 1) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Transactions</h1>
        </div>
        <Card className="p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p>Loading transactions...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Transactions</h1>
        </div>
        <Card className="p-8">
          <div className="text-center text-red-500">
            <p>Error: {error}</p>
            <Button onClick={() => refetch()} className="mt-4">
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <div className="text-sm text-muted-foreground">
          Total: {total} transaction(s)
        </div>
      </div>

      {/* Filters */}
      <Card className="p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <Select
              value={localType}
              onValueChange={setLocalType}
              placeholder="All Types"
            >
              <Select.Option value="">All Types</Select.Option>
              <Select.Option value="credit">Credit</Select.Option>
              <Select.Option value="debit">Debit</Select.Option>
              <Select.Option value="transfer">Transfer</Select.Option>
              <Select.Option value="fee">Fee</Select.Option>
              <Select.Option value="deposit">Deposit</Select.Option>
              <Select.Option value="withdrawal">Withdrawal</Select.Option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Status</label>
            <Select
              value={localStatus}
              onValueChange={setLocalStatus}
              placeholder="All Statuses"
            >
              <Select.Option value="">All Statuses</Select.Option>
              <Select.Option value="completed">Completed</Select.Option>
              <Select.Option value="pending">Pending</Select.Option>
              <Select.Option value="failed">Failed</Select.Option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Per Page</label>
            <Select
              value={limit.toString()}
              onValueChange={(value) => handleLimitChange(Number(value))}
              placeholder="Select limit"
            >
              <Select.Option value="5">5</Select.Option>
              <Select.Option value="10">10</Select.Option>
              <Select.Option value="25">25</Select.Option>
              <Select.Option value="50">50</Select.Option>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={handleSearch} variant="outline">
              Apply Filters
            </Button>
          </div>
        </div>
      </Card>

      {/* Transactions Table */}
      <Card className="p-6">
        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No transactions found</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={transactions}
            pagination={{
              currentPage: page,
              totalPages: totalPages,
              totalItems: total,
              onPageChange: handlePageChange,
            }}
          />
        )}
      </Card>
    </div>
  );
}