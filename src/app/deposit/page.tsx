// src/app/deposit/page.tsx
// Deposit Page

'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAccounts, useDeposits, useToast } from '@/hooks';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';

function DepositPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accounts } = useAccounts({ limit: 100 });
  const { createDeposit } = useDeposits();
  const { success, error: showError } = useToast();
  
  const [formData, setFormData] = useState({
    accountId: searchParams.get('accountId') || '',
    amount: 0,
    method: 'bank_transfer',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [depositRef, setDepositRef] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const account = accounts.find(a => a.id === formData.accountId);

  const canProceed = formData.accountId && formData.amount > 0;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setShowConfirm(false);
    try {
      const deposit = await createDeposit({
        accountId: formData.accountId,
        amount: formData.amount * 100,
        currency: 'NGN',
        method: formData.method,
        description: formData.description,
        idempotencyKey: 'deposit-' + Date.now(),
      });
      setDepositRef(deposit.reference);
      success('Deposit submitted!', 'Success');
    } catch (err: any) {
      showError(err.message || 'Deposit failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (depositRef) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Deposit Complete</h1>
        <Card className="p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-2xl">✓</span>
          </div>
          <h2 className="text-xl font-bold mb-2">Deposit Successful!</h2>
          <p className="text-muted-foreground mb-4">Reference: {depositRef}</p>
          <div className="flex gap-4 justify-center">
            <Button onClick={() => router.push('/accounts')}>
              View Accounts
            </Button>
            <Button variant="outline" onClick={() => router.push('/deposit')}>
              New Deposit
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Deposit Funds</h1>
      
      <Card className="p-8 mb-6">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Account</label>
            <Select
              value={formData.accountId}
              onValueChange={(v) => setFormData(p => ({ ...p, accountId: v }))}
              placeholder="Select account"
            >
              {accounts.map((acc) => (
                <Select.Option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.accountType}) - {formatCurrency(acc.balance)}
                </Select.Option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Amount (NGN)</label>
            <Input
              type="number"
              value={formData.amount || ''}
              onChange={(e) => setFormData(p => ({ ...p, amount: Number(e.target.value) }))}
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Deposit Method</label>
            <Select
              value={formData.method}
              onValueChange={(v) => setFormData(p => ({ ...p, method: v }))}
            >
              <Select.Option value="bank_transfer">Bank Transfer</Select.Option>
              <Select.Option value="cash">Cash Deposit</Select.Option>
              <Select.Option value="mobile_money">Mobile Money</Select.Option>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description (Optional)</label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
              placeholder="Deposit description"
            />
          </div>

          {account && formData.amount > 0 && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium mb-2">Summary</h3>
              <div className="flex justify-between">
                <span>Account:</span>
                <span>{account.name}</span>
              </div>
              <div className="flex justify-between">
                <span>Amount:</span>
                <span className="font-medium">{formatCurrency(formData.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Method:</span>
                <span>{formData.method.replace('_', ' ')}</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => router.push('/accounts')}>
          Cancel
        </Button>
        <Button onClick={() => setShowConfirm(true)} disabled={!canProceed || isSubmitting}>
          Submit Deposit
        </Button>
      </div>

      <Dialog open={showConfirm} onOpenChange={(open) => setShowConfirm(open)} title="Confirm Deposit">
        <div className="py-4">
          <p className="mb-4">Are you sure you want to deposit {formatCurrency(formData.amount)} to {account?.name}?</p>
          <div className="flex gap-4 justify-end">
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} isLoading={isSubmitting}>
              Confirm
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default function DepositPage() {
  return (
    <Suspense fallback={<div className="container mx-auto p-6">Loading...</div>}>
      <DepositPageContent />
    </Suspense>
  );
}
}