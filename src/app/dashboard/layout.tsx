'use client';

import { Sidebar } from './sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="flex">
        <Sidebar />
        <main className="ml-64 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}