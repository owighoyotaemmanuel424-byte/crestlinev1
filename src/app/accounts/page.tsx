// src/app/accounts/page.tsx
// Customer Accounts Page

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAccounts } from '@/hooks';
import { formatCurrency } from '@/lib/utils';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';

export default function AccountsPage() {
  const { accounts, total, page, limit, totalPages, isLoading, error, refetch } = useAccounts({
    page: 1,
    limit: 10,
  });
  const { success, error: showError } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const handleSearch = () => {
    refetch({ page: 1, search, status: statusFilter, accountType: typeFilter });
  };

  const handlePageChange = (newPage: number) => {
    refetch({ page: newPage, search, status: statusFilter, accountType: typeFilter });
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

  const columns = [
    {
      header: 'Account Number',
      accessor: 'accountNumber',
      cell: (row: any) => (
        <div className="font-mono">
          {maskAccountNumber(row.accountNumber)}
        </div>
      ),
    },
    {
      header: 'Name',
      accessor: 'name',
    },
    {
      header: 'Type',
      accessor: 'accountType',
    },
    {
      header: 'Currency',
      accessor: 'currency',
    },
    {
      header: 'Balance',
      accessor: 'balance',
      cell: (row: any) => (
        <div className="text-right font-medium">
          {formatCurrency(row.balance, row.currency)}
        </div>
      ),
    },
    {
      header: 'Available',
      accessor: 'availableBalance',
      cell: (row: any) => (
        <div className="text-right font-medium">
          {formatCurrency(row.availableBalance, row.currency)}
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
      header: 'Created',
      accessor: 'createdAt',
      cell: (row: any) => (
        <div className="text-sm text-muted-foreground">
          {new Date(row.createdAt).toLocaleDateString()}
        </div>
      ),
    },
    {
      header: 'Actions',
      cell: (row: any) => (
        <Link href={`/accounts/${row.id}`} passHref>
          <Button variant="ghost" size="sm">
            View
          </Button>
        </Link>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">My Accounts</h1>
        </div>
        <Card className="p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p>Loading accounts...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">My Accounts</h1>
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
        <h1 className="text-2xl font-bold">My Accounts</h1>
        <div className="text-sm text-muted-foreground">
          Total: {total} account(s)
        </div>
      </div>

      {/* Filters */}
      <Card className="p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts..."
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="frozen">Frozen</option>
              <option value="closed">Closed</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="">All Types</option>
              <option value="savings">Savings</option>
              <option value="current">Current</option>
              <option value="domiciliary">Domiciliary</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={handleSearch} variant="outline">
            Apply Filters
          </Button>
        </div>
      </Card>

      {/* Accounts Table */}
      <Card className="p-6">
        {accounts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No accounts found</p>
            <Link href="/" passHref>
              <Button>Create Account</Button>
            </Link>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={accounts}
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