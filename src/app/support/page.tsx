// src/app/support/page.tsx
// Help and support

'use client';

import { useState } from 'react';
import { Headphones, LifeBuoy, Mail, MessageSquare, Phone, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { useApiMutation, useApiResource, useToast } from '@/hooks';

const CHANNELS = [
  { icon: Phone, title: 'Call us', body: '24/7 on +1 (555) 0100 for lost cards and fraud.' },
  { icon: Mail, title: 'Email', body: 'help@crestline.example — we reply within one business day.' },
  { icon: MessageSquare, title: 'Live chat', body: 'Weekdays 08:00–20:00 for account questions.' },
];

function statusVariant(status?: string) {
  switch ((status || '').toLowerCase()) {
    case 'resolved':
    case 'closed':
      return 'success' as const;
    case 'open':
    case 'in_progress':
      return 'warning' as const;
    case 'escalated':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}

export default function SupportPage() {
  const tickets = useApiResource<any[]>('/api/support/tickets');
  const { mutate, isSubmitting } = useApiMutation();
  const { success, error: showError } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    subject: '',
    category: 'GENERAL',
    priority: 'MEDIUM',
    description: '',
  });
  const [formError, setFormError] = useState('');

  const rows = Array.isArray(tickets.data) ? tickets.data : [];

  const submit = async () => {
    setFormError('');
    if (!form.subject.trim() || !form.description.trim()) {
      setFormError('Add a subject and description so we can help quickly.');
      return;
    }

    try {
      await mutate('/api/support/tickets', 'POST', {
        subject: form.subject,
        category: form.category,
        priority: form.priority,
        description: form.description,
      });
      setOpen(false);
      setForm({ subject: '', category: 'GENERAL', priority: 'MEDIUM', description: '' });
      tickets.refetch();
      success('A support agent will pick this up shortly.', 'Ticket created');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not create the ticket';
      setFormError(message);
      showError(message, 'Ticket not created');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="We are here to help"
        title="Support"
        description="Raise a ticket, or reach a human right away if your card is lost or you spot fraud."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            New ticket
          </Button>
        }
      />

      <div className="mb-6 grid gap-5 sm:grid-cols-3">
        {CHANNELS.map((channel) => (
          <div key={channel.title} className="chase-card p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary">
              <channel.icon className="h-[18px] w-[18px]" />
            </span>
            <p className="mt-4 text-sm font-semibold text-foreground">{channel.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{channel.body}</p>
          </div>
        ))}
      </div>

      <section className="chase-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Your tickets</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Every conversation you have started with our team.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <span>
              <LifeBuoy className="h-4 w-4" />
              {rows.length} on record
            </span>
          </Button>
        </div>

        <div className="mt-5">
          {tickets.isLoading ? (
            <LoadingRows rows={3} />
          ) : tickets.error ? (
            <ErrorState
              title="We could not load your tickets"
              description={tickets.error}
              action={
                <Button variant="outline" onClick={tickets.refetch}>
                  Try again
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Headphones}
              title="No support tickets yet"
              description="If something looks wrong on your account, raise a ticket and we will investigate."
              action={<Button onClick={() => setOpen(true)}>Create a ticket</Button>}
            />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((ticket) => (
                <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {ticket.subject}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {ticket.description || 'No description'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {(ticket.category || 'general').toString().toLowerCase()} ·{' '}
                      {new Date(ticket.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {ticket.priority && (
                      <Badge variant={ticket.priority === 'HIGH' ? 'warning' : 'secondary'}>
                        {ticket.priority}
                      </Badge>
                    )}
                    <Badge variant={statusVariant(ticket.status)}>{ticket.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Create a support ticket"
        description="Tell us what happened and we will route it to the right team."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} isLoading={isSubmitting}>
              Submit ticket
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Input
            label="Subject"
            value={form.subject}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, subject: event.target.value }))
            }
            placeholder="e.g. Card declined in store"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Category"
              value={form.category}
              onValueChange={(value) => setForm((previous) => ({ ...previous, category: value }))}
            >
              <Select.Option value="GENERAL">General</Select.Option>
              <Select.Option value="ACCOUNT">Account</Select.Option>
              <Select.Option value="TRANSACTION">Transaction</Select.Option>
              <Select.Option value="TECHNICAL">Technical</Select.Option>
              <Select.Option value="FRAUD">Fraud</Select.Option>
              <Select.Option value="COMPLAINT">Complaint</Select.Option>
            </Select>
            <Select
              label="Priority"
              value={form.priority}
              onValueChange={(value) => setForm((previous) => ({ ...previous, priority: value }))}
            >
              <Select.Option value="LOW">Low</Select.Option>
              <Select.Option value="MEDIUM">Medium</Select.Option>
              <Select.Option value="HIGH">High</Select.Option>
              <Select.Option value="CRITICAL">Critical</Select.Option>
            </Select>
          </div>
          <div>
            <label className="chase-label" htmlFor="ticket-description">
              Description
            </label>
            <textarea
              id="ticket-description"
              value={form.description}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, description: event.target.value }))
              }
              rows={5}
              placeholder="Include dates, amounts and what you expected to happen."
              className="chase-input min-h-[7rem] resize-y py-3"
            />
          </div>
          {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
        </div>
      </Dialog>
    </div>
  );
}
