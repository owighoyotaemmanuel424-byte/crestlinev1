import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/app-shell';
import { ToastProvider } from '@/components/ui/toast';

export const metadata: Metadata = {
  title: {
    default: 'Crestline Capital | Modern banking, lending and investing',
    template: '%s · Crestline Capital',
  },
  description:
    'Crestline Capital brings checking, savings, cards, loans and investing together in one secure, beautifully simple digital bank.',
  applicationName: 'Crestline Capital',
};

export const viewport: Viewport = {
  themeColor: '#002b5c',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
