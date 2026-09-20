// src/app/notifications/page.tsx
// Notification centre

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bell, CheckCheck, Info } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { useApiMutation, useNotifications, useToast } from '@/hooks';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const { notifications, unreadCount, isLoading, error, refetch } = useNotifications({ limit: 25 });
  const { mutate, isSubmitting } = useApiMutation();
  const { success, error: showError } = useToast();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const visible =
    filter === 'unread' ? notifications.filter((item) => !item.isRead) : notifications;

  const markAllRead = async () => {
    try {
      await mutate('/api/notifications', 'POST', {});
      refetch();
      success('All notifications marked as read.', 'Inbox cleared');
    } catch (caught) {
      showError(
        caught instanceof Error ? caught.message : 'Could not update notifications',
        'Update failed'
      );
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="Security alerts, transaction confirmations and account updates — all in one timeline."
        actions={
          <>
            <div className="flex rounded-md border border-border bg-card p-1">
              {(['all', 'unread'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  className={cn(
                    'rounded px-3.5 py-1.5 text-sm font-medium capitalize transition-colors',
                    filter === option
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {option}
                  {option === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={markAllRead}
              isLoading={isSubmitting}
              disabled={unreadCount === 0}
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          </>
        }
      />

      <section className="chase-card p-6">
        {isLoading ? (
          <LoadingRows rows={4} />
        ) : error ? (
          <ErrorState
            title="We could not load your notifications"
            description={error}
            action={
              <Button variant="outline" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={filter === 'unread' ? 'You are all caught up' : 'No notifications yet'}
            description={
              filter === 'unread'
                ? 'Every notification has been read. New alerts will appear here instantly.'
                : 'Account alerts, deposit confirmations and security notices will land here.'
            }
            action={
              filter === 'unread' ? (
                <Button variant="outline" onClick={() => setFilter('all')}>
                  View all notifications
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/dashboard">Back to dashboard</Link>
                </Button>
              )
            }
          />
        ) : (
          <ul className="space-y-3">
            {visible.map((notification) => (
              <li
                key={notification.id}
                className={cn(
                  'flex items-start gap-4 rounded-lg border p-4 transition-colors',
                  notification.isRead
                    ? 'border-border bg-card'
                    : 'border-primary/30 bg-accent'
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    notification.isRead
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-primary/15 text-primary'
                  )}
                >
                  <Info className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{notification.title}</p>
                    {!notification.isRead && <Badge variant="primary" size="sm">New</Badge>}
                    {notification.category && (
                      <Badge variant="secondary" size="sm">
                        {notification.category}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {notification.message}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(notification.createdAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
