// src/app/transfer/page.tsx
// Transfer Page - Simplified

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAccounts, useBeneficiaries, useTransfers, useToast } from '@/hooks';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';

export default function TransferPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accounts } = useAccounts({ limit: 100 });
  const { beneficiaries } = useBeneficiaries({ limit: 100 });
  const { createTransfer } = useTransfers();
  const { success, error: showError } = useToast();
  
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    senderAccountId: searchParams.get('accountId') || '',
    recipientName: '',
    recipientBank: '',
    recipientAccountNumber: '',
    amount: 0,
    description: '',
  });
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transferRef, setTransferRef] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const senderAccount = accounts.find(a => a.id === formData.senderAccountId);

  useEffect(() => {
    if (selectedBeneficiaryId) {
      const ben = beneficiaries.find(b => b.id === selectedBeneficiaryId);
      if (ben) {
        setFormData(prev => ({
          ...prev,
          recipientName: ben.name,
          recipientBank: ben.bankName,
          recipientAccountNumber: ben.accountNumber,
        }));
      }
    }
  }, [selectedBeneficiaryId, beneficiaries]);

  const canProceed = step === 1 ? !!formData.senderAccountId : 
                     step === 2 ? (selectedBeneficiaryId || (formData.recipientName && formData.recipientAccountNumber)) :
                     step === 3 ? formData.amount > 0 : true;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setShowConfirm(false);
    try {
      if (senderAccount && formData.amount > senderAccount.availableBalance) {
        showError('Insufficient balance');
        setIsSubmitting(false);
        return;
      }

      const transfer = await createTransfer({
        senderAccountId: formData.senderAccountId,
        recipientName: formData.recipientName,
        recipientBank: formData.recipientBank,
        recipientAccountNumber: formData.recipientAccountNumber,
        amount: formData.amount * 100,
        currency: 'NGN',
        description: formData.description,
        idempotencyKey: `transfer-${Date.now()}`,
      });
      setTransferRef(transfer.reference);
      setStep(4);
      success('Transfer submitted!', 'Success');
    } catch (err: any) {
      showError(err.message || 'Transfer failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
  };

  if (step === 4) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Transfer Complete</h1>
        <Card className="p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-2xl">✓</span>
          </div>
          <h2 className="text-xl font-bold mb-2">Transfer Successful!</h2>
          <p className="text-muted-foreground mb-4">Reference: {transferRef}</p>
          <div className="flex gap-4 justify-center">
            <Button onClick={() => router.push('/accounts')}>
              View Accounts
            </Button>
            <Button variant="outline" onClick={() => router.push('/transfer')}>
              New Transfer
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Send Money</h1>
      
      <div className="flex items-center justify-between mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${s <= step ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
              {s}
            </div>
            {s < 3 && <div className={`w-24 h-1 mx-2 ${s < step ? 'bg-blue-600' : 'bg-gray-100'}`}></div>}
          </div>
        ))}
      </div>

      <Card className="p-8 mb-6">
        {step === 1 && (
          <>
            <h2 className="text-xl font-semibold mb-6">Select Source Account</h2>
            <div className="space-y-4">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  onClick={() => setFormData(p => ({ ...p, senderAccountId: acc.id }))}
                  className={`p-4 border rounded-lg cursor-pointer ${formData.senderAccountId === acc.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                >
                  <div className="flex justify-between">
                    <div>
                      <div className="font-medium">{acc.name}</div>
                      <div className="text-sm text-muted-foreground">{acc.accountType}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(acc.availableBalance)}</div>
                      <div className="text-sm text-muted-foreground">Available</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-xl font-semibold mb-6">Select Recipient</h2>
            <div className="mb-6">
              <h3 className="font-medium mb-2">From Beneficiaries</h3>
              <Select
                value={selectedBeneficiaryId}
                onValueChange={setSelectedBeneficiaryId}
                placeholder="Select beneficiary"
              >
                {beneficiaries.map((b) => (
                  <Select.Option key={b.id} value={b.id}>
                    {b.name} - {b.accountNumber}
                  </Select.Option>
                ))}
              </Select>
            </div>
            <div>
              <h3 className="font-medium mb-2">Or Enter New Recipient</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  value={formData.recipientName}
                  onChange={(e) => setFormData(p => ({ ...p, recipientName: e.target.value }))}
                  placeholder="Recipient Name"
                />
                <Input
                  value={formData.recipientBank}
                  onChange={(e) => setFormData(p => ({ ...p, recipientBank: e.target.value }))}
                  placeholder="Bank Name"
                />
                <Input
                  value={formData.recipientAccountNumber}
                  onChange={(e) => setFormData(p => ({ ...p, recipientAccountNumber: e.target.value }))}
                  placeholder="Account Number"
                  className="md:col-span-2"
                />
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-xl font-semibold mb-6">Enter Amount</h2>
            <div className="space-y-4">
              <Input
                type="number"
                value={formData.amount || ''}
                onChange={(e) => setFormData(p => ({ ...p, amount: Number(e.target.value) }))}
                placeholder="Amount (NGN)"
                min="0"
                step="0.01"
              />
              <Input
                value={formData.description}
                onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                placeholder="Description (Optional)"
              />
              {senderAccount && formData.amount > senderAccount.availableBalance && (
                <p className="text-red-500 text-sm">Insufficient balance</p>
              )}
              
              <div className="p-4 bg-gray-50 rounded-lg mt-6">
                <h3 className="font-medium mb-2">Summary</h3>
                <div className="flex justify-between">
                  <span>From:</span>
                  <span>{senderAccount?.name || formData.senderAccountId}</span>
                </div>
                <div className="flex justify-between">
                  <span>To:</span>
                  <span>{formData.recipientName} ({formData.recipientAccountNumber})</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span className="font-medium">{formatCurrency(formData.amount)}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => step === 1 ? router.push('/accounts') : setStep(s => s - 1)}>
          {step === 1 ? 'Cancel' : 'Back'}
        </Button>
        {step < 3 ? (
          <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed}>
            Continue
          </Button>
        ) : (
          <Button onClick={() => setShowConfirm(true)} disabled={!canProceed || isSubmitting}>
            Submit Transfer
          </Button>
        )}
      </div>

      <Dialog open={showConfirm} onOpenChange={(open) => setShowConfirm(open)} title="Confirm Transfer">
        <div className="py-4">
          <p className="mb-4">Are you sure you want to transfer {formatCurrency(formData.amount)} to {formData.recipientName}?</p>
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